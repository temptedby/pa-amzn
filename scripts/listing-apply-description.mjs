/** APPLIES product_description to the four live listings. REAL WRITE (no VALIDATION_PREVIEW).
 *  Verifies by reading the value back from Amazon afterwards, not by trusting the submission status.
 *  RUN: node scripts/listing-apply-description.mjs [--dry] */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const DRY=process.argv.includes('--dry');
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const items=JSON.parse(readFileSync(process.env.DESC_JSON,'utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const before={};
for(const x of items){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}&includedData=summaries,attributes`,{headers:H})).json();
  x.pt=((g.summaries||[])[0]||{}).productType;
  before[x.sku]=(g.attributes||{}).product_description;
}
console.log(`=== ${DRY?'DRY RUN':'LIVE WRITE'} — product_description on 4 SKUs ===\n`);
for(const x of items){
  const mode=DRY?'&mode=VALIDATION_PREVIEW':'';
  const body={productType:x.pt,patches:[{op:'replace',path:'/attributes/product_description',
    value:[{value:x.desc, marketplace_id:MKT}]}]};
  const res=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}${mode}`,
    {method:'PATCH',headers:H,body:JSON.stringify(body)});
  const j=await res.json().catch(()=>({}));
  const errs=(j.issues||[]).filter(i=>i.severity==='ERROR');
  console.log(`${x.name.padEnd(11)} ${x.sku.padEnd(14)} HTTP ${res.status}  status=${j.status}  sub=${j.submissionId||'-'}  ${x.len} chars`);
  for(const i of (j.issues||[])) console.log(`   [${i.severity}] ${i.code}: ${(i.message||'').slice(0,130)}`);
  if(errs.length) console.log('   ^^ NOT APPLIED');
  await sleep(1200);
}
if(DRY){ console.log('\nDry run only, nothing applied.'); process.exit(0); }
console.log('\n=== READ-BACK VERIFICATION (30s settle) ===');
await sleep(30000);
for(const x of items){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}&includedData=attributes`,{headers:H})).json();
  const v=(g.attributes||{}).product_description;
  const got=Array.isArray(v)?String(v[0]?.value??''):'';
  const match = got.trim()===x.desc.trim();
  console.log(`${x.name.padEnd(11)} was:${before[x.sku]?'present':'ABSENT'}  now:${got?got.length+' chars':'ABSENT'}  ${match?'MATCHES what we sent':'DOES NOT MATCH'}`);
  if(got && !match) console.log(`   starts: ${got.slice(0,90)}`);
}
