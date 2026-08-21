/** READ-ONLY. Actual settlement fees on the few MX and BR orders we have ever had.
 *  The Canadian lesson: getMyFeesEstimate understates Remote Fulfilment by more than half. */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const SP='https://sellingpartnerapi-na.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<6;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('connect failed');}
let tok;for(let i=0;i<6;i++){try{const j=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();tok=j.access_token;if(tok)break;}catch(e){}await sleep(3000);}
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const agg={};
// The Finances API caps a window (~180d), so walk it in chunks around the four known orders.
const WINDOWS=[['2025-08-01','2025-10-05'],['2025-10-05','2025-12-10']];
let pages=0;
for(const [from,to] of WINDOWS){
 let n;
 do{
  const url=n? `${SP}/finances/v0/financialEvents?NextToken=${encodeURIComponent(n)}`
            : `${SP}/finances/v0/financialEvents?PostedAfter=${from}T00:00:00Z&PostedBefore=${to}T00:00:00Z&MaxResultsPerPage=100`;
  const r=await rq(url,{headers:H});
  const j=await r.json();
  if(!r.ok){console.log('HTTP',r.status,JSON.stringify(j).slice(0,150));break;}
  for(const s of j.payload?.FinancialEvents?.ShipmentEventList||[]){
    for(const it of s.ShipmentItemList||[]){
      const cur=(it.ItemChargeList||[])[0]?.ChargeAmount?.CurrencyCode;
      if(cur!=='MXN'&&cur!=='BRL') continue;
      const a=agg[cur]||(agg[cur]={units:0,principal:0,fees:{},skus:{}});
      a.units+=Number(it.QuantityShipped||1);
      a.skus[it.SellerSKU]=(a.skus[it.SellerSKU]||0)+Number(it.QuantityShipped||1);
      for(const c of it.ItemChargeList||[]) if(c.ChargeType==='Principal') a.principal+=Number(c.ChargeAmount?.CurrencyAmount||0);
      for(const f of it.ItemFeeList||[]) a.fees[f.FeeType]=(a.fees[f.FeeType]||0)+Number(f.FeeAmount?.CurrencyAmount||0);
    }
  }
  n=j.payload?.NextToken; pages++; await sleep(1500);
 }while(n && pages<50);
}
const FXr=await (await rq('https://open.er-api.com/v6/latest/USD')).json().catch(()=>({rates:{}}));
console.log(`scanned ${pages} pages\n`);
for(const [cur,a] of Object.entries(agg)){
  const fx=FXr.rates?.[cur]||1;
  const fba=-(a.fees.FBAPerUnitFulfillmentFee||0)/a.units;
  const ref=-(a.fees.Commission||0)/a.units;
  const oth=-(Object.entries(a.fees).filter(([t])=>!['FBAPerUnitFulfillmentFee','Commission'].includes(t)).reduce((x,[,v])=>x+v,0))/a.units;
  const price=a.principal/a.units;
  console.log(`${cur}: ${a.units} units  SKUs ${JSON.stringify(a.skus)}`);
  console.log(`   avg price ${price.toFixed(2)} = USD ${(price/fx).toFixed(2)}`);
  console.log(`   FBA/unit  ${fba.toFixed(2)} = USD ${(fba/fx).toFixed(2)}   (US is $2.52, CA is CAD 8.21 = USD 5.96)`);
  console.log(`   referral  ${ref.toFixed(2)} = ${(100*ref/price).toFixed(1)}%   other ${oth.toFixed(2)}`);
  console.log(`   net pre-COGS ${(price-fba-ref-oth).toFixed(2)} = USD ${((price-fba-ref-oth)/fx).toFixed(2)}\n`);
}
if(!Object.keys(agg).length) console.log('no MXN or BRL shipment events found in that window');
