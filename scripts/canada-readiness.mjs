/** Is Canada actually ready to advertise into? Listings buyable, inventory present, ads profile live.
 *  Read-only. RUN: node scripts/canada-readiness.mjs */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const SP='https://sellingpartnerapi-na.amazon.com', SELLER='ACXMWZZUZKFVD';
const US='ATVPDKIKX0DER', CA='A2EUQ1WTGCTBG2';
const spTok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':spTok,'content-type':'application/json'};
const SKUS={'57-P4AJ-J4AC':'Single/Black','CPH-BLCK-2':'2-Pack','CPH-BLCK-3':'3-Pack','UG-SVG8-LB0P':'Pro'};

console.log('=== 1. MARKETPLACE PARTICIPATION ===');
const mp=await (await fetch(`${SP}/sellers/v1/marketplaceParticipations`,{headers:H})).json();
for(const p of (mp.payload||[])){
  const m=p.marketplace||{}, pt=p.participation||{};
  console.log(`  ${String(m.name).padEnd(14)} ${m.id}  ${m.countryCode}  selling=${pt.isParticipating}  suspended=${pt.hasSuspendedListings}`);
}

console.log('\n=== 2. LISTING STATUS IN CANADA ===');
for(const [sku,label] of Object.entries(SKUS)){
  const res=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${CA}&includedData=summaries,issues`,{headers:H});
  const j=await res.json();
  if(!res.ok){console.log(`  ${label.padEnd(12)} HTTP ${res.status} ${JSON.stringify(j).slice(0,90)}`);continue;}
  const s=(j.summaries||[])[0]||{};
  console.log(`  ${label.padEnd(12)} status=${(s.status||[]).join('/')||'none'}  asin=${s.asin||'-'}  issues=${(j.issues||[]).length}`);
  for(const i of (j.issues||[]).slice(0,3)) console.log(`      [${i.severity}] ${i.code}: ${(i.message||'').slice(0,80)}`);
}

console.log('\n=== 3. FBA INVENTORY, CANADA vs US ===');
for(const [mkt,lab] of [[CA,'CANADA'],[US,'US']]){
  const res=await fetch(`${SP}/fba/inventory/v1/summaries?details=true&granularityType=Marketplace&granularityId=${mkt}&marketplaceIds=${mkt}`,{headers:H});
  const j=await res.json();
  const inv=j.payload?.inventorySummaries||[];
  const tot=inv.reduce((a,x)=>a+(x.totalQuantity||0),0);
  console.log(`  ${lab}: ${inv.length} SKUs, ${tot} units total`);
  for(const x of inv.filter(z=>z.totalQuantity>0).slice(0,8))
    console.log(`      ${String(x.sellerSku).padEnd(16)} ${String(x.totalQuantity).padStart(5)} units  fulfillable=${x.inventoryDetails?.fulfillableQuantity??'-'}`);
}
