/**
 * Create + apply Gmail labels to file kept mail (seed of the daily labeling system).
 *  - "Shipments"  → Cynthia Lafferty shipment emails (kept in inbox)
 *  - "Trademark"  → trademark/Securisee/USPTO emails (labeled AND archived out of inbox)
 * Read+modify only (gmail.modify). Never deletes. RUN: node scripts/inbox-label.mjs
 */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const api=(p,init)=>fetch(`https://gmail.googleapis.com/gmail/v1/users/me${p}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init?.headers||{})}}).then(async r=>{const t=await r.text();if(!r.ok)throw new Error(`${p} ${r.status}: ${t}`);return t?JSON.parse(t):{};});

async function ensureLabel(name){
  const {labels=[]}=await api('/labels');
  const found=labels.find(l=>l.name===name);
  if(found)return found.id;
  const created=await api('/labels',{method:'POST',body:JSON.stringify({name,labelListVisibility:'labelShow',messageListVisibility:'show'})});
  console.log(`created label "${name}"`);
  return created.id;
}
async function search(q){const ids=[];let pt;do{const u=new URLSearchParams({q,maxResults:'100'});if(pt)u.set('pageToken',pt);const pg=await api(`/messages?${u}`);(pg.messages||[]).forEach(m=>ids.push(m.id));pt=pg.nextPageToken;}while(pt);return ids;}
async function batch(ids,add,remove){for(let i=0;i<ids.length;i+=900){await api('/messages/batchModify',{method:'POST',body:JSON.stringify({ids:ids.slice(i,i+900),addLabelIds:add,removeLabelIds:remove})});}}

// Shipments — Cynthia (keep in inbox)
const shipId=await ensureLabel('Shipments');
const cyn=await search('from:cindyrlaff@gmail.com');
if(cyn.length){await batch(cyn,[shipId],[]);console.log(`labeled ${cyn.length} Cynthia email(s) → Shipments (kept in inbox)`);}

// Trademark — file out of inbox
const tmId=await ensureLabel('Trademark');
const tm=await search('(trademark OR Securisee OR USPTO OR "registration certificate") -in:trash');
if(tm.length){await batch(tm,[tmId],['INBOX']);console.log(`labeled ${tm.length} trademark email(s) → Trademark + archived`);}
else console.log('no trademark email found by search');
console.log('done.');
