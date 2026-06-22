/** Pull REAL Amazon fees (referral + FBA fulfillment) via SP-API getMyFeesEstimate, then compute
 *  true contribution margin + break-even ACOS. Validated data, not an assumption.
 *  RUN: node scripts/fees.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER';
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);

// price + COGS per ASIN (COGS landed w/ packaging, William 2026-06-23)
const ITEMS=[
  {asin:'B07Y5GZP1T',label:'Single',price:9.49,cogs:0.62},
  {asin:'B0BLLJLSDP',label:'Pro',price:10.49,cogs:1.62},
  {asin:'B097MGPCPC',label:'2-Pack',price:13.49,cogs:1.24},
];
const fee=async(it)=>{
  const body={FeesEstimateRequest:{MarketplaceId:MKT,IsAmazonFulfilled:true,Identifier:it.asin,PriceToEstimateFees:{ListingPrice:{CurrencyCode:'USD',Amount:it.price}}}};
  const r=await fetch(`${SP}/products/fees/v0/items/${it.asin}/feesEstimate`,{method:'POST',headers:{'x-amz-access-token':tok,'content-type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json();
  return j?.payload?.FeesEstimateResult?.FeesEstimate||j;
};
console.log('ASIN'.padEnd(8),'price  COGS  referral  FBA    totalFees  contribution  break-even ACOS');
for(const it of ITEMS){
  const f=await fee(it);
  const total=f?.TotalFeesEstimate?.Amount;
  const details={}; (f?.FeeDetailList||[]).forEach(d=>details[d.FeeType]=d.FeeAmount?.Amount);
  if(total==null){console.log(`${it.label.padEnd(8)} fee error: ${JSON.stringify(f).slice(0,160)}`);continue;}
  const ref=details.ReferralFee??'?', fba=details.FBAFees??details.FulfillmentFees??'?';
  const contribution=it.price-it.cogs-total;
  const beAcos=contribution/it.price;
  console.log(`${it.label.padEnd(8)} $${it.price}  $${it.cogs}   $${(+ref).toFixed(2)}    $${fba==='?'?'?':(+fba).toFixed(2)}   $${total.toFixed(2)}      $${contribution.toFixed(2)}        ${(beAcos*100).toFixed(0)}%`);
}
console.log('\ncontribution = price - COGS - (referral + FBA + other Amazon fees);  break-even ACOS = contribution / price');
console.log('(storage/long-term fees not in per-unit estimate; add from monthly settlement for full accuracy.)');
