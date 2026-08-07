#!/usr/bin/env node
// Ingest Amazon Advertising console CSV/TSV exports into our own keyword history.
//
// Why this exists: the Ads API serves only 95 days (verified 2026-08-05 against Amazon's own
// "data retention start date" error). Anything older can only come out of the console by hand.
//
//   node scripts/ingest-keyword-csv.mjs <file.csv> [more.csv ...]
//   node scripts/ingest-keyword-csv.mjs --dry <file.csv>     # parse + report, write nothing
//
// Rows WITH a date column go to kw_daily (per-day grain).
// Rows WITHOUT one go to kw_lifetime as a period total, which is what the lifetime-ROAS rule needs.
// Both are idempotent: totals are aggregated in memory first, then written with REPLACE semantics,
// so re-running the same file can never double-count.

import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { URL } from 'node:url';

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const db = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const files = args.filter(a => !a.startsWith('--'));
const prodArg = args.find(a => a.startsWith('--product='));
const AD_PRODUCT = prodArg ? prodArg.split('=')[1] : 'SPONSORED_PRODUCTS';
const curArg = args.find(a => a.startsWith('--currency='));
const CURRENCY = curArg ? curArg.split('=')[1].toUpperCase() : 'USD';
const mktArg = args.find(a => a.startsWith('--market='));
const MARKET = mktArg ? mktArg.split('=')[1].toUpperCase() : 'US';
if (!files.length) { console.error('usage: node scripts/ingest-keyword-csv.mjs [--dry] [--product=SPONSORED_BRANDS] <file.csv> ...'); process.exit(1); }

const norm = t => String(t ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const num = v => { const n = Number(String(v ?? '').replace(/[$,%\s]/g, '')); return Number.isFinite(n) ? n : 0; };

// Amazon renames these columns constantly across report types and years. Rather than chase every
// spelling, normalise the header (lowercase, strip everything that is not a letter or digit) and
// match on that. "Total cost (USD)", "Spend(USD)" and "Total cost" all collapse to the same key.
const nk = h => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const FIELD = {
  word:     ['keyword', 'keywordtext', 'customersearchterm', 'searchterm', 'targeting', 'target', 'categoriesproducts', 'automatictargetinggroups'],
  match:    ['matchtype', 'keywordtype', 'targetmatchtype', 'match'],
  date:     ['date', 'day', 'startdate'],
  spend:    ['spend', 'cost', 'totalspend', 'totalcost', 'spendusd', 'totalcostusd', 'spendcad', 'totalcostcad'],
  clicks:   ['clicks'],
  impr:     ['impressions'],
  orders:   ['orders', 'purchases', 'unitssold'],
  sales:    ['sales', 'salesusd', 'salescad', 'totalsales'],
  bid:      ['bid', 'bidusd', 'bidcad', 'keywordbid', 'keywordbidusd', 'keywordbidcad'],
  sug_low:  ['suggestedbidlowusd', 'suggestedbidlowcad', 'suggestedbidlow'],
  sug_med:  ['suggestedbidmedianusd', 'suggestedbidmediancad', 'suggestedbidmedian', 'suggestedbid'],
  sug_high: ['suggestedbidhighusd', 'suggestedbidhighcad', 'suggestedbidhigh'],
  state:    ['state'],
  status:   ['status', 'targetstatus', 'statuscode'],
};
// Prefer an exact normalised hit; fall back to a prefix hit so "sales14day" still resolves to sales.
function mapHeader(cols) {
  const keys = cols.map(nk);
  const idx = {};
  const claimed = new Set();
  // Pass 1: exact normalised matches only. These are unambiguous, so they claim their column first.
  for (const [field, names] of Object.entries(FIELD)) {
    const at = keys.findIndex((k, i) => !claimed.has(i) && names.includes(k));
    idx[field] = at;
    if (at >= 0) claimed.add(at);
  }
  // Pass 2: prefix fallback for anything still unmatched, and never steal a claimed column.
  // Without the claim check, "suggested bid (low)(CAD)" prefix-matches the generic "suggestedbid"
  // and silently lands in the median slot too.
  for (const [field, names] of Object.entries(FIELD)) {
    if (idx[field] >= 0) continue;
    const at = keys.findIndex((k, i) => !claimed.has(i) &&
      names.some(n => k === n + 'usd' || k === n + 'cad' || (k.startsWith(n) && k.length <= n.length + 6)));
    idx[field] = at;
    if (at >= 0) claimed.add(at);
  }
  return idx;
}
const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);
function parse(text) {
  const delim = text.split('\n')[0].includes(TAB) ? TAB : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== CR) cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

let totalDaily = 0, totalLife = 0;
for (const file of files) {
  const rows = parse(readFileSync(file, 'utf8'));
  // Amazon often prefixes exports with title/filter rows; find the real header.
  let h = -1, idx = null;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cand = mapHeader(rows[i]);
    if (cand.word >= 0 && (cand.spend >= 0 || cand.clicks >= 0)) { h = i; idx = cand; break; }
  }
  if (h < 0) { console.error('SKIP ' + basename(file) + ': no recognisable keyword/spend header in first 12 rows'); continue; }
  const mapped = Object.entries(idx).filter(([, v]) => v >= 0).map(([k, v]) => k + '=' + rows[h][v]).join(', ');
  console.log('\n' + basename(file) + '  [' + AD_PRODUCT + ' / ' + MARKET + ' / ' + CURRENCY + ']  header row ' + (h + 1) + '  mapped: ' + mapped);

  const daily = new Map(), life = new Map();
  let skipped = 0;
  for (const r of rows.slice(h + 1)) {
    const word = norm(r[idx.word]); if (!word) { skipped++; continue; }
    const mt = (idx.match >= 0 ? String(r[idx.match] || '') : 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    const rec = { spend: num(r[idx.spend]), clicks: num(r[idx.clicks]), impressions: num(r[idx.impr]), orders: num(r[idx.orders]), sales: num(r[idx.sales]) };
    const meta = { bid: idx.bid>=0?num(r[idx.bid]):null, sug_low: idx.sug_low>=0?num(r[idx.sug_low]):null,
      sug_med: idx.sug_med>=0?num(r[idx.sug_med]):null, sug_high: idx.sug_high>=0?num(r[idx.sug_high]):null,
      state: idx.state>=0?String(r[idx.state]||'').trim():null, status: idx.status>=0?String(r[idx.status]||'').trim():null };
    const rawDate = idx.date >= 0 ? String(r[idx.date] || '').trim() : '';
    const d = rawDate && !Number.isNaN(Date.parse(rawDate)) ? new Date(rawDate).toISOString().slice(0, 10) : '';
    const bucket = d ? daily : life;
    const key = d ? (word + ' ' + mt + ' ' + d) : (word + ' ' + mt);
    const prev = bucket.get(key) || { word, mt, d, spend: 0, clicks: 0, impressions: 0, orders: 0, sales: 0, ...meta };
    for (const k of ['spend', 'clicks', 'impressions', 'orders', 'sales']) prev[k] += rec[k];
    // bid/suggestion are point-in-time attributes, not additive; keep the highest bid seen.
    if (meta.bid !== null && (prev.bid === null || meta.bid > prev.bid)) prev.bid = meta.bid;
    for (const k of ['sug_low','sug_med','sug_high','state','status']) if (meta[k] !== null && meta[k] !== '') prev[k] = meta[k];
    bucket.set(key, prev);
  }
  const days = [...daily.values()].map(v => v.d).sort();
  const pStart = days[0] || '1970-01-01';
  const pEnd = days[days.length - 1] || new Date().toISOString().slice(0, 10);
  const dSpend = [...daily.values()].reduce((a, v) => a + v.spend, 0).toFixed(2);
  const lSpend = [...life.values()].reduce((a, v) => a + v.spend, 0).toFixed(2);
  console.log('  parsed: ' + daily.size + ' keyword-days, ' + life.size + ' keyword totals, ' + skipped + ' unusable rows');
  console.log('  spend:  daily $' + dSpend + '   total-only $' + lSpend);
  if (dry) continue;

  for (const v of daily.values()) {
    await db.execute({ sql: 'INSERT INTO kw_daily (word,match_type,day,spend,clicks,impressions,orders,sales,ad_product) VALUES (?,?,?,?,?,?,?,?,\'SPONSORED_PRODUCTS\') ON CONFLICT(word,match_type,day,ad_product) DO UPDATE SET spend=excluded.spend, clicks=excluded.clicks, impressions=excluded.impressions, orders=excluded.orders, sales=excluded.sales, updated_at=datetime(\'now\')',
      args: [v.word, v.mt, v.d, v.spend, v.clicks, v.impressions, v.orders, v.sales, AD_PRODUCT] });
    totalDaily++;
  }
  for (const v of life.values()) {
    await db.execute({ sql: 'INSERT INTO kw_lifetime (word,match_type,period_start,period_end,spend,clicks,impressions,orders,sales,source,bid,sug_low,sug_med,sug_high,state,status,ad_product,currency,marketplace) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(word,match_type,period_start,period_end,source) DO UPDATE SET spend=excluded.spend, clicks=excluded.clicks, impressions=excluded.impressions, orders=excluded.orders, sales=excluded.sales, bid=excluded.bid, sug_low=excluded.sug_low, sug_med=excluded.sug_med, sug_high=excluded.sug_high, state=excluded.state, status=excluded.status, imported_at=datetime(\'now\')',
      args: [v.word, v.mt, pStart, pEnd, v.spend, v.clicks, v.impressions, v.orders, v.sales, basename(file), v.bid ?? null, v.sug_low ?? null, v.sug_med ?? null, v.sug_high ?? null, v.state ?? null, v.status ?? null, AD_PRODUCT, CURRENCY, MARKET] });
    totalLife++;
  }
}
console.log('\nwrote ' + totalDaily + ' keyword-days and ' + totalLife + ' keyword totals' + (dry ? ' (DRY RUN, nothing written)' : ''));
