/** Makes the one Canadian campaign able to serve, then sets it to a slow start.
 *
 *  Diagnosis 2026-08-21: of the 5 advertised ASINs, 3 have NO Canadian offer at all and 1 does not
 *  hold the Buy Box, so only the CAD 52.31 2-Pack could ever serve. The two ASINs that DO win the
 *  Buy Box, the flagship B07Y5GZP1T and the Pro, were not advertised in Canada at all.
 *
 *  RUN: node scripts/canada-campaign-fix.mjs --dry     print the plan, change nothing
 *       node scripts/canada-campaign-fix.mjs           apply, then read every change back
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const DRY=process.argv.includes('--dry');
const A='https://advertising-api.amazon.com', CA_PROFILE='2269012516456949';
const AD_GROUP='277016880094866';
const BUDGET=15, BID=0.35;
// Seller accounts identify a product ad by SKU, not ASIN: POST /sp/productAds with `asin` returns
// 207 with "merchantSku is empty". The list endpoint reports `asin` back, which is what misled me.
const ADD=[{asin:'B07Y5GZP1T',sku:'57-P4AJ-J4AC'},{asin:'B0BLLJLSDP',sku:'UG-SVG8-LB0P'}]; // buy box ours, never advertised in Canada
const ADD_ASINS=ADD.map(a=>a.asin);
const DEAD_ASINS=['B097MJCPBK','B097MJCQBF','B097MHPL12']; // no Canadian offer, can never serve
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})}).then(r=>r.json());
const H=ct=>({Authorization:`Bearer ${tok.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':CA_PROFILE,'Content-Type':ct,'Accept':ct});
const CT={camp:'application/vnd.spCampaign.v3+json',kw:'application/vnd.spKeyword.v3+json',pa:'application/vnd.spProductAd.v3+json'};
const outcome=j=>{const b=j.productAds||j.keywords||j.campaigns||j;return `success ${(b.success||[]).length} error ${(b.error||[]).length}`+((b.error||[]).length?`  ${JSON.stringify(b.error).slice(0,220)}`:'');};

console.log(`=== ${DRY?'DRY RUN — nothing is changed':'LIVE'} — Canadian campaign ===\n`);
const camps=await fetch(`${A}/sp/campaigns/list`,{method:'POST',headers:H(CT.camp),body:JSON.stringify({maxResults:100})}).then(r=>r.json());
const camp=(camps.campaigns||[])[0];
console.log(`campaign  ${camp.campaignId}  ${camp.state}  budget ${camp.budget?.budget}/day  "${camp.name}"`);
const pads=await fetch(`${A}/sp/productAds/list`,{method:'POST',headers:H(CT.pa),body:JSON.stringify({maxResults:100})}).then(r=>r.json());
const existing=(pads.productAds||[]);
console.log(`product ads ${existing.length}: ${existing.map(p=>p.asin+':'+p.state).join(', ')}`);
const kws=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H(CT.kw),body:JSON.stringify({maxResults:1000})}).then(r=>r.json());
const enabled=(kws.keywords||[]).filter(k=>k.state==='ENABLED');
const toRebid=enabled.filter(k=>Number(k.bid)!==BID);
console.log(`keywords ${(kws.keywords||[]).length}, enabled ${enabled.length}, bids to change ${toRebid.length}`);
const bidsNow={}; for(const k of enabled) bidsNow[k.bid]=(bidsNow[k.bid]||0)+1;
console.log('current enabled bids:', JSON.stringify(bidsNow));

console.log(`\nPLAN
  1. add product ads      ${ADD.map(a=>a.asin+' ('+a.sku+')').join(', ')}
  2. pause product ads    ${DEAD_ASINS.join(', ')}   (no Canadian offer)
  3. budget               ${camp.budget?.budget} -> ${BUDGET} CAD/day
  4. bids                 ${toRebid.length} enabled keywords -> CAD ${BID}`);
if(DRY){ console.log('\nDry run. Nothing changed.'); process.exit(0); }

console.log('\n--- applying ---');
const have=new Set(existing.map(p=>p.asin));
const addList=ADD.filter(a=>!have.has(a.asin));
if(addList.length){
  const r=await fetch(`${A}/sp/productAds`,{method:'POST',headers:H(CT.pa),body:JSON.stringify({productAds:addList.map(a=>({campaignId:String(camp.campaignId),adGroupId:AD_GROUP,sku:a.sku,state:'ENABLED'}))})});
  console.log(`1. add ${addList.map(a=>a.sku).join(',')}  HTTP ${r.status}  ${outcome(await r.json().catch(()=>({})))}`);
} else console.log('1. add: already present, nothing to do');
await sleep(1500);
const kill=existing.filter(p=>DEAD_ASINS.includes(p.asin)&&p.state!=='PAUSED');
if(kill.length){
  const r=await fetch(`${A}/sp/productAds`,{method:'PUT',headers:H(CT.pa),body:JSON.stringify({productAds:kill.map(p=>({adId:String(p.adId),state:'PAUSED'}))})});
  console.log(`2. pause ${kill.map(p=>p.asin).join(',')}  HTTP ${r.status}  ${outcome(await r.json().catch(()=>({})))}`);
} else console.log('2. pause: nothing enabled to pause');
await sleep(1500);
const rc=await fetch(`${A}/sp/campaigns`,{method:'PUT',headers:H(CT.camp),body:JSON.stringify({campaigns:[{campaignId:String(camp.campaignId),budget:{budget:BUDGET,budgetType:camp.budget?.budgetType||'DAILY'}}]})});
console.log(`3. budget -> ${BUDGET}  HTTP ${rc.status}  ${outcome(await rc.json().catch(()=>({})))}`);
await sleep(1500);
let ok=0,err=0;
for(let i=0;i<toRebid.length;i+=100){
  const batch=toRebid.slice(i,i+100).map(k=>({keywordId:String(k.keywordId),bid:BID}));
  const r=await fetch(`${A}/sp/keywords`,{method:'PUT',headers:H(CT.kw),body:JSON.stringify({keywords:batch})});
  const j=await r.json().catch(()=>({}));
  ok+=(j.keywords?.success||[]).length; err+=(j.keywords?.error||[]).length;
  if((j.keywords?.error||[]).length) console.log('   err sample',JSON.stringify(j.keywords.error).slice(0,200));
  await sleep(1500);
}
console.log(`4. bids -> ${BID}  success ${ok}  error ${err}`);

console.log('\n=== READ-BACK FROM AMAZON ===');
await sleep(6000);
const c2=await fetch(`${A}/sp/campaigns/list`,{method:'POST',headers:H(CT.camp),body:JSON.stringify({maxResults:100})}).then(r=>r.json());
console.log(`budget now  ${(c2.campaigns||[])[0]?.budget?.budget} CAD/day`);
const p2=await fetch(`${A}/sp/productAds/list`,{method:'POST',headers:H(CT.pa),body:JSON.stringify({maxResults:100})}).then(r=>r.json());
for(const p of (p2.productAds||[]).sort((a,b)=>a.state.localeCompare(b.state))) console.log(`  ad ${p.asin}  ${p.state}`);
const k2=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H(CT.kw),body:JSON.stringify({maxResults:1000})}).then(r=>r.json());
const en2=(k2.keywords||[]).filter(k=>k.state==='ENABLED');
const dist={}; for(const k of en2) dist[k.bid]=(dist[k.bid]||0)+1;
console.log(`enabled keywords ${en2.length}, bid distribution:`, JSON.stringify(dist));
