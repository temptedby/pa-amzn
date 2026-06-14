/** Search hello@phoneassured.com Drive (drive.readonly) for entity/address documents:
 *  Douglas Dean (Holdings) LLC formation, bank statements, EIN, operating agreement.
 *  RUN: node scripts/drive-find-docs.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const tok=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const terms=['douglas dean','holdings','articles of organization','certificate of formation','operating agreement','bank statement','EIN','employer identification','securisee','formation','registered agent','articles of incorporation'];
const hits=new Map();
for(const t of terms){
  const q=`(name contains '${t}' or fullText contains '${t}') and trashed=false`;
  const u=new URLSearchParams({q,fields:'files(id,name,mimeType,modifiedTime,parents)',pageSize:'50',corpora:'allDrives',includeItemsFromAllDrives:'true',supportsAllDrives:'true'});
  const r=await fetch(`https://www.googleapis.com/drive/v3/files?${u}`,{headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.json());
  if(r.error){console.log(`[${t}] ERROR ${r.error.code} ${r.error.message}`);continue;}
  for(const f of (r.files||[])){ if(!hits.has(f.id)) hits.set(f.id,{...f,why:t}); }
  console.log(`[${t}] ${ (r.files||[]).length } hit(s)`);
}
console.log(`\n=== UNIQUE DOCUMENT MATCHES (${hits.size}) ===`);
for(const f of hits.values()){
  const kind=/folder/.test(f.mimeType)?'DIR ':'FILE';
  console.log(`  ${kind} ${f.name}   [${f.mimeType.split('.').pop()}]  matched:"${f.why}"  mod:${(f.modifiedTime||'').slice(0,10)}  id:${f.id}`);
}
if(!hits.size) console.log('  (none found in this Drive)');
