/** What CAD price earns the SAME contribution as the US price? Solves from Amazon's own fees.
 *  Read-only. RUN: node scripts/canada-price-target.mjs [fx] */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const SP='https://sellingpartnerapi-na.amazon.com';
const US='ATVPDKIKX0DER', CA='A2EUQ1WTGCTBG2';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const FX=parseFloat(process.argv[2]||'1.38');
const P={'57-P4AJ-J4AC':{n:'Single',cogs:0.62,us:9.49,ca:29.28},
         'CPH-BLCK-2' :{n:'2-Pack',cogs:1.24,us:13.49,ca:52.31},
         'CPH-BLCK-3' :{n:'3-Pack',cogs:1.86,us:16.49,ca:67.39},
         'UG-SVG8-LB0P':{n:'Pro',  cogs:1.62,us:10.49,ca:27.04}};
async function fee(sku,mkt,amount,cur){
  for(let a=0;a<6;a++){
    const body={FeesEstimateRequest:{MarketplaceId:mkt,IdType:'SellerSKU',IdValue:sku,IsAmazonFulfilled:true,
      Identifier:`${sku}-${mkt}-${amount}-${a}-${Date.now()}`,PriceToEstimateFees:{ListingPrice:{CurrencyCode:cur,Amount:amount}}}};
    const res=await fetch(`${SP}/products/fees/v0/listings/${encodeURIComponent(sku)}/feesEstimate`,{method:'POST',headers:H,body:JSON.stringify(body)});
    const j=await res.json();
    if(res.status===429){ await sleep(4000); continue; }
    const rr=j.payload?.FeesEstimateResult;
    if(rr?.Status!=='Success') return null;
    const d={}; for(const f of (rr.FeesEstimate?.FeeDetailList||[])) d[f.FeeType]=f.FinalFee?.Amount;
    return {tot:rr.FeesEstimate?.TotalFeesEstimate?.Amount, fba:d.FBAFees||0, ref:d.ReferralFee||0};
  }
  return null;
}
console.log(`FX assumed ${FX} CAD per USD. All "net" figures are USD contribution per unit after Amazon fees and COGS.\n`);
console.log('product   US price  US fees  US net |  CA now  CA fees  CA net | CA price to MATCH US net');
const out=[];
for(const [sku,p] of Object.entries(P)){
  const uf=await fee(sku,US,p.us,'USD'); await sleep(2500);
  const cf=await fee(sku,CA,p.ca,'CAD'); await sleep(2500);
  if(!uf||!cf){console.log(`${p.n}: fee lookup failed`);continue;}
  const usNet=p.us-uf.tot-p.cogs;
  const caNet=(p.ca-cf.tot)/FX-p.cogs;
  // referral is proportional; FBA is flat. solve: ((1-refRate)*X - fba)/FX - cogs = usNet
  const refRate=cf.ref/p.ca;
  const target=((usNet+p.cogs)*FX + cf.fba)/(1-refRate);
  out.push({...p,sku,usNet,caNet,target,fba:cf.fba,refRate});
  console.log(`${p.n.padEnd(8)} ${('$'+p.us).padStart(8)} ${uf.tot.toFixed(2).padStart(8)} ${usNet.toFixed(2).padStart(7)} | ${('C$'+p.ca).padStart(7)} ${cf.tot.toFixed(2).padStart(8)} ${caNet.toFixed(2).padStart(7)} | CAD ${target.toFixed(2)}`);
}
console.log('\nWhy Canada must cost more: the FBA fee is flat and much larger there.');
for(const o of out) console.log(`  ${o.n.padEnd(8)} CA FBA fee CAD ${o.fba.toFixed(2)} = USD ${(o.fba/FX).toFixed(2)}   referral ${(o.refRate*100).toFixed(0)}%`);
console.log('\nFloor: the CAD price below which a sale loses money (net = 0)');
for(const o of out){
  const floor=(o.cogs*FX + o.fba)/(1-o.refRate);
  console.log(`  ${o.n.padEnd(8)} break-even CAD ${floor.toFixed(2)}   your CAD 15 idea nets USD ${((15*(1-o.refRate)-o.fba)/FX-o.cogs).toFixed(2)}`);
}
