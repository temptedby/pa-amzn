/** READ-ONLY. Same-hour ad spend against authorised daily budget, all three profiles. */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const A='https://advertising-api.amazon.com';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
for(const [cc,pid,ccy] of [['US',process.env.ADS_PROFILE_ID,'USD'],['CA',process.env.ADS_PROFILE_ID_CA,'CAD'],['MX',process.env.ADS_PROFILE_ID_MX,'MXN']]){
  const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':pid,'Content-Type':'application/vnd.spcampaign.v3+json','Accept':'application/vnd.spcampaign.v3+json'};
  const cs=await (await fetch(`${A}/sp/campaigns/list`,{method:'POST',headers:H,body:JSON.stringify({maxResults:200,stateFilter:{include:['ENABLED']}})})).json();
  const ids=(cs.campaigns||[]).map(c=>c.campaignId);
  if(!ids.length){console.log(`${cc}: no enabled SP campaigns`);continue;}
  const BH={...H,'Content-Type':'application/vnd.spcampaignbudgetusage.v1+json','Accept':'application/vnd.spcampaignbudgetusage.v1+json'};
  const u=await (await fetch(`${A}/sp/campaigns/budget/usage`,{method:'POST',headers:BH,body:JSON.stringify({campaignIds:ids.slice(0,100)})})).json();
  let spent=0,budget=0,n=0;
  for(const r of (u.success||[])){ budget+=r.budget||0; spent+=(r.budget||0)*((r.budgetUsagePercent||0)/100); n++; }
  console.log(`${cc} ${ccy}  ${spent.toFixed(2).padStart(9)} spent of ${budget.toFixed(2).padStart(9)} authorised across ${n} campaigns  (${budget?(100*spent/budget).toFixed(1):0}%)`);
  for(const r of (u.success||[]).filter(r=>(r.budgetUsagePercent||0)>0).sort((a,b)=>b.budgetUsagePercent-a.budgetUsagePercent).slice(0,6)){
    console.log(`     ${String(r.budgetUsagePercent.toFixed(1)).padStart(6)}%  budget ${String(r.budget).padStart(7)}  campaign ${r.campaignId}`);
  }
}
