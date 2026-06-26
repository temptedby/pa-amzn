/** Search terms that MEET William's rule (>=$4 spend AND ACOS<=50% i.e. ROAS>=2x) over ~60 days
 *  -> candidates to add as EXACT + PHRASE. Read-only. RUN: node scripts/harvest-candidates.mjs */
import { readFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib'; import { URL } from 'node:url';
function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}
loadEnv();
const A='https://advertising-api.amazon.com', sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
const iso=d=>d.toISOString().slice(0,10);
async function rep(sd,ed){
  const cfg={name:'h',startDate:sd,endDate:ed,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['searchTerm'],columns:['searchTerm','keyword','matchType','cost','sales14d','purchases14d','clicks'],reportTypeId:'spSearchTerm',timeUnit:'SUMMARY',format:'GZIP_JSON'}};
  const cr=await fetch(`${A}/reporting/reports`,{method:'POST',headers:H('application/vnd.createasyncreportrequest.v3+json'),body:JSON.stringify(cfg)}).then(r=>r.json());
  let rid=cr.reportId; if(!rid&&cr.code==='425'){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/);if(m)rid=m[1];}
  if(!rid){console.log('create fail',JSON.stringify(cr).slice(0,140));return[];}
  let url;for(let i=0;i<80;i++){await sleep(9000);const s=await fetch(`${A}/reporting/reports/${rid}`,{headers:H('application/vnd.createasyncreportrequest.v3+json')}).then(r=>r.json());if(s.status==='COMPLETED'){url=s.url;break;}if(s.status==='FAILURE'){console.log('FAIL',JSON.stringify(s).slice(0,140));return[];}}
  if(!url)return[];
  return JSON.parse(gunzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).toString());
}
const D=864e5, base=Date.now()-2*D;
const agg=new Map();
for(const [s,e] of [[base-60*D,base-30*D],[base-30*D,base]]){
  const rows=await rep(iso(new Date(s)),iso(new Date(e)));
  for(const r of rows){const t=(r.searchTerm||'').trim();if(!t)continue;const o=agg.get(t)||{cost:0,sales:0,ord:0,clicks:0,mt:new Set()};o.cost+=r.cost||0;o.sales+=r.sales14d||0;o.ord+=r.purchases14d||0;o.clicks+=r.clicks||0;if(r.matchType)o.mt.add(r.matchType);agg.set(t,o);}
}
const all=[...agg.entries()].map(([t,o])=>({t,...o,acos:o.sales?o.cost/o.sales:Infinity,roas:o.cost?o.sales/o.cost:0}));
const qualify=all.filter(x=>x.cost>=4 && x.sales>0 && x.acos<=0.50).sort((a,b)=>b.sales-a.sales);
console.log(`\n=== HARVEST CANDIDATES (>=$4 spend AND ACOS<=50% / ROAS>=2x), ~60 days ===`);
console.log(`search terms analyzed: ${all.length}`);
console.log(`QUALIFY to add as EXACT + PHRASE: ${qualify.length}`);
let tc=0,ts=0,to=0;
for(const x of qualify){tc+=x.cost;ts+=x.sales;to+=x.ord;}
console.log(`their totals: $${tc.toFixed(2)} spend, $${ts.toFixed(2)} sales, ${to} orders, blended ACOS ${ts?(tc/ts*100).toFixed(0):'-'}%`);
console.log(`\ntop qualifying terms (term | spend | sales | ACOS | ROAS | ord | currentMatch):`);
for(const x of qualify.slice(0,25)) console.log(`  ${x.t.slice(0,42).padEnd(42)} $${x.cost.toFixed(2).padStart(6)} $${x.sales.toFixed(2).padStart(7)} ${(x.acos*100).toFixed(0).padStart(3)}% ${x.roas.toFixed(1)}x ${String(x.ord).padStart(2)}  ${[...x.mt].join(',')}`);
const near=all.filter(x=>x.cost>=4 && x.acos>0.50 && x.acos<=0.60).length;
console.log(`\n(borderline 50-60% ACOS with >=$4 spend: ${near} — watch list)`);
