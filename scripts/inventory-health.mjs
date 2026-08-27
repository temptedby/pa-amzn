/** READ-ONLY. FBA inventory on hand, US pool, ALL PAGES. */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
let next=null, all=[], pages=0;
do{
  const u=`${SP}/fba/inventory/v1/summaries?details=true&granularityType=Marketplace&granularityId=${MKT}&marketplaceIds=${MKT}`+(next?`&nextToken=${encodeURIComponent(next)}`:'');
  const j=await (await fetch(u,{headers:{'x-amz-access-token':tok}})).json();
  all.push(...(j.payload?.inventorySummaries||[]));
  next=j.pagination?.nextToken||null; pages++;
  if(next) await sleep(2200);
}while(next && pages<40);
console.log('pages',pages,'skus returned',all.length);
let f=0,t=0,res=0,unf=0;
console.log('\nsku'.padEnd(25),'asin'.padEnd(12),'sellable  reserved  unfulfl   total');
for(const s of all.filter(s=>(s.totalQuantity||0)>0).sort((a,b)=>b.totalQuantity-a.totalQuantity)){
  const d=s.inventoryDetails||{};
  f+=d.fulfillableQuantity||0; t+=s.totalQuantity||0;
  res+=d.reservedQuantity?.totalReservedQuantity||0; unf+=d.unfulfillableQuantity?.totalUnfulfillableQuantity||0;
  console.log(String(s.sellerSku).padEnd(25),String(s.asin).padEnd(12),
    String(d.fulfillableQuantity??0).padStart(8),String(d.reservedQuantity?.totalReservedQuantity??0).padStart(10),
    String(d.unfulfillableQuantity?.totalUnfulfillableQuantity??0).padStart(8),String(s.totalQuantity||0).padStart(8));
}
console.log(`\nSELLABLE ${f}   RESERVED ${res}   UNFULFILLABLE ${unf}   TOTAL ${t}`);
