/**
 * Undo the over-broad "Trademark" labeling, then LIST narrow candidates for the
 * real trademark file (has attachment) without bulk-acting. RUN: node scripts/inbox-label-fix.mjs
 */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const api=(p,init)=>fetch(`https://gmail.googleapis.com/gmail/v1/users/me${p}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init?.headers||{})}}).then(async r=>{const t=await r.text();if(!r.ok)throw new Error(`${p} ${r.status}: ${t}`);return t?JSON.parse(t):{};});
const header=(m,n)=>m.payload?.headers?.find(h=>h.name.toLowerCase()===n)?.value||'';
async function search(q){const ids=[];let pt;do{const u=new URLSearchParams({q,maxResults:'100'});if(pt)u.set('pageToken',pt);const pg=await api(`/messages?${u}`);(pg.messages||[]).forEach(m=>ids.push(m.id));pt=pg.nextPageToken;}while(pt);return ids;}

// 1) Remove the bad Trademark label from everything.
const {labels=[]}=await api('/labels');
const tm=labels.find(l=>l.name==='Trademark');
if(tm){
  const tagged=await search('label:Trademark');
  for(let i=0;i<tagged.length;i+=900){await api('/messages/batchModify',{method:'POST',body:JSON.stringify({ids:tagged.slice(i,i+900),removeLabelIds:[tm.id]})});}
  console.log(`removed "Trademark" label from ${tagged.length} messages (reset).`);
}

// 2) List narrow candidates for the real trademark certificate (don't act).
const cand=await search('has:attachment (trademark OR USPTO OR "registration certificate" OR Securisee) newer_than:400d');
console.log(`\n${cand.length} candidate email(s) WITH ATTACHMENTS (pick the real trademark file):`);
for(const id of cand.slice(0,20)){const m=await api(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);console.log(`  • ${header(m,'from')}  |  ${header(m,'subject').slice(0,60)}  |  ${header(m,'date').slice(0,16)}`);}
console.log('\nTell me which one is the trademark certificate and I\'ll label just it (and save to Drive once I have write access).');
