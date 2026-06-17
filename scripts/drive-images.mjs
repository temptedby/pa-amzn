/** List Phone Assured images (with IDs + dimensions) for building slideshows/graphics.
 *  RUN: node scripts/drive-images.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const tok=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const ROOTS=['1jEUM1ALt4hoN8TSC2NrxwgUONDW-Ouzs','1etMm02wDysWZipGSBMmfzBdBdqHez7Tm','1ZOYruu3FpRHfdrb2xfSy-SzG-m6c_b-3','1EXez9bGwoph_d0wdoDpvZY7tJFqMQySL'];
const seen=new Set(), imgs=[];
async function kids(id){const out=[];let pt;do{const q=new URLSearchParams({q:`'${id}' in parents and trashed=false`,fields:'nextPageToken,files(id,name,mimeType,size,imageMediaMetadata(width,height))',pageSize:'200',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});if(pt)q.set('pageToken',pt);const r=await fetch(`https://www.googleapis.com/drive/v3/files?${q}`,{headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.json());(r.files||[]).forEach(f=>out.push(f));pt=r.nextPageToken;}while(pt);return out;}
async function crawl(id,path,d){if(d>4||seen.has(id))return;seen.add(id);for(const f of await kids(id)){if(/folder/.test(f.mimeType))await crawl(f.id,path+'/'+f.name.slice(0,20),d+1);else if(/image\/(jpeg|png)/.test(f.mimeType)){const w=f.imageMediaMetadata?.width||0,h=f.imageMediaMetadata?.height||0;imgs.push({name:f.name,id:f.id,w,h,mb:f.size?(f.size/1048576).toFixed(1):'?',path});}}}
for(const r of ROOTS) await crawl(r,'',0);
imgs.sort((a,b)=>(b.w*b.h)-(a.w*a.h));
const land=imgs.filter(i=>i.w>=1000&&i.w>=i.h), port=imgs.filter(i=>i.h>i.w&&i.h>=1000);
const dim=i=>(`${i.w}x${i.h}`).padEnd(11);
console.log(`total images ${imgs.length}\n=== LARGE LANDSCAPE (good for slideshow frames) ===`);
land.slice(0,18).forEach(i=>console.log(`  ${dim(i)} ${i.name.slice(0,40).padEnd(40)} ${i.path.slice(-22)}  ${i.id}`));
console.log('=== LARGE PORTRAIT/VERTICAL ===');
port.slice(0,12).forEach(i=>console.log(`  ${dim(i)} ${i.name.slice(0,40).padEnd(40)} ${i.path.slice(-22)}  ${i.id}`));
// likely brand/product/logo assets by name
const brand=imgs.filter(i=>/tag|logo|product|graphic|brand|secured|assured|pro |clip|hero|main/i.test(i.name));
console.log('\n=== LIKELY BRAND / PRODUCT / LOGO ASSETS ===');
brand.slice(0,20).forEach(i=>console.log(`  ${dim(i)} ${i.name.slice(0,44).padEnd(44)}  ${i.id}`));
