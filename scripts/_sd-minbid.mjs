/** READ-MOSTLY probe: what is Amazon's minimum Sponsored Display bid?
 *  Probes on a target inside a PAUSED campaign so nothing serving is disturbed,
 *  and restores the original bid at the end. */
import { readFileSync } from 'node:fs'; import { URL } from 'node:url';
function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const A='https://advertising-api.amazon.com';
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json','Accept':'application/json'};
const camps=await fetch(`${A}/sd/campaigns`,{headers:H}).then(r=>r.json());
const paused=new Set(camps.filter(c=>c.state!=='enabled').map(c=>String(c.campaignId)));
const cname=Object.fromEntries(camps.map(c=>[String(c.campaignId),c.name]));
const ags=await fetch(`${A}/sd/adGroups`,{headers:H}).then(r=>r.json());
const agc=Object.fromEntries(ags.map(a=>[String(a.adGroupId),String(a.campaignId)]));
const targets=await fetch(`${A}/sd/targets`,{headers:H}).then(r=>r.json());
const subject=targets.find(t=>t.state==='enabled' && paused.has(agc[String(t.adGroupId)]) && JSON.stringify(t.expression||[]).includes('lookback'));
if(!subject){ console.log('no safe probe subject found'); process.exit(0); }
console.log(`probe subject: target ${subject.targetId}, bid $${subject.bid}, campaign "${(cname[agc[String(subject.adGroupId)]]||'').slice(0,40)}" (PAUSED, so nothing is serving)\n`);
const original=subject.bid;
const put=async(bid)=>{
  const r=await fetch(`${A}/sd/targets`,{method:'PUT',headers:H,body:JSON.stringify([{targetId:subject.targetId,bid}])});
  const t=await r.text();
  return {status:r.status, body:t.slice(0,220).replace(/\s+/g,' ')};
};
for(const bid of [0.07,0.05,0.03,0.02,0.01]){
  const {status,body}=await put(bid);
  const ok=/SUCCESS/.test(body);
  console.log(`  $${bid.toFixed(2)}  HTTP ${status}  ${ok?'ACCEPTED':'REFUSED  '+body}`);
  if(!ok) break;
}
// read back what actually stuck, then restore
const after=await fetch(`${A}/sd/targets`,{headers:H}).then(r=>r.json());
const now=after.find(t=>String(t.targetId)===String(subject.targetId));
console.log(`\n  read back: $${now?.bid}`);
await put(original);
const restored=(await fetch(`${A}/sd/targets`,{headers:H}).then(r=>r.json())).find(t=>String(t.targetId)===String(subject.targetId));
console.log(`  restored to: $${restored?.bid}`);
