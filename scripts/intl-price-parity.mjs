/** Prices any marketplace at US CONTRIBUTION PARITY, the method William approved for Canada:
 *  the US price converted, plus the extra fees Amazon charges us there, so a unit earns the same.
 *
 *  Fees are MEASURED from settlement events per marketplace, never getMyFeesEstimate, which
 *  returned CAD 3.79 against an actual CAD 8.21 and would have priced every SKU below break-even.
 *
 *  Pro carries the Single's price plus the local equivalent of the CAD 2 premium William set.
 *
 *  RUN: node scripts/intl-price-parity.mjs --market=MX          show the table, change nothing
 *       node scripts/intl-price-parity.mjs --market=MX --live   apply + read back
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=n=>(process.argv.find(a=>a.startsWith('--'+n+'='))||'').split('=')[1];
const LIVE=process.argv.includes('--live');
const MARKET=(arg('market')||'').toUpperCase();
// referral and fba MEASURED from real settlements; see scripts/intl-actual-fees.mjs
const M={
  MX:{id:'A1AM78C64UM0Y8', ccy:'MXN', referral:0.10, dst:0,      fba:136.84},
  BR:{id:'A2Q3Y263D00KWC', ccy:'BRL', referral:0.15, dst:0,      fba:37.00},
  CA:{id:'A2EUQ1WTGCTBG2', ccy:'CAD', referral:0.15, dst:0.0027, fba:8.21},
}[MARKET];
if(!M){console.error('need --market=MX|BR|CA');process.exit(1);}
const SP='https://sellingpartnerapi-na.amazon.com', SELLER='ACXMWZZUZKFVD';
const PRO_PREMIUM_USD=1.45;   // = the CAD 2.00 premium William set, in USD
// William 2026-08-21: "$2 a unit our real all in costs". The old per-SKU figures (0.62/1.24/1.62/
// 1.86) were RAW unit cost and excluded inbound freight and testing.
const COGS=2.00;
// --net=N prices every SKU to clear N dollars a sale, which is William's "$2-4 per sale" rule and
// produces a ladder a shopper can read. Without it, prices target US contribution parity, which on
// a flat cross-border fee gives a nonsense ladder: $15 for one and $20 for three.
const NET=Number((process.argv.find(a=>a.startsWith('--net='))||'').split('=')[1])||null;
const ITEMS=[
  {sku:'57-P4AJ-J4AC', name:'Single', usContrib:3.55, cogs:COGS, premium:0,               net:NET},
  {sku:'UG-SVG8-LB0P', name:'Pro',    usContrib:3.48, cogs:COGS, premium:PRO_PREMIUM_USD, net:NET?NET+0.5:null},
  {sku:'CPH-BLCK-2',   name:'2-Pack', usContrib:6.03, cogs:COGS, premium:0,               net:NET?NET+1:null},
  {sku:'CPH-BLCK-3',   name:'3-Pack', usContrib:8.48, cogs:COGS, premium:0,               net:NET?NET+2:null},
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<7;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('x');}
let FX=null,SRC='';
for(const [u,p,n] of [['https://api.frankfurter.app/latest?from=USD','j=>j','frankfurter (ECB)'],['https://open.er-api.com/v6/latest/USD','','open.er-api.com']]){
  try{const j=await (await rq(u)).json(); if(j?.rates?.[M.ccy]){FX=j.rates[M.ccy];SRC=n||'open.er-api.com';break;}}catch(e){}
}
if(!FX){console.error('no live FX; refusing to guess');process.exit(1);}
let tok;for(let i=0;i<6;i++){try{const j=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();tok=j.access_token;if(tok)break;}catch(e){}await sleep(3000);}
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const k=1-M.referral-M.dst;
console.log(`=== ${LIVE?'LIVE':'PLAN ONLY'} — ${MARKET} priced at US contribution parity ===`);
console.log(`FX 1 USD = ${FX.toFixed(4)} ${M.ccy}  (${SRC})   referral ${(M.referral*100).toFixed(0)}%   FBA ${M.ccy} ${M.fba}/unit measured\n`);
console.log(NET?`         target     price ${M.ccy}   break-even   live now`:`         US keeps   parity ${M.ccy}   break-even   live now`);
for(const it of ITEMS){
  const target=(it.net!=null ? it.net : (it.usContrib+it.premium))*FX;
  it.price = +(((target + M.fba + it.cogs*FX)/k)).toFixed(2);
  it.be     = +(((M.fba + it.cogs*FX)/k)).toFixed(2);
  const g=await (await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(it.sku)}?marketplaceIds=${M.id}&includedData=summaries,attributes`,{headers:H})).json();
  it.pt=((g.summaries||[])[0]||{}).productType||'CELL_PHONE_HOLSTER';
  it.live=(g.attributes||{}).purchasable_offer?.[0]?.our_price?.[0]?.schedule?.[0]?.value_with_tax;
  console.log(`${it.name.padEnd(8)} $${(it.net!=null?it.net:it.usContrib).toFixed(2).padStart(5)}${(it.net==null&&it.premium)?' +$'+it.premium:'     '}  ${String(it.price).padStart(9)}  ${String(it.be).padStart(10)}   ${String(it.live??'none').padStart(9)}`);
  await sleep(1300);
}
if(!LIVE){ console.log('\nPlan only. Nothing changed.'); process.exit(0); }
console.log('\n--- applying ---');
for(const it of ITEMS){
  if(it.live===it.price){ console.log(`${it.name.padEnd(8)} already ${it.price}, skipping`); continue; }
  const res=await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(it.sku)}?marketplaceIds=${M.id}`,{method:'PATCH',headers:H,
    body:JSON.stringify({productType:it.pt,patches:[{op:'replace',path:'/attributes/purchasable_offer',
      value:[{currency:M.ccy,audience:'ALL',marketplace_id:M.id,our_price:[{schedule:[{value_with_tax:it.price}]}]}]}]})});
  const j=await res.json().catch(()=>({}));
  const errs=(j.issues||[]).filter(i=>i.severity==='ERROR');
  console.log(`${it.name.padEnd(8)} ${String(it.live??'none').padStart(9)} -> ${String(it.price).padStart(8)}  HTTP ${res.status} ${j.status||'-'} ${errs.length?'ERRORS':'clean'}`);
  for(const i of (j.issues||[])) console.log(`    [${i.severity}] ${i.code}: ${(i.message||'').slice(0,130)}`);
  await sleep(1600);
}
console.log('\n=== READ-BACK (45s settle) ===');
await sleep(45000);
for(const it of ITEMS){
  const g=await (await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(it.sku)}?marketplaceIds=${M.id}&includedData=attributes`,{headers:H})).json();
  const got=(g.attributes||{}).purchasable_offer?.[0]?.our_price?.[0]?.schedule?.[0]?.value_with_tax;
  console.log(`${it.name.padEnd(8)} now ${M.ccy} ${String(got).padStart(9)}  ${got===it.price?'MATCHES':'DOES NOT MATCH'}`);
  await sleep(1300);
}
