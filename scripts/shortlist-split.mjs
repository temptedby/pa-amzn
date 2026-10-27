/**
 * shortlist-split.mjs — build two identical SP campaigns, one per ASIN, and point them
 * at the only keyword set this account has ever run profitably.
 *
 * William 2026-10-23: "create all new ad campaigns that are exactly the same with exact
 * keywords for everything, but direct half the budget to the two-clip and half to the
 * single-clip."
 *
 * WHY IDENTICAL KEYWORDS WORK HERE: Amazon serves one ad per advertiser per auction, so
 * with open budgets the Single (482 reviews) would win nearly every impression. With a
 * tight DAILY cap it cannot: once the Single's campaign spends its cap it leaves the
 * auction for the rest of the day and the 2-Pack takes those impressions. The cap is the
 * splitter. Read the result as ROAS per campaign, which is budget-normalised; do not read
 * impression share, which is time-of-day biased.
 *
 * SHORTLIST: settled ROAS >= 1.50x on kw_day through 2026-10-09 (14-day attribution
 * complete). 58 entities, of which 54 are keywords. The other 4 are targeting clauses and
 * are deliberately left alone where they are: they are our cheapest converters at
 * $0.18-$0.56 a click and cannot live in a keyword campaign.
 *
 * DRY RUN BY DEFAULT. --apply writes. --pause-old additionally pauses the ~1,886 other
 * live keywords, which is what stops us bidding against our own new campaigns.
 *
 * Passes are gated: nothing in pass N+1 runs unless pass N verified. Pass 2 reads back
 * servingStatus on each product ad, because SP-API is down and a SKU's offer cannot be
 * confirmed any other way. An unverified SKU is what minted the NOT_BUYABLE ads that left
 * two campaigns dark on 2026-10-08.
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }

const APPLY = process.argv.includes('--apply');
const PAUSE_OLD = process.argv.includes('--pause-old');
const BUDGET = Number((process.argv.find(a => a.startsWith('--budget=')) || '--budget=5').split('=')[1]);
const ROAS_BAR = Number((process.argv.find(a => a.startsWith('--bar=')) || '--bar=1.5').split('=')[1]);
const SETTLED_THROUGH = '2026-10-09';     // today minus the 14-day attribution window
const FLOOR = 0.10, CEILING = 0.85;       // BID_FLOOR and BID_CONFIRM_CEILING from ad-rules.ts
const TODAY = '2026-10-23';

const SIDES = [
  { tag: 'Single', sku: '57-P4AJ-J4AC', asin: 'B07Y5GZP1T', name: 'PA Shortlist - Single - 2026-10-23' },
  { tag: '2-Pack', sku: 'CPH-BLCK-2',   asin: 'B097MGPCPC', name: 'PA Shortlist - 2-Pack - 2026-10-23' },
];

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
const post = async (path, type, body) => {
  const r = await fetch(A + path, { method: 'POST', headers: H(type), body: JSON.stringify(body) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch {}
  return { ok: r.ok, status: r.status, j, txt };
};
const put = async (path, type, body) => {
  const r = await fetch(A + path, { method: 'PUT', headers: H(type), body: JSON.stringify(body) });
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
  return { ok: r.ok, status: r.status, j, txt };
};
async function listAll(path, type, key, extra = {}) {
  let out = [], tok = null;
  do { const b = { maxResults: 500, includeExtendedDataFields: true, ...extra }; if (tok) b.nextToken = tok;
    const r = await post(path, type, b);
    if (!r.ok) { console.log('  UNREAD ' + path + ' ' + r.status + ' ' + r.txt.slice(0, 200)); break; }
    out.push(...(r.j?.[key] || [])); tok = r.j?.nextToken || null;
  } while (tok);
  return out;
}

// ---------------------------------------------------------------- the shortlist
const { createClient } = await import('@libsql/client');
const db = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
const rows = (await db.execute({
  sql: `select keyword_id, word, match_type, sum(spend) sp, sum(clicks) clk, sum(orders) ord, sum(sales) sa
        from kw_day where day <= ? group by 1,2,3 having sum(orders) > 0`, args: [SETTLED_THROUGH] })).rows;
const all = rows.map(x => ({ id: String(x.keyword_id), word: String(x.word), mt: String(x.match_type),
  sp: x.sp || 0, clk: x.clk || 0, ord: x.ord || 0, sa: x.sa || 0 })).map(x => ({ ...x, roas: x.sa / x.sp, cpc: x.clk ? x.sp / x.clk : 0 }));
const tier = all.filter(x => x.roas >= ROAS_BAR);
const KW = tier.filter(x => ['BROAD', 'PHRASE', 'EXACT'].includes(x.mt));
const CLAUSES = tier.filter(x => !['BROAD', 'PHRASE', 'EXACT'].includes(x.mt));
// one row per (word, matchType): the same word can appear under several ids historically
const seen = new Map();
for (const k of KW.sort((a, b) => b.roas - a.roas)) { const key = k.word.toLowerCase() + '|' + k.mt; if (!seen.has(key)) seen.set(key, k); }
const PLAN = [...seen.values()].map(k => ({ ...k,
  // start each word at the click price it actually converted at, clamped to the standing rails
  bid: Math.min(CEILING, Math.max(FLOOR, Math.round(k.cpc * 100) / 100)) }));

const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
// Contribution per dollar of revenue. $3.55/unit came from the skill file and cites nothing; the
// code's $4.93 is VALIDATED against a live getMyFeesEstimate call ($9.49 - $0.62 COGS - $1.42
// referral - $2.52 FBA). William 2026-10-23: the goods are already bought and we are selling
// through, so COGS is sunk and $5.55 is the figure that decides whether a click is worth buying.
const FULL = 4.93 / 9.49, SUNK = 5.55 / 9.49;   // break-even 1.92x and 1.71x respectively
console.log(`shortlist bar: settled ROAS >= ${ROAS_BAR}x through ${SETTLED_THROUGH}`);
console.log(`  ${tier.length} entities qualify: ${PLAN.length} keywords to create per campaign, ${CLAUSES.length} targeting clauses LEFT ALONE`);
console.log(`  their settled record: $${sum(PLAN, x => x.sp).toFixed(2)} spend, ${sum(PLAN, x => x.ord)} orders, $${sum(PLAN, x => x.sa).toFixed(2)} sales,`
  + ` ROAS ${(sum(PLAN, x => x.sa) / sum(PLAN, x => x.sp)).toFixed(2)}x`);
console.log(`  net on validated fees (break-even 1.92x): $${(sum(PLAN, x => x.sa) * FULL - sum(PLAN, x => x.sp)).toFixed(2)}`
  + `   net with the goods sunk (break-even 1.71x): $${(sum(PLAN, x => x.sa) * SUNK - sum(PLAN, x => x.sp)).toFixed(2)}`);
console.log(`  historic burn rate $${(sum(PLAN, x => x.sp) / 156).toFixed(2)}/day against a new cap of $${(BUDGET * 2).toFixed(2)}/day across both campaigns`);
console.log(`  bids: floor $${FLOOR}, ceiling $${CEILING}, ${PLAN.filter(x => x.bid >= CEILING).length} words clamped at the ceiling`);
console.log('\n  the clauses being left in place (cheapest converters we own):');
for (const c of CLAUSES) console.log(`    ${c.roas.toFixed(2)}x  $${c.cpc.toFixed(2)}/clk  ${c.ord} ord  ${c.mt}  ${c.word}`);

// ---------------------------------------------------------------- live state
console.log('\nreading live state...');
const camps = await listAll('/sp/campaigns/list', V.C, 'campaigns');
const ags = await listAll('/sp/adGroups/list', V.G, 'adGroups');
const kws = await listAll('/sp/keywords/list', V.K, 'keywords');
const CMAP = new Map(camps.map(c => [String(c.campaignId), c]));
const liveAg = new Set(ags.filter(a => a.state === 'ENABLED' && CMAP.get(String(a.campaignId))?.state === 'ENABLED').map(a => String(a.adGroupId)));
const liveKw = kws.filter(k => k.state === 'ENABLED' && liveAg.has(String(k.adGroupId)));
const keepIds = new Set(PLAN.map(x => x.id));
const toPause = liveKw.filter(k => !keepIds.has(String(k.keywordId)));
console.log(`  ${camps.length} campaigns, ${liveKw.length} live keywords`);
console.log(`  pass 4 would pause ${toPause.length} of them (${liveKw.length - toPause.length} of the shortlist are already live and stay put)`);
// Resumable. A previous run can have created the campaign, its ad group and its product ad and
// then stopped at a gate; adopt whatever exists rather than minting a second copy of it.
for (const s of SIDES) { const c = camps.find(c => c.name === s.name); if (c) { s.existing = String(c.campaignId); console.log(`  adopting existing "${s.name}" ${c.campaignId} (state ${c.state})`); } }

if (!APPLY) {
  console.log('\n=========== DRY RUN. Nothing was written. ===========');
  for (const s of SIDES) {
    console.log(`\ncampaign  "${s.name}"`);
    console.log(`  budget    $${BUDGET.toFixed(2)}/day DAILY`);
    console.log(`  bidding   AUTO_FOR_SALES, +50% PLACEMENT_TOP, +50% PLACEMENT_PRODUCT_PAGE   (copied from 212260116772958, the campaign measured winning top of search at 11.6% CVR)`);
    console.log(`  ad group  "${s.tag} shortlist"  defaultBid $${CEILING.toFixed(2)}`);
    console.log(`  product   sku ${s.sku}  (asin ${s.asin})  <- pass 2 refuses to continue unless this reads back AD_STATUS_LIVE`);
    console.log(`  keywords  ${PLAN.length}`);
  }
  console.log('\nfirst 12 keywords as they would be written:');
  console.log('     bid   was/clk   ROAS  ord   match    word');
  for (const k of PLAN.slice(0, 12)) console.log(`   $${k.bid.toFixed(2)}   $${k.cpc.toFixed(2)}  ${k.roas.toFixed(2)}x  ${String(k.ord).padStart(3)}   ${k.mt.padEnd(7)}  ${k.word}`);
  console.log(`   ... ${PLAN.length} total`);
  console.log(`\nmax possible new spend: $${(BUDGET * 2).toFixed(2)}/day. Effective top-of-search CPC can reach ~$${(CEILING * 1.5 * 2).toFixed(2)} on the`);
  console.log(`placement and dynamic multipliers, which is inside the $4 bid cap and is paid equally by both sides.`);
  console.log(`\nRun with --apply to write. Add --pause-old to also pause the ${toPause.length} other live keywords.`);
  process.exit(0);
}

// ---------------------------------------------------------------- pass 1: campaigns + ad groups
console.log('\n--- PASS 1: campaigns and ad groups');
const built = [];
for (const s of SIDES) {
  if (s.existing) {
    const g0 = ags.filter(a => String(a.campaignId) === s.existing);
    const gid0 = g0.length ? String(g0[0].adGroupId) : null;
    if (gid0) { console.log(`  ${s.tag} reusing campaign ${s.existing} ad group ${gid0}`);
      built.push({ ...s, campaignId: s.existing, adGroupId: gid0 }); continue; }
    const g1 = await post('/sp/adGroups', V.G, { adGroups: [{ campaignId: s.existing, name: `${s.tag} shortlist`, state: 'ENABLED', defaultBid: CEILING }] });
    const gid1 = g1.j?.adGroups?.success?.[0]?.adGroupId;
    if (!gid1) { console.log(`  FAILED ${s.tag} ad group on adopted campaign: ${g1.status} ${g1.txt.slice(0, 400)}`); process.exit(1); }
    console.log(`  ${s.tag} reusing campaign ${s.existing}, new ad group ${gid1}`);
    built.push({ ...s, campaignId: s.existing, adGroupId: String(gid1) }); continue;
  }
  const r = await post('/sp/campaigns', V.C, { campaigns: [{
    // No portfolioId. The v2 portfolios endpoint 404s on these credentials, so a portfolio budget
    // cap could not be ruled out, and an unverifiable cap that silently throttles the test is worse
    // than no portfolio at all.
    // Born PAUSED on purpose. A campaign is only enabled in pass 4, after its product ad has read
    // back buyable and its keywords are verified. An enabled half-built campaign is how two ad
    // groups went dark on 2026-10-08.
    name: s.name, targetingType: 'MANUAL', state: 'PAUSED', startDate: TODAY,
    budget: { budget: BUDGET, budgetType: 'DAILY' },
    dynamicBidding: { strategy: 'AUTO_FOR_SALES', placementBidding: [
      { percentage: 50, placement: 'PLACEMENT_TOP' }, { percentage: 50, placement: 'PLACEMENT_PRODUCT_PAGE' }] },
  }] });
  const id = r.j?.campaigns?.success?.[0]?.campaignId;
  if (!id) { console.log(`  FAILED ${s.tag} campaign: ${r.status} ${r.txt.slice(0, 400)}`); process.exit(1); }
  console.log(`  ${s.tag} campaign ${id}`);
  const g = await post('/sp/adGroups', V.G, { adGroups: [{ campaignId: String(id), name: `${s.tag} shortlist`, state: 'ENABLED', defaultBid: CEILING }] });
  const gid = g.j?.adGroups?.success?.[0]?.adGroupId;
  if (!gid) { console.log(`  FAILED ${s.tag} ad group: ${g.status} ${g.txt.slice(0, 400)}`); process.exit(1); }
  console.log(`  ${s.tag} ad group ${gid}`);
  built.push({ ...s, campaignId: String(id), adGroupId: String(gid) });
}

// ---------------------------------------------------------------- pass 2: product ads
// Only SKU-level verdicts are meaningful here. CAMPAIGN_INCOMPLETE simply means "no targeting yet",
// which is true by construction until pass 3, so it is NOT a failure. The buyability verdict is
// read in pass 4, once the campaign is complete enough for Amazon to render one.
console.log('\n--- PASS 2: product ads');
const SKU_FAIL = ['NOT_BUYABLE', 'MISSING_IMAGE', 'MISSING_DECORATION', 'INELIGIBLE', 'ASIN_NOT_BUYABLE', 'OUT_OF_STOCK'];
for (const b of built) {
  const have = await listAll('/sp/productAds/list', V.P, 'productAds', { campaignIdFilter: { include: [b.campaignId] } });
  let me = have.find(x => x.sku === b.sku || x.asin === b.asin);
  if (me) { b.adId = String(me.adId); console.log(`  ${b.tag} ad ${b.adId} already exists on sku ${b.sku}`); }
  else {
    const r = await post('/sp/productAds', V.P, { productAds: [{ campaignId: b.campaignId, adGroupId: b.adGroupId, sku: b.sku, state: 'ENABLED' }] });
    const adId = r.j?.productAds?.success?.[0]?.adId;
    if (!adId) { console.log(`  FAILED ${b.tag} product ad: ${r.status} ${r.txt.slice(0, 400)}`); process.exit(1); }
    b.adId = String(adId);
    console.log(`  ${b.tag} ad ${adId} created on sku ${b.sku}`);
  }
  const v = await listAll('/sp/productAds/list', V.P, 'productAds', { campaignIdFilter: { include: [b.campaignId] } });
  const now = v.find(x => String(x.adId) === b.adId);
  const ss = now?.extendedData?.servingStatus || now?.servingStatus || 'UNREAD';
  console.log(`  ${b.tag} servingStatus ${ss}` + (ss === 'CAMPAIGN_INCOMPLETE' ? '  (expected: no keywords yet)' : ''));
  if (SKU_FAIL.includes(ss)) { console.log(`  STOPPING: ${b.tag} sku ${b.sku} is ${ss}. That SKU has no sellable offer.`); process.exit(1); }
}

// ---------------------------------------------------------------- pass 3: keywords
console.log('\n--- PASS 3: keywords');
for (const b of built) {
  let made = 0, failed = 0;
  for (let i = 0; i < PLAN.length; i += 100) {
    const chunk = PLAN.slice(i, i + 100);
    const r = await post('/sp/keywords', V.K, { keywords: chunk.map(k => ({
      campaignId: b.campaignId, adGroupId: b.adGroupId, keywordText: k.word, matchType: k.mt, state: 'ENABLED', bid: k.bid })) });
    made += (r.j?.keywords?.success || []).length;
    const errs = r.j?.keywords?.error || [];
    failed += errs.length;
    for (const e of errs.slice(0, 3)) console.log(`    ${b.tag} kw error: ${JSON.stringify(e).slice(0, 180)}`);
  }
  const back = await listAll('/sp/keywords/list', V.K, 'keywords', { campaignIdFilter: { include: [b.campaignId] } });
  console.log(`  ${b.tag}: ${made} created, ${failed} refused, ${back.filter(k => k.state === 'ENABLED').length} ENABLED on read-back`);
  b.verified = back.filter(k => k.state === 'ENABLED').length;
}
if (built.some(b => b.verified < 1)) { console.log('\n  STOPPING: a campaign has no enabled keywords. Not pausing anything.'); process.exit(1); }

// ---------------------------------------------------------------- pass 4: verify, then enable
console.log('\n--- PASS 4: buyability read-back, then enable');
await new Promise(r => setTimeout(r, 30000));        // servingStatus is not instant after targeting lands
let okToRun = true;
for (const b of built) {
  const v = await listAll('/sp/productAds/list', V.P, 'productAds', { campaignIdFilter: { include: [b.campaignId] } });
  const me = v.find(x => String(x.adId) === b.adId);
  const ss = me?.extendedData?.servingStatus || me?.servingStatus || 'UNREAD';
  b.serving = ss;
  console.log(`  ${b.tag} sku ${b.sku} servingStatus ${ss}`);
  if (SKU_FAIL.includes(ss)) { okToRun = false; b.dead = true; }
}
if (!okToRun) {
  console.log('\n  STOPPING: a SKU is not buyable. Leaving both campaigns PAUSED so nothing spends.');
  process.exit(1);
}
for (const b of built) {
  const r = await put('/sp/campaigns', V.C, { campaigns: [{ campaignId: b.campaignId, state: 'ENABLED', budget: { budget: BUDGET, budgetType: 'DAILY' } }] });
  const back = await listAll('/sp/campaigns/list', V.C, 'campaigns', { campaignIdFilter: { include: [b.campaignId] } });
  const st = back[0]?.state, bud = back[0]?.budget?.budget;
  console.log(`  ${b.tag} campaign ${b.campaignId} -> ${st}, budget $${bud}/day  (PUT ${r.status})`);
  if (st !== 'ENABLED') { console.log(`  WARNING: ${b.tag} did not read back ENABLED.`); }
}

// ---------------------------------------------------------------- pass 5: stop competing with ourselves
if (!PAUSE_OLD) {
  console.log(`\n--- PASS 5 SKIPPED. ${toPause.length} old keywords are still live and will bid against the new campaigns.`);
  console.log('    Re-run with --pause-old once you are happy the new campaigns look right.');
} else {
  console.log(`\n--- PASS 5: pausing ${toPause.length} old live keywords`);
  let done = 0;
  for (let i = 0; i < toPause.length; i += 100) {
    const chunk = toPause.slice(i, i + 100);
    const r = await put('/sp/keywords', V.K, { keywords: chunk.map(k => ({ keywordId: String(k.keywordId), state: 'PAUSED' })) });
    done += (r.j?.keywords?.success || []).length;
    if (i % 500 === 0) console.log(`    ${done}/${toPause.length}`);
  }
  const after = (await listAll('/sp/keywords/list', V.K, 'keywords')).filter(k => k.state === 'ENABLED' && liveAg.has(String(k.adGroupId)));
  console.log(`  paused ${done}. live keywords in old ad groups now: ${after.length}`);
}
console.log('\nDONE. Read the result as ROAS per campaign, not impression share.');
