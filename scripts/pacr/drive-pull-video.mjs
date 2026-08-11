/** drive-pull-video.mjs — crawl Drive for Phone Assured video and pull it local.
 *  Impersonates William (domain-wide delegation), same as drive-upload.mjs.
 *  RUN: node scripts/pacr/drive-pull-video.mjs [--list]
 */
import fs from 'node:fs'; import path from 'node:path'; import { createSign } from 'node:crypto';
const c=JSON.parse(fs.readFileSync('/Users/williamholdeman/projects/wdh-personal/secrets/google-writer.json','utf8'));
const b=x=>Buffer.from(x).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const n=Math.floor(Date.now()/1000);
const h=`${b(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${b(JSON.stringify({iss:c.client_email,sub:'william@besocialscene.com',scope:'https://www.googleapis.com/auth/drive',aud:'https://oauth2.googleapis.com/token',exp:n+3600,iat:n}))}`;
const TOK=(await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${h}.${b(createSign('RSA-SHA256').update(h).sign(c.private_key))}`}).then(r=>r.json())).access_token;
const H={Authorization:`Bearer ${TOK}`};

const ROOTS=[
  ['1NaOH7qcRK7_x7s04NhnHnHLutVhbIxXq','2022_PHONE ASSURED_VIDEOS'],
  ['13ZeJCihHwrbS7CdStGI2eaQP9JCwoMuz','AMZ1Step Content'],
  ['1jEUM1ALt4hoN8TSC2NrxwgUONDW-Ouzs','Phone Assured'],
  ['1etMm02wDysWZipGSBMmfzBdBdqHez7Tm','Phone Assured 2'],
  ['1EXez9bGwoph_d0wdoDpvZY7tJFqMQySL','Phone Assured 3'],
  ['1zVGhhLCDD4nyqrDbFYrNhmZGU-T4NN9X','Phone Assured root'],
];
const seen=new Set(), vids=[];
async function kids(id){const out=[];let pt;do{
  const q=new URLSearchParams({q:`'${id}' in parents and trashed=false`,fields:'nextPageToken,files(id,name,mimeType,size,videoMediaMetadata(width,height,durationMillis))',pageSize:'200',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
  if(pt)q.set('pageToken',pt);
  const r=await fetch(`https://www.googleapis.com/drive/v3/files?${q}`,{headers:H}).then(r=>r.json());
  (r.files||[]).forEach(f=>out.push(f)); pt=r.nextPageToken;}while(pt);return out;}
async function crawl(id,p,d){ if(d>6||seen.has(id))return; seen.add(id);
  for(const f of await kids(id)){
    if(/folder/.test(f.mimeType)) await crawl(f.id,`${p}/${f.name}`,d+1);
    else if(/^video\//.test(f.mimeType)) vids.push({...f,path:p});
  }}
for(const [id,name] of ROOTS){ try{ await crawl(id,name,0);}catch(e){console.log('skip',name,e.message.slice(0,60));} }

const uniq=new Map(); for(const v of vids) if(!uniq.has(v.name)||Number(v.size)>Number(uniq.get(v.name).size)) uniq.set(v.name,v);
const list=[...uniq.values()].sort((a,b)=>Number(b.size)-Number(a.size));
const mb=v=>(Number(v.size||0)/1048576);
console.log(`found ${vids.length} video files, ${list.length} unique names, ${list.reduce((s,v)=>s+mb(v),0).toFixed(0)} MB total\n`);
list.slice(0,60).forEach(v=>{const m=v.videoMediaMetadata||{};
  console.log(`  ${mb(v).toFixed(1).padStart(7)} MB  ${String(m.width||'?')+'x'+String(m.height||'?')}`.padEnd(28)+`${((m.durationMillis||0)/1000).toFixed(0).padStart(4)}s  ${v.name.slice(0,52).padEnd(54)} ${v.path.slice(-30)}`);});

if(process.argv.includes('--list')) process.exit(0);
const OUT='assets/source/_drive-video'; fs.mkdirSync(OUT,{recursive:true});
let got=0, bytes=0;
for(const v of list){
  if(mb(v)>260) { console.log(`  skip (too big) ${v.name}`); continue; }
  if(/\.crdownload$/i.test(v.name)) { continue; }            // half-downloaded training courses
  if(/^BPA-Day/i.test(v.name)) { continue; }                  // not product footage
  if(/^(amazon-detail-discreet|social-0)/.test(v.name)) { continue; }  // our own uploads
  const safe=v.name.replace(/[^\w.\- ]/g,'_');
  const dest=path.join(OUT,safe);
  if(fs.existsSync(dest)&&fs.statSync(dest).size===Number(v.size)){got++;continue;}
  const r=await fetch(`https://www.googleapis.com/drive/v3/files/${v.id}?alt=media&supportsAllDrives=true`,{headers:H});
  if(!r.ok){console.log(`  FAIL ${r.status} ${v.name}`);continue;}
  fs.writeFileSync(dest,Buffer.from(await r.arrayBuffer()));
  got++; bytes+=mb(v);
  if(got%10===0) console.log(`  ...${got} pulled, ${bytes.toFixed(0)} MB`);
}
console.log(`\npulled ${got} files, ${bytes.toFixed(0)} MB -> ${OUT}`);
