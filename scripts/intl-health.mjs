/** READ-ONLY. Why is a campaign not serving? servingStatus is the field that says so.
 *  RUN: node scripts/intl-health.mjs */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<6;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('x');}
const tok=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();
for(const [cc,pid,ccy] of [['CANADA',process.env.ADS_PROFILE_ID_CA,'CAD'],['MEXICO',process.env.ADS_PROFILE_ID_MX,'MXN']]){
  const H=ct=>({Authorization:`Bearer ${tok.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':pid,'Content-Type':ct,'Accept':ct});
  console.log(`\n=============== ${cc} (${ccy}) ===============`);
  const c=await (await rq(`${A}/sp/campaigns/list`,{method:'POST',headers:H('application/vnd.spCampaign.v3+json'),body:JSON.stringify({maxResults:100,includeExtendedDataFields:true})})).json();
  for(const x of c.campaigns||[]){
    console.log(`  CAMPAIGN ${x.state.padEnd(8)} serving=${String(x.extendedData?.servingStatus||'?').padEnd(28)} ${ccy} ${String(x.budget?.budget).padStart(6)}/day  ${String(x.name).slice(0,40)}`);
  }
  await sleep(900);
  const g=await (await rq(`${A}/sp/adGroups/list`,{method:'POST',headers:H('application/vnd.spAdGroup.v3+json'),body:JSON.stringify({maxResults:100,includeExtendedDataFields:true})})).json();
  for(const x of g.adGroups||[]) console.log(`  ADGROUP  ${x.state.padEnd(8)} serving=${String(x.extendedData?.servingStatus||'?').padEnd(28)} bid ${x.defaultBid}  ${String(x.name).slice(0,30)}`);
  await sleep(900);
  const p=await (await rq(`${A}/sp/productAds/list`,{method:'POST',headers:H('application/vnd.spProductAd.v3+json'),body:JSON.stringify({maxResults:100,includeExtendedDataFields:true})})).json();
  for(const x of p.productAds||[]) console.log(`  AD       ${x.state.padEnd(8)} serving=${String(x.extendedData?.servingStatus||'?').padEnd(28)} ${x.asin||x.sku}`);
  await sleep(900);
  const k=await (await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify({maxResults:1000,includeExtendedDataFields:true})})).json();
  const en=(k.keywords||[]).filter(x=>x.state==='ENABLED');
  const byServ={};
  for(const x of en){const s=x.extendedData?.servingStatus||'?';byServ[s]=(byServ[s]||0)+1;}
  console.log(`  KEYWORDS enabled ${en.length}:`, JSON.stringify(byServ));
  const bids=en.map(x=>+x.bid).sort((a,b)=>a-b);
  if(bids.length) console.log(`  bids ${bids[0]} to ${bids[bids.length-1]}, median ${bids[Math.floor(bids.length/2)]}`);
}
