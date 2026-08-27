/** Discover the APPROVED values for compatible_cellular_phone_models by reading listings that
 *  already carry them. Any value live in Amazon's catalogue is by definition an approved value.
 *  Read-only. RUN: node scripts/compat-vocabulary.mjs */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
// our four, plus competitors named in the 08-10 teardown
const ASINS=['B07Y5GZP1T','B097MGPCPC','B097MK5VZ4','B0BLLJLSDP'];
const vocab=new Set();
async function look(asin){
  const res=await fetch(`${SP}/catalog/2022-04-01/items/${asin}?marketplaceIds=${MKT}&includedData=attributes,summaries`,{headers:H});
  if(!res.ok){console.log(`  ${asin}: HTTP ${res.status}`);return;}
  const j=await res.json();
  const a=j.attributes||{};
  const f1=a.compatible_cellular_phone_models, f2=a.compatible_phone_models;
  const v1=(f1||[]).map(x=>x.value);
  const v2=(f2||[]).map(x=>x.value);
  v1.forEach(v=>vocab.add(v));
  console.log(`\n  ${asin}  ${String((j.summaries||[])[0]?.itemName||'').slice(0,60)}`);
  console.log(`     compatible_cellular_phone_models: ${v1.length} values`);
  v1.slice(0,60).forEach(v=>console.log(`        "${v}"`));
  console.log(`     compatible_phone_models: ${v2.length ? JSON.stringify(v2).slice(0,150) : '(none)'}`);
}
console.log('=== reading our own ASINs from the catalogue ===');
for(const a of ASINS){ await look(a); await sleep(900); }
console.log(`\n=== distinct approved values discovered: ${vocab.size} ===`);
[...vocab].sort().forEach(v=>console.log(`  ${v}`));
