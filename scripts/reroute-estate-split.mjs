/**
 * reroute-estate-split.mjs — split the REAL ad estate between the Single and the 2-Pack.
 *
 * William 2026-10-23: "all the live ads we had way more than this all live ads half budget to
 * single and half budget to the 2 pack".
 *
 * Rather than build new campaigns (which start with no click history, the handicap that buried the
 * 3-Pack on 10-08), this reroutes the two campaigns that carry 95% of SP spend:
 *
 *     212260116772958   $271.84 Oct, 13 orders, has the +50/+50 placements   ->  SINGLE
 *     212881454178968   $201.25 Oct, 10 orders                               ->  2-PACK
 *
 * Budget: October SP actual was $21.59/day. Half is $10.80, set as $5.40/day each, so the total is
 * halved and the two ASINs get equal money. These campaigns' old budgets ($90 and $250) never bound
 * anything; actual spend was $11.82 and $8.75/day, so a $5.40 cap is a real halving.
 *
 * Keywords: only the shortlist (settled ROAS >= 1.50x through 2026-10-09) stays enabled. Missing
 * shortlist words are added to each campaign's busiest ad group so both sides carry the same list.
 *
 * Left alone on purpose: the 3-Pack keeps every product-targeting ad group (William 2026-10-20,
 * "keep the three pack on ACE and targeting"), and the four cheap targeting clauses keep running.
 *
 * DRY RUN BY DEFAULT. --apply writes.
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
const APPLY = process.argv.includes('--apply');
const BUDGET = Number((process.argv.find(a => a.startsWith('--budget=')) || '--budget=5.40').split('=')[1]);
const SETTLED_THROUGH = '2026-10-09', BAR = 1.5, FLOOR = 0.10, CEILING = 0.85;

const SIDES = [
  { tag: 'Single', campaignId: '212260116772958', sku: '57-P4AJ-J4AC', asin: 'B07Y5GZP1T' },
  { tag: '2-Pack', campaignId: '212881454178968', sku: 'CPH-BLCK-2',   asin: 'B097MGPCPC' },
];
// Campaigns whose only enabled ad is NOT_BUYABLE: they cannot serve, and one of them still burned
// $5.54 this month. Pausing them is the cheapest saving on this page.
const DARK = [
  { id: '324534995037875', why: 'only ad is B0CFYW3NYQ NOT_BUYABLE, spent $5.54 Oct for 0 orders' },
  { id: '534305991369689', why: 'only ad is B097MGPCPC on sku 34-MR1G-UASV, NOT_BUYABLE' },
];
// The sandbox pair built earlier today. Redundant once the established campaigns carry the list,
// and worse, because they have no click history at all.
const SANDBOX = ['265068164981323', '62806633223492'];

const A = 'https://advertising-api.amazon.com';
const CID = process.env.ADS_CLIENT_ID, CS = process.env.ADS_CLIENT_SECRET,
      RT = process.env.ADS_REFRESH_TOKEN, PROF = process.env.ADS_PROFILE_ID_US || process.env.ADS_PROFILE_ID;
const V = { C: 'application/vnd.spCampaign.v3+json', G: 'application/vnd.spAdGroup.v3+json',
            P: 'application/vnd.spProductAd.v3+json', K: 'application/vnd.spKeyword.v3+json' };
const { access_token } = await (await fetch('https://api.amazon.com/auth/o2/token', { method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: RT, client_id: CID, client_secret: CS }) })).json();
const H = (t) => ({ Authorization: 'Bearer ' + access_token, 'Amazon-Advertising-API-ClientId': CID,
  'Amazon-Advertising-API-Scope': PROF, 'Content-Type': t, Accept: t });
const call = async (method, path, type, body) => {
  const r = await fetch(A + path, { method, headers: H(type), body: JSON.stringify(body) });
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
  return { ok: r.ok, status: r.status, j, txt };
};
const post = (p, t, b) => call('POST', p, t, b), put = (p, t, b) => call('PUT', p, t, b);
async function L(path, type, key, extra = {}) {
  let o = [], tok = null;
  do { const b = { maxResults: 500, includeExtendedDataFields: true, ...extra }; if (tok) b.nextToken = tok;
    const r = await post(path, type, b);
    if (!r.ok) { console.log('  UNREAD ' + path + ' ' + r.status + ' ' + r.txt.slice(0, 160)); break; }
    o.push(...(r.j?.[key] || [])); tok = r.j?.nextToken || null; } while (tok);
  return o;
}

// ------------------------------------------------------------------ shortlist
const { createClient } = await import('@libsql/client');
const db = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
const rows = (await db.execute({ sql: `select keyword_id, word, match_type, sum(spend) sp, sum(clicks) clk,
  sum(orders) ord, sum(sales) sa from kw_day where day <= ? group by 1,2,3 having sum(orders) > 0`, args: [SETTLED_THROUGH] })).rows;
const tier = rows.map(x => ({ id: String(x.keyword_id), word: String(x.word), mt: String(x.match_type),
  sp: x.sp || 0, clk: x.clk || 0, ord: x.ord || 0, sa: x.sa || 0 }))
  .map(x => ({ ...x, roas: x.sa / x.sp, cpc: x.clk ? x.sp / x.clk : 0 }))
  .filter(x => x.roas >= BAR && ['BROAD', 'PHRASE', 'EXACT'].includes(x.mt));
const seen = new Map();
for (const k of tier.sort((a, b) => b.roas - a.roas)) { const key = k.word.toLowerCase() + '|' + k.mt; if (!seen.has(key)) seen.set(key, k); }
const PLAN = [...seen.values()].map(k => ({ ...k, bid: Math.min(CEILING, Math.max(FLOOR, Math.round(k.cpc * 100) / 100)) }));
const WANT = new Set(PLAN.map(k => k.word.toLowerCase() + '|' + k.mt));
console.log(`shortlist: ${PLAN.length} keywords at settled ROAS >= ${BAR}x through ${SETTLED_THROUGH}`);

// ------------------------------------------------------------------ live state
const camps = await L('/sp/campaigns/list', V.C, 'campaigns');
const ags = await L('/sp/adGroups/list', V.G, 'adGroups');
const ads = await L('/sp/productAds/list', V.P, 'productAds');
const kws = await L('/sp/keywords/list', V.K, 'keywords');
const CM = new Map(camps.map(c => [String(c.campaignId), c]));

const actions = { enableAd: [], pauseAd: [], createAd: [], pauseKw: [], createKw: [], budget: [], pauseCamp: [] };
for (const s of SIDES) {
  const c = CM.get(s.campaignId);
  s.myAgs = ags.filter(a => String(a.campaignId) === s.campaignId && a.state === 'ENABLED');
  // keyword ad groups only: a product-targeting group keeps the 3-Pack
  s.kwAgs = s.myAgs.filter(a => kws.some(k => String(k.adGroupId) === String(a.adGroupId)));
  s.busiest = s.kwAgs.map(a => ({ a, n: kws.filter(k => String(k.adGroupId) === String(a.adGroupId) && k.state === 'ENABLED').length }))
    .sort((x, y) => y.n - x.n)[0]?.a;
  console.log(`\n=== ${s.tag}  campaign ${s.campaignId}  "${String(c?.name).slice(0, 40)}"`);
  console.log(`    budget $${c?.budget?.budget} -> $${BUDGET.toFixed(2)}/day`);
  actions.budget.push({ campaignId: s.campaignId, budget: BUDGET, tag: s.tag, was: c?.budget?.budget });
  for (const g of s.kwAgs) {
    const gid = String(g.adGroupId);
    const mine = ads.filter(x => String(x.adGroupId) === gid);
    const want = mine.find(x => x.sku === s.sku || x.asin === s.asin);
    const others = mine.filter(x => x.state === 'ENABLED' && !(x.sku === s.sku || x.asin === s.asin));
    if (want && want.state === 'ENABLED') console.log(`    ag ${gid}  ${s.tag} ad ${want.adId} already ENABLED`);
    else if (want) { actions.enableAd.push({ adId: String(want.adId), gid, tag: s.tag }); console.log(`    ag ${gid}  ENABLE existing ${s.tag} ad ${want.adId}`); }
    else { actions.createAd.push({ campaignId: s.campaignId, adGroupId: gid, sku: s.sku, tag: s.tag }); console.log(`    ag ${gid}  CREATE ${s.tag} ad on sku ${s.sku}`); }
    for (const o of others) { actions.pauseAd.push({ adId: String(o.adId), gid, asin: o.asin }); console.log(`    ag ${gid}  PAUSE ${o.asin} ad ${o.adId}  (one ad per ad group)`); }
  }
  // keywords: pause anything off-list, add anything missing to the busiest ad group
  const mineKw = kws.filter(k => k.state === 'ENABLED' && s.kwAgs.some(g => String(g.adGroupId) === String(k.adGroupId)));
  const have = new Set(mineKw.map(k => String(k.keywordText).toLowerCase() + '|' + k.matchType));
  const kill = mineKw.filter(k => !WANT.has(String(k.keywordText).toLowerCase() + '|' + k.matchType));
  const add = PLAN.filter(k => !have.has(k.word.toLowerCase() + '|' + k.mt));
  console.log(`    keywords: ${mineKw.length} enabled -> pause ${kill.length}, keep ${mineKw.length - kill.length}, add ${add.length} missing`);
  for (const k of kill) actions.pauseKw.push({ keywordId: String(k.keywordId) });
  if (s.busiest) for (const k of add) actions.createKw.push({ campaignId: s.campaignId, adGroupId: String(s.busiest.adGroupId),
    keywordText: k.word, matchType: k.mt, state: 'ENABLED', bid: k.bid });
}
for (const d of DARK) { const c = CM.get(d.id); if (c?.state === 'ENABLED') { actions.pauseCamp.push(d); console.log(`\nPAUSE dark campaign ${d.id}  "${String(c.name).slice(0, 34)}"  budget $${c.budget?.budget}  — ${d.why}`); } }
for (const id of SANDBOX) { const c = CM.get(id); if (c?.state === 'ENABLED') { actions.pauseCamp.push({ id, why: 'sandbox pair replaced by the rerouted established campaigns' }); console.log(`PAUSE sandbox ${id}  "${String(c.name).slice(0, 34)}"`); } }

const totalAfter = SIDES.length * BUDGET;
console.log(`\n--- SUMMARY`);
console.log(`  budgets set          ${actions.budget.length}  -> $${totalAfter.toFixed(2)}/day total, half-and-half`);
console.log(`  product ads enable   ${actions.enableAd.length}   create ${actions.createAd.length}   pause ${actions.pauseAd.length}`);
console.log(`  keywords  pause      ${actions.pauseKw.length}   create ${actions.createKw.length}`);
console.log(`  campaigns paused     ${actions.pauseCamp.length}`);
console.log(`  October SP actual was $21.59/day. After this the cap is $${totalAfter.toFixed(2)}/day, ${(100*totalAfter/21.59).toFixed(0)}% of it.`);

if (!APPLY) { console.log('\n=========== DRY RUN. Nothing was written. Re-run with --apply. ==========='); process.exit(0); }

console.log('\n--- writing');
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
// 1. budgets first: a reroute must never run under an old $250 cap
for (const c of chunk(actions.budget, 10)) {
  const r = await put('/sp/campaigns', V.C, { campaigns: c.map(x => ({ campaignId: x.campaignId, budget: { budget: x.budget, budgetType: 'DAILY' } })) });
  console.log(`  budgets ${r.status}  success ${(r.j?.campaigns?.success || []).length}`);
}
// 2. the target ad must be live BEFORE the incumbent is paused, or the ad group goes dark
for (const c of chunk(actions.enableAd, 50)) {
  const r = await put('/sp/productAds', V.P, { productAds: c.map(x => ({ adId: x.adId, state: 'ENABLED' })) });
  console.log(`  enable ads ${r.status}  success ${(r.j?.productAds?.success || []).length}`);
}
for (const c of chunk(actions.createAd, 50)) {
  const r = await post('/sp/productAds', V.P, { productAds: c.map(x => ({ campaignId: x.campaignId, adGroupId: x.adGroupId, sku: x.sku, state: 'ENABLED' })) });
  console.log(`  create ads ${r.status}  success ${(r.j?.productAds?.success || []).length}  error ${(r.j?.productAds?.error || []).length}`);
  for (const e of (r.j?.productAds?.error || []).slice(0, 4)) console.log('    ' + JSON.stringify(e).slice(0, 200));
}
// verify every target ad group now holds an enabled ad for the right ASIN, before pausing anything
const adsNow = await L('/sp/productAds/list', V.P, 'productAds');
let safe = true;
for (const s of SIDES) for (const g of s.kwAgs) {
  const gid = String(g.adGroupId);
  const ok = adsNow.some(x => String(x.adGroupId) === gid && x.state === 'ENABLED' && (x.sku === s.sku || x.asin === s.asin));
  if (!ok) { console.log(`  REFUSING to pause in ag ${gid}: no enabled ${s.tag} ad present`); safe = false; }
}
if (!safe) { console.log('\n  STOPPING before any pause. No ad group will be left dark.'); process.exit(1); }
for (const c of chunk(actions.pauseAd, 50)) {
  const r = await put('/sp/productAds', V.P, { productAds: c.map(x => ({ adId: x.adId, state: 'PAUSED' })) });
  console.log(`  pause old ads ${r.status}  success ${(r.j?.productAds?.success || []).length}`);
}
// 3. keywords: add the missing ones, then pause the off-list ones
for (const c of chunk(actions.createKw, 100)) {
  const r = await post('/sp/keywords', V.K, { keywords: c });
  console.log(`  create kw ${r.status}  success ${(r.j?.keywords?.success || []).length}  error ${(r.j?.keywords?.error || []).length}`);
}
let paused = 0;
for (const c of chunk(actions.pauseKw, 100)) {
  const r = await put('/sp/keywords', V.K, { keywords: c.map(x => ({ keywordId: x.keywordId, state: 'PAUSED' })) });
  paused += (r.j?.keywords?.success || []).length;
}
console.log(`  paused ${paused} of ${actions.pauseKw.length} off-list keywords`);
// 4. campaigns that cannot serve, and the redundant sandbox
for (const c of chunk(actions.pauseCamp, 10)) {
  const r = await put('/sp/campaigns', V.C, { campaigns: c.map(x => ({ campaignId: x.id, state: 'PAUSED' })) });
  console.log(`  pause campaigns ${r.status}  success ${(r.j?.campaigns?.success || []).length}`);
}
console.log('\n--- read-back');
const c2 = await L('/sp/campaigns/list', V.C, 'campaigns');
const a2 = await L('/sp/adGroups/list', V.G, 'adGroups');
const p2 = await L('/sp/productAds/list', V.P, 'productAds');
const k2 = await L('/sp/keywords/list', V.K, 'keywords');
const en2 = c2.filter(x => x.state === 'ENABLED');
console.log(`  enabled campaigns ${en2.length}, authorised $${en2.reduce((t, x) => t + (x.budget?.budget || 0), 0).toFixed(2)}/day`);
for (const s of SIDES) {
  const live = p2.filter(x => x.state === 'ENABLED' && s.kwAgs.some(g => String(g.adGroupId) === String(x.adGroupId)));
  const lk = k2.filter(x => x.state === 'ENABLED' && s.kwAgs.some(g => String(g.adGroupId) === String(x.adGroupId)));
  const byA = {}; for (const x of live) byA[x.asin] = (byA[x.asin] || 0) + 1;
  const ss = {}; for (const x of live) { const v = x.extendedData?.servingStatus || '?'; ss[v] = (ss[v] || 0) + 1; }
  console.log(`  ${s.tag}: budget $${CM.get(s.campaignId) && c2.find(x => String(x.campaignId) === s.campaignId)?.budget?.budget}/day, ads ${JSON.stringify(byA)} ${JSON.stringify(ss)}, ${lk.length} keywords enabled`);
}
