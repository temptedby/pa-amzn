/** LIVE. Set every ENABLED retarget audience target to the entry bid.
 *  William 2026-08-14: "start at .05 and see if bids go up and down based on roas, once we spend
 *  $4 turn it off." Amazon's own minimum, quoted from a live write, is $0.02.
 *  RUN: node scripts/sd-set-entry-bid.mjs [--apply] [bid]
 */
import { readFileSync } from 'node:fs'; import { URL } from 'node:url';
function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const A='https://advertising-api.amazon.com';
const APPLY=process.argv.includes('--apply');
const BID=Number(process.argv.find(a=>/^0?\.\d+$/.test(a))||0.05);
if(BID<0.02){console.log('below Amazon minimum $0.02');process.exit(1);}
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json','Accept':'application/json'};
const camps=await fetch(`${A}/sd/campaigns`,{headers:H}).then(r=>r.json());
const cname=Object.fromEntries(camps.map(c=>[String(c.campaignId),c.name]));
const ags=await fetch(`${A}/sd/adGroups`,{headers:H}).then(r=>r.json());
const agc=Object.fromEntries(ags.map(a=>[String(a.adGroupId),String(a.campaignId)]));
const targets=await fetch(`${A}/sd/targets`,{headers:H}).then(r=>r.json());
// ASIN targets carry a plain string in `value`; audience targets carry an array. Guard for both.
const lab=t=>{const e=(t.expression||[])[0]; if(!e||!Array.isArray(e.value))return null;
  const lb=e.value.find(v=>v&&v.type==='lookback');
  return lb?`${e.type} ${lb.value}d`:null;};
const want=targets.filter(t=>t.state==='enabled'&&lab(t)&&Math.abs((t.bid??0)-BID)>0.001);
console.log(`enabled audience targets to move to $${BID.toFixed(2)}: ${want.length}`);
want.forEach(t=>console.log(`  $${String(t.bid).padStart(5)} -> $${BID.toFixed(2)}  ${lab(t).padEnd(15)} ${(cname[agc[String(t.adGroupId)]]||'?').slice(0,40)}`));
if(!APPLY){console.log('\nDRY RUN. --apply to write.');process.exit(0);}
if(!want.length) process.exit(0);
const r=await fetch(`${A}/sd/targets`,{method:'PUT',headers:H,body:JSON.stringify(want.map(t=>({targetId:t.targetId,bid:BID})))});
console.log('\nHTTP',r.status,(await r.text()).slice(0,300));
const after=await fetch(`${A}/sd/targets`,{headers:H}).then(r=>r.json());
console.log('\n== read back, every enabled audience target ==');
for(const t of after){ if(t.state!=='enabled')continue; const l=lab(t); if(!l)continue;
  console.log(`  $${String(t.bid).padStart(5)}  ${l.padEnd(15)} ${(cname[agc[String(t.adGroupId)]]||'?').slice(0,42)}`); }
