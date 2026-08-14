/** 90-day Sponsored Products SEARCH TERM report, filtered for non-phone carry items.
 *  Real demand evidence from our own account, read-only. */
import { readFileSync, writeFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib'; import { URL } from 'node:url';
function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const A='https://advertising-api.amazon.com'; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/vnd.createasyncreportrequest.v3+json','Accept':'application/vnd.createasyncreportrequest.v3+json'};
const cfg={name:'st90',startDate:'2026-07-15',endDate:'2026-08-14',configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['searchTerm'],columns:['searchTerm','keyword','matchType','impressions','clicks','cost','sales14d','purchases14d'],reportTypeId:'spSearchTerm',timeUnit:'SUMMARY',format:'GZIP_JSON'}};
const cr=await fetch(`${A}/reporting/reports`,{method:'POST',headers:H,body:JSON.stringify(cfg)}).then(r=>r.json());
let rid=cr.reportId; if(!rid){const m=JSON.stringify(cr).match(/([0-9a-f]{8}-[0-9a-f-]{27})/); if(m)rid=m[1];}
if(!rid){console.log('create failed',JSON.stringify(cr).slice(0,200));process.exit(0);}
let rows=null;
for(let i=0;i<120;i++){const s=await fetch(`${A}/reporting/reports/${rid}`,{headers:H}).then(r=>r.json());
  if(s.status==='COMPLETED'){rows=JSON.parse(gunzipSync(Buffer.from(await (await fetch(s.url)).arrayBuffer())).toString());break;}
  if(s.status==='FAILURE'){console.log('FAILURE');process.exit(0);} await sleep(10000);}
if(!rows){console.log('timeout');process.exit(0);}
const WORDS=['key','wallet','badge','airpod','earbud','headphone','camera','glass','purse','passport','vape','bottle','tool','dog','pet','luggage','backpack','id card','remote','fob'];
const hits=rows.filter(r=>{const t=String(r.searchTerm||'').toLowerCase(); return WORDS.some(w=>t.includes(w));});
let C=0,S=0,O=0,K=0; for(const r of hits){C+=r.cost||0;S+=r.sales14d||0;O+=r.purchases14d||0;K+=r.clicks||0;}
console.log(`31-day search terms: ${rows.length} total, ${hits.length} mention a NON-PHONE carry item`);
console.log(`  those terms: ${K} clicks, $${C.toFixed(2)} spend, $${S.toFixed(2)} sales, ${O} orders\n`);
hits.sort((a,b)=>(b.clicks||0)-(a.clicks||0)).slice(0,30).forEach(r=>
  console.log(`  ${String(r.impressions||0).padStart(6)}imp ${String(r.clicks||0).padStart(3)}clk $${(r.cost||0).toFixed(2).padStart(6)} -> $${(r.sales14d||0).toFixed(2).padStart(6)}  ${String(r.searchTerm).slice(0,52)}`));
writeFileSync('/private/tmp/claude-501/-Users-williamholdeman-projects-PA-AMZN/9fc63066-7cc4-4fbe-bf9c-00fda875b57a/scratchpad/st90.json', JSON.stringify(hits,null,1));
