/** Give the 3-Pack its own product-targeting ad group, aimed at the ASINs that have actually
 *  converted for us.
 *
 *  William 2026-10-06: "build ads for 3 pack", then yes to adding the ASIN targeting.
 *
 *  WHY PRODUCT TARGETING RATHER THAN MORE KEYWORDS. Measured since 2026-09-01:
 *     ASIN / auto targets   ~10% conversion at about $0.56 a click
 *     broad + phrase keys     4% conversion at $1.05 a click
 *  Product targeting is the cheapest converting inventory in the account. The four ASINs below have
 *  returned 5.29x, 2.39x, 1.34x and 1.20x, and they already run at a $0.37 bid in ad group
 *  266122741022729, so this is copying a configuration that works rather than guessing at one.
 *
 *  WHY A NEW AD GROUP. Amazon serves ONE ad per ad group per auction. On 2026-09-30 eight 3-Pack
 *  ads were dropped into the Single's ad groups and took 0 impressions in six days, because the
 *  Single's 480 reviews win every time. Putting the 3-Pack in with the existing proven targets
 *  would repeat that exactly. It needs its own ad group so its ad is the only one that can serve.
 *
 *  BID $0.37, matching the proven configuration, not the $0.25 keyword entry. Those targets realise
 *  about $0.56 a click from a $0.37 bid, and the 3-Pack can afford $0.78 at the measured 9.09%
 *  conversion, so $0.37 is inside its means and is the bid already shown to win impressions. A
 *  lower entry risks repeating September, where the test produced no data at all.
 *
 *  DRY RUN BY DEFAULT. Pass --apply to write.
 *  RUN: node scripts/three-pack-asin-targets.mjs [--apply]
 */
import { readFileSync } from 'node:fs';
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}
const APPLY = process.argv.includes('--apply');
const CID = '305834701368758', SKU = 'CPH-BLCK-3', ASIN_3PK = 'B097MK5VZ4';
const BID = 0.37, CEILING = 0.85, AG_NAME = '3-Pack ASIN targets';
const TARGETS = [
  { asin: 'B0GLY1GT7M', note: '5.29x at $0.56/click since 2026-09-01' },
  { asin: 'B0GLXVT1JT', note: '2.39x at $0.57/click' },
  { asin: 'B0CX1QMR5L', note: '1.34x at $0.60/click' },
  { asin: 'B0G2BF2ZJS', note: '1.20x at $0.56/click' },
];
const A = 'https://advertising-api.amazon.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function rq(u, o) { for (let i = 0; i < 8; i++) { try { const r = await fetch(u, o); if (r.status === 429) { await sleep(9000); continue; } return r; } catch { await sleep(4000); } } throw new Error('net'); }
const tok = (await (await rq('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: process.env.ADS_REFRESH_TOKEN, client_id: process.env.ADS_CLIENT_ID, client_secret: process.env.ADS_CLIENT_SECRET }) })).json()).access_token;
const H = ct => ({ Authorization: 'Bearer ' + tok, 'Amazon-Advertising-API-ClientId': process.env.ADS_CLIENT_ID, 'Amazon-Advertising-API-Scope': process.env.ADS_PROFILE_ID, 'Content-Type': ct, Accept: ct });
const AG = 'application/vnd.spAdGroup.v3+json', TG = 'application/vnd.spTargetingClause.v3+json', PA = 'application/vnd.spProductAd.v3+json';

const ags = JSON.parse(await (await rq(A + '/sp/adGroups/list', { method: 'POST', headers: H(AG), body: JSON.stringify({ maxResults: 500, campaignIdFilter: { include: [CID] } }) })).text()).adGroups || [];
let host = ags.find(g => g.name === AG_NAME);
console.log(`3-Pack campaign ${CID} has ${ags.length} ad groups:`);
for (const g of ags) console.log(`   ${String(g.state).padEnd(8)} "${g.name}"`);
console.log(host ? `\n"${AG_NAME}" already exists (${host.adGroupId})` : `\nwould CREATE ad group "${AG_NAME}" at $${BID}`);
console.log(`would add the 3-Pack product ad (${SKU} / ${ASIN_3PK}) so its ad is the only one that can serve there`);
console.log('would add these product targets:');
for (const t of TARGETS) console.log(`   asin=${t.asin}  $${BID.toFixed(2)}   ${t.note}`);
if (BID > CEILING) { console.error(`bid $${BID} is over the $${CEILING} confirm ceiling; stopping`); process.exit(1); }
if (!APPLY) { console.log(`\nDRY RUN. Nothing changed. Budget stays at $2/day; no new spending commitment.`); process.exit(0); }

if (!host) {
  const r = await rq(A + '/sp/adGroups', { method: 'POST', headers: H(AG), body: JSON.stringify({ adGroups: [{ campaignId: CID, name: AG_NAME, state: 'ENABLED', defaultBid: BID }] }) });
  const t = await r.text(); if (!r.ok) { console.error('adGroup ->', r.status, t.slice(0, 300)); process.exit(1); }
  const j = JSON.parse(t); host = j.adGroups?.success?.[0]?.adGroup ?? { adGroupId: j.adGroups?.success?.[0]?.adGroupId };
  console.log(`\nad group created: ${host?.adGroupId}`);
}
if (!host?.adGroupId) { console.error('no ad group id to work with'); process.exit(1); }

const r2 = await rq(A + '/sp/productAds', { method: 'POST', headers: H(PA), body: JSON.stringify({ productAds: [{ campaignId: CID, adGroupId: String(host.adGroupId), sku: SKU, state: 'ENABLED' }] }) });
const t2 = await r2.text();
console.log(r2.ok ? `product ad: ${JSON.parse(t2).productAds?.success?.length ?? 0} created` : `productAd -> ${r2.status} ${t2.slice(0, 300)}`);

const r3 = await rq(A + '/sp/targets', { method: 'POST', headers: H(TG), body: JSON.stringify({ targetingClauses: TARGETS.map(t => ({ campaignId: CID, adGroupId: String(host.adGroupId), expressionType: 'MANUAL', state: 'ENABLED', bid: BID, expression: [{ type: 'ASIN_SAME_AS', value: t.asin }] })) }) });
const t3 = await r3.text();
console.log(r3.ok ? `targets: ${JSON.parse(t3).targetingClauses?.success?.length ?? 0} created, ${JSON.parse(t3).targetingClauses?.error?.length ?? 0} refused` : `targets -> ${r3.status} ${t3.slice(0, 400)}`);

await sleep(6000);
const vt = JSON.parse(await (await rq(A + '/sp/targets/list', { method: 'POST', headers: H(TG), body: JSON.stringify({ maxResults: 500, includeExtendedDataFields: true, campaignIdFilter: { include: [CID] } }) })).text()).targetingClauses || [];
const vp = JSON.parse(await (await rq(A + '/sp/productAds/list', { method: 'POST', headers: H(PA), body: JSON.stringify({ maxResults: 500, includeExtendedDataFields: true, campaignIdFilter: { include: [CID] } }) })).text()).productAds || [];
console.log('\nREAD BACK');
for (const t of vt) console.log(`  target ${String(t.state).padEnd(8)} $${Number(t.bid).toFixed(2)}  ${JSON.stringify(t.expression)}  serving=${t.extendedData?.servingStatus || '?'}`);
for (const p of vp) console.log(`  ad     ${String(p.state).padEnd(8)} ${p.asin || p.sku}  adGroup=${p.adGroupId}  serving=${p.extendedData?.servingStatus || '?'}`);
const over = vt.filter(t => t.state === 'ENABLED' && Number(t.bid) > CEILING).length;
console.log(`\n${over === 0 ? 'OK' : 'VIOLATION'}: ${over} enabled targets above the $${CEILING} ceiling`);
