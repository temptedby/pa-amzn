/** Overspend check across ALL ad products (William 2026-08-06).
 *
 *  Answers one question: is anything spending money it has not earned, anywhere in the account?
 *  Read-only. Reports, never writes.
 *
 *  The $4 rule (ad-rules.ts) is Sponsored Products only, and SP is ~17% of the spend. This walks
 *  all three products so nothing runs unwatched:
 *    SP  keyword level   spend + sales  -> full rule
 *    SD  target  level   spend + sales  -> full rule
 *    SB  campaign level  spend only     -> spend-vs-cap, because SB reports do not return sales
 *                                          for this profile (see daily-summaries/2026-08-05.md)
 *
 *  RUN: node scripts/ad-overspend.mjs [--days=MTD|7|30]
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';

function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}catch{}}
loadEnv();

const A='https://advertising-api.amazon.com';
const KILL_SPEND=4.00;          // William's rule: $4 of rope
const BREAKEVEN_ACOS=0.52;      // validated from real fees: $9.49 price, $0.62 COGS, $1.42 referral, $2.52 FBA
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const iso=d=>d.toISOString().slice(0,10);
const usd=n=>'$'+Number(n||0).toFixed(2);

const arg=n=>{const a=process.argv.find(x=>x.startsWith('--'+n+'='));return a?a.split('=')[1]:null;};
const daysArg=arg('days')||'MTD';
const now=new Date();
const START=daysArg==='MTD'?iso(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)))
                           :iso(new Date(Date.now()-Number(daysArg)*864e5));
const END=iso(now);

const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});

async function report(label,cfg,maxPolls=75){
  const cr=await fetch(`${A}/reporting/reports`,{method:'POST',headers:H('application/vnd.createasyncreportrequest.v3+json'),body:JSON.stringify(cfg)}).then(r=>r.json());
  let rid=cr.reportId;
  if(!rid&&String(cr.code)==='425'){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/);if(m)rid=m[1];}   // duplicate -> reuse the existing one
  if(!rid){console.log(`  ${label}: cannot create (${JSON.stringify(cr).slice(0,140)})`);return null;}
  for(let i=0;i<maxPolls;i++){
    await sleep(10000);
    const s=await fetch(`${A}/reporting/reports/${rid}`,{headers:H('application/vnd.createasyncreportrequest.v3+json')}).then(r=>r.json());
    if(s.status==='COMPLETED')return JSON.parse(gunzipSync(Buffer.from(await (await fetch(s.url)).arrayBuffer())).toString());
    if(s.status==='FAILURE'){console.log(`  ${label}: report FAILED`);return null;}
  }
  console.log(`  ${label}: still pending after ${maxPolls*10}s — Amazon's queue, not our code`);
  return null;
}

// A row is overspending when it has burned the $4 of rope without earning it back.
function verdict(spend,sales,orders){
  if(spend<KILL_SPEND)return null;
  if(orders===0)return {kind:'no sales',waste:spend};
  const acos=sales>0?spend/sales:Infinity;
  if(acos>=BREAKEVEN_ACOS)return {kind:`ACOS ${(acos*100).toFixed(0)}%`,waste:spend-sales*BREAKEVEN_ACOS};
  return null;
}

console.log(`OVERSPEND CHECK  ${START} .. ${END}\n${'='.repeat(64)}`);
let totalWaste=0, totalSpend=0;

// ---- Sponsored Products, keyword level -------------------------------------------------
{
  const rows=await report('SP',{name:'osp-sp',startDate:START,endDate:END,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['targeting'],columns:['keywordId','keyword','matchType','cost','sales14d','purchases14d','campaignName'],reportTypeId:'spTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}});
  console.log('\nSPONSORED PRODUCTS  (keyword level, full rule)');
  if(rows){
    const bad=[];let spend=0;
    for(const r of rows){
      spend+=r.cost||0;
      const v=verdict(r.cost||0,r.sales14d||0,r.purchases14d||0);
      if(v)bad.push({t:r.keyword||r.keywordId,m:r.matchType,c:r.cost,s:r.sales14d,o:r.purchases14d,v});
    }
    totalSpend+=spend;
    console.log(`  spend ${usd(spend)} across ${rows.length} keywords`);
    if(!bad.length)console.log('  nothing over the $4 line. CLEAN.');
    bad.sort((a,b)=>b.v.waste-a.v.waste).forEach(b=>{totalWaste+=b.v.waste;
      console.log(`  OVER  ${usd(b.c).padStart(8)}  ${String(b.o).padStart(2)} ord  ${b.v.kind.padEnd(11)}  ${(b.t||'').slice(0,42)} (${b.m||''})`);});
  }
}

// ---- Sponsored Display, target level --------------------------------------------------
{
  const rows=await report('SD',{name:'osp-sd',startDate:START,endDate:END,configuration:{adProduct:'SPONSORED_DISPLAY',groupBy:['targeting'],columns:['targetingText','cost','sales','purchases','campaignName'],reportTypeId:'sdTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}});
  console.log('\nSPONSORED DISPLAY  (target level, full rule)');
  if(rows){
    const bad=[];let spend=0;
    for(const r of rows){
      spend+=r.cost||0;
      const v=verdict(r.cost||0,r.sales||0,r.purchases||0);
      if(v)bad.push({t:r.targetingText,c:r.cost,o:r.purchases,v});
    }
    totalSpend+=spend;
    console.log(`  spend ${usd(spend)} across ${rows.length} targets`);
    if(!bad.length)console.log('  nothing over the $4 line. CLEAN.');
    bad.sort((a,b)=>b.v.waste-a.v.waste).forEach(b=>{totalWaste+=b.v.waste;
      console.log(`  OVER  ${usd(b.c).padStart(8)}  ${String(b.o).padStart(2)} ord  ${b.v.kind.padEnd(11)}  ${(b.t||'').slice(0,42)}`);});
  }
}

// ---- Sponsored Brands, campaign level, spend only --------------------------------------
// SB reports return COMPLETED-with-zero-rows or never complete for this profile, so sales are not
// knowable here. Budget usage IS reachable and is what makes SB spend visible at all.
{
  console.log('\nSPONSORED BRANDS  (campaign level, SPEND ONLY — reports return no sales for this profile)');
  const camps=await fetch(`${A}/sb/v4/campaigns/list`,{method:'POST',headers:H('application/vnd.sbcampaignresource.v4+json'),body:JSON.stringify({maxResults:100})}).then(r=>r.json()).catch(()=>({}));
  const list=camps.campaigns||[];
  const enabled=list.filter(c=>c.state==='ENABLED');
  console.log(`  ${list.length} campaigns, ${enabled.length} ENABLED`);
  if(enabled.length){
    const bu=await fetch(`${A}/sb/campaigns/budget/usage`,{method:'POST',headers:H('application/vnd.sbcampaignbudgetusage.v1+json'),body:JSON.stringify({campaignIds:enabled.map(c=>String(c.campaignId))})}).then(r=>r.json()).catch(()=>({}));
    const byId=new Map(enabled.map(c=>[String(c.campaignId),c]));
    let day=0;
    for(const u of (bu.success||[])){
      const c=byId.get(String(u.campaignId))||{};
      const budget=Number(u.budget??c.budget?.budget??0);
      const spent=(Number(u.budgetUsagePercent||0)/100)*budget;
      day+=spent;
      if(spent>0)console.log(`  ${usd(spent).padStart(8)} today (${Number(u.budgetUsagePercent||0).toFixed(1)}% of ${usd(budget)})  ${(c.name||u.campaignId).slice(0,42)}  @${u.usageUpdatedTimestamp||''}`);
    }
    console.log(`  today so far ${usd(day)}  ->  ~${usd(day*30)}/month at this rate`);
    console.log('  NOTE: no sales data, so the $4 rule cannot be applied here. This is spend running unjudged.');
  }
}

console.log(`\n${'='.repeat(64)}`);
console.log(`measurable spend ${usd(totalSpend)}   estimated waste ${usd(totalWaste)}`);
console.log(`rule: pause at ${usd(KILL_SPEND)} month-to-date with no orders, or ACOS >= ${(BREAKEVEN_ACOS*100).toFixed(0)}%`);
