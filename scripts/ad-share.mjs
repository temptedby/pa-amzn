/** Ad sales as a % of OVERALL sales (units + $), over the last ~60 days where both
 *  ad-attributed data (Ads API, ~60-65d retention) and total orders (SP-API all-orders)
 *  are reachable. Then back-estimate lifetime total units from the known 8,926 lifetime
 *  ad-attributed units:  lifetime_total ≈ 8,926 / ad_unit_share.
 *  RUN: node scripts/ad-share.mjs */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const LIFETIME_AD_UNITS=8926; // William, from Campaign Manager lifetime
const A='https://advertising-api.amazon.com', SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER';

// ---- Ads API ----
const adTok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const AH=ct=>({Authorization:`Bearer ${adTok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
async function adReport(sd,ed){
  const cfg={name:'share',startDate:sd,endDate:ed,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['campaign'],columns:['cost','sales14d','purchases14d','unitsSoldClicks14d','campaignId'],reportTypeId:'spCampaigns',timeUnit:'SUMMARY',format:'GZIP_JSON'}};
  const cr=await fetch(`${A}/reporting/reports`,{method:'POST',headers:AH('application/vnd.createasyncreportrequest.v3+json'),body:JSON.stringify(cfg)}).then(r=>r.json());
  let rid=cr.reportId; if(!rid&&cr.code==='425'){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/);if(m)rid=m[1];}
  if(!rid){console.log('  ad create failed',JSON.stringify(cr).slice(0,160));return null;}
  let url;for(let i=0;i<80;i++){await sleep(9000);const s=await fetch(`${A}/reporting/reports/${rid}`,{headers:AH('application/vnd.createasyncreportrequest.v3+json')}).then(r=>r.json());if(s.status==='COMPLETED'){url=s.url;break;}if(s.status==='FAILURE'){console.log('  ad FAILURE',JSON.stringify(s).slice(0,160));return null;}}
  if(!url)return null;
  const rows=JSON.parse(gunzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).toString());
  let units=0,sales=0,ord=0,cost=0;for(const r of rows){units+=r.unitsSoldClicks14d||0;sales+=r.sales14d||0;ord+=r.purchases14d||0;cost+=r.cost||0;}
  return {units,sales,ord,cost};
}

// ---- SP-API all-orders (total) ----
const spTok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const sp=async(p,init)=>{const r=await fetch(`${SP}${p}`,{...init,headers:{'x-amz-access-token':spTok,'content-type':'application/json',...(init?.headers||{})}});const t=await r.text();return{ok:r.ok,status:r.status,json:t?JSON.parse(t):null,text:t};};
async function totalOrders(sdISO,edISO){
  let cr;for(let a=0;a<6;a++){cr=await sp('/reports/2021-06-30/reports',{method:'POST',body:JSON.stringify({reportType:'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',marketplaceIds:[MKT],dataStartTime:sdISO,dataEndTime:edISO})});if(cr.status===429){await sleep(61000);continue;}break;}
  if(!cr.ok){console.log('  order create failed',cr.status);return null;}
  let docId,status;for(let i=0;i<48;i++){await sleep(5000);const st=await sp(`/reports/2021-06-30/reports/${cr.json.reportId}`);status=st.json?.processingStatus;if(status==='DONE'){docId=st.json.reportDocumentId;break;}if(/FATAL|CANCELLED/.test(status))return null;}
  if(!docId)return null;
  const doc=await sp(`/reports/2021-06-30/documents/${docId}`);
  const buf=Buffer.from(await (await fetch(doc.json.url)).arrayBuffer());
  const txt=doc.json.compressionAlgorithm==='GZIP'?gunzipSync(buf).toString():buf.toString();
  const lines=txt.split('\n').filter(Boolean);if(lines.length<2)return{units:0,sales:0};
  const h=lines[0].split('\t');const qi=h.indexOf('quantity'),pi=h.indexOf('item-price'),si=h.indexOf('item-status');
  let units=0,sales=0;for(const l of lines.slice(1)){const c=l.split('\t');if((c[si]||'').toLowerCase().includes('cancel'))continue;units+=parseInt(c[qi]||'0',10)||0;sales+=parseFloat(c[pi]||'0')||0;}
  return {units,sales};
}

// last ~60 days in two 30-day chunks (ad data retained ~60-65d)
const D=864e5, base=Date.now()-2*D;
const chunks=[[new Date(base-60*D),new Date(base-30*D)],[new Date(base-30*D),new Date(base)]];
let adU=0,adS=0,adO=0,adC=0,toU=0,toS=0;
for(const [s,e] of chunks){
  const sd=s.toISOString().slice(0,10), ed=e.toISOString().slice(0,10);
  console.log(`window ${sd}..${ed}`);
  const ad=await adReport(sd,ed);
  const tot=await totalOrders(s.toISOString(),e.toISOString());
  if(ad){adU+=ad.units;adS+=ad.sales;adO+=ad.ord;adC+=ad.cost;console.log(`  ad: ${ad.units} units, $${ad.sales.toFixed(2)} sales, ${ad.ord} orders, $${ad.cost.toFixed(2)} spend`);}
  if(tot){toU+=tot.units;toS+=tot.sales;console.log(`  total: ${tot.units} units, $${tot.sales.toFixed(2)} sales`);}
}
const uShare=toU?adU/toU:0, sShare=toS?adS/toS:0;
console.log(`\n=== AD SHARE (last ~60 days) ===`);
console.log(`ad units / total units:  ${adU} / ${toU} = ${(uShare*100).toFixed(1)}%`);
console.log(`ad $ / total $:          $${adS.toFixed(2)} / $${toS.toFixed(2)} = ${(sShare*100).toFixed(1)}%`);
console.log(`ad spend (ACOS proxy):   $${adC.toFixed(2)} -> ACOS ${adS?(adC/adS*100).toFixed(0):'?'}% on ad sales`);
console.log(`\n=== LIFETIME BACK-ESTIMATE (8,926 lifetime ad units / ad-unit-share) ===`);
if(uShare>0){
  console.log(`at ${(uShare*100).toFixed(1)}% ad share  -> ${Math.round(LIFETIME_AD_UNITS/uShare).toLocaleString()} total units`);
  for(const p of [0.40,0.45,0.50,0.55,0.60]) console.log(`  sensitivity @ ${(p*100)}% -> ${Math.round(LIFETIME_AD_UNITS/p).toLocaleString()}`);
}
console.log(`\nCaveat: 60-day window during a low-visibility stretch; the 2-yr average ad-share is the better divisor (pull Campaign Manager lifetime monthly ad units vs order-report totals).`);
