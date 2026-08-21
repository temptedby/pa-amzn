/** Applies bullets, description and backend search terms to one marketplace from a copy JSON.
 *
 *  Validates every field first (mode=VALIDATION_PREVIEW) and, on --live, writes and then READS
 *  BACK from Amazon rather than trusting the submission status. Same discipline as
 *  canada-apply-prices.mjs, for the same reason: `ACCEPTED` is a receipt, not an outcome.
 *
 *  RUN: node scripts/listing-apply-copy.mjs --copy=<file.json> --market=US            validate only
 *       node scripts/listing-apply-copy.mjs --copy=<file.json> --market=US --live     apply
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=n=>(process.argv.find(a=>a.startsWith('--'+n+'='))||'').split('=').slice(1).join('=');
const LIVE=process.argv.includes('--live');
const COPY=arg('copy'), MARKET=(arg('market')||'US').toUpperCase();
const MKT={US:'ATVPDKIKX0DER',CA:'A2EUQ1WTGCTBG2',MX:'A1AM78C64UM0Y8',BR:'A2Q3Y263D00KWC'}[MARKET];
if(!COPY||!MKT){console.error('need --copy=<file.json> and --market=US|CA|MX|BR');process.exit(1);}
const SP='https://sellingpartnerapi-na.amazon.com', SELLER='ACXMWZZUZKFVD';
const SKU={BLACK:'57-P4AJ-J4AC','2-PACK':'CPH-BLCK-2','3-PACK':'CPH-BLCK-3',PRO:'UG-SVG8-LB0P'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<6;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('connect failed');}
let tok;for(let i=0;i<6;i++){try{const j=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();tok=j.access_token;if(tok)break;}catch(e){}await sleep(3000);}
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const copy=JSON.parse(readFileSync(COPY,'utf8'));

console.log(`=== ${LIVE?'LIVE WRITE':'VALIDATION ONLY'} — ${MARKET} (${MKT}) — from ${COPY} ===\n`);
const results=[];
for(const [name,rec] of Object.entries(copy)){
  const sku=SKU[name]; if(!sku){console.log(`skip ${name}: no SKU mapping`);continue;}
  const g=await (await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&includedData=summaries`,{headers:H})).json();
  const pt=((g.summaries||[])[0]||{}).productType||'CELL_PHONE_HOLSTER';
  const bullets=(rec.bullets||[]).map(b=>b.headline?`${b.headline}: ${b.body}`:b.body).filter(Boolean);
  const patches=[];
  if(bullets.length) patches.push({op:'replace',path:'/attributes/bullet_point',value:bullets.map(v=>({value:v,marketplace_id:MKT}))});
  if(rec.description) patches.push({op:'replace',path:'/attributes/product_description',value:[{value:rec.description,marketplace_id:MKT}]});
  if(rec.search_terms) patches.push({op:'replace',path:'/attributes/generic_keyword',value:[{value:rec.search_terms,marketplace_id:MKT}]});
  const over=bullets.filter(b=>b.length>500).length;
  const stBytes=Buffer.byteLength(rec.search_terms||'');
  if(over||stBytes>250){console.log(`${name}: LOCAL CHECK FAILED — ${over} bullets over 500 chars, search terms ${stBytes} bytes`);continue;}
  const mode=LIVE?'':'&mode=VALIDATION_PREVIEW';
  const res=await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}${mode}`,{method:'PATCH',headers:H,body:JSON.stringify({productType:pt,patches})});
  const j=await res.json().catch(()=>({}));
  const errs=(j.issues||[]).filter(i=>i.severity==='ERROR');
  console.log(`${name.padEnd(7)} ${sku.padEnd(14)} ${bullets.length} bullets, desc ${rec.description?.length||0}, terms ${stBytes}b   HTTP ${res.status} status=${j.status||'-'} ${errs.length?'ERRORS':'clean'}`);
  for(const i of (j.issues||[])) console.log(`    [${i.severity}] ${i.code}: ${(i.message||'').slice(0,150)}`);
  results.push({name,sku,bullets:bullets.length,ok:!errs.length});
  await sleep(1500);
}
if(!LIVE){ console.log('\nValidation only. Nothing written.'); process.exit(0); }
console.log('\n=== READ-BACK FROM AMAZON (45s settle) ===');
await sleep(45000);
for(const r of results){
  const g=await (await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(r.sku)}?marketplaceIds=${MKT}&includedData=attributes`,{headers:H})).json();
  const a=g.attributes||{};
  console.log(`${r.name.padEnd(7)} bullets ${(a.bullet_point||[]).length}  description ${((a.product_description||[])[0]?.value||'').length} chars  search terms ${Buffer.byteLength((a.generic_keyword||[])[0]?.value||'')}b`);
  await sleep(1300);
}
