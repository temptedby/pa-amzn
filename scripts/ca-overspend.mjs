/** The $4 rule applied to CANADA. Read-only by default; --apply pauses.
 *  Same rule as Sponsored Products US: keyword past $4 month-to-date and under 1.0x ROAS -> pause.
 *  RUN: node scripts/ca-overspend.mjs [--apply] */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const APPLY=process.argv.includes('--apply');
const A='https://advertising-api.amazon.com', PROF='2269012516456949';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':ct,'Accept':ct});
const V3='application/vnd.createasyncreportrequest.v3+json';
const iso=d=>d.toISOString().slice(0,10);
const now=new Date(); const start=iso(new Date(now.getFullYear(),now.getMonth(),1)), end=iso(now);
const cfg={name:`ca-kill-${Date.now()}`,startDate:start,endDate:end,
  configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['targeting'],columns:['keywordId','keyword','matchType','cost','sales14d','purchases14d','clicks','impressions','campaignId','adGroupId'],reportTypeId:'spTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}};
let cr=await (await fetch(`${A}/reporting/reports`,{method:'POST',headers:H(V3),body:JSON.stringify(cfg)})).json();
let rid=cr.reportId||String(cr.detail||'').match(/([0-9a-f-]{36})/)?.[1];
if(!rid){console.log('report create failed:',JSON.stringify(cr).slice(0,250));process.exit(1);}
let rows=null;
for(let i=0;i<200;i++){ await sleep(10000);
  const s=await (await fetch(`${A}/reporting/reports/${rid}`,{headers:H(V3)})).json();
  if(s.status==='COMPLETED'){rows=JSON.parse(gunzipSync(Buffer.from(await (await fetch(s.url)).arrayBuffer())).toString());break;}
  if(s.status==='FAILURE'){console.log('report FAILURE');process.exit(1);}
}
if(!rows){console.log('report timed out');process.exit(1);}
let tc=0,ts=0; for(const q of rows){tc+=q.cost||0;ts+=q.sales14d||0;}
console.log(`CANADA Sponsored Products ${start}..${end}`);
console.log(`  ${rows.length} targeting rows   spend CAD ${tc.toFixed(2)}   sales CAD ${ts.toFixed(2)}   ${ts>0?(ts/tc).toFixed(2)+'x':'0.00x'}\n`);
const breach=rows.filter(q=>(q.cost||0)>=4 && (q.sales14d||0) < (q.cost||0)).sort((a,b)=>b.cost-a.cost);
if(!breach.length){ console.log('  Nothing past CAD 4.00 unprofitably. Rule already satisfied.'); }
for(const q of breach)
  console.log(`  CAD ${q.cost.toFixed(2).padStart(7)} -> ${(q.sales14d||0).toFixed(2).padStart(7)}  ${((q.sales14d||0)/q.cost).toFixed(2)}x  ${String(q.keyword||'').slice(0,38).padEnd(40)} ${q.matchType||''}  id=${q.keywordId}`);
if(!APPLY){ console.log(`\nREAD-ONLY. ${breach.length} would be paused. Re-run with --apply to act.`); process.exit(0); }
if(!breach.length) process.exit(0);
const KH={...H('application/vnd.spKeyword.v3+json')};
const res=await fetch(`${A}/sp/keywords`,{method:'PUT',headers:KH,body:JSON.stringify({keywords:breach.map(q=>({keywordId:String(q.keywordId),state:'PAUSED'}))})});
console.log(`\napply HTTP ${res.status}`, (await res.text()).slice(0,400));
