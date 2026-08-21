/** READ-ONLY. What did Amazon ACTUALLY charge us per Canadian unit? Ground truth from settlement
 *  events on the real 2024-25 CA orders, which beats any fee estimate. */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const SP='https://sellingpartnerapi-na.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let tok;
for(let i=0;i<6;i++){try{const j=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();tok=j.access_token;if(tok)break;}catch(e){}await sleep(3000);}
const H={'x-amz-access-token':tok,'content-type':'application/json'};
async function jget(u){for(let i=0;i<6;i++){try{const r=await fetch(u,{headers:H});if(r.status===429){await sleep(8000);continue;}return{ok:r.ok,status:r.status,j:await r.json()};}catch(e){await sleep(4000);}}return{ok:false,j:{}};}

const after='2025-06-01T00:00:00Z', before='2025-10-15T00:00:00Z';
let n, pages=0, seen=0;
const agg={}; // currency -> {units, principal, fees:{type:amount}}
do{
  const url=n? `${SP}/finances/v0/financialEvents?NextToken=${encodeURIComponent(n)}`
            : `${SP}/finances/v0/financialEvents?PostedAfter=${after}&PostedBefore=${before}&MaxResultsPerPage=100`;
  const r=await jget(url);
  if(!r.ok){console.log('HTTP',r.status,JSON.stringify(r.j).slice(0,160));break;}
  const ev=r.j.payload?.FinancialEvents||{};
  for(const s of ev.ShipmentEventList||[]){
    for(const it of s.ShipmentItemList||[]){
      const cur=(it.ItemChargeList||[])[0]?.ChargeAmount?.CurrencyCode;
      if(cur!=='CAD') continue;
      seen++;
      const sku=it.SellerSKU||'?';
      const a=agg[sku]||(agg[sku]={units:0,principal:0,fees:{}});
      a.units+=Number(it.QuantityShipped||1);
      for(const c of it.ItemChargeList||[]) if(c.ChargeType==='Principal') a.principal+=Number(c.ChargeAmount?.CurrencyAmount||0);
      for(const f of it.ItemFeeList||[]) a.fees[f.FeeType]=(a.fees[f.FeeType]||0)+Number(f.FeeAmount?.CurrencyAmount||0);
    }
  }
  n=r.j.payload?.NextToken; pages++;
  await sleep(1500);
}while(n && pages<30);

console.log(`scanned ${pages} pages, ${seen} CAD shipment items\n`);
const NAME={'57-P4AJ-J4AC':'Single','CPH-BLCK-2':'2-Pack','CPH-BLCK-3':'3-Pack','UG-SVG8-LB0P':'Pro'};
console.log('SKU        units  avgPrice   FBA/u  referral/u  refl%   other/u  net/u (CAD, pre-COGS)');
for(const [sku,a] of Object.entries(agg)){
  const fba=-(a.fees.FBAPerUnitFulfillmentFee||0)/a.units;
  const ref=-(a.fees.Commission||0)/a.units;
  const other=-(Object.entries(a.fees).filter(([t])=>t!=='FBAPerUnitFulfillmentFee'&&t!=='Commission').reduce((x,[,v])=>x+v,0))/a.units;
  const price=a.principal/a.units;
  const net=price-fba-ref-other;
  console.log(`${(NAME[sku]||sku).padEnd(10)} ${String(a.units).padStart(5)}  ${price.toFixed(2).padStart(7)}  ${fba.toFixed(2).padStart(6)}  ${ref.toFixed(2).padStart(9)}  ${(100*ref/price).toFixed(1).padStart(5)}%  ${other.toFixed(2).padStart(7)}  ${net.toFixed(2).padStart(7)}`);
}
