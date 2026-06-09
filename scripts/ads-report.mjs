/** Pull a Sponsored Products KEYWORD performance report (last 14 days) via the
 *  Reporting API v3, join with current bids, and flag bleeders (kill-switch
 *  candidates) + winners. First look at what the engine will act on.
 *  RUN: node scripts/ads-report.mjs */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {ADS_CLIENT_ID:CID,ADS_CLIENT_SECRET:CS,ADS_REFRESH_TOKEN:RT,ADS_PROFILE_ID:PID}=process.env;
const BASE='https://advertising-api.amazon.com';
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PID,'Content-Type':ct,'Accept':ct});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const iso=d=>d.toISOString().slice(0,10);
const end=new Date(); const start=new Date(Date.now()-14*864e5);

// 1) Current bids per keyword
async function allKeywords(){
  const out=[]; let next;
  do{ const r=await fetch(`${BASE}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify({maxResults:1000,...(next?{nextToken:next}:{})})});
    const j=await r.json(); if(!r.ok){console.error('keywords',r.status,JSON.stringify(j).slice(0,200));break;} (j.keywords||[]).forEach(k=>out.push(k)); next=j.nextToken;
  }while(next);
  return out;
}
const kws=await allKeywords();
const bid={}; const meta={};
for(const k of kws){ bid[k.keywordId]=k.bid; meta[k.keywordId]={text:k.keywordText,match:k.matchType,state:k.state}; }
console.log(`Keywords pulled: ${kws.length}`);

// 2) Request the keyword report (SUMMARY, 14d)
const cfg={name:'kw14',startDate:iso(start),endDate:iso(end),configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['targeting'],columns:['keywordId','keyword','matchType','impressions','clicks','cost','sales14d','purchases14d','campaignId'],reportTypeId:'spTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}};
const req=await fetch(`${BASE}/reporting/reports`,{method:'POST',headers:H('application/vnd.createasyncreportrequest.v3+json'),body:JSON.stringify(cfg)});
const reqJ=await req.json(); if(!req.ok){console.error('report request failed',req.status,JSON.stringify(reqJ).slice(0,400));process.exit(1);}
const reportId=reqJ.reportId; console.log('report requested:',reportId,'— polling...');

// 3) Poll until COMPLETED
let url;
for(let i=0;i<40;i++){ await sleep(8000);
  const s=await fetch(`${BASE}/reporting/reports/${reportId}`,{headers:H('application/vnd.createasyncreportrequest.v3+json')}).then(r=>r.json());
  process.stdout.write(`  status=${s.status} `);
  if(s.status==='COMPLETED'){url=s.url;break;} if(s.status==='FAILURE'){console.error('\nreport FAILURE',JSON.stringify(s).slice(0,300));process.exit(1);}
}
if(!url){console.error('\nreport not ready in time');process.exit(1);}

// 4) Download + gunzip + analyze
const buf=Buffer.from(await (await fetch(url)).arrayBuffer());
const rows=JSON.parse(gunzipSync(buf).toString());
console.log(`\n\nReport rows: ${rows.length}`);
const enrich=rows.map(r=>({...r,acos:r.sales14d>0?(r.cost/r.sales14d*100):null,bid:bid[r.keywordId],state:meta[r.keywordId]?.state}));
const spend=enrich.reduce((a,b)=>a+(b.cost||0),0), sales=enrich.reduce((a,b)=>a+(b.sales14d||0),0);
console.log(`14d totals: spend $${spend.toFixed(2)}  sales $${sales.toFixed(2)}  ACOS ${sales>0?(spend/sales*100).toFixed(1):'n/a'}%\n`);
const bleeders=enrich.filter(r=>r.cost>=4 && (r.purchases14d||0)===0).sort((a,b)=>b.cost-a.cost);
console.log(`BLEEDERS (≥$4 spent, 0 orders → engine would pause): ${bleeders.length}`);
bleeders.slice(0,12).forEach(r=>console.log(`  $${(r.cost||0).toFixed(2).padStart(7)}  ${(r.keyword||'').slice(0,40).padEnd(40)} [${r.state}] bid=${r.bid}`));
const winners=enrich.filter(r=>(r.purchases14d||0)>0 && r.acos!=null && r.acos<40).sort((a,b)=>a.acos-b.acos);
console.log(`\nWINNERS (orders, ACOS <40% → engine would push up / harvest): ${winners.length}`);
winners.slice(0,12).forEach(r=>console.log(`  ACOS ${r.acos.toFixed(0).padStart(3)}%  $${(r.sales14d||0).toFixed(0).padStart(5)} sales  ${(r.keyword||'').slice(0,38).padEnd(38)} [${r.state}] bid=${r.bid}`));
