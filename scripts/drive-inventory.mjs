/** Recursively inventory the Phone Assured Drive folders — all videos + images
 *  (reusable content), with paths. Phone Assured only (two-companies separation).
 *  RUN: node scripts/drive-inventory.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const tok=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);

const ROOTS={
  'Phone Assured':'1jEUM1ALt4hoN8TSC2NrxwgUONDW-Ouzs',
  'Phone Assured 2':'1etMm02wDysWZipGSBMmfzBdBdqHez7Tm',
  'Sell Phone Assured':'1ZOYruu3FpRHfdrb2xfSy-SzG-m6c_b-3',
};
const seen=new Set(); const vids=[], imgs=[], other=[];
async function children(id){
  const out=[]; let pt;
  do{ const q=new URLSearchParams({q:`'${id}' in parents and trashed=false`,fields:'nextPageToken,files(id,name,mimeType,size)',pageSize:'200'}); if(pt)q.set('pageToken',pt);
    const r=await fetch(`https://www.googleapis.com/drive/v3/files?${q}`,{headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.json());
    (r.files||[]).forEach(f=>out.push(f)); pt=r.nextPageToken;
  }while(pt); return out;
}
async function crawl(id,path,depth){
  if(depth>5||seen.has(id))return; seen.add(id);
  for(const f of await children(id)){
    if(/folder/.test(f.mimeType)){ await crawl(f.id,`${path}/${f.name}`,depth+1); }
    else { const e={name:f.name,path,mb:f.size?(f.size/1048576).toFixed(1):'?'};
      if(/video/.test(f.mimeType)) vids.push(e); else if(/image/.test(f.mimeType)) imgs.push(e); else other.push(e); }
  }
}
for(const [name,id] of Object.entries(ROOTS)) await crawl(id,name,0);

console.log(`\n========== VIDEOS (${vids.length}) ==========`);
vids.forEach(v=>console.log(`  🎬 ${v.name.slice(0,52).padEnd(52)} ${v.mb}MB   ${v.path.slice(-40)}`));
console.log(`\n========== IMAGES (${imgs.length}) ==========`);
imgs.slice(0,60).forEach(v=>console.log(`  🖼  ${v.name.slice(0,52).padEnd(52)} ${v.path.slice(-40)}`));
if(imgs.length>60) console.log(`  ...+${imgs.length-60} more images`);
console.log(`\nSummary: ${vids.length} videos, ${imgs.length} images, ${other.length} other files.`);
