/** Probe snake_case token format for compatible_cellular_phone_models. VALIDATION only.
 *  RUN: node scripts/compat-token-probe.mjs */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const sku='57-P4AJ-J4AC';
const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${sku}?marketplaceIds=${MKT}&includedData=summaries`,{headers:H})).json();
const pt=((g.summaries||[])[0]||{}).productType;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function probe(vals){
  const body={productType:pt,patches:[{op:'replace',path:'/attributes/compatible_cellular_phone_models',value:vals.map(v=>({value:v,marketplace_id:MKT}))}]};
  const res=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${sku}?marketplaceIds=${MKT}&mode=VALIDATION_PREVIEW`,{method:'PATCH',headers:H,body:JSON.stringify(body)});
  const j=await res.json().catch(()=>({}));
  const errs=(j.issues||[]).filter(i=>i.severity==='ERROR');
  const bad=new Set(errs.map(e=>{const m=(e.message||'').match(/accept the (.+?) you entered/);return m?m[1]:'?';}));
  return {ok:errs.length===0, bad};
}
// candidate tokens for Megan's Black list (<=171 g) and a few Pro ones
const CAND=['apple_iphone_16','apple_iphone_16e','apple_iphone_air','apple_iphone_15','apple_iphone_14',
 'apple_iphone_13','apple_iphone_12','apple_iphone_13_mini','apple_iphone_12_mini',
 'apple_iphone_se_3rd_gen','apple_iphone_se_2nd_gen','apple_iphone_se_1st_gen',
 'samsung_galaxy_s25','samsung_galaxy_s24','samsung_galaxy_s23','samsung_galaxy_s22',
 'google_pixel_5','google_pixel_4a','google_pixel_4a_5g',
 'apple_iphone_17_pro_max','apple_iphone_16_pro','samsung_galaxy_s25_ultra','google_pixel_9_pro'];
console.log('Testing snake_case tokens one at a time (VALIDATION only, nothing applied)\n');
const good=[],bad=[];
for(const c of CAND){
  const {ok}=await probe([c]);
  (ok?good:bad).push(c);
  console.log(`  ${ok?'OK    ':'REJECT'}  ${c}`);
  await sleep(700);
}
console.log(`\naccepted ${good.length} of ${CAND.length}`);
if(good.length>1){
  const {ok,bad:b}=await probe(good);
  console.log(`all ${good.length} together: ${ok?'ACCEPTED':'rejected -> '+[...b].join(', ')}`);
}
console.log('\nACCEPTED TOKENS:'); good.forEach(v=>console.log('  '+v));
