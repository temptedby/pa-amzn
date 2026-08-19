/** Authoritative title limit from the Definitions API + our four CURRENT live titles.
 *  Read-only. RUN: node scripts/title-limits.mjs */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};

const d=await (await fetch(`${SP}/definitions/2020-09-01/productTypes/CELL_PHONE_HOLSTER?marketplaceIds=${MKT}&requirements=LISTING&locale=en_US`,{headers:H})).json();
if(d.schema?.link?.resource){
  const s=await (await fetch(d.schema.link.resource)).json();
  const it=s.properties?.item_name;
  console.log('=== Definitions API: item_name for CELL_PHONE_HOLSTER ===');
  console.log(JSON.stringify(it?.items?.properties?.value||it,null,1).slice(0,700));
}else{ console.log('definitions:',JSON.stringify(d).slice(0,300)); }

const SKUS={'57-P4AJ-J4AC':'Single/Black','CPH-BLCK-2':'2-Pack','CPH-BLCK-3':'3-Pack','UG-SVG8-LB0P':'Pro'};
console.log('\n=== our CURRENT live titles ===');
for(const [sku,label] of Object.entries(SKUS)){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&includedData=summaries`,{headers:H})).json();
  const s=(g.summaries||[])[0]||{};
  const t=s.itemName||'';
  console.log(`\n${label}  ${t.length} chars`);
  console.log(`  ${t}`);
  console.log(`  first 80: "${t.slice(0,80)}"`);
}
