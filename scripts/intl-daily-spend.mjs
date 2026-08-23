/** READ-ONLY. Actual spend and sales for a given day, per international profile.
 *  Uses v3 reports rather than the budget-usage endpoint, which only knows the CURRENT account day.
 *  RUN: node scripts/intl-daily-spend.mjs --start=2026-08-20 --end=2026-08-22 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=n=>(process.argv.find(a=>a.startsWith('--'+n+'='))||'').split('=')[1];
const START=arg('start')||'2026-08-20', END=arg('end')||'2026-08-22';
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<6;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('x');}
const tok=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();
const V3='application/vnd.createasyncreportrequest.v3+json';
for(const [cc,pid,ccy] of [['CANADA',process.env.ADS_PROFILE_ID_CA,'CAD'],['MEXICO',process.env.ADS_PROFILE_ID_MX,'MXN']]){
  const H={Authorization:`Bearer ${tok.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':pid,'Content-Type':V3,'Accept':V3};
  const cr=await (await rq(`${A}/reporting/reports`,{method:'POST',headers:H,body:JSON.stringify({
    name:`${cc}-daily`, startDate:START, endDate:END,
    configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['campaign'],
      columns:['date','campaignName','impressions','clicks','cost','purchases14d','sales14d'],
      reportTypeId:'spCampaigns',timeUnit:'DAILY',format:'GZIP_JSON'}})})).json();
  let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
  if(!rid){console.log(`\n${cc}: cannot create report — ${JSON.stringify(cr).slice(0,160)}`);continue;}
  let url=null;
  for(let i=0;i<180;i++){ await sleep(8000);
    const s=await (await rq(`${A}/reporting/reports/${rid}`,{headers:H})).json();
    if(s.status==='COMPLETED'){url=s.url;break;} if(s.status==='FAILURE'){break;} }
  console.log(`\n===== ${cc} (${ccy}) ${START} to ${END} =====`);
  if(!url){console.log('  report did not complete');continue;}
  const rows=JSON.parse(gunzipSync(Buffer.from(await (await rq(url)).arrayBuffer())).toString());
  if(!rows.length){console.log('  ZERO ROWS — no impressions, no clicks, no spend in this window');continue;}
  console.log('  date         imps  clicks     spend    sales  campaign');
  let sp=0,sa=0,cl=0,im=0;
  for(const r of rows.sort((a,b)=>String(a.date).localeCompare(String(b.date)))){
    sp+=+r.cost||0; sa+=+r.sales14d||0; cl+=+r.clicks||0; im+=+r.impressions||0;
    console.log(`  ${r.date}  ${String(r.impressions||0).padStart(6)}  ${String(r.clicks||0).padStart(6)}  ${(+r.cost||0).toFixed(2).padStart(8)}  ${(+r.sales14d||0).toFixed(2).padStart(7)}  ${String(r.campaignName).slice(0,40)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(11)} ${String(im).padStart(6)}  ${String(cl).padStart(6)}  ${sp.toFixed(2).padStart(8)}  ${sa.toFixed(2).padStart(7)}`);
}
