/** Writes compatible_cellular_phone_models: Megan's models (tokenized) plus vetted extras.
 *  Validates first, drops anything Amazon rejects, caps at 60, then verifies by read-back.
 *  RUN: node scripts/compat-apply-full.mjs [--apply] */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const APPLY=process.argv.includes('--apply'), CAP=60;
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OVERRIDE={'apple iphone se (3rd generation)':'apple_iphone_se_3rd_gen','apple iphone se (2nd generation)':'apple_iphone_se_2nd_gen','apple iphone se (1st generation)':'apple_iphone_se_1st_gen'};
const tokenize=n=>{const k=n.toLowerCase().trim();return OVERRIDE[k]||k.replace(/\+/g,' plus').replace(/[()]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');};
const items=JSON.parse(readFileSync(process.env.MODELS_JSON,'utf8'));
for(const x of items){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}&includedData=summaries,attributes`,{headers:H})).json();
  x.pt=((g.summaries||[])[0]||{}).productType;
  x.before=((g.attributes||{}).compatible_cellular_phone_models||[]).map(z=>z.value);
  x.want=[...new Set([...x.models.map(tokenize), ...x.extra])].slice(0,CAP);
}
async function send(x,vals,validate){
  const body={productType:x.pt,patches:[{op:'replace',path:'/attributes/compatible_cellular_phone_models',value:vals.map(v=>({value:v,marketplace_id:MKT}))}]};
  const url=`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}${validate?'&mode=VALIDATION_PREVIEW':''}`;
  const res=await fetch(url,{method:'PATCH',headers:H,body:JSON.stringify(body)});
  const j=await res.json().catch(()=>({}));
  const errs=(j.issues||[]).filter(i=>i.severity==='ERROR');
  const bad=new Set(); for(const e of errs){const m=(e.message||'').match(/accept the (.+?) you entered/); if(m) bad.add(m[1]);}
  return {status:j.status,bad,sub:j.submissionId,errs};
}
console.log(`=== ${APPLY?'LIVE WRITE':'VALIDATION'} ===\n`);
for(const x of items){
  let vals=x.want;
  let v=await send(x,vals,true);
  if(v.bad.size){ vals=vals.filter(t=>!v.bad.has(t)); await sleep(900); v=await send(x,vals,true);
    console.log(`  ${x.name}: dropped ${[...v.bad].join(', ')||'(rejected set)'}`); }
  x.final=vals;
  console.log(`  ${x.name.padEnd(11)} was ${String(x.before.length).padStart(2)}  ->  ${String(vals.length).padStart(2)} of ${CAP}   validation ${v.status}`);
  await sleep(1000);
}
if(!APPLY){ console.log('\nValidation only, nothing applied.'); process.exit(0); }
console.log('\n--- applying ---');
for(const x of items){
  const v=await send(x,x.final,false);
  console.log(`  ${x.name.padEnd(11)} ${v.status}  sub=${v.sub||'-'}`);
  for(const e of v.errs) console.log(`     [${e.code}] ${(e.message||'').slice(0,110)}`);
  await sleep(1400);
}
console.log('\n--- read-back (35s settle) ---');
await sleep(35000);
for(const x of items){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}&includedData=attributes`,{headers:H})).json();
  const now=((g.attributes||{}).compatible_cellular_phone_models||[]).map(z=>z.value);
  const same=now.length===x.final.length && x.final.every(t=>now.includes(t));
  console.log(`  ${x.name.padEnd(11)} was ${x.before.join(',')||'(empty)'}  ->  now ${now.length} values  ${same?'MATCHES':'CHECK: '+now.length+' vs sent '+x.final.length}`);
}
