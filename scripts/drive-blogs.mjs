/** Find blog/article-style docs to repurpose for content. RUN: node scripts/drive-blogs.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const tok=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);

const terms=['blog','article','SEO','phone tether','phone lanyard','lose your phone','phone leash','retractable','keep your phone','phone safety','phone drop'];
const seen=new Map();
for(const t of terms){
  const q=`(name contains '${t}' or fullText contains '${t}') and (mimeType='application/vnd.google-apps.document' or mimeType contains 'word' or mimeType='text/plain') and trashed=false`;
  const u=new URLSearchParams({q,fields:'files(id,name,mimeType,modifiedTime)',pageSize:'50',corpora:'allDrives',includeItemsFromAllDrives:'true',supportsAllDrives:'true'});
  const r=await fetch(`https://www.googleapis.com/drive/v3/files?${u}`,{headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.json());
  if(r.error){console.log(`[${t}] ERR ${r.error.message}`);continue;}
  for(const f of (r.files||[])) if(!seen.has(f.id)) seen.set(f.id,{...f,why:t});
}
const ss=/whisk|tequila|tasting|festival|staff|w9|w-9|contract|nye|halloween|social scene|booking|crawl|bar |brunch/i;
const pa=[],other=[];
for(const f of seen.values()) (ss.test(f.name)?other:pa).push(f);
console.log(`=== Phone-Assured-relevant docs (${pa.length}) ===`);
pa.forEach(f=>console.log(`  ${f.name}   mod:${(f.modifiedTime||'').slice(0,10)}  why:"${f.why}"  id:${f.id}`));
console.log(`\n=== other/SS docs that matched (${other.length}, skim for misfiled PA blogs) ===`);
other.slice(0,25).forEach(f=>console.log(`  ${f.name}   id:${f.id}`));
