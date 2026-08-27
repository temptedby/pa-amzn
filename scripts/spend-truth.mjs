/** READ-ONLY. Answers exactly two questions William asked on 2026-08-26, across every ad product
 *  and every marketplace we spend in:
 *
 *   A) Is any entity STILL ENABLED that has spent the kill bar or more this month and has NEVER
 *      converted?
 *   B) Is any entity STILL ENABLED that HAS converted this month but is running under 1.5x ROAS?
 *
 *  Question B deliberately has NO spend floor. William asked for every converting keyword under
 *  1.5x that is live, not only the ones past $4, so a word that converted on $1 of spend is listed
 *  with its spend shown rather than filtered out.
 *
 *  Every row is month-to-date spend from Amazon's own report joined to a live state read-back taken
 *  in the same run. An entity the state read cannot resolve is printed as NOT FOUND and counted as
 *  a violation, never as a pass (William 2026-08-25: "could not find is violation").
 *
 *  RUN: node scripts/spend-truth.mjs
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}
const A = 'https://advertising-api.amazon.com';
const START = '2026-08-01';
const END = new Date().toISOString().slice(0, 10);
const ROAS_BAR = 1.5;
const KILL_SPEND = { USD: 4, CAD: 5.5, MXN: 68 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function rq(u, o) { for (let i = 0; i < 8; i++) { try { const r = await fetch(u, o); if (r.status === 429) { await sleep(9000); continue; } return r; } catch { await sleep(4000); } } throw new Error('net'); }

let tok;
async function refreshToken() {
  const j = await (await rq('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: process.env.ADS_REFRESH_TOKEN, client_id: process.env.ADS_CLIENT_ID, client_secret: process.env.ADS_CLIENT_SECRET }) })).json();
  tok = j.access_token; if (!tok) throw new Error('could not mint an access token');
}
const H = (pid, ct) => ({ Authorization: `Bearer ${tok}`, 'Amazon-Advertising-API-ClientId': process.env.ADS_CLIENT_ID, 'Amazon-Advertising-API-Scope': pid, 'Content-Type': ct, 'Accept': ct });
const V3 = 'application/vnd.createasyncreportrequest.v3+json';
const parseIds = s => JSON.parse(s.replace(/"(keywordId|adGroupId|campaignId|targetId)":\s*(\d{10,})/g, '"$1":"$2"'));

async function report(pid, cfg, name) {
  const cr = await (await rq(`${A}/reporting/reports`, { method: 'POST', headers: H(pid, V3), body: JSON.stringify({ name, startDate: START, endDate: END, configuration: cfg }) })).json();
  let rid = cr.reportId; if (!rid) { const m = String(cr.detail || '').match(/([0-9a-f-]{36})/); if (m) rid = m[1]; }
  if (!rid) return { rows: null, why: JSON.stringify(cr).slice(0, 200) };
  for (let i = 0; i < 420; i++) {
    await sleep(7000);
    const s = await (await rq(`${A}/reporting/reports/${rid}`, { headers: H(pid, V3) })).json();
    if (s.status === 'COMPLETED') return { rows: parseIds(gunzipSync(Buffer.from(await (await rq(s.url)).arrayBuffer())).toString()) };
    if (s.status === 'FAILURE') return { rows: null, why: 'report FAILURE' };
  }
  return { rows: null, why: 'still queued after 49 minutes' };
}

const fmt = n => Number(n).toFixed(2);
const A_LIST = [], B_LIST = [];

function judge(label, ccy, rows, state) {
  const bar = KILL_SPEND[ccy] ?? 4;
  let spend = 0, sales = 0, n = 0;
  for (const r of rows) {
    const id = String(r.keywordId ?? r.targetId ?? '');
    const c = +r.cost || 0, s = +r.sales14d || +r.sales || 0, o = +r.purchases14d || +r.purchases || 0;
    spend += c; sales += s;
    if (c <= 0) continue;
    n++;
    const st = state.get(id);
    const live = st ? String(st.state).toUpperCase() : 'NOT FOUND';
    const on = live === 'ENABLED' || live === 'NOT FOUND';
    const word = `${r.keyword ?? r.targeting ?? r.targetingText ?? '(auto)'} ${String(r.matchType ?? r.keywordType ?? '').toUpperCase()}`.trim();
    if (o === 0 && c >= bar && on) A_LIST.push({ label, ccy, c, s, o, word, live, bid: st?.bid });
    if (o >= 1 && s / c < ROAS_BAR && on) B_LIST.push({ label, ccy, c, s, o, word, live, bid: st?.bid });
  }
  console.log(`  ${label}: ${n} entities spent, ${ccy} ${fmt(spend)}, sales ${ccy} ${fmt(sales)}, ROAS ${spend ? (sales / spend).toFixed(2) : '0.00'}, kill bar ${ccy} ${bar}`);
}

async function spState(pid) {
  const state = new Map();
  for (const [path, ct, key, idk] of [['/sp/keywords/list', 'application/vnd.spKeyword.v3+json', 'keywords', 'keywordId'],
                                      ['/sp/targets/list', 'application/vnd.spTargetingClause.v3+json', 'targetingClauses', 'targetId']]) {
    let next = null;
    do {
      const t = await (await rq(`${A}${path}`, { method: 'POST', headers: H(pid, ct), body: JSON.stringify({ maxResults: 1000, ...(next ? { nextToken: next } : {}) }) })).text();
      const r = parseIds(t);
      for (const k of (r[key] || [])) state.set(String(k[idk]), { state: k.state, bid: k.bid });
      next = r.nextToken || null;
    } while (next);
  }
  return state;
}

async function sp(label, pid, ccy) {
  await refreshToken();
  const { rows, why } = await report(pid, { adProduct: 'SPONSORED_PRODUCTS', groupBy: ['targeting'],
    columns: ['keywordId', 'keyword', 'keywordType', 'matchType', 'campaignName', 'clicks', 'cost', 'purchases14d', 'sales14d'],
    reportTypeId: 'spTargeting', timeUnit: 'SUMMARY', format: 'GZIP_JSON' }, `truth-sp-${ccy}`);
  if (!rows) { console.log(`  ${label}: COULD NOT READ (${why}). NOTHING is judged here.`); return; }
  judge(label, ccy, rows, await spState(pid));
}

async function sd(label, pid, ccy) {
  await refreshToken();
  const { rows, why } = await report(pid, { adProduct: 'SPONSORED_DISPLAY', groupBy: ['targeting'],
    columns: ['targetingId', 'targetingText', 'targetingExpression', 'campaignName', 'clicks', 'cost', 'purchases', 'sales'],
    reportTypeId: 'sdTargeting', timeUnit: 'SUMMARY', format: 'GZIP_JSON' }, `truth-sd-${ccy}`);
  if (!rows) { console.log(`  ${label}: COULD NOT READ (${why}). NOTHING is judged here.`); return; }
  const state = new Map();
  for (let i = 0; ; i += 100) {
    const t = await (await rq(`${A}/sd/targets?startIndex=${i}&count=100`, { headers: H(pid, 'application/json') })).text();
    const page = parseIds(t); if (!page.length) break;
    for (const k of page) state.set(String(k.targetId), { state: k.state, bid: k.bid });
    if (page.length < 100) break;
  }
  judge(label, ccy, rows.map(r => ({ ...r, targetId: r.targetingId, keyword: r.targetingText || r.targetingExpression })), state);
}

async function sb(label, pid, ccy) {
  await refreshToken();
  const acc = new Map();
  for (let d = new Date(START + 'T00:00:00Z'); d <= new Date(END + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10).replace(/-/g, '');
    let url = null;
    for (let a = 0; a < 3 && !url; a++) {
      const j = await (await rq(`${A}/v2/hsa/keywords/report`, { method: 'POST', headers: H(pid, 'application/json'),
        body: JSON.stringify({ reportDate: day, metrics: 'cost,attributedSales14d,attributedConversions14d,clicks' }) })).json();
      if (j.location) url = j.location; else await sleep(4000);
    }
    if (!url) { console.log(`  ${label}: day ${day} would not report. NOTHING is judged for Sponsored Brands.`); return; }
    for (let i = 0; i < 40; i++) {
      const r = await rq(url, { headers: H(pid, 'application/json'), redirect: 'follow' });
      if (r.status === 200) {
        const b = Buffer.from(await r.arrayBuffer());
        const rows = parseIds((b[0] === 0x1f ? gunzipSync(b) : b).toString());
        for (const x of rows) {
          const id = String(x.keywordId ?? ''); if (!id) continue;
          const o = acc.get(id) ?? { keywordId: id, keyword: x.keywordText, matchType: x.matchType, cost: 0, sales14d: 0, purchases14d: 0 };
          o.cost += +x.cost || 0; o.sales14d += +x.attributedSales14d || 0; o.purchases14d += +x.attributedConversions14d || 0;
          acc.set(id, o);
        }
        break;
      }
      await sleep(5000);
    }
  }
  const state = new Map();
  const t = await (await rq(`${A}/sb/keywords`, { headers: { ...H(pid, 'application/json'), Accept: 'application/vnd.sbkeyword.v3.2+json' } })).text();
  for (const k of parseIds(t)) state.set(String(k.keywordId), { state: k.state, bid: k.bid });
  judge(label, ccy, [...acc.values()], state);
}

console.log(`\nTHE TWO QUESTIONS, ${START} to ${END}, live Amazon state read in the same run.\n`);
await sp('SPONSORED PRODUCTS US', process.env.ADS_PROFILE_ID, 'USD');
await sd('SPONSORED DISPLAY US', process.env.ADS_PROFILE_ID, 'USD');
await sb('SPONSORED BRANDS US', process.env.ADS_PROFILE_ID, 'USD');
if (process.env.ADS_PROFILE_ID_CA) await sp('SPONSORED PRODUCTS CANADA', process.env.ADS_PROFILE_ID_CA, 'CAD');
if (process.env.ADS_PROFILE_ID_MX) await sp('SPONSORED PRODUCTS MEXICO', process.env.ADS_PROFILE_ID_MX, 'MXN');

const show = (title, list) => {
  console.log(`\n=========== ${title} ===========`);
  if (!list.length) { console.log('  none.'); return; }
  list.sort((a, b) => b.c - a.c);
  for (const r of list) console.log(`  ${r.ccy} ${fmt(r.c).padStart(8)} spent  ${r.ccy} ${fmt(r.s).padStart(8)} sales  ${(r.c ? r.s / r.c : 0).toFixed(2).padStart(5)}x  ${String(r.o).padStart(2)}ord  bid ${String(r.bid ?? '-').padStart(5)}  ${r.live.padEnd(9)} ${r.word.slice(0, 46).padEnd(46)} ${r.label}`);
  console.log(`  ${list.length} entities.`);
};
show('A. SPENT THE KILL BAR OR MORE, NEVER CONVERTED, STILL LIVE', A_LIST);
show(`B. CONVERTED BUT UNDER ${ROAS_BAR}x ROAS, STILL LIVE (no spend floor)`, B_LIST);
