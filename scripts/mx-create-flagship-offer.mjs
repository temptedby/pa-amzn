/** Creates the Mexican offer for the FLAGSHIP, the ASIN carrying all 480 reviews, which had no
 *  listing in Mexico at all while five other sellers competed on it unopposed.
 *
 *  Price MXN 256.60 is US-contribution parity using the MEASURED Mexican fees (referral 10%, FBA
 *  MXN 136.84 per unit from settlement), not getMyFeesEstimate, which understates Remote Fulfilment.
 *
 *  RUN: node scripts/mx-create-flagship-offer.mjs --dry    validate, write nothing
 *       node scripts/mx-create-flagship-offer.mjs          create, then read back
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const SP='https://sellingpartnerapi-na.amazon.com', SELLER='ACXMWZZUZKFVD';
const MX='A1AM78C64UM0Y8', CA='A2EUQ1WTGCTBG2', SKU='57-P4AJ-J4AC';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<6;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('connect failed');}
let tok;for(let i=0;i<6;i++){try{const j=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();tok=j.access_token;if(tok)break;}catch(e){}await sleep(3000);}
const H={'x-amz-access-token':tok,'content-type':'application/json'};

const g=await (await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(SKU)}?marketplaceIds=${MX}&includedData=summaries,attributes`,{headers:H})).json();
console.log('MX record today:');
console.log('  productType:', ((g.summaries||[])[0]||{}).productType || '(none)');
console.log('  attributes :', Object.keys(g.attributes||{}).join(', ')||'(none)');
const gc=await (await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(SKU)}?marketplaceIds=${CA}&includedData=summaries,attributes`,{headers:H})).json();
const pt=((g.summaries||[])[0]||{}).productType || ((gc.summaries||[])[0]||{}).productType || 'CELL_PHONE_HOLSTER';
console.log('  using productType:', pt);

// MXN 256.60 = the US-contribution parity price from the RBB (referral 10%, FBA MXN 136.84)
const PRICE = 256.60;
const patches=[
  {op:'replace', path:'/attributes/purchasable_offer', value:[{currency:'MXN', audience:'ALL', marketplace_id:MX,
      our_price:[{schedule:[{value_with_tax:PRICE}]}]}]},
  {op:'replace', path:'/attributes/fulfillment_availability', value:[{fulfillment_channel_code:'AMAZON_NA'}]},
  {op:'replace', path:'/attributes/condition_type', value:[{value:'new_new', marketplace_id:MX}]},
  {op:'replace', path:'/attributes/merchant_suggested_asin', value:[{value:'B07Y5GZP1T', marketplace_id:MX}]},
  // Amazon MX answered the first probe in Spanish: "Se requiere '¿Se necesitan baterías?', pero falta."
  // Canada carries both of these; Mexico's partial record does not.
  {op:'replace', path:'/attributes/batteries_required', value:[{value:false, marketplace_id:MX}]},
  {op:'replace', path:'/attributes/batteries_included', value:[{value:false, marketplace_id:MX}]},
];
// "Normativas sobre mercancías peligrosas" = supplier_declared_dg_hz_regulation. Rather than guess a
// value, copy whatever Canada already declares for the identical SKU and re-stamp the marketplace.
const caDg=(gc.attributes||{}).supplier_declared_dg_hz_regulation;
if(caDg){
  console.log('  copying dangerous-goods declaration from CA:', JSON.stringify(caDg));
  patches.push({op:'replace', path:'/attributes/supplier_declared_dg_hz_regulation',
    value: caDg.map(v=>({...v, marketplace_id:MX}))});
} else console.log('  !! CA has no supplier_declared_dg_hz_regulation to copy');
const DRY=process.argv.includes('--dry');
const res=await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(SKU)}?marketplaceIds=${MX}${DRY?'&mode=VALIDATION_PREVIEW':''}`,
  {method:'PATCH',headers:H,body:JSON.stringify({productType:pt,patches})});
const j=await res.json().catch(()=>({}));
console.log(`\n${DRY?'VALIDATION':'LIVE WRITE'} at MXN ${PRICE}:  HTTP ${res.status}  status=${j.status||'-'}  issues=${(j.issues||[]).length}`);
for(const i of (j.issues||[])) console.log(`  [${i.severity}] ${i.code}: ${(i.message||'').slice(0,170)}`);
if(DRY){ console.log('\nNothing was written.'); process.exit(0); }
console.log('\n=== READ-BACK FROM AMAZON (60s settle) ===');
await sleep(60000);
const back=await (await rq(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(SKU)}?marketplaceIds=${MX}&includedData=summaries,offers,fulfillmentAvailability`,{headers:H})).json();
const bs=(back.summaries||[])[0]||{};
console.log(`  status  ${(bs.status||[]).join('/')||'NONE'}`);
console.log(`  offer   ${JSON.stringify((back.offers||[]).map(o=>o.price?.amount+' '+o.price?.currencyCode))}`);
console.log(`  fulfil  ${JSON.stringify((back.fulfillmentAvailability||[]).map(f=>f.fulfillmentChannelCode))}`);
const pr=await (await rq(`${SP}/products/pricing/v0/items/B07Y5GZP1T/offers?MarketplaceId=${MX}&ItemCondition=New`,{headers:H})).json();
const offers=pr.payload?.Offers||[];
const mine=offers.find(o=>o.MyOffer===true||o.SellerId===SELLER);
console.log(`  BUYER SIDE: ${offers.length} offers on the ASIN, ours ${mine?`${mine.ListingPrice?.Amount} MXN buyBox=${!!mine.IsBuyBoxWinner}`:'NOT VISIBLE YET (catalogue can lag)'}`);
