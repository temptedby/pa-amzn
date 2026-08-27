/** VALIDATION_PREVIEW submission: asks Amazon whether it WOULD accept a copy change.
 *  Applies NOTHING. mode=VALIDATION_PREVIEW is Amazon's dry-run for the Listings Items API.
 *  Settles "do we own the copy fields on this ASIN?" definitively, rather than by inference.
 *  RUN: node scripts/listing-validate.mjs */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const SKUS={'57-P4AJ-J4AC':'Single/Black'};

for(const [sku,label] of Object.entries(SKUS)){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&includedData=summaries`,{headers:H})).json();
  const s=(g.summaries||[])[0]||{};
  const pt=s.productType;
  console.log(`\n=== ${label} (${sku}) productType=${pt} ===`);
  if(!pt){console.log('  no productType, skipping');continue;}
  const body={productType:pt,patches:[{op:'replace',path:'/attributes/item_name',
    value:[{value:'VALIDATION PROBE DO NOT APPLY',marketplace_id:MKT}]}]};
  const res=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&mode=VALIDATION_PREVIEW`,
    {method:'PATCH',headers:H,body:JSON.stringify(body)});
  const j=await res.json().catch(()=>({}));
  console.log(`  HTTP ${res.status}  status=${j.status||'-'}  submissionId=${j.submissionId||'-'}`);
  const issues=j.issues||[];
  if(!issues.length){ console.log('  issues: NONE  -> Amazon would ACCEPT this write'); }
  for(const i of issues) console.log(`  [${i.severity}] ${i.code}: ${(i.message||'')}`);
}
console.log('\nNOTHING WAS APPLIED. mode=VALIDATION_PREVIEW is a dry run.');
