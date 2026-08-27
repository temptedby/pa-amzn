/** Sets the four Canadian prices to CONTRIBUTION PARITY with the US.
 *  William 2026-08-21: "make sure the pricing carries to be similar with the currency exchange and
 *  amzn fees" then "18.72 looks right then 2 pack should use same conversions".
 *
 *  Parity = the CAD price at which our USD contribution per unit equals the US one, using the REAL
 *  Canadian fees measured from settlement events (FBA CAD 8.21 flat, referral 15%, DST 0.27%).
 *  getMyFeesEstimate is NOT used: it returns the domestic CAD 3.79 rate for these Remote
 *  Fulfilment orders and would have underpriced every SKU below break-even.
 *
 *  RUN: node scripts/canada-apply-prices.mjs --dry     validation only, writes nothing
 *       node scripts/canada-apply-prices.mjs           real write + read-back verification
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const DRY=process.argv.includes('--dry');
const SP='https://sellingpartnerapi-na.amazon.com', CA='A2EUQ1WTGCTBG2', SELLER='ACXMWZZUZKFVD';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let tok;for(let i=0;i<6;i++){try{const j=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();tok=j.access_token;if(tok)break;}catch(e){}await sleep(3000);}
if(!tok){console.error('no token');process.exit(1);}
const H={'x-amz-access-token':tok,'content-type':'application/json'};

// Pro carries a CAD 2.00 premium over the Single, William 2026-08-21, mirroring the US $1.00
// premium. Parity alone put it at 18.60 because its COGS is $1.00 higher; the premium is on top.
const ITEMS=[
  {sku:'57-P4AJ-J4AC', name:'Single', from:18.72, to:18.72},
  {sku:'UG-SVG8-LB0P', name:'Pro',    from:18.60, to:20.72},
  {sku:'CPH-BLCK-2',   name:'2-Pack', from:22.75, to:22.75},
  {sku:'CPH-BLCK-3',   name:'3-Pack', from:26.94, to:26.94},
].filter(x=>{const o=(process.argv.find(a=>a.startsWith('--only='))||'').split('=')[1];return !o||x.sku===o||x.name.toLowerCase()===o.toLowerCase();});

console.log(`=== ${DRY?'VALIDATION ONLY — nothing is written':'LIVE WRITE'} — Canadian prices ===\n`);
for(const x of ITEMS){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${CA}&includedData=summaries,attributes`,{headers:H})).json();
  x.pt=((g.summaries||[])[0]||{}).productType;
  const cur=(g.attributes||{}).purchasable_offer?.[0]?.our_price?.[0]?.schedule?.[0]?.value_with_tax;
  x.live=cur;
  if(cur!==x.from) console.log(`  !! ${x.name}: live price is ${cur}, expected ${x.from}. Using the live value as the baseline.`);
  await sleep(1000);
}
for(const x of ITEMS){
  const mode=DRY?'&mode=VALIDATION_PREVIEW':'';
  const body={productType:x.pt,patches:[{op:'replace',path:'/attributes/purchasable_offer',
    value:[{currency:'CAD',audience:'ALL',marketplace_id:CA,our_price:[{schedule:[{value_with_tax:x.to}]}]}]}]};
  const res=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${CA}${mode}`,{method:'PATCH',headers:H,body:JSON.stringify(body)});
  const j=await res.json().catch(()=>({}));
  const errs=(j.issues||[]).filter(i=>i.severity==='ERROR');
  console.log(`${x.name.padEnd(8)} ${x.sku.padEnd(14)} CAD ${String(x.live).padStart(6)} -> ${String(x.to).padStart(6)}   HTTP ${res.status}  status=${j.status||'-'}  ${errs.length?'ERRORS':'clean'}`);
  for(const i of (j.issues||[])) console.log(`    [${i.severity}] ${i.code}: ${(i.message||'').slice(0,140)}`);
  await sleep(1500);
}
if(DRY){ console.log('\nValidation only. Nothing was changed.'); process.exit(0); }
console.log('\n=== READ-BACK FROM AMAZON (45s settle) ===');
await sleep(45000);
for(const x of ITEMS){
  const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(x.sku)}?marketplaceIds=${CA}&includedData=attributes`,{headers:H})).json();
  const got=(g.attributes||{}).purchasable_offer?.[0]?.our_price?.[0]?.schedule?.[0]?.value_with_tax;
  console.log(`${x.name.padEnd(8)} now CAD ${String(got).padStart(6)}   ${got===x.to?'MATCHES what we sent':'DOES NOT MATCH — was '+x.live}`);
  await sleep(1200);
}
