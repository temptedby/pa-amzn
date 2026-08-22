/** Builds the Mexican Sponsored Products campaign from scratch. Mexico has ZERO campaigns today.
 *
 *  William 2026-08-21: "only top performing words translated to local language small spend at first".
 *  So the keywords are the concepts behind our 2x+ US winners rendered in Mexican Spanish, not a
 *  literal word-for-word translation: celular not movil, correa/cordon rather than "leash".
 *
 *  Asks Amazon for its own bid recommendations rather than guessing a Mexican CPC.
 *
 *  RUN: node scripts/mx-campaign-create.mjs --dry     plan + suggested bids, creates nothing
 *       node scripts/mx-campaign-create.mjs           create, then read every object back
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const DRY=process.argv.includes('--dry');
const A='https://advertising-api.amazon.com', MX=process.env.ADS_PROFILE_ID_MX||'2243911174683279';
const BUDGET=20;             // MXN/day, about USD 1.18. "small spend at first".
const BID_FALLBACK=2.50;     // only used if Amazon declines to suggest for a term
// Per-keyword entry bid comes from Amazon's OWN suggestion, lowest of the three it returns.
// Guessing a Mexican CPC is how Canada ended up enabled and never serving: its bids were CAD
// 0.99-1.75 and it took 17 impressions in seven weeks. Amazon's low suggestion is the cheapest
// bid it thinks will actually enter the auction, which is exactly what "start small" should mean.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<6;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('connect failed');}
let tok;for(let i=0;i<6;i++){try{tok=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();if(tok?.access_token)break;}catch(e){}await sleep(3000);}
const H=ct=>({Authorization:`Bearer ${tok.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':MX,'Content-Type':ct,'Accept':ct});
const CT={c:'application/vnd.spCampaign.v3+json',g:'application/vnd.spAdGroup.v3+json',k:'application/vnd.spKeyword.v3+json',p:'application/vnd.spProductAd.v3+json'};

// The concept behind each 2x+ US winner, in Mexican Spanish. Not a literal translation:
// "leash" has no natural Spanish equivalent for this product, so cordon/correa carry it.
const WORDS=[
 'cordon para celular','correa para celular','cordon antirrobo celular','correa antirrobo celular',
 'cordon retractil celular','correa retractil celular','cordon de seguridad celular',
 'correa de seguridad para celular','cable antirrobo celular','sujetador de celular',
 'correa anticaida celular','cordon para iphone','correa para iphone','portacelular retractil',
 'cordon celular viaje','correa celular mosqueton','agarradera para celular','cordon movil antirrobo',
];
const MATCH=['PHRASE','EXACT'];

console.log(`=== ${DRY?'DRY RUN — nothing is created':'CREATING'} — Mexico Sponsored Products ===\n`);
const existing=await (await rq(`${A}/sp/campaigns/list`,{method:'POST',headers:H(CT.c),body:JSON.stringify({maxResults:100})})).json();
console.log(`Mexico currently has ${(existing.campaigns||[]).length} SP campaigns.`);
if((existing.campaigns||[]).length){ console.log('  NOT empty — stopping so nothing is duplicated.'); process.exit(1); }

console.log(`\nPLAN
  campaign     "Phone Assured MX - SP - Manual" ENABLED, MXN ${BUDGET}/day
  ad group     "MX Round 1", default bid from Amazon's suggestion per keyword
  product ads  every SKU that is BUYABLE in Mexico
  keywords     ${WORDS.length} phrases x ${MATCH.join(' + ')} = ${WORDS.length*MATCH.length} rows
  governed by  the same rules as the US, in pesos: MXN 68 kill (= USD 4), stop under 1.0x`);

// Amazon's own bid guidance beats a guess at Mexican CPC.
// v5 content type: Amazon refuses v3 for MX outright, "marketplace 771770 is not supported".
const SUGGEST={};
for(let i=0;i<WORDS.length;i+=10){
  const chunk=WORDS.slice(i,i+10);
  const rec=await rq(`${A}/sp/targets/bid/recommendations`,{method:'POST',
    headers:{...H('application/vnd.spthemebasedbidrecommendation.v5+json')},
    body:JSON.stringify({targetingExpressions:chunk.map(w=>({type:'KEYWORD_BROAD_MATCH',value:w})),
      recommendationType:'BIDS_FOR_NEW_AD_GROUP',campaignType:'SPONSORED_PRODUCTS',
      bidding:{strategy:'LEGACY_FOR_SALES'}, asins:['B0BLLJLSDP']})});
  const j=await rec.json().catch(()=>({}));
  for(const theme of (j.bidRecommendations||[])){
    for(const r of (theme.bidRecommendationsForTargetingExpressions||[])){
      const w=r.targetingExpression?.value;
      const vals=(r.bidValues||[]).map(v=>Number(v.suggestedBid)).filter(Number.isFinite).sort((a,b)=>a-b);
      if(w&&vals.length) SUGGEST[w]=vals[0];
    }
  }
  await sleep(1200);
}
const bidFor=w=>+(SUGGEST[w]??BID_FALLBACK).toFixed(2);
console.log(`\nAmazon's low suggested bid per keyword (MXN), ${Object.keys(SUGGEST).length} of ${WORDS.length} returned:`);
for(const w of WORDS) console.log(`  ${String(bidFor(w)).padStart(5)}  ${w}${SUGGEST[w]?'':'   <- no suggestion, using fallback'}`);
const bids=WORDS.map(bidFor);
console.log(`  range ${Math.min(...bids)} to ${Math.max(...bids)}, mean ${(bids.reduce((a,b)=>a+b,0)/bids.length).toFixed(2)} MXN`);
console.log(`  for scale: MXN 68 is the kill bar (USD 4), so a keyword gets roughly ${Math.round(68/(bids.reduce((a,b)=>a+b,0)/bids.length))} clicks to prove itself`);

if(DRY){ console.log('\nDry run. Nothing created.'); process.exit(0); }

const cr=await rq(`${A}/sp/campaigns`,{method:'POST',headers:H(CT.c),body:JSON.stringify({campaigns:[{
  name:'Phone Assured MX - SP - Manual', targetingType:'MANUAL', state:'ENABLED',
  budget:{budget:BUDGET,budgetType:'DAILY'}, startDate:new Date().toISOString().slice(0,10),
  dynamicBidding:{strategy:'LEGACY_FOR_SALES'}}]})});
const cj=await cr.json().catch(()=>({}));
const campaignId=(cj.campaigns?.success||[])[0]?.campaignId;
console.log(`\n1. campaign  HTTP ${cr.status}  id=${campaignId||'FAILED'}`);
if(!campaignId) console.log('   raw:', JSON.stringify(cj).slice(0,600));
if(!campaignId) process.exit(1);
await sleep(2000);
const gr=await rq(`${A}/sp/adGroups`,{method:'POST',headers:H(CT.g),body:JSON.stringify({adGroups:[{
  campaignId:String(campaignId), name:'MX Round 1', state:'ENABLED', defaultBid:BID_FALLBACK}]})});
const gj=await gr.json().catch(()=>({}));
const adGroupId=(gj.adGroups?.success||[])[0]?.adGroupId;
console.log(`2. ad group  HTTP ${gr.status}  id=${adGroupId||'FAILED'}  ${JSON.stringify(gj.adGroups?.error||[]).slice(0,200)}`);
if(!adGroupId) process.exit(1);
await sleep(2000);
const SKUS=['UG-SVG8-LB0P','CPH-BLCK-2','CPH-BLCK-3','57-P4AJ-J4AC'];
const pr=await rq(`${A}/sp/productAds`,{method:'POST',headers:H(CT.p),body:JSON.stringify({productAds:
  SKUS.map(sku=>({campaignId:String(campaignId),adGroupId:String(adGroupId),sku,state:'ENABLED'}))})});
const pj=await pr.json().catch(()=>({}));
console.log(`3. product ads  HTTP ${pr.status}  success ${(pj.productAds?.success||[]).length} error ${(pj.productAds?.error||[]).length}`);
for(const e of (pj.productAds?.error||[]).slice(0,4)) console.log('     ', JSON.stringify(e).slice(0,180));
await sleep(2000);
const ops=[]; for(const w of WORDS) for(const m of MATCH) ops.push({campaignId:String(campaignId),adGroupId:String(adGroupId),keywordText:w,matchType:m,state:'ENABLED',bid:bidFor(w)});
const kr=await rq(`${A}/sp/keywords`,{method:'POST',headers:H(CT.k),body:JSON.stringify({keywords:ops})});
const kj=await kr.json().catch(()=>({}));
console.log(`4. keywords  HTTP ${kr.status}  success ${(kj.keywords?.success||[]).length} error ${(kj.keywords?.error||[]).length}`);
for(const e of (kj.keywords?.error||[]).slice(0,4)) console.log('     ', JSON.stringify(e).slice(0,180));

console.log('\n=== READ-BACK FROM AMAZON ===');
await sleep(8000);
const c2=await (await rq(`${A}/sp/campaigns/list`,{method:'POST',headers:H(CT.c),body:JSON.stringify({maxResults:100})})).json();
for(const c of c2.campaigns||[]) console.log(`  campaign ${c.campaignId} ${c.state} MXN ${c.budget?.budget}/day "${c.name}"`);
const p2=await (await rq(`${A}/sp/productAds/list`,{method:'POST',headers:H(CT.p),body:JSON.stringify({maxResults:100})})).json();
console.log(`  product ads: ${(p2.productAds||[]).map(x=>(x.asin||x.sku)+':'+x.state).join(', ')}`);
const k2=await (await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H(CT.k),body:JSON.stringify({maxResults:1000})})).json();
const en=(k2.keywords||[]).filter(x=>x.state==='ENABLED');
console.log(`  keywords: ${(k2.keywords||[]).length} total, ${en.length} enabled, bids MXN ${Math.min(...en.map(x=>+x.bid))} to ${Math.max(...en.map(x=>+x.bid))}`);
