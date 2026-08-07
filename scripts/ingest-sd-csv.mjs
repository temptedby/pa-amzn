#!/usr/bin/env node
// Ingest non-keyword console exports (SD audiences, SD ads, SP ads) into ad_entity_lifetime.
// These have no keyword column, so they cannot live in kw_lifetime.
//   node scripts/ingest-sd-csv.mjs [--dry] [--product=SPONSORED_PRODUCTS] <file.csv> ...
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { URL } from 'node:url';
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const db = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
const args = process.argv.slice(2), dry = args.includes('--dry');
const files = args.filter(a => !a.startsWith('--'));
const prodArg = args.find(a => a.startsWith('--product='));
const AD_PRODUCT = prodArg ? prodArg.split('=')[1] : 'SPONSORED_DISPLAY';
const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const CR = String.fromCharCode(13);
function parse(t) { const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"' && t[i+1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== CR) cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== '')); }
const AS_OF = '2026-08-05';
let n = 0;
for (const f of files) {
  const rows = parse(readFileSync(f, 'utf8'));
  const h = rows[0], ix = name => h.findIndex(c => c.trim().toLowerCase().replace(/[^a-z0-9]/g,'') === name);
  const nameCol = [ix('ads'), ix('adname'), ix('audiences'), ix('targets')].find(i => i >= 0) ?? -1;
  const type = ix('audiences') >= 0 ? 'AUDIENCE' : (ix('targets') >= 0 ? 'TARGET' : 'AD');
  if (nameCol < 0) { console.error('SKIP ' + basename(f) + ': no ads/audiences/ad name column'); continue; }
  // SP ad exports carry no ID column; SKU (falling back to ASIN) is the stable identity there.
  const idCol = [ix('id'), ix('sku'), ix('asin')].find(i => i >= 0) ?? -1;
  let rowsIn = 0, spend = 0, sales = 0;
  for (const r of rows.slice(1)) {
    const id = String(r[idCol] ?? '').trim(); if (!id) continue;
    const pick = (...names) => { for (const n of names) { const i = ix(n); if (i >= 0) return num(r[i]); } return 0; };
    const rec = { spend: pick('spend', 'totalcostusd', 'totalcost'), sales: pick('sales', 'salesusd'),
      orders: pick('orders', 'purchases'), clicks: pick('clicks'), impressions: pick('impressions'),
      dpv: pick('dpv'), bid: ix('bid') >= 0 ? num(r[ix('bid')]) : null,
      sug: ix('suggestedbid') >= 0 ? num(r[ix('suggestedbid')]) : null };
    spend += rec.spend; sales += rec.sales; rowsIn++;
    if (dry) continue;
    await db.execute({ sql: `INSERT INTO ad_entity_lifetime
      (entity_type,entity_id,entity_name,asin,ad_product,status,bid,sug_bid,impressions,clicks,dpv,spend,orders,sales,currency,marketplace,source,as_of)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'USD','US',?,?)
      ON CONFLICT(entity_type,entity_id,as_of,source) DO UPDATE SET
        spend=excluded.spend, sales=excluded.sales, orders=excluded.orders, clicks=excluded.clicks,
        impressions=excluded.impressions, dpv=excluded.dpv, bid=excluded.bid, sug_bid=excluded.sug_bid`,
      args: [type, id, String(r[nameCol] ?? '').slice(0, 300), ix('asin') >= 0 ? String(r[ix('asin')] ?? '') : null,
             AD_PRODUCT, String(r[ix('status')] ?? ''), rec.bid, rec.sug, rec.impressions, rec.clicks, rec.dpv,
             rec.spend, rec.orders, rec.sales, basename(f), AS_OF] });
    n++;
  }
  const roas = spend > 0 ? (sales / spend).toFixed(2) : 'n/a';
  console.log(`${basename(f)}  [${type}]  ${rowsIn} rows  spend $${spend.toFixed(2)}  sales $${sales.toFixed(2)}  ROAS ${roas}`);
}
console.log(`\n${dry ? 'DRY RUN, nothing written' : 'wrote ' + n + ' rows'}`);
