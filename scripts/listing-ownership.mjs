/** Who owns each copy field on each ASIN: our seller contribution, or Amazon's shared catalogue?
 *  Read-only. Answers "will pasting Megan's copy actually change the page?"
 *  RUN: node scripts/listing-ownership.mjs */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const SKUS={'57-P4AJ-J4AC':'Single/Black','CPH-BLCK-2':'2-Pack','CPH-BLCK-3':'3-Pack','UG-SVG8-LB0P':'Pro'};
const FIELDS=['item_name','bullet_point','product_description','generic_keyword'];
for(const [sku,label] of Object.entries(SKUS)){
  const res=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&includedData=attributes,summaries`,{headers:{'x-amz-access-token':tok,'content-type':'application/json'}});
  const j=await res.json();
  if(!res.ok){console.log(`${label}: ${res.status} ${JSON.stringify(j).slice(0,140)}`);continue;}
  const attrs=j.attributes||{};
  console.log(`\n=== ${label}  (${sku}, ASIN ${(j.summaries||[])[0]?.asin||'?'}) ===`);
  for(const f of FIELDS){
    const v=attrs[f];
    if(v===undefined){ console.log(`  ${f.padEnd(22)} ABSENT from our contribution  -> catalogue-supplied, our write may not surface`); continue; }
    const n=Array.isArray(v)?v.length:1;
    const first=Array.isArray(v)?JSON.stringify(v[0]).slice(0,80):JSON.stringify(v).slice(0,80);
    console.log(`  ${f.padEnd(22)} PRESENT (${n})  ${first}`);
  }
  console.log(`  total attributes we contribute: ${Object.keys(attrs).length}`);
}
