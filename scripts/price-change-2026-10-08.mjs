/**
 * Price change, approved by William 2026-10-08.
 *   Single  57-P4AJ-J4AC  $9.49 -> $9.99   (deliberately UNDER $10: Amazon's low-price FBA
 *                                           rate ends at $10.00 and the FBA fee jumps $0.92,
 *                                           so $10.49 would net $5.48 against today's $5.55)
 *   2-Pack  CPH-BLCK-2   $13.49 -> $14.49  (already above the cliff, FBA unchanged, +$0.85)
 *   3-Pack  CPH-BLCK-3   unchanged at $16.49
 * Patches ONLY our_price.value_with_tax; every other field is carried through verbatim.
 */
import {readFileSync} from 'fs';
for(const l of readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z_0-9]+)=(.*)$/);if(m)process.env[m[1]]??=m[2].replace(/^["']|["']$/g,'');}
const LIVE=process.argv.includes('--live');
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();
const SID='ACXMWZZUZKFVD', MKT='ATVPDKIKX0DER';
const H={'x-amz-access-token':access_token,'Content-Type':'application/json'};
const JOBS=[['57-P4AJ-J4AC',9.49,9.99],['CPH-BLCK-2',13.49,14.49]];
console.log(LIVE?'=== LIVE\n':'=== DRY RUN (add --live to apply)\n');
for(const [sku,expect,to] of JOBS){
  const gu=`https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/items/${SID}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&includedData=summaries,attributes`;
  const g=await fetch(gu,{headers:{'x-amz-access-token':access_token}});
  if(!g.ok){console.log(sku+'  READ FAILED '+g.status);continue;}
  const cur=await g.json();
  const pt=cur.summaries?.[0]?.productType;
  const offer=JSON.parse(JSON.stringify(cur.attributes.purchasable_offer));
  const now=offer[0]?.our_price?.[0]?.schedule?.[0]?.value_with_tax;
  if(now!==expect){console.log(sku+'  ABORT: expected $'+expect+' but listing says $'+now+'. Not touching it.');continue;}
  offer[0].our_price[0].schedule[0].value_with_tax=to;
  const body={productType:pt,patches:[{op:'replace',path:'/attributes/purchasable_offer',value:offer}]};
  console.log(sku+'  $'+now+' -> $'+to+'   productType '+pt);
  if(!LIVE){console.log('   payload: '+JSON.stringify(body).slice(0,230)+'...');continue;}
  const pu=`https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/items/${SID}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}`;
  const p=await fetch(pu,{method:'PATCH',headers:H,body:JSON.stringify(body)});
  const ptxt=await p.text();
  console.log('   PATCH '+p.status+'  '+ptxt.replace(/\s+/g,' ').slice(0,220));
  await new Promise(s=>setTimeout(s,3000));
}
if(LIVE){
  console.log('\n=== READ-BACK from Amazon (not the write\'s own response)');
  await new Promise(s=>setTimeout(s,20000));
  const r=await fetch(`https://sellingpartnerapi-na.amazon.com/products/pricing/v0/price?MarketplaceId=${MKT}&ItemType=Sku&Skus=57-P4AJ-J4AC,CPH-BLCK-2,CPH-BLCK-3`,{headers:{'x-amz-access-token':access_token}});
  if(r.ok) for(const p of ((await r.json()).payload||[]))
    console.log('   '+String(p.SellerSKU).padEnd(14)+' now $'+((p.Product?.Offers||[])[0]?.BuyingPrice?.ListingPrice?.Amount ?? '-'));
  else console.log('   read-back HTTP '+r.status+' (price feeds can lag a few minutes)');
}
process.exit(0);
