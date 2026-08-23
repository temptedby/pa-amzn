/** How much does a day's ad sales figure RISE after the fact?
 *
 *  William 2026-08-23: "you're saying sales still landing will rise, but by how much?"
 *
 *  METHOD, and it is a real measurement rather than an estimate. Two independent readings of the
 *  same number:
 *    (a) what we BELIEVED month-to-date SP sales were at the end of day D — the last
 *        kw_perf_snapshot row written on day D, which the engine wrote from that day's own report.
 *    (b) what we now KNOW month-to-date SP sales through day D were — today's daily report,
 *        accumulated to day D.
 *  (b) minus (a) is attribution that landed after the fact, and D's age tells us how long it took.
 *
 *  Sponsored Products only on both sides, because kw_perf_snapshot is a keyword table.
 *  RUN: node scripts/attribution-rise.mjs
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const START=arg('start',new Date().toISOString().slice(0,7)+'-01'), END=arg('end',new Date().toISOString().slice(0,10));
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const V3='application/vnd.createasyncreportrequest.v3+json';
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':V3,'Accept':V3};

const cr=await (await rq(`${A}/reporting/reports`,{method:'POST',headers:H,body:JSON.stringify({
  name:`attrib-rise-${START}-${END}`,startDate:START,endDate:END,
  configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['campaign'],columns:['date','cost','sales14d','purchases14d'],
    reportTypeId:'spCampaigns',timeUnit:'DAILY',format:'GZIP_JSON'}})})).json();
let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
if(!rid){console.log('report create failed');process.exit(1);}
let rows=null;
for(let i=0;i<200;i++){await sleep(8000);
  const s=await (await rq(`${A}/reporting/reports/${rid}`,{headers:H})).json();
  if(s.status==='COMPLETED'){rows=JSON.parse(gunzipSync(Buffer.from(await (await rq(s.url)).arrayBuffer())).toString());break;}
  if(s.status==='FAILURE'){console.log('report FAILURE');process.exit(1);}}
if(!rows){console.log('report did not complete');process.exit(1);}

const byDay={};
for(const r of rows){ byDay[r.date]??={cost:0,sales:0}; byDay[r.date].cost+=+r.cost||0; byDay[r.date].sales+=+r.sales14d||0; }
const days=Object.keys(byDay).sort();
const truthCum={}; let c=0;
for(const d of days){ c+=byDay[d].sales; truthCum[d]=c; }

const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
// What we believed at the end of day D. Use the MAXIMUM total across that day's pulls, not the
// LAST one.
//
// The engine only completed 2 to 4 runs a day this month, and a run whose report was still PENDING
// writes a PARTIAL snapshot. Taking the last pull of the day therefore sometimes reads a partial as
// the day's closing belief, which manufactures an enormous fake "rise" the next day: the first
// version of this script reported 08-20 rising 191.5%, which was not attribution at all, it was a
// short snapshot being compared against a complete one. A month-to-date total can only go up, so
// the max across the day is the honest closing figure.
const pulls=(await db.execute(`select taken_at, round(sum(mtd_sales),2) s, count(*) n
  from kw_perf_snapshot group by taken_at order by taken_at`)).rows;
const rawBest={}, pullCount={};
for(const r of pulls){
  const d=String(r.taken_at).slice(0,10), v=+(r.s||0);
  if(rawBest[d]===undefined || v>rawBest[d]) rawBest[d]=v;
  pullCount[d]=(pullCount[d]||0)+1;
}
// MONOTONICITY IS THE TEST OF A GOOD READING, and taking the max WITHIN a day was not enough.
//
// A month-to-date total cannot fall. So if day D's best reading is below day D-1's, every pull on
// day D was partial and the day has NO usable closing figure. It must be DISCARDED, not used.
// 08-20 is the case that proves it: both its pulls came in at $130.39 against $282.74 the day
// before. Using it produced a fake 191.5% "attribution rise" that survived the first fix, because
// max-within-a-day cannot detect a day where every pull was short.
const believed={}, unusable=[];
let running=0;
for(const d of Object.keys(rawBest).sort()){
  if(rawBest[d] >= running){ believed[d]=rawBest[d]; running=rawBest[d]; }
  else { unusable.push(`${d} (read $${rawBest[d].toFixed(2)}, but $${running.toFixed(2)} was already booked)`); }
}

console.log(`\nHOW MUCH A DAY'S SALES FIGURE RISES AFTER THE FACT (Sponsored Products)\n`);
console.log('day         age  pulls   believed MTD    now known MTD     rise      rise %');
const byAge={};
for(const d of days){
  if(believed[d]===undefined || truthCum[d]===undefined) continue;
  const age=Math.round((new Date(END)-new Date(d))/864e5);
  const b=believed[d], t=truthCum[d], rise=t-b;
  if(b<=0) continue;
  (byAge[age]??=[]).push(rise/b);
  console.log(`${d}  ${String(age).padStart(4)}  ${String(pullCount[d]??0).padStart(5)}   ${b.toFixed(2).padStart(11)}   ${t.toFixed(2).padStart(13)}   ${rise.toFixed(2).padStart(7)}   ${(100*rise/b).toFixed(1).padStart(6)}%`);
}
if(unusable.length){
  console.log(`\nDISCARDED — every pull that day was partial, so the day has no closing figure:`);
  for(const u of unusable) console.log('  ',u);
}
console.log('\nBY AGE — how much a figure of this age is still going to move:\n');
console.log('days old   n    rise');
const ages=Object.keys(byAge).map(Number).sort((a,b)=>a-b);
for(const a of ages){
  const v=byAge[a].slice().sort((x,y)=>x-y); const med=v[Math.floor(v.length/2)];
  console.log(`${String(a).padStart(8)}  ${String(v.length).padStart(2)}    ${(100*med).toFixed(1)}%${v.length<3?'   <- ONE observation. Not a rate. Do not plan on it.':''}`);
}
console.log(`\nREAD THIS BEFORE USING THE TABLE. Each age has ONE observation, because this month is the
only history in kw_perf_snapshot. One number is an anecdote, not a curve. What it can support is a
DIRECTION: figures 5 to 9 days old were still rising 18% to 54%, and figures 0 to 2 days old had
barely moved yet because their sales had not started landing. Both are consistent with a 14-day
window. Neither is a rate you can multiply a day's ROAS by.

To get a real curve, the same daily report has to be pulled repeatedly over the next fortnight and
each day's figure tracked as it settles. That is forward-looking work, and it is the only honest way
to answer "by how much".`);
