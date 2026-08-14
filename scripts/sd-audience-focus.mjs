/** LIVE. William 2026-08-14: views 7 and 14 only, purchases 365 only.
 *  Pauses views-30d and any purchases window other than 365 in the ENABLED retarget campaigns. */
import { readFileSync } from 'node:fs'; import { URL } from 'node:url';
function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const A='https://advertising-api.amazon.com';
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json','Accept':'application/json'};
const DRY = process.argv[2] !== '--apply';
const camps=await fetch(`${A}/sd/campaigns`,{headers:H}).then(r=>r.json());
const cname=Object.fromEntries(camps.map(c=>[String(c.campaignId),c.name]));
const ags=await fetch(`${A}/sd/adGroups`,{headers:H}).then(r=>r.json());
const agc=Object.fromEntries(ags.map(a=>[String(a.adGroupId),String(a.campaignId)]));
const targets=await fetch(`${A}/sd/targets`,{headers:H}).then(r=>r.json());
const parse=t=>{const e=(t.expression||[])[0]; if(!e||(e.type!=='views'&&e.type!=='purchases'))return null;
  const lb=(e.value||[]).find(v=>v.type==='lookback'); const kind=(e.value||[]).find(v=>v.type)?.type;
  return lb?{type:e.type, days:Number(lb.value), scope:kind}:null;};
const KEEP_VIEWS=[7,14], KEEP_BUY=[365];
const kill=[];
for(const t of targets){
  if(t.state!=='enabled') continue;
  const p=parse(t); if(!p) continue;
  const ok = p.type==='views' ? KEEP_VIEWS.includes(p.days) : KEEP_BUY.includes(p.days);
  if(!ok) kill.push({targetId:t.targetId, label:`${p.type} ${p.days}d  $${t.bid}  ${(cname[agc[String(t.adGroupId)]]||'?').slice(0,40)}`});
}
console.log(`enabled audience targets outside William's list: ${kill.length}`);
kill.forEach(k=>console.log('  pause', k.label));
if(DRY){console.log('\nDRY RUN. --apply to pause.');process.exit(0);}
if(!kill.length) process.exit(0);
const r=await fetch(`${A}/sd/targets`,{method:'PUT',headers:H,body:JSON.stringify(kill.map(k=>({targetId:k.targetId,state:'paused'})))});
console.log('\nHTTP',r.status, JSON.stringify(await r.json().catch(()=>null)).slice(0,400));
const after=await fetch(`${A}/sd/targets`,{headers:H}).then(r=>r.json());
console.log('\nENABLED audience targets now:');
for(const t of after){ if(t.state!=='enabled')continue; const p=parse(t); if(!p)continue;
  console.log(`  ${p.type} ${String(p.days).padStart(3)}d  $${t.bid}  ${(cname[agc[String(t.adGroupId)]]||'?').slice(0,42)}`); }
