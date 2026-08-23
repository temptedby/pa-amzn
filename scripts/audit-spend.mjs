/** THE AUDIT. Ad spend per day, per ad product, with a cumulative column that lines up with what
 *  the Amazon Ads console shows, and a HARD REFUSAL to print a total when any day is missing.
 *
 *  William 2026-08-23: "We need an auditing system, a second brain for you to get your data right
 *  ... it's frustrating when I respond to something and it's not real. Garbage in, garbage out."
 *
 *  WHAT WENT WRONG AND WHAT THIS FIXES. tacos.mjs printed a month total of $868.21 and, separately,
 *  a line reading "SB days not returned: 2026-08-12, 2026-08-21". Two Sponsored Brands days had
 *  failed to come back. The total was therefore about $11 light against William's console figure of
 *  $879, and I quoted the total without carrying the caveat with it. The number was not wrong by
 *  accident, it was KNOWN to be incomplete and presented as complete.
 *
 *  So the rule here is structural, not a reminder: if a day is missing, this script prints NO TOTAL.
 *  It retries every Sponsored Brands day until it answers, and if one still will not, it says which
 *  and refuses to add up. An incomplete total is worse than no total, because it gets quoted.
 *
 *  RUN: node scripts/audit-spend.mjs [--start=2026-08-01] [--end=YYYY-MM-DD] [--expect=879]
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const START=arg('start',new Date().toISOString().slice(0,7)+'-01');
const END=arg('end',new Date().toISOString().slice(0,10));
const EXPECT=arg('expect','')? +arg('expect','') : null;
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
const V3='application/vnd.createasyncreportrequest.v3+json';

async function v3(label,cfg){
  const cr=await (await rq(`${A}/reporting/reports`,{method:'POST',headers:H(V3),body:JSON.stringify(cfg)})).json();
  let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
  if(!rid) return {err:`create failed: ${JSON.stringify(cr).slice(0,160)}`};
  for(let i=0;i<200;i++){await sleep(8000);
    const s=await (await rq(`${A}/reporting/reports/${rid}`,{headers:H(V3)})).json();
    if(s.status==='COMPLETED') return {rows:JSON.parse(gunzipSync(Buffer.from(await (await rq(s.url)).arrayBuffer())).toString())};
    if(s.status==='FAILURE') return {err:'report FAILURE'};}
  return {err:'timeout'};
}
// Sponsored Brands has no working v3 daily report for this profile (single-ad-group legacy
// campaigns are excluded), so it is one v2 HSA call PER DAY. Each is retried; a day that never
// answers is recorded as missing rather than as zero. Zero and unknown are not the same number.
async function sbDay(day,tries=4){
  const HH={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json'};
  for(let t=0;t<tries;t++){
    try{
      const cr=await rq(`${A}/v2/hsa/campaigns/report`,{method:'POST',headers:HH,body:JSON.stringify({reportDate:day.replace(/-/g,''),metrics:'campaignId,campaignName,impressions,clicks,cost,attributedSales14d'})});
      if(!cr.ok){await sleep(5000);continue;}
      const {reportId}=await cr.json(); if(!reportId){await sleep(5000);continue;}
      for(let i=0;i<60;i++){await sleep(6000);
        const st=await (await rq(`${A}/v2/reports/${reportId}`,{headers:HH})).json().catch(()=>({}));
        if(st.status==='FAILURE') break;
        if(st.status!=='SUCCESS') continue;
        const b=Buffer.from(await (await rq(`${A}/v2/reports/${reportId}/download`,{headers:HH,redirect:'follow'})).arrayBuffer());
        let txt; try{txt=gunzipSync(b).toString();}catch{txt=b.toString();}
        return JSON.parse(txt);
      }
    }catch{}
    await sleep(6000);
  }
  return null;   // NOT zero. Unknown.
}

const days=[];for(let d=new Date(START+'T12:00:00Z');d<=new Date(END+'T12:00:00Z');d=new Date(d.getTime()+864e5))days.push(d.toISOString().slice(0,10));
console.log(`auditing ${days.length} days, ${START} to ${END}. Sponsored Brands is one call per day and is retried, so this is slow.\n`);

const [sp,sd,...sbAll]=await Promise.all([
  v3('SP',{name:`audit-sp-${START}-${END}`,startDate:START,endDate:END,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['campaign'],columns:['date','cost','sales14d','clicks','impressions'],reportTypeId:'spCampaigns',timeUnit:'DAILY',format:'GZIP_JSON'}}),
  v3('SD',{name:`audit-sd-${START}-${END}`,startDate:START,endDate:END,configuration:{adProduct:'SPONSORED_DISPLAY',groupBy:['campaign'],columns:['date','cost','sales','clicks','impressions'],reportTypeId:'sdCampaigns',timeUnit:'DAILY',format:'GZIP_JSON'}}),
  ...days.map(d=>sbDay(d).then(r=>({day:d,rows:r}))),
]);

const gaps=[];
if(sp.err) gaps.push(`Sponsored Products report: ${sp.err}`);
if(sd.err) gaps.push(`Sponsored Display report: ${sd.err}`);
const agg={}; for(const d of days) agg[d]={sp:0,sd:0,sb:null,spS:0,sdS:0,sbS:0};
for(const r of (sp.rows||[])) if(agg[r.date]){agg[r.date].sp+=+r.cost||0;agg[r.date].spS+=+r.sales14d||0;}
for(const r of (sd.rows||[])) if(agg[r.date]){agg[r.date].sd+=+r.cost||0;agg[r.date].sdS+=+r.sales||0;}
for(const s of sbAll){
  if(!s.rows){gaps.push(`Sponsored Brands ${s.day}: no answer after 4 attempts`);continue;}
  agg[s.day].sb=0;
  for(const r of s.rows){agg[s.day].sb+=r.cost||0;agg[s.day].sbS+=r.attributedSales14d||0;}
}

// TWO BLOCKS, ALWAYS, AND NEVER MIXED. William 2026-08-23: "let's just make sure we're really
// clear whether we're talking about day-to-day spend and ROAS day-to-day or overall cumulative."
// A daily ROAS and a month-to-date ROAS are different questions and one is far less trustworthy
// than the other; printing them in one column is how they get confused.
console.log('=========== DAY BY DAY. Each row is that day alone. ===========\n');
console.log('day            SP       SD       SB     SPEND   ad sales   ROAS   note');
let cum=0, cumSales=0, complete=true;
const rowsOut=[];
const todayIso=new Date().toISOString().slice(0,10);
const ageDays=d=>Math.round((new Date(todayIso)-new Date(d))/864e5);
for(const d of days){
  const a=agg[d]; const known=a.sb!==null && !sp.err && !sd.err;
  const tot=a.sp+a.sd+(a.sb??0);
  const sales=a.spS+a.sdS+a.sbS;
  if(known){cum+=tot;cumSales+=sales;} else complete=false;
  // Ad sales are credited to the CLICK date inside a 14-day attribution window, so a recent day's
  // sales figure is INCOMPLETE and will rise. Saying so per row is the only honest way to show it.
  const age=ageDays(d);
  const note = age<=1 ? 'sales still landing, will rise a lot'
             : age<=7 ? 'sales still landing, will rise'
             : age<14 ? 'sales mostly landed'
             : 'settled';
  rowsOut.push({d,tot,sales,known,cum,cumSales});
  console.log(`${d}  ${a.sp.toFixed(2).padStart(7)}  ${a.sd.toFixed(2).padStart(7)}  ${(a.sb===null?'MISSING':a.sb.toFixed(2)).padStart(7)}  ${tot.toFixed(2).padStart(7)}  ${sales.toFixed(2).padStart(8)}  ${(tot?(sales/tot).toFixed(2):'-').padStart(5)}   ${note}`);
}
console.log('\n=========== CUMULATIVE. Each row is 08-01 through that day. ===========\n');
console.log('through        spend   ad sales   ROAS');
for(const r of rowsOut){
  if(!r.known){console.log(`${r.d}   -- incomplete, not totalled --`);continue;}
  console.log(`${r.d}  ${r.cum.toFixed(2).padStart(9)}  ${r.cumSales.toFixed(2).padStart(9)}  ${(r.cum?(r.cumSales/r.cum).toFixed(2):'-').padStart(5)}`);
}
console.log('');
if(gaps.length){
  console.log('INCOMPLETE. No total will be printed. Missing:');
  for(const g of gaps) console.log('  -',g);
  console.log('\nA total computed over these gaps would be LOW, and once quoted it becomes the number');
  console.log('everyone reasons from. Re-run until every day answers.');
  process.exit(2);
}
console.log(`COMPLETE: every one of the ${days.length} days answered.`);
console.log(`MONTH TO ${END}   ad spend $${cum.toFixed(2)}   ad sales $${cumSales.toFixed(2)}   ROAS ${(cumSales/cum).toFixed(2)}`);
console.log(`(cumulative ROAS is the trustworthy one. The last few DAILY rows understate,\n because a click on the 22nd can still be credited a sale on the 5th of September.)`);
if(EXPECT!==null){
  const diff=cum-EXPECT;
  console.log(`expected (yours)      $${EXPECT.toFixed(2)}`);
  console.log(`difference            $${diff.toFixed(2)}   ${Math.abs(diff)<1?'MATCH':'DOES NOT MATCH — do not quote either number until this is explained'}`);
}
