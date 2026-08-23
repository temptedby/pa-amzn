/** READ-ONLY. Every keyword/target that has spent over the kill bar this month, what it earned,
 *  and whether it is still enabled. Answers: "how many words are over $4 that should be paused?"
 *  RUN: node scripts/over-bar.mjs [--bar=4] [--start=2026-08-01] */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const BAR=+arg('bar',4), START=arg('start','2026-08-01'), END=arg('end',new Date().toISOString().slice(0,10));
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const PID=process.env.ADS_PROFILE_ID;
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':PID,'Content-Type':ct,'Accept':ct});
const V3='application/vnd.createasyncreportrequest.v3+json';

// --- month-to-date per-target performance
const cr=await (await rq(`${A}/reporting/reports`,{method:'POST',headers:H(V3),body:JSON.stringify({
  name:`over-bar-${START}-${END}`,startDate:START,endDate:END,
  configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['targeting'],
    columns:['keywordId','keyword','keywordType','matchType','campaignName','adGroupName','impressions','clicks','cost','purchases14d','sales14d'],
    reportTypeId:'spTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}})})).json();
let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
if(!rid){console.log('report create failed',JSON.stringify(cr).slice(0,300));process.exit(1);}
let url=null;
for(let i=0;i<180;i++){await sleep(8000);
  const s=await (await rq(`${A}/reporting/reports/${rid}`,{headers:H(V3)})).json();
  if(s.status==='COMPLETED'){url=s.url;break;} if(s.status==='FAILURE'){console.log('report FAILURE');process.exit(1);} }
if(!url){console.log('report did not complete');process.exit(1);}
const rows=JSON.parse(gunzipSync(Buffer.from(await (await rq(url)).arrayBuffer())).toString());

// --- live state of every keyword and product target
const KH=H('application/vnd.spKeyword.v3+json');
const state=new Map();
for(const [path,ct,key] of [['/sp/keywords/list','application/vnd.spKeyword.v3+json','keywords'],
                            ['/sp/targets/list','application/vnd.spTargetingClause.v3+json','targetingClauses']]){
  let next=null;
  do{
    const r=await (await rq(`${A}${path}`,{method:'POST',headers:H(ct),body:JSON.stringify({maxResults:1000,...(next?{nextToken:next}:{})})})).json();
    for(const k of (r[key]||[])) state.set(String(k.keywordId||k.targetId),{state:k.state,bid:k.bid,serving:k.extendedData?.servingStatus});
    next=r.nextToken||null;
  }while(next);
}

const over=rows.filter(r=>(+r.cost||0)>=BAR);
const sorted=over.sort((a,b)=>(+b.cost)-(+a.cost));
const fmt=n=>Number(n).toFixed(2);
let killSpend=0,killN=0,okSpend=0,okN=0;
console.log(`\nUS Sponsored Products, ${START} to ${END}.  ${rows.length} targets ran, ${over.length} spent $${BAR}+.\n`);
console.log('  spend   sales   ROAS  clicks   state      bid   match     keyword');
for(const r of sorted){
  const c=+r.cost||0, s=+r.sales14d||0, roas=s/c;
  const st=state.get(String(r.keywordId))||{};
  const live=(st.state||'?').toUpperCase();
  const flag=(s===0)?'KILL':(roas<1.0?'KILL':(roas<1.5?'KILL@1.5':'keep'));
  if(flag.startsWith('KILL')&&live==='ENABLED'){killSpend+=c;killN++;} else {okSpend+=c;okN++;}
  console.log(`${fmt(c).padStart(7)} ${fmt(s).padStart(7)} ${(s?roas.toFixed(2):'0.00').padStart(6)} ${String(r.clicks||0).padStart(7)}  ${live.padEnd(9)} ${String(st.bid??'-').padStart(5)}  ${String(r.matchType||r.keywordType||'').toLowerCase().padEnd(8)} ${String(r.keyword||'(auto)').slice(0,44).padEnd(44)} ${flag}`);
}
const allSpend=rows.reduce((t,r)=>t+(+r.cost||0),0), allSales=rows.reduce((t,r)=>t+(+r.sales14d||0),0);
const overSpend=over.reduce((t,r)=>t+(+r.cost||0),0);
console.log(`\nSP TOTAL      spend $${fmt(allSpend)}   sales $${fmt(allSales)}   ROAS ${(allSales/allSpend).toFixed(2)}`);
console.log(`over $${BAR}       spend $${fmt(overSpend)}  (${(100*overSpend/allSpend).toFixed(0)}% of SP spend) across ${over.length} targets`);
console.log(`STILL ENABLED and failing the bar: ${killN} targets, $${fmt(killSpend)} spent this month`);
