/** Pull Sponsored Products campaigns (v3) for the US profile to see their state
 *  (enabled / paused / archived) + budgets — i.e. why ad spend is ~$0.
 *  RUN: node scripts/ads-campaigns.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {ADS_CLIENT_ID:CID,ADS_CLIENT_SECRET:CS,ADS_REFRESH_TOKEN:RT,ADS_PROFILE_ID:PID}=process.env;
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS}).toString()}).then(r=>r.json()).then(j=>j.access_token);

async function list(path, ct, body){
  const r=await fetch('https://advertising-api.amazon.com'+path,{method:'POST',headers:{Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PID,'Content-Type':ct,'Accept':ct},body:JSON.stringify(body)});
  const t=await r.text(); if(!r.ok) throw new Error(`${path} ${r.status}: ${t.slice(0,400)}`); return JSON.parse(t);
}
try{
  const camps=await list('/sp/campaigns/list','application/vnd.spCampaign.v3+json',{maxResults:300});
  const list2=camps.campaigns||[];
  console.log(`\nSponsored Products campaigns: ${list2.length}\n`);
  const byState={};
  for(const c of list2){ byState[c.state]=(byState[c.state]||0)+1; console.log(`  [${(c.state||'?').padEnd(8)}] ${c.name?.slice(0,46).padEnd(46)} budget=${c.budget?.budget??'?'} ${c.budget?.budgetType||''} ${c.targetingType||''}`); }
  console.log('\nState summary:', JSON.stringify(byState));
  if(!list2.length) console.log('\nNO campaigns — ad spend is $0 because there are no Sponsored Products campaigns. We build fresh.');
  else if(!byState.ENABLED) console.log('\nNo ENABLED campaigns — everything is paused/archived. That is why spend is ~$0. We re-enable + manage.');
}catch(e){ console.error('\nError:',e.message); }
