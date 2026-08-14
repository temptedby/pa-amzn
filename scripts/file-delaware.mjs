/** File Melanie's ACH form and all Delaware correspondence under a new sublabel.
 *
 *  Label: "Phone Assured/Delaware Standing"  (Gmail nests by "/" in the label name)
 *  Preview by default. MODE=file applies. Never deletes; archive = remove INBOX, mail is kept.
 *  RUN: node scripts/file-delaware.mjs        (preview)
 *       MODE=file node scripts/file-delaware.mjs
 */
import { readFileSync } from 'node:fs'; import { URL } from 'node:url';
function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const LIVE=process.env.MODE==='file';
const tok=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'})}).then(r=>r.json()).then(j=>j.access_token);
const G='https://gmail.googleapis.com/gmail/v1/users/me', H={Authorization:`Bearer ${tok}`,'Content-Type':'application/json'};
const api=async(p,init)=>{const r=await fetch(`${G}${p}`,{...init,headers:{...H,...(init?.headers||{})}});const t=await r.text();if(!r.ok)throw new Error(`${p} ${r.status}: ${t.slice(0,300)}`);return t?JSON.parse(t):{};};

const PARENT='Phone Assured', CHILD='Phone Assured/Delaware Standing';
const {labels=[]}=await api('/labels');
const byName=Object.fromEntries(labels.map(l=>[l.name,l.id]));
async function ensure(name){
  if(byName[name])return byName[name];
  if(!LIVE){console.log(`  would create label "${name}"`);return null;}
  const r=await api('/labels',{method:'POST',body:JSON.stringify({name,labelListVisibility:'labelShow',messageListVisibility:'show'})});
  byName[name]=r.id; console.log(`  created label "${name}"`); return r.id;
}

// Melanie's ACH form, plus anything from or about Delaware corporate standing.
const QUERIES=[
  ['Melanie / ACH form', 'from:melanie OR subject:ACH OR subject:"direct deposit"'],
  // Subject- and sender-scoped on purpose: a bare "Delaware" body match drags in every trademark
  // email, because the state name sits in Maven IP's address block.
  ['Delaware standing',  'from:delaware.gov OR from:corp.delaware.gov OR from:delawarefile.com OR from:incorp OR from:"registered agent" OR subject:Delaware OR subject:"franchise tax" OR subject:"good standing" OR subject:"annual report" OR subject:"registered agent"'],
];
async function search(q){const ids=new Map();let pt;do{const u=new URLSearchParams({q,maxResults:'100'});if(pt)u.set('pageToken',pt);const pg=await api(`/messages?${u}`);for(const m of (pg.messages||[]))ids.set(m.id,1);pt=pg.nextPageToken;}while(pt);return [...ids.keys()];}
const hdr=(m,n)=>m.payload?.headers?.find(h=>h.name.toLowerCase()===n)?.value||'';

const all=new Map();
for(const [label,q] of QUERIES){
  const ids=await search(q);
  console.log(`\n${label}: ${ids.length} message(s)   [${q}]`);
  for(const id of ids){
    if(all.has(id))continue;
    const m=await api(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    all.set(id,{from:hdr(m,'from'),subject:hdr(m,'subject'),date:hdr(m,'date'),inbox:(m.labelIds||[]).includes('INBOX')});
  }
}
console.log(`\n=== ${all.size} unique message(s) to file under "${CHILD}" ===`);
for(const [id,m] of all) console.log(`  ${m.inbox?'[inbox]':'[filed]'} ${m.date.slice(0,16).padEnd(17)} ${m.from.slice(0,38).padEnd(38)} ${m.subject.slice(0,60)}`);

await ensure(PARENT);
const childId=await ensure(CHILD);
if(!LIVE){console.log(`\nPREVIEW ONLY. Re-run with MODE=file to apply.`);process.exit(0);}
const ids=[...all.keys()];
for(let i=0;i<ids.length;i+=900){
  await api('/messages/batchModify',{method:'POST',body:JSON.stringify({ids:ids.slice(i,i+900),addLabelIds:[childId],removeLabelIds:['INBOX']})});
}
console.log(`\nlabelled ${ids.length} message(s) "${CHILD}" and archived them out of the inbox.`);
