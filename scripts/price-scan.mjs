/** Pricing landscape for the price-test build: current price/title + who else is on our ASINs.
 *  RUN: node scripts/price-scan.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const sp=async(p)=>{const r=await fetch(`${SP}${p}`,{headers:{'x-amz-access-token':tok,'content-type':'application/json'}});const t=await r.text();return{ok:r.ok,status:r.status,json:t?JSON.parse(t):null};};

// live listings (price + title) — use the live SKUs from the inventory dump
const SKUS={ '57-P4AJ-J4AC':'Single B07Y5GZP1T', 'CPH-BLCK-2':'2-Pack B097MGPCPC', 'CPH-BLCK-3':'3-Pack(blk) B097MK5VZ4', 'UG-SVG8-LB0P':'Pro B0BLLJLSDP' };
console.log('=== CURRENT LISTINGS (price + title) ===');
for(const [sku,label] of Object.entries(SKUS)){
  const r=await sp(`/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&includedData=attributes,summaries,offers`);
  if(!r.ok){console.log(`  ${label} (${sku}): ${r.status} ${JSON.stringify(r.json).slice(0,100)}`);await sleep(600);continue;}
  const a=r.json?.attributes||{}, sum=(r.json?.summaries||[])[0]||{};
  const price=a.purchasable_offer?.[0]?.our_price?.[0]?.schedule?.[0]?.value_with_tax ?? a.list_price?.[0]?.value ?? '?';
  console.log(`  ${label.padEnd(18)} price=$${price}  status=${(sum.status||[]).join('/')||'?'}`);
  console.log(`       title: ${(sum.itemName||a.item_name?.[0]?.value||'?').slice(0,90)}`);
  await sleep(700);
}
// competition on our ASINs
const ASINS={ B07Y5GZP1T:'Single', B097MGPCPC:'2-Pack', B097MK5VZ4:'3-Pack(blk)', B0BLLJLSDP:'Pro' };
console.log('\n=== OFFERS ON OUR ASINs (are we the only seller?) ===');
for(const [asin,label] of Object.entries(ASINS)){
  const r=await sp(`/products/pricing/v0/items/${asin}/offers?MarketplaceId=${MKT}&ItemCondition=New`);
  if(!r.ok){console.log(`  ${label} ${asin}: ${r.status}`);await sleep(2200);continue;}
  const p=r.json?.payload||{}, offers=p.Offers||[], sum=p.Summary||{};
  const others=offers.filter(o=>o.SellerId!==SELLER);
  const bb=offers.find(o=>o.IsBuyBoxWinner);
  console.log(`  ${label.padEnd(12)} ${asin}  totalOffers=${sum.TotalOfferCount??offers.length}  others=${others.length}  buyBox=${bb?('$'+bb.ListingPrice?.Amount+(bb.SellerId===SELLER?' (US)':' (COMPETITOR!)')):'none'}`);
  others.forEach(o=>console.log(`       competitor: $${o.ListingPrice?.Amount} +ship $${o.Shipping?.Amount||0}  FBA=${o.IsFulfilledByAmazon} seller=${o.SellerId}`));
  await sleep(2200);
}
console.log('\nDONE.');
