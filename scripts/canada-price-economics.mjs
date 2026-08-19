/** What does a Canadian order actually net us? Amazon's own fee estimate at several price points.
 *  Read-only. RUN: node scripts/canada-price-economics.mjs */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const SP='https://sellingpartnerapi-na.amazon.com', SELLER='ACXMWZZUZKFVD';
const US='ATVPDKIKX0DER', CA='A2EUQ1WTGCTBG2';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const COGS={'57-P4AJ-J4AC':0.62,'CPH-BLCK-2':1.24,'CPH-BLCK-3':1.86,'UG-SVG8-LB0P':1.62};
const NAMES={'57-P4AJ-J4AC':'Single','CPH-BLCK-2':'2-Pack','CPH-BLCK-3':'3-Pack','UG-SVG8-LB0P':'Pro'};
const FX=1.38;
async function fees(sku,mkt,amount,cur){
  const body={FeesEstimateRequest:{MarketplaceId:mkt,IdType:'SellerSKU',IdValue:sku,
    IsAmazonFulfilled:true,Identifier:`${sku}-${amount}-${Date.now()}`,
    PriceToEstimateFees:{ListingPrice:{CurrencyCode:cur,Amount:amount}}}};
  const res=await fetch(`${SP}/products/fees/v0/listings/${encodeURIComponent(sku)}/feesEstimate`,{method:'POST',headers:H,body:JSON.stringify(body)});
  const j=await res.json();
  const r=j.payload?.FeesEstimateResult;
  if(r?.Status!=='Success') return {err:`${r?.Status||res.status} ${JSON.stringify(r?.Error||j).slice(0,110)}`};
  const tot=r.FeesEstimate?.TotalFeesEstimate?.Amount;
  const det={};
  for(const f of (r.FeesEstimate?.FeeDetailList||[])) det[f.FeeType]=f.FinalFee?.Amount;
  return {tot,det};
}
console.log('CANADA — what a sale actually nets, at Amazon\'s own fee estimate\n');
for(const sku of Object.keys(NAMES)){
  console.log(`--- ${NAMES[sku]} (${sku})  COGS $${COGS[sku].toFixed(2)} USD ---`);
  for(const price of [29.28,25,20,15,12]){
    const f=await fees(sku,CA,price,'CAD');
    if(f.err){console.log(`  CAD ${String(price).padStart(6)}   ${f.err}`);continue;}
    const usd=price/FX, feesUsd=f.tot/FX;
    const net=usd-feesUsd-COGS[sku];
    const parts=Object.entries(f.det).map(([k,v])=>`${k} ${v.toFixed(2)}`).join('  ');
    console.log(`  CAD ${String(price).padStart(6)}  fees CAD ${f.tot.toFixed(2).padStart(6)}  => USD net ${net>=0?' ':''}${net.toFixed(2).padStart(6)}   ${parts}`);
    await new Promise(z=>setTimeout(z,600));
  }
  const u=await fees(sku,US,{'57-P4AJ-J4AC':9.49,'CPH-BLCK-2':13.49,'CPH-BLCK-3':16.49,'UG-SVG8-LB0P':10.49}[sku],'USD');
  if(!u.err){ const p={'57-P4AJ-J4AC':9.49,'CPH-BLCK-2':13.49,'CPH-BLCK-3':16.49,'UG-SVG8-LB0P':10.49}[sku];
    console.log(`  US  $${String(p).padStart(6)}  fees USD ${u.tot.toFixed(2).padStart(6)}  => USD net  ${(p-u.tot-COGS[sku]).toFixed(2).padStart(6)}  <- for comparison`); }
  console.log();
}
