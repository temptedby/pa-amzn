/** READ-ONLY. Every dollar of ad spend, every product, every campaign, right now.
 *
 *  No database writes, no Amazon mutations. Pure report.
 *
 *  Sponsored Brands reports return COMPLETED with zero rows for this profile, so the reporting API
 *  cannot tell us what SB cost — and SB is most of the spend. The budget-usage endpoint can:
 *  budgetUsagePercent x budget = dollars spent so far in the current account day. It bypasses the
 *  report queue entirely. The counter RESETS AT 07:00 UTC, so a reading taken just after the reset
 *  looks like zero spend when it only means the day just started.
 *
 *  RUN: node scripts/spend-snapshot.mjs
 */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const A='https://advertising-api.amazon.com';
const usd=n=>'$'+Number(n||0).toFixed(2);
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const base={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID};
const H=(ct,acc)=>({...base,'Content-Type':ct,'Accept':acc||ct});

/** Amazon's advertising day runs 07:00Z to 07:00Z. Before 07:00Z we are still inside yesterday. */
const accountDay=(d=new Date())=>new Date(d.getTime()-7*3600*1000).toISOString().slice(0,10);

const PRODUCTS=[
  { key:'Sponsored Products',
    list:async()=>{let n,out=[];do{const r=await fetch(`${A}/sp/campaigns/list`,{method:'POST',headers:H('application/vnd.spCampaign.v3+json'),body:JSON.stringify({maxResults:100,...(n?{nextToken:n}:{})})}).then(r=>r.json());out.push(...(r.campaigns||[]));n=r.nextToken;}while(n);
      return out.map(c=>({id:String(c.campaignId),name:c.name,state:c.state,budget:c.budget?.budget}));},
    usage:'/sp/campaigns/budget/usage', ct:'application/vnd.spcampaignbudgetusage.v1+json' },
  { key:'Sponsored Brands',
    list:async()=>{const r=await fetch(`${A}/sb/v4/campaigns/list`,{method:'POST',headers:H('application/vnd.sbcampaignresource.v4+json'),body:JSON.stringify({maxResults:100})}).then(r=>r.json());
      return (r.campaigns||[]).map(c=>({id:String(c.campaignId),name:c.name,state:c.state,budget:c.budget?.budget??c.budget}));},
    usage:'/sb/campaigns/budget/usage', ct:'application/vnd.sbcampaignbudgetusage.v1+json' },
  { key:'Sponsored Display',
    list:async()=>{const r=await fetch(`${A}/sd/campaigns`,{headers:H('application/json')}).then(r=>r.json());
      return (Array.isArray(r)?r:[]).map(c=>({id:String(c.campaignId),name:c.name,state:String(c.state||'').toUpperCase(),budget:c.budget}));},
    usage:'/sd/campaigns/budget/usage', ct:'application/vnd.sdcampaignbudgetusage.v1+json' },
];

const nowZ=new Date().toISOString().slice(11,16);
console.log(`AD SPEND — account day ${accountDay()}   (resets 07:00Z, it is ${nowZ}Z now)\n`);
let grand=0, grandBudget=0;
const summary=[];
for(const p of PRODUCTS){
  let camps=[];
  try{ camps=await p.list(); }catch(e){ console.log(`${p.key}: campaign list FAILED — ${e.message}\n`); continue; }
  const live=camps.filter(c=>c.state==='ENABLED');
  if(!live.length){ console.log(`${p.key}: 0 enabled campaigns\n`); summary.push([p.key,0,0,0]); continue; }
  let usage={};
  try{ usage=await fetch(`${A}${p.usage}`,{method:'POST',headers:H(p.ct),body:JSON.stringify({campaignIds:live.map(c=>c.id)})}).then(r=>r.json()); }
  catch(e){ console.log(`${p.key}: budget usage FAILED — ${e.message}\n`); continue; }
  const byId=new Map(live.map(c=>[c.id,c]));
  let sub=0, budg=0;
  const lines=[];
  for(const u of (usage.success||[])){
    const c=byId.get(String(u.campaignId))||{};
    const budget=Number(u.budget ?? c.budget ?? 0);
    const pct=Number(u.budgetUsagePercent||0);
    const spend=+(budget*pct/100).toFixed(2);
    sub+=spend; budg+=budget;
    lines.push(`   ${usd(spend).padStart(8)}  ${pct.toFixed(1).padStart(5)}% of ${usd(budget).padStart(8)}/day   ${(c.name||u.campaignId).slice(0,44)}`);
  }
  lines.sort((a,b)=>parseFloat(b.trim().slice(1))-parseFloat(a.trim().slice(1)));
  grand+=sub; grandBudget+=budg;
  summary.push([p.key,live.length,sub,budg]);
  console.log(`${p.key}  —  ${live.length} enabled, ${usd(sub)} spent so far, ${usd(budg)}/day authorised`);
  lines.forEach(l=>console.log(l));
  for(const e of (usage.error||[])) console.log(`   ERROR ${JSON.stringify(e).slice(0,120)}`);
  console.log('');
}
console.log('─'.repeat(72));
console.log('product                enabled     spent today    authorised/day');
for(const [k,n,s,b] of summary) console.log(`${k.padEnd(22)} ${String(n).padStart(4)}   ${usd(s).padStart(12)}   ${usd(b).padStart(14)}`);
console.log(`${'TOTAL'.padEnd(22)}        ${usd(grand).padStart(12)}   ${usd(grandBudget).padStart(14)}`);
console.log(`\nusing ${grandBudget>0?(grand/grandBudget*100).toFixed(1):'0'}% of authorised budget.`);
console.log('Cumulative since 07:00Z. Run again later in the day for the running total.');
