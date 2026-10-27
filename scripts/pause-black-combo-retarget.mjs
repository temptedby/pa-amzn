/**
 * Pause the Black Combo Retarget pair.
 * William 2026-10-27: "black retarget pause until we know how to convert retarget ads".
 *
 * This answers the open question Q4. That campaign had all 15 of its ads switched off, so its
 * $50/day had been dead; making it Single-only today enabled its Single ads and woke it up, which
 * William had not asked for. Pausing both halves at campaign level returns it to not spending and
 * is fully reversible.
 *
 * Scope is deliberately the Black COMBO pair only. Two other Display retarget campaigns carry
 * "Black" in their names and are left alone pending William, listed at the end.
 *
 * Dry run by default. --apply writes.
 */
import fs from 'node:fs';
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const APPLY=process.argv.includes('--apply');
const PAIR=['481667295554084','212304114081274'];
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const h={Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':'application/json',Accept:'application/json'};
const A='https://advertising-api.amazon.com';
const g=async p=>{const r=await fetch(A+p,{headers:h}); if(!r.ok) throw new Error('UNREAD '+p+' '+r.status); return r.json();};
let camps=await g('/sd/campaigns');
const target=camps.filter(c=>PAIR.includes(String(c.campaignId)));
console.log((APPLY?'APPLYING':'DRY RUN')+'\n');
for(const c of target) console.log('  $'+String(c.budget).padEnd(5)+String(c.campaignId).padEnd(18)+String(c.state).padEnd(10)+String(c.name).slice(0,52));
const todo=target.filter(c=>c.state==='enabled');
console.log('\n  to pause: '+todo.length+'   budget released $'+todo.reduce((t,c)=>t+c.budget,0).toFixed(2)+'/day');
if(APPLY&&todo.length){
  const r=await fetch(A+'/sd/campaigns',{method:'PUT',headers:h,body:JSON.stringify(todo.map(c=>({campaignId:Number(c.campaignId),state:'paused'})))});
  const t=await r.text(); console.log('\n  PUT http '+r.status+'  '+t.slice(0,200));
  camps=await g('/sd/campaigns');
  for(const id of PAIR){const c=camps.find(x=>String(x.campaignId)===id);
    console.log('  read back '+id+'  '+(c?c.state:'missing')+'  $'+(c?c.budget:'-'));}
} else if(!APPLY) console.log('\nnothing written. add --apply');
console.log('\nLEFT ALONE, other Display retargets with "Black" in the name, pending William:');
for(const c of camps.filter(x=>x.state==='enabled'&&/retarget/i.test(String(x.name))))
  console.log('  $'+String(c.budget).padEnd(5)+String(c.campaignId).padEnd(18)+String(c.name).slice(0,54));
const en=camps.filter(c=>c.state==='enabled');
console.log('\nDisplay enabled campaigns: '+en.length+'   authorised $'+en.reduce((t,c)=>t+c.budget,0).toFixed(2)+'/day');
