/** Sales-drop / 220%-ACOS diagnostic — real data, no assumptions.
 *  (1) This-month ad conversion (ACOS, CVR, clicks vs orders)
 *  (2) FBA stock per ASIN (out-of-stock => ads can't convert)
 *  (3) Featured Offer / Buy Box per ASIN (suppressed or lost => ads can't convert)
 *  RUN: node scripts/diagnose.mjs */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const iso=d=>d.toISOString().slice(0,10);
const MKT='ATVPDKIKX0DER';
const OURS={B07Y5GZP1T:'Single',B097MGPCPC:'2-Pack',B0CFYVNBJX:'Pro',B097MHPL12:'3-Pack'};

// ---------- SP-API ----------
const SP='https://sellingpartnerapi-na.amazon.com';
const spTok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const sp=async(path)=>{const r=await fetch(`${SP}${path}`,{headers:{'x-amz-access-token':spTok,'content-type':'application/json'}});const t=await r.text();return{ok:r.ok,status:r.status,json:t?JSON.parse(t):null};};

console.log('===== (2) FBA INVENTORY (fulfillable stock) =====');
const inv=await sp(`/fba/inventory/v1/summaries?details=true&granularityType=Marketplace&granularityId=${MKT}&marketplaceIds=${MKT}`);
const stock={};
if(inv.ok){for(const s of (inv.json?.payload?.inventorySummaries||[])){stock[s.asin]={sku:s.sellerSku,total:s.totalQuantity,fulfillable:s.inventoryDetails?.fulfillableQuantity??s.totalQuantity,inbound:(s.inventoryDetails?.inboundShippedQuantity||0)+(s.inventoryDetails?.inboundWorkingQuantity||0)};}}
else console.log('  inventory error',inv.status, JSON.stringify(inv.json).slice(0,200));
for(const [a,l] of Object.entries(OURS)){const s=stock[a];console.log(`  ${l.padEnd(8)} ${a}  fulfillable=${s?s.fulfillable:'—(no FBA summary)'}  ${s?`total=${s.total} inbound=${s.inbound} sku=${s.sku}`:''}`);}

console.log('\n===== (3) FEATURED OFFER / BUY BOX per ASIN =====');
for(const [a,l] of Object.entries(OURS)){
  const r=await sp(`/products/pricing/v0/items/${a}/offers?MarketplaceId=${MKT}&ItemCondition=New`);
  if(!r.ok){console.log(`  ${l.padEnd(8)} ${a}  offers error ${r.status} ${JSON.stringify(r.json).slice(0,120)}`);await sleep(2200);continue;}
  const p=r.json?.payload||{};const sum=p.Summary||{};
  const offers=p.Offers||[];
  const bb=offers.find(o=>o.IsBuyBoxWinner);
  const bbPrice=(sum.BuyBoxPrices||[]).map(x=>`$${x.ListingPrice?.Amount}`).join(',')||'—';
  console.log(`  ${l.padEnd(8)} ${a}  offers=${sum.TotalOfferCount??offers.length}  buyBoxPrice=${bbPrice}  buyBoxEligible=${(sum.BuyBoxEligibleOffers||[]).map(x=>x.OfferCount).reduce((x,y)=>x+y,0)||'0'}`);
  if(bb) console.log(`           buyBoxWinner: seller=${bb.SellerId} FBA=${bb.IsFulfilledByAmazon} price=$${bb.ListingPrice?.Amount} +ship $${bb.Shipping?.Amount||0}`);
  else console.log(`           buyBoxWinner: NONE (Buy Box suppressed — no Featured Offer)`);
  await sleep(2200);
}

// ---------- ADS this month ----------
console.log('\n===== (1) ADS THIS MONTH (conversion) =====');
const A='https://advertising-api.amazon.com';
const aTok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const aH=ct=>({Authorization:`Bearer ${aTok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
const start=iso(new Date(Date.UTC(2026,5,1)));const end=iso(new Date());
const cfg={name:'diag',startDate:start,endDate:end,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['campaign'],columns:['impressions','clicks','cost','sales14d','purchases14d','campaignName'],reportTypeId:'spCampaigns',timeUnit:'SUMMARY',format:'GZIP_JSON'}};
const cr=await fetch(`${A}/reporting/reports`,{method:'POST',headers:aH('application/vnd.createasyncreportrequest.v3+json'),body:JSON.stringify(cfg)}).then(r=>r.json());
let rid=cr.reportId; if(!rid&&cr.code==='425'){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/);if(m)rid=m[1];}
if(!rid){console.log('ads report create failed',JSON.stringify(cr));}
else{
  let url;for(let i=0;i<60;i++){await sleep(9000);const s=await fetch(`${A}/reporting/reports/${rid}`,{headers:aH('application/vnd.createasyncreportrequest.v3+json')}).then(r=>r.json());if(s.status==='COMPLETED'){url=s.url;break;}if(s.status==='FAILURE'){console.log('ads report FAILURE');break;}}
  if(url){
    const rows=JSON.parse(gunzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).toString());
    let C=0,K=0,S=0,O=0;for(const r of rows){C+=r.cost||0;K+=r.clicks||0;S+=r.sales14d||0;O+=r.purchases14d||0;}
    console.log(`  period ${start}..${end}`);
    console.log(`  spend=$${C.toFixed(2)}  sales=$${S.toFixed(2)}  clicks=${K}  orders=${O}`);
    console.log(`  ACOS=${S>0?(C/S*100).toFixed(0)+'%':'∞ (no sales)'}   CVR=${K>0?(O/K*100).toFixed(2)+'%':'—'}   CPC=$${K>0?(C/K).toFixed(2):'—'}`);
    const worst=rows.filter(r=>r.cost>0).sort((a,b)=>b.cost-a.cost).slice(0,8);
    console.log('  top spend campaigns:');worst.forEach(r=>console.log(`    $${(r.cost||0).toFixed(2)} spend / ${r.purchases14d||0} orders / ${r.clicks||0} clk  ${(r.campaignName||'').slice(0,42)}`));
  }
}
console.log('\nDONE.');
