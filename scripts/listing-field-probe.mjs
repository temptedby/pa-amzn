/** Which INDIVIDUAL copy fields will Amazon accept from us? VALIDATION_PREVIEW, applies nothing.
 *  item_name and bullet_point are catalogue-shared; generic_keyword is usually merchant-scoped.
 *  RUN: node scripts/listing-field-probe.mjs */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const SKUS={'57-P4AJ-J4AC':'Single/Black','CPH-BLCK-2':'2-Pack','CPH-BLCK-3':'3-Pack','UG-SVG8-LB0P':'Pro'};
const PROBES={
  item_name:          [{value:'Phone Assured Retractable Phone Tether, Anti-Theft Phone Lanyard and Cell Phone Leash for Travel',marketplace_id:MKT}],
  bullet_point:       [{value:'PROTECT YOUR PHONE FROM DROPS, LOSS AND THEFT. Keeps your phone securely attached and within easy reach.',marketplace_id:MKT}],
  product_description:[{value:'Your phone goes everywhere with you. Phone Assured was designed to help protect it.',marketplace_id:MKT}],
  generic_keyword:    [{value:'phone lanyard strap cord clip holder safety security anti drop theft carabiner',marketplace_id:MKT}],
};
for(const [sku,label] of Object.entries(SKUS)){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&includedData=summaries`,{headers:H})).json();
  const pt=((g.summaries||[])[0]||{}).productType; if(!pt) continue;
  console.log(`\n=== ${label} ===`);
  for(const [field,value] of Object.entries(PROBES)){
    const body={productType:pt,patches:[{op:'replace',path:`/attributes/${field}`,value}]};
    const res=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&mode=VALIDATION_PREVIEW`,{method:'PATCH',headers:H,body:JSON.stringify(body)});
    const j=await res.json().catch(()=>({}));
    const errs=(j.issues||[]).filter(i=>i.severity==='ERROR');
    const warns=(j.issues||[]).filter(i=>i.severity!=='ERROR');
    const verdict = j.status==='ACCEPTED'||errs.length===0 ? 'ACCEPTED' : 'REFUSED';
    console.log(`  ${field.padEnd(20)} ${String(j.status||res.status).padEnd(9)} ${verdict.padEnd(9)} ${errs.map(e=>e.code).join(',')||''}${warns.length?'  warn:'+warns.map(w=>w.code).join(','):''}`);
    for(const e of errs) console.log(`      ${e.code}: ${(e.message||'').slice(0,110)}`);
    await new Promise(z=>setTimeout(z,600));
  }
}
console.log('\nNOTHING APPLIED — VALIDATION_PREVIEW throughout.');
