/** Copies the compatible_cellular_phone_models token list from the US listing to another marketplace.
 *
 *  The tokens are snake_case wire values, not display names, and the field rejects human-readable
 *  names including Amazon's own schema example (learned 2026-08-19). They are language-independent,
 *  so Mexico and Brazil render them in their own locale from the same token.
 *
 *  RUN: node scripts/listing-apply-compat-intl.mjs --market=CA          validate only
 *       node scripts/listing-apply-compat-intl.mjs --market=CA --live   apply + read back
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=n=>(process.argv.find(a=>a.startsWith('--'+n+'='))||'').split('=')[1];
const LIVE=process.argv.includes('--live');
const MARKET=(arg('market')||'').toUpperCase();
const MKT={CA:'A2EUQ1WTGCTBG2',MX:'A1AM78C64UM0Y8',BR:'A2Q3Y263D00KWC'}[MARKET];
if(!MKT){console.error('need --market=CA|MX|BR');process.exit(1);}
const SP='https://sellingpartnerapi-na.amazon.com', US='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const SKUS={'57-P4AJ-J4AC':'Single','CPH-BLCK-2':'2-Pack','CPH-BLCK-3':'3-Pack','UG-SVG8-LB0P':'Pro'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<6;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('connect failed');}
let tok;for(let i=0;i<6;i++){try{const j=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();tok=j.access_token;if(tok)break;}catch(e){}await sleep(3000);}
const H={'x-amz-access-token':tok,'content-type':'application/json'};
console.log(`=== ${LIVE?'LIVE':'VALIDATION ONLY'} — compatibility tokens US -> ${MARKET} ===\n`);
const done=[];
for(const [sku,name] of Object.entries(SKUS)){
  const us=await (await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${US}&includedData=attributes`,{headers:H})).json();
  const toks=((us.attributes||{}).compatible_cellular_phone_models||[]).map(x=>x.value);
  if(!toks.length){console.log(`${name.padEnd(7)} US has no tokens, skipping`);continue;}
  const tgt=await (await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&includedData=summaries,attributes`,{headers:H})).json();
  const pt=((tgt.summaries||[])[0]||{}).productType||'CELL_PHONE_HOLSTER';
  const had=((tgt.attributes||{}).compatible_cellular_phone_models||[]).length;
  const mode=LIVE?'':'&mode=VALIDATION_PREVIEW';
  const res=await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}${mode}`,{method:'PATCH',headers:H,
    body:JSON.stringify({productType:pt,patches:[{op:'replace',path:'/attributes/compatible_cellular_phone_models',
      value:toks.map(v=>({value:v,marketplace_id:MKT}))}]})});
  const j=await res.json().catch(()=>({}));
  const errs=(j.issues||[]).filter(i=>i.severity==='ERROR');
  console.log(`${name.padEnd(7)} ${sku.padEnd(14)} ${had} -> ${toks.length} tokens   HTTP ${res.status} status=${j.status||'-'} ${errs.length?'ERRORS':'clean'}`);
  for(const i of (j.issues||[])) console.log(`    [${i.severity}] ${i.code}: ${(i.message||'').slice(0,140)}`);
  if(!errs.length) done.push({sku,name,want:toks.length});
  await sleep(1500);
}
if(!LIVE){console.log('\nValidation only. Nothing written.');process.exit(0);}
console.log('\n=== READ-BACK FROM AMAZON (45s settle) ===');
await sleep(45000);
for(const d of done){
  const g=await (await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(d.sku)}?marketplaceIds=${MKT}&includedData=attributes`,{headers:H})).json();
  const got=((g.attributes||{}).compatible_cellular_phone_models||[]).length;
  console.log(`${d.name.padEnd(7)} now ${got} tokens  ${got===d.want?'MATCHES':'DOES NOT MATCH, wanted '+d.want}`);
  await sleep(1300);
}
