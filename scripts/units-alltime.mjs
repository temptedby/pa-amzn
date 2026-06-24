/** Discover real ALL-TIME units sold from Amazon (SP-API Sales & Traffic report, ~2yr window).
 *  Sums unitsOrdered across the available history. RUN: node scripts/units-alltime.mjs */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const sp=async(p,init)=>{const r=await fetch(`${SP}${p}`,{...init,headers:{'x-amz-access-token':tok,'content-type':'application/json',...(init?.headers||{})}});const t=await r.text();return{ok:r.ok,status:r.status,json:t?JSON.parse(t):null,text:t};};

const iso=d=>d.toISOString().slice(0,10)+'T00:00:00Z';
// Sales & Traffic report data is generally available ~2 years back. Chunk into 1-year windows to be safe.
const windows=[[new Date(Date.now()-730*864e5),new Date(Date.now()-365*864e5)],[new Date(Date.now()-365*864e5),new Date()]];
let grandUnits=0, grandSales=0, minD=null, maxD=null;
const byAsin={};
for(const [s,e] of windows){
  const body={reportType:'GET_SALES_AND_TRAFFIC_REPORT',marketplaceIds:[MKT],dataStartTime:iso(s),dataEndTime:iso(e),reportOptions:{dateGranularity:'DAY',asinGranularity:'PARENT'}};
  const cr=await sp('/reports/2021-06-30/reports',{method:'POST',body:JSON.stringify(body)});
  if(!cr.ok){console.log(`window ${iso(s)}..${iso(e)} create failed: ${cr.status} ${cr.text.slice(0,160)}`);continue;}
  const rid=cr.json.reportId; let docId, status;
  for(let i=0;i<40;i++){await sleep(5000);const st=await sp(`/reports/2021-06-30/reports/${rid}`);status=st.json?.processingStatus;if(status==='DONE'){docId=st.json.reportDocumentId;break;}if(status==='FATAL'||status==='CANCELLED'){break;}}
  if(!docId){console.log(`window ${iso(s)}..${iso(e)}: report ${status||'timeout'}`);continue;}
  const doc=await sp(`/reports/2021-06-30/documents/${docId}`);
  const dl=await fetch(doc.json.url); const buf=Buffer.from(await dl.arrayBuffer());
  const raw=doc.json.compressionAlgorithm==='GZIP'?gunzipSync(buf).toString():buf.toString();
  const j=JSON.parse(raw);
  let wU=0,wS=0;
  for(const d of (j.salesAndTrafficByDate||[])){const u=d.salesByDate?.unitsOrdered||0;wU+=u;wS+=d.salesByDate?.orderedProductSales?.amount||0;const day=d.date;if(u>0){if(!minD||day<minD)minD=day;if(!maxD||day>maxD)maxD=day;}}
  for(const a of (j.salesAndTrafficByAsin||[])){const k=a.parentAsin||a.childAsin||a.sku||'?';byAsin[k]=(byAsin[k]||0)+(a.salesByAsin?.unitsOrdered||0);}
  grandUnits+=wU; grandSales+=wS;
  console.log(`window ${iso(s).slice(0,10)}..${iso(e).slice(0,10)}: ${wU} units, $${wS.toFixed(2)} sales`);
}
console.log(`\n=== ALL-TIME (last ~2 years, the Sales & Traffic retention window) ===`);
console.log(`UNITS ORDERED: ${grandUnits}`);
console.log(`ORDERED PRODUCT SALES: $${grandSales.toFixed(2)}`);
console.log(`data covers first→last day with sales: ${minD} → ${maxD}`);
console.log('by parent ASIN:'); Object.entries(byAsin).sort((a,b)=>b[1]-a[1]).forEach(([a,u])=>console.log(`  ${a}: ${u}`));
console.log('\nNote: SP-API Sales & Traffic retains ~2 years; units before that are not in this pull.');
