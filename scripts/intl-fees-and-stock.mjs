/** READ-ONLY. (1) Do we actually have units to sell? (2) Is there a currency-conversion fee that my
 *  parity pricing omitted? We are paid in CAD/MXN/BRL into a US bank, so Amazon converts. */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const SP='https://sellingpartnerapi-na.amazon.com', US='ATVPDKIKX0DER';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<6;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('connect failed');}
let tok;for(let i=0;i<6;i++){try{const j=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();tok=j.access_token;if(tok)break;}catch(e){}await sleep(3000);}
const H={'x-amz-access-token':tok,'content-type':'application/json'};

console.log('=== 1. SELLABLE UNITS (one pool, Remote Fulfilment serves CA/MX/BR from it) ===');
const r=await (await rq(`${SP}/fba/inventory/v1/summaries?details=true&granularityType=Marketplace&granularityId=${US}&marketplaceIds=${US}`,{headers:H})).json();
const NAME={'57-P4AJ-J4AC':'Single','CPH-BLCK-2':'2-Pack','CPH-BLCK-3':'3-Pack','UG-SVG8-LB0P':'Pro'};
let tot=0, sellable=0;
for(const x of (r.payload?.inventorySummaries||[])){
  const q=x.inventoryDetails||{};
  const f=q.fulfillableQuantity??0;
  if((x.totalQuantity||0)===0 && f===0) continue;
  tot+=x.totalQuantity||0; sellable+=f;
  const label=NAME[x.sellerSku]||x.sellerSku;
  console.log(`  ${label.padEnd(8)} ${String(x.sellerSku).padEnd(16)} total ${String(x.totalQuantity).padStart(4)}  FULFILLABLE ${String(f).padStart(4)}  inbound ${String((q.inboundShippedQuantity||0)+(q.inboundWorkingQuantity||0)+(q.inboundReceivingQuantity||0)).padStart(3)}  unfulfillable ${q.unfulfillableQuantity??0}  reserved ${q.reservedQuantity?.totalReservedQuantity??0}`);
}
console.log(`  ---- ${tot} total, ${sellable} FULFILLABLE across all four SKUs`);

console.log('\n=== 2. EVERY FEE TYPE AMAZON HAS EVER CHARGED US, by currency ===');
const seen={}, svc={}, adj={};
for(const [from,to] of [['2025-08-01','2026-01-25'],['2026-02-01','2026-07-25'],['2026-07-25','2026-08-21']]){
  let n,pages=0;
  do{
    const url=n? `${SP}/finances/v0/financialEvents?NextToken=${encodeURIComponent(n)}`
              : `${SP}/finances/v0/financialEvents?PostedAfter=${from}T00:00:00Z&PostedBefore=${to}T00:00:00Z&MaxResultsPerPage=100`;
    const res=await rq(url,{headers:H}); const j=await res.json();
    if(!res.ok){console.log(`  window ${from}: HTTP ${res.status}`);break;}
    const ev=j.payload?.FinancialEvents||{};
    for(const s of ev.ShipmentEventList||[]) for(const it of s.ShipmentItemList||[]){
      const cur=(it.ItemChargeList||[])[0]?.ChargeAmount?.CurrencyCode||'?';
      for(const f of it.ItemFeeList||[]){ const v=Number(f.FeeAmount?.CurrencyAmount||0); if(v===0) continue;
        seen[cur]=seen[cur]||{}; seen[cur][f.FeeType]=(seen[cur][f.FeeType]||0)+v; }
    }
    // non-shipment events are where a conversion fee would hide
    // Where a currency-conversion or disbursement fee would hide.
    for(const e of ev.ServiceFeeEventList||[]){
      for(const f of e.FeeList||[]){
        const cur=f.FeeAmount?.CurrencyCode||'?', v=Number(f.FeeAmount?.CurrencyAmount||0);
        svc[cur]=svc[cur]||{}; svc[cur][f.FeeType]=(svc[cur][f.FeeType]||0)+v;
      }
    }
    for(const e of ev.AdjustmentEventList||[]){
      const t=e.AdjustmentType||'?'; const cur=e.AdjustmentAmount?.CurrencyCode||'?';
      if(cur!=='USD'){ adj[`${cur}/${t}`]=(adj[`${cur}/${t}`]||0)+Number(e.AdjustmentAmount?.CurrencyAmount||0); }
    }
    n=j.payload?.NextToken; pages++; await sleep(1400);
  }while(n && pages<40);
}
for(const [cur,f] of Object.entries(seen)){
  if(cur==='_other') continue;
  console.log(`  ${cur}: ${Object.entries(f).map(([k,v])=>`${k} ${v.toFixed(2)}`).join(', ')}`);
}
console.log('\n  SERVICE FEES by currency (where a conversion fee would appear):');
for(const [cur,f] of Object.entries(svc)) console.log(`    ${cur}: ${Object.entries(f).map(([k,v])=>`${k} ${v.toFixed(2)}`).join(', ')}`);
console.log('\n  NON-USD ADJUSTMENTS:', JSON.stringify(adj));
