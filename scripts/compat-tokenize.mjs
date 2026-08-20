/** Turn Megan's display names into Amazon's snake_case tokens, then validate every one.
 *  VALIDATION only unless --apply. RUN: node scripts/compat-tokenize.mjs [--apply] */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const APPLY=process.argv.includes('--apply');
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Amazon's tokens are mostly predictable, but ordinals and "+" are not. Overrides are values
// PROVEN accepted by VALIDATION_PREVIEW, not guesses.
const OVERRIDE={
  'apple iphone se (3rd generation)':'apple_iphone_se_3rd_gen',
  'apple iphone se (2nd generation)':'apple_iphone_se_2nd_gen',
  'apple iphone se (1st generation)':'apple_iphone_se_1st_gen',
};
export function tokenize(name){
  const k=name.toLowerCase().trim();
  if(OVERRIDE[k]) return OVERRIDE[k];
  return k.replace(/\+/g,' plus')
    .replace(/[()]/g,'')
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_|_$/g,'');
}
const items=JSON.parse(readFileSync(process.env.MODELS_JSON,'utf8'));
for(const x of items){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}&includedData=summaries`,{headers:H})).json();
  x.pt=((g.summaries||[])[0]||{}).productType;
  x.tokens=x.models.map(tokenize);
}
async function probe(x,vals){
  const body={productType:x.pt,patches:[{op:'replace',path:'/attributes/compatible_cellular_phone_models',value:vals.map(v=>({value:v,marketplace_id:MKT}))}]};
  const url=`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}${APPLY?'':'&mode=VALIDATION_PREVIEW'}`;
  const res=await fetch(url,{method:'PATCH',headers:H,body:JSON.stringify(body)});
  const j=await res.json().catch(()=>({}));
  const errs=(j.issues||[]).filter(i=>i.severity==='ERROR');
  const bad=new Set();
  for(const e of errs){const m=(e.message||'').match(/accept the (.+?) you entered/); if(m) bad.add(m[1]);}
  return {status:j.status,errs,bad,sub:j.submissionId};
}
console.log(`=== ${APPLY?'LIVE WRITE':'VALIDATION'} — compatible_cellular_phone_models ===\n`);
for(const x of items){
  let vals=x.tokens;
  let res=await probe(x,vals);
  if(res.bad.size){
    console.log(`  ${x.name}: ${res.bad.size} token(s) rejected -> ${[...res.bad].join(', ')}`);
    vals=vals.filter(v=>!res.bad.has(v));
    await sleep(900);
    res=await probe(x,vals);
  }
  console.log(`  ${x.name.padEnd(11)} ${String(res.status).padEnd(9)} ${vals.length}/${x.tokens.length} tokens${res.sub?'  sub='+res.sub:''}`);
  x.final=vals;
  await sleep(1200);
}
if(!APPLY){
  console.log('\nValidation only, nothing applied. Token lists that passed:');
  for(const x of items) console.log(`\n  ${x.name} (${x.final.length}):\n    ${x.final.join(', ')}`);
  process.exit(0);
}
console.log('\n=== READ-BACK (30s settle) ===');
await sleep(30000);
for(const x of items){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}&includedData=attributes`,{headers:H})).json();
  const v=((g.attributes||{}).compatible_cellular_phone_models||[]).map(z=>z.value);
  console.log(`  ${x.name.padEnd(11)} now ${v.length} values  sent ${x.final.length}  ${v.length===x.final.length?'MATCHES':'CHECK'}`);
}
