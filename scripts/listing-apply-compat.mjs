/** compatible_phone_models for the four listings. VALIDATION_PREVIEW unless --apply.
 *  Tries one-value-per-model first; falls back to a single joined string if Amazon prefers that.
 *  RUN: node scripts/listing-apply-compat.mjs [--apply] */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const APPLY=process.argv.includes('--apply');
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const items=JSON.parse(readFileSync(process.env.MODELS_JSON,'utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(const x of items){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}&includedData=summaries`,{headers:H})).json();
  x.pt=((g.summaries||[])[0]||{}).productType;
}
const shapes={
  perModel: x=>x.models.map(m=>({value:m, language_tag:'en_US', marketplace_id:MKT})),
  joined:   x=>[{value:x.models.join(', '), language_tag:'en_US', marketplace_id:MKT}],
};
console.log(`=== ${APPLY?'LIVE WRITE':'VALIDATION'} — compatible_phone_models ===\n`);
for(const x of items){
  let chosen=null;
  for(const [shape,fn] of Object.entries(shapes)){
    const val=fn(x);
    const body={productType:x.pt,patches:[{op:'replace',path:'/attributes/compatible_phone_models',value:val}]};
    const res=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}&mode=VALIDATION_PREVIEW`,{method:'PATCH',headers:H,body:JSON.stringify(body)});
    const j=await res.json().catch(()=>({}));
    const errs=(j.issues||[]).filter(i=>i.severity==='ERROR');
    const warns=(j.issues||[]).filter(i=>i.severity!=='ERROR');
    const len=shape==='joined'?val[0].value.length:Math.max(...val.map(v=>v.value.length));
    console.log(`  ${x.name.padEnd(11)} ${shape.padEnd(9)} ${String(j.status).padEnd(8)} items=${val.length} maxlen=${len}  ${errs.map(e=>e.code+':'+(e.message||'').slice(0,70)).join(' | ')||''}${warns.length?'  warn:'+warns.map(w=>w.code).join(','):''}`);
    if(!errs.length && !chosen) chosen={shape,val};
    await sleep(700);
  }
  x.chosen=chosen;
  console.log(`  ${''.padEnd(11)} -> using ${chosen?chosen.shape:'NONE VALID'}\n`);
}
if(!APPLY){ console.log('Validation only, nothing applied.'); process.exit(0); }
console.log('=== APPLYING ===');
for(const x of items){
  if(!x.chosen){console.log(`  ${x.name}: no valid shape, skipped`);continue;}
  const body={productType:x.pt,patches:[{op:'replace',path:'/attributes/compatible_phone_models',value:x.chosen.val}]};
  const res=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}`,{method:'PATCH',headers:H,body:JSON.stringify(body)});
  const j=await res.json().catch(()=>({}));
  console.log(`  ${x.name.padEnd(11)} HTTP ${res.status} status=${j.status} sub=${j.submissionId||'-'}`);
  for(const i of (j.issues||[])) console.log(`     [${i.severity}] ${i.code}: ${(i.message||'').slice(0,110)}`);
  await sleep(1200);
}
console.log('\n=== READ-BACK (30s settle) ===');
await sleep(30000);
for(const x of items){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${MKT}&includedData=attributes`,{headers:H})).json();
  const v=(g.attributes||{}).compatible_phone_models;
  const n=Array.isArray(v)?v.length:0;
  console.log(`  ${x.name.padEnd(11)} now ${n?n+' entries':'ABSENT'}  ${n?'sent '+x.chosen.val.length:''}  ${n===x.chosen?.val.length?'MATCHES':'CHECK'}`);
}
