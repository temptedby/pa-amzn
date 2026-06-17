/** Hunt for the Delaware LLC formation documents in Drive. RUN: node scripts/drive-delaware.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const tok=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const terms=['delaware','certificate of formation','certificate of incorporation','division of corporations','operating agreement','douglas dean holdings','articles of organization','cloud peak','registered agent','certificate of good standing','EIN'];
const seen=new Map();
for(const t of terms){
  const q=`(name contains '${t}' or fullText contains '${t}') and trashed=false`;
  const u=new URLSearchParams({q,fields:'files(id,name,mimeType,modifiedTime)',pageSize:'40',corpora:'allDrives',includeItemsFromAllDrives:'true',supportsAllDrives:'true'});
  const r=await fetch(`https://www.googleapis.com/drive/v3/files?${u}`,{headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.json());
  if(r.error){console.log(`[${t}] ERR ${r.error.message}`);continue;}
  for(const f of (r.files||[])) if(!seen.has(f.id)) seen.set(f.id,{...f,why:t});
}
const skip=/whisk|tequila|tasting|festival|staff|w9|w-9|nye|halloween|social scene|booking|crawl|brand outreach|attendee|venue/i;
console.log('=== Delaware/formation candidates (Phone-Assured/Douglas-Dean relevant) ===');
let n=0;
for(const f of seen.values()){
  if(skip.test(f.name)) continue;
  const kind=/pdf/.test(f.mimeType)?'PDF':/document/.test(f.mimeType)?'DOC':/folder/.test(f.mimeType)?'DIR':f.mimeType.split(/[.\/]/).pop();
  console.log(`  [${kind}] ${f.name}  mod:${(f.modifiedTime||'').slice(0,10)}  why:"${f.why}"  id:${f.id}`); n++;
}
if(!n) console.log('  (no Delaware-specific docs found in Drive)');
