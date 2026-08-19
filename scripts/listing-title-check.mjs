/** Run candidate titles past Amazon with VALIDATION_PREVIEW. Applies nothing.
 *  RUN: node scripts/listing-title-check.mjs "<title>" [sku]  */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const sku=process.argv[3]||'57-P4AJ-J4AC';
const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&includedData=summaries`,{headers:H})).json();
const pt=((g.summaries||[])[0]||{}).productType;
const title=process.argv[2];
const body={productType:pt,patches:[{op:'replace',path:'/attributes/item_name',value:[{value:title,marketplace_id:MKT}]}]};
const res=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&mode=VALIDATION_PREVIEW`,{method:'PATCH',headers:H,body:JSON.stringify(body)});
const j=await res.json().catch(()=>({}));
const errs=(j.issues||[]).filter(i=>i.severity==='ERROR');
console.log(`${j.status}  ${title.length} chars`);
console.log(`  ${title}`);
for(const e of errs) console.log(`  [${e.code}] ${(e.message||'').slice(0,200)}`);
if(!errs.length) console.log('  -> ACCEPTED, nothing applied');
