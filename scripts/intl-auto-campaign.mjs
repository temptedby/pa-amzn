/** Adds the AUTO campaign that Canada and Mexico are both missing.
 *
 *  The US foundation has one (SP - Auto, $50/day). Canada and Mexico have manual campaigns only,
 *  so they can only ever spend on words WE guessed. An auto campaign lets Amazon match against the
 *  whole listing and report back what people actually typed, and harvestCandidates() then promotes
 *  any term that converts at 2x into EXACT + PHRASE. That is the discovery half of the engine and
 *  neither country has had it.
 *
 *  Budget is taken OUT of the existing campaign rather than added on top, so the country's total
 *  daily authorisation does not move. William held Canada at CAD 15 and that stays true.
 *
 *  RUN: node scripts/intl-auto-campaign.mjs --market=CA --dry
 *       node scripts/intl-auto-campaign.mjs --market=CA
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=n=>(process.argv.find(a=>a.startsWith('--'+n+'='))||'').split('=')[1];
const DRY=process.argv.includes('--dry');
const MARKET=(arg('market')||'').toUpperCase();
const CFG={
  CA:{profile:process.env.ADS_PROFILE_ID_CA, ccy:'CAD', total:15, autoShare:5,  bid:0.35,
      skus:['57-P4AJ-J4AC','UG-SVG8-LB0P','CPH-BLCK-2','CPH-BLCK-3']},
  MX:{profile:process.env.ADS_PROFILE_ID_MX, ccy:'MXN', total:20, autoShare:10, bid:2.50,
      skus:['UG-SVG8-LB0P','CPH-BLCK-2','CPH-BLCK-3']},
}[MARKET];
if(!CFG?.profile){console.error('need --market=CA|MX');process.exit(1);}
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<6;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('connect failed');}
let tok;for(let i=0;i<6;i++){try{tok=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();if(tok?.access_token)break;}catch(e){}await sleep(3000);}
const H=ct=>({Authorization:`Bearer ${tok.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':CFG.profile,'Content-Type':ct,'Accept':ct});
const CT={c:'application/vnd.spCampaign.v3+json',g:'application/vnd.spAdGroup.v3+json',p:'application/vnd.spProductAd.v3+json',t:'application/vnd.spTargetingClause.v3+json'};

const list=await (await rq(`${A}/sp/campaigns/list`,{method:'POST',headers:H(CT.c),body:JSON.stringify({maxResults:100})})).json();
const camps=list.campaigns||[];
const auto=camps.find(c=>String(c.targetingType).toUpperCase()==='AUTO');
const manual=camps.filter(c=>String(c.targetingType).toUpperCase()==='MANUAL'&&c.state==='ENABLED');
console.log(`=== ${DRY?'DRY RUN':'LIVE'} — ${MARKET} auto campaign ===\n`);
console.log(`existing campaigns: ${camps.length}`);
for(const c of camps) console.log(`  ${c.state.padEnd(8)} ${String(c.targetingType).padEnd(7)} ${CFG.ccy} ${String(c.budget?.budget).padStart(6)}/day  "${c.name}"`);
if(auto){ console.log('\nAn AUTO campaign already exists. Nothing to do.'); process.exit(0); }
const newManual=Math.max(1, CFG.total-CFG.autoShare);
console.log(`\nPLAN, total daily authorisation stays at ${CFG.ccy} ${CFG.total}
  manual  ${manual[0]?.budget?.budget} -> ${newManual}/day
  auto    new, ${CFG.autoShare}/day, default bid ${CFG.bid}
  ads     ${CFG.skus.length} SKUs, the ones buyable in ${MARKET}
  purpose let Amazon report what shoppers actually type; harvest promotes 2x terms to EXACT+PHRASE`);
if(DRY){ console.log('\nDry run. Nothing created.'); process.exit(0); }

if(manual[0]){
  const r=await rq(`${A}/sp/campaigns`,{method:'PUT',headers:H(CT.c),body:JSON.stringify({campaigns:[{campaignId:String(manual[0].campaignId),budget:{budget:newManual,budgetType:'DAILY'}}]})});
  console.log(`\n1. manual budget -> ${newManual}  HTTP ${r.status}`);
  await sleep(2000);
}
const cr=await rq(`${A}/sp/campaigns`,{method:'POST',headers:H(CT.c),body:JSON.stringify({campaigns:[{
  name:`Phone Assured ${MARKET} - SP - Auto`, targetingType:'AUTO', state:'ENABLED',
  budget:{budget:CFG.autoShare,budgetType:'DAILY'}, startDate:new Date().toISOString().slice(0,10),
  dynamicBidding:{strategy:'LEGACY_FOR_SALES'}}]})});
const cj=await cr.json().catch(()=>({}));
const cid=(cj.campaigns?.success||[])[0]?.campaignId;
console.log(`2. auto campaign  HTTP ${cr.status}  id=${cid||'FAILED'}`);
if(!cid){ console.log('   raw:', JSON.stringify(cj).slice(0,500)); process.exit(1); }
await sleep(2000);
const gr=await rq(`${A}/sp/adGroups`,{method:'POST',headers:H(CT.g),body:JSON.stringify({adGroups:[{campaignId:String(cid),name:`${MARKET} Auto`,state:'ENABLED',defaultBid:CFG.bid}]})});
const gj=await gr.json().catch(()=>({}));
const gid=(gj.adGroups?.success||[])[0]?.adGroupId;
console.log(`3. ad group  HTTP ${gr.status}  id=${gid||'FAILED'}`);
if(!gid){ console.log('   raw:', JSON.stringify(gj).slice(0,400)); process.exit(1); }
await sleep(2000);
const pr=await rq(`${A}/sp/productAds`,{method:'POST',headers:H(CT.p),body:JSON.stringify({productAds:CFG.skus.map(sku=>({campaignId:String(cid),adGroupId:String(gid),sku,state:'ENABLED'}))})});
const pj=await pr.json().catch(()=>({}));
console.log(`4. product ads  HTTP ${pr.status}  success ${(pj.productAds?.success||[]).length} error ${(pj.productAds?.error||[]).length}`);
await sleep(2000);
// Amazon creates the four auto match types ITSELF when an AUTO ad group is made. Creating them
// again returns a bare HTTP 400 with an empty error array, which reads like a failure and is a
// duplicate refusal. Confirmed live 2026-08-21: all four were already ENABLED on the new CA group,
// inheriting the ad group's default bid. So READ them rather than create them.
const tr=await rq(`${A}/sp/targets/list`,{method:'POST',headers:H(CT.t),body:JSON.stringify({maxResults:100,adGroupIdFilter:{include:[String(gid)]}})});
const tj=await tr.json().catch(()=>({}));
const clauses=tj.targetingClauses||[];
console.log(`5. auto targets  Amazon created ${clauses.length} of 4:`);
for(const t of clauses) console.log(`     ${t.state} ${JSON.stringify(t.expression)} bid=${t.bid??'inherits '+CFG.bid}`);
if(clauses.length<4) console.log('     !! fewer than 4, the campaign will under-serve');

console.log('\n=== READ-BACK FROM AMAZON ===');
await sleep(6000);
const l2=await (await rq(`${A}/sp/campaigns/list`,{method:'POST',headers:H(CT.c),body:JSON.stringify({maxResults:100})})).json();
let sum=0;
for(const c of l2.campaigns||[]){ if(c.state==='ENABLED') sum+=Number(c.budget?.budget||0);
  console.log(`  ${c.state.padEnd(8)} ${String(c.targetingType).padEnd(7)} ${CFG.ccy} ${String(c.budget?.budget).padStart(6)}/day  "${c.name}"`); }
console.log(`  total enabled daily authorisation: ${CFG.ccy} ${sum}  ${sum===CFG.total?'(unchanged, as planned)':'(CHANGED — check)'}`);
