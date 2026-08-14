/** LIVE. Point the six REJECTED-creative ad groups at an already-APPROVED, text-free photo.
 *  William 2026-08-14: "make sure not the ones that were denied", "all of these work for the ads
 *  if approved", "i like the selfie though clip not attched".
 *
 *  Only the two rejected creatives are touched. Properties are copied VERBATIM from a creative
 *  Amazon has already approved, so the crops are known-good rather than computed here.
 *    Pro Retarget         -> daf95685  woman, tether clipped to her handbag strap
 *    Black Combo Retarget -> 5ca48c2d  clip attached at the waistband
 *  The selfie (596e7f00) is held back on William's own note: the cord hangs loose, so it does not
 *  show the clip doing its job. PACR rule 1 territory.
 */
import { readFileSync } from 'node:fs'; import { URL } from 'node:url';
function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const A='https://advertising-api.amazon.com';
const DRY = process.argv[2] !== '--apply';
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json','Accept':'application/json'};
const camps=await fetch(`${A}/sd/campaigns`,{headers:H}).then(r=>r.json());
const cname=Object.fromEntries(camps.map(c=>[String(c.campaignId),c.name]));
const ags=await fetch(`${A}/sd/adGroups`,{headers:H}).then(r=>r.json());
const agc=Object.fromEntries(ags.map(a=>[String(a.adGroupId),String(a.campaignId)]));
// BIG-ID PRECISION. creativeId is 18 digits, past Number.MAX_SAFE_INTEGER, so JSON.parse rounds it
// and every write comes back NOT_FOUND against an id that does not exist. Same trap sb-v2.ts hit.
// The ids are lifted out of the RAW text as strings and the request body is assembled as text.
const creRaw=await fetch(`${A}/sd/creatives?adGroupIdFilter=${ags.map(a=>a.adGroupId).join(',')}`,{headers:H}).then(r=>r.text());
const exactIds=[...creRaw.matchAll(/"creativeId":(\d+),"adGroupId":(\d+)/g)].map(m=>({creativeId:m[1],adGroupId:m[2]}));
const cre=JSON.parse(creRaw);
cre.forEach((c,i)=>{ c._id=exactIds[i]?.creativeId; c._ag=exactIds[i]?.adGroupId; });

const donor=(frag)=>{const c=cre.find(x=>JSON.stringify(x.properties).includes(frag)&&x.moderationStatus==='APPROVED');
  if(!c) throw new Error('no APPROVED donor for '+frag); return c.properties;};
const PICK=[
  {campaign:/^Pro Retarget/i,        props:donor('daf95685'), label:'woman + handbag (daf95685)'},
  {campaign:/^Black Combo Retarget/i, props:donor('5ca48c2d'), label:'waistband clip (5ca48c2d)'},
];
const ops=[];
for(const c of cre){
  if(c.moderationStatus!=='REJECTED') continue;                 // never touch an approved creative
  const name=cname[agc[String(c.adGroupId)]]||'';
  const pick=PICK.find(p=>p.campaign.test(name));
  if(!pick){ console.log('  rejected but no mapping:',name); continue; }
  ops.push({_id:c._id, _ag:c._ag, properties:pick.props, _n:name, _l:pick.label});
}
console.log(`rejected creatives to repoint: ${ops.length}`);
ops.forEach(o=>console.log(`  ${String(o._id).padEnd(20)} ${o._n.slice(0,38).padEnd(38)} -> ${o._l}`));
if(DRY){console.log('\nDRY RUN. --apply to swap.');process.exit(0);}

// Assembled as TEXT so the 18-digit ids survive. JSON.stringify of a JS number would round them.
const bodyText='['+ops.map(o=>
  `{"creativeId":${o._id},"adGroupId":${o._ag},"creativeType":"IMAGE","properties":${JSON.stringify(o.properties)}}`
).join(',')+']';
const r=await fetch(`${A}/sd/creatives`,{method:'PUT',headers:H,body:bodyText});
console.log('\nHTTP',r.status,(await r.text()).slice(0,700));

const after=await fetch(`${A}/sd/creatives?adGroupIdFilter=${ags.map(a=>a.adGroupId).join(',')}`,{headers:H}).then(r=>r.json());
console.log('\n== read back ==');
for(const c of after){
  const n=(cname[agc[String(c.adGroupId)]]||'?');
  if(!/Retarget/i.test(n)) continue;
  const f=((c.properties?.squareImages||[])[0]?.url||'').split('/').pop().slice(0,13);
  console.log(`  ${String(c.moderationStatus).padEnd(12)} ${f}  ${n.slice(0,40)}`);
}
