/** READ-ONLY. Sponsored Products performance split by advertised ASIN, for two windows,
 *  so the 3-Pack test can be compared with the Single on the same report type.
 *  RUN: node scripts/asin-split.mjs [--a=2026-10-01:2026-10-05] [--b=2026-09-01:2026-09-30] */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const WINS=[['OCTOBER',arg('a','2026-10-01:2026-10-05')],['SEPTEMBER',arg('b','2026-09-01:2026-09-30')]];
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const V3='application/vnd.createasyncreportrequest.v3+json';
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':V3,Accept:V3};
async function report(start,end){
  const cfg={name:`asin ${start} ${end}`,startDate:start,endDate:end,
    configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['advertiser'],
      columns:['advertisedAsin','advertisedSku','campaignName','impressions','clicks','cost','sales14d','purchases14d','unitsSoldClicks14d'],
      reportTypeId:'spAdvertisedProduct',timeUnit:'SUMMARY',format:'GZIP_JSON'}};
  const cr=await (await rq(`${A}/reporting/reports`,{method:'POST',headers:H,body:JSON.stringify(cfg)})).json();
  let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
  if(!rid){console.error('create failed',JSON.stringify(cr).slice(0,300));return null;}
  console.error(`  report ${rid} queued for ${start}..${end}`);
  for(let i=0;i<200;i++){await sleep(8000);
    const s=await (await rq(`${A}/reporting/reports/${rid}`,{headers:H})).json();
    if(s.status==='COMPLETED')return JSON.parse(gunzipSync(Buffer.from(await (await rq(s.url)).arrayBuffer())).toString());
    if(s.status==='FAILED'){console.error('  FAILED',s.statusDetails);return null;}
    if(i%15===14)console.error(`  ... ${s.status} ${(i+1)*8}s`);
  }
  console.error('  TIMEOUT');return null;
}
for(const [label,w] of WINS){
  const [start,end]=w.split(':');
  const rows=await report(start,end);
  console.log(`\n=========== ${label}  ${start} to ${end} ===========`);
  if(rows===null){console.log('  UNREAD: the report did not complete. Not a zero.');continue;}
  if(!rows.length){console.log('  UNREAD: report returned DONE with zero rows (window may be refused).');continue;}
  const by=new Map();
  for(const r of rows){const k=r.advertisedAsin||'(none)';const a=by.get(k)||{sku:new Set(),imp:0,clk:0,cost:0,sales:0,ord:0,units:0};
    a.sku.add(r.advertisedSku);a.imp+=r.impressions||0;a.clk+=r.clicks||0;a.cost+=r.cost||0;a.sales+=r.sales14d||0;a.ord+=r.purchases14d||0;a.units+=r.unitsSoldClicks14d||0;by.set(k,a);}
  const out=[...by.entries()].sort((x,y)=>y[1].cost-x[1].cost);
  console.log('asin        spend     sales   ROAS   clicks   CPC   ord  units  CVR     sku');
  let tc=0,ts=0;
  for(const [asin,a] of out){tc+=a.cost;ts+=a.sales;
    console.log(`${asin}  ${a.cost.toFixed(2).padStart(8)}  ${a.sales.toFixed(2).padStart(8)}  ${(a.sales/(a.cost||1)).toFixed(2).padStart(5)}  ${String(a.clk).padStart(6)}  ${(a.cost/(a.clk||1)).toFixed(2).padStart(5)}  ${String(a.ord).padStart(4)}  ${String(a.units).padStart(5)}  ${a.clk?((a.ord/a.clk)*100).toFixed(1)+'%':'   - '}  ${[...a.sku].join(',')}`);}
  console.log(`TOTAL       ${tc.toFixed(2).padStart(8)}  ${ts.toFixed(2).padStart(8)}  ${(ts/(tc||1)).toFixed(2).padStart(5)}`);
}
