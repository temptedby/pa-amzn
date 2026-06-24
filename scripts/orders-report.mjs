/** All-time units via the All-Orders flat-file report (sums the quantity column). RUN: node scripts/orders-report.mjs */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const sp=async(p,init)=>{const r=await fetch(`${SP}${p}`,{...init,headers:{'x-amz-access-token':tok,'content-type':'application/json',...(init?.headers||{})}});const t=await r.text();return{ok:r.ok,status:r.status,json:t?JSON.parse(t):null,text:t};};
const iso=d=>d.toISOString();

async function pull(type, sd, ed){
  const body={reportType:type,marketplaceIds:[MKT],dataStartTime:iso(sd),dataEndTime:iso(ed)};
  const cr=await sp('/reports/2021-06-30/reports',{method:'POST',body:JSON.stringify(body)});
  if(!cr.ok){return {err:`${cr.status} ${cr.text.slice(0,120)}`};}
  const rid=cr.json.reportId; let docId, status;
  for(let i=0;i<48;i++){await sleep(5000);const st=await sp(`/reports/2021-06-30/reports/${rid}`);status=st.json?.processingStatus;if(status==='DONE'){docId=st.json.reportDocumentId;break;}if(status==='FATAL'||status==='CANCELLED')return {err:status};}
  if(!docId)return {err:status||'timeout'};
  const doc=await sp(`/reports/2021-06-30/documents/${docId}`);
  const buf=Buffer.from(await (await fetch(doc.json.url)).arrayBuffer());
  const txt=doc.json.compressionAlgorithm==='GZIP'?gunzipSync(buf).toString():buf.toString();
  return {txt};
}

const end=new Date(), start=new Date(Date.now()-735*864e5);
console.log('trying GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', iso(start).slice(0,10),'..',iso(end).slice(0,10));
let res=await pull('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', start, end);
if(res.err){console.log('order-date report:',res.err,'\n-> trying GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL');res=await pull('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL', start, end);}
if(res.err){console.log('report failed:',res.err);process.exit(0);}

const lines=res.txt.split('\n').filter(Boolean);
const hdr=lines[0].split('\t');
const qi=hdr.indexOf('quantity'), si=hdr.findIndex(h=>/item-status|order-status/.test(h)), di=hdr.indexOf('purchase-date');
let units=0, orders=new Set(), minD='9', maxD='0';
const oi=hdr.indexOf('amazon-order-id');
for(const l of lines.slice(1)){const c=l.split('\t');const q=parseInt(c[qi]||'0',10)||0;const stat=(c[si]||'').toLowerCase();if(stat.includes('cancel'))continue;units+=q;if(oi>=0)orders.add(c[oi]);const d=(c[di]||'').slice(0,10);if(d){if(d<minD)minD=d;if(d>maxD)maxD=d;}}
console.log(`\n=== ALL-ORDERS report (${lines.length-1} rows) ===`);
console.log(`UNITS (sum quantity, ex-cancelled): ${units}`);
console.log(`distinct orders: ${orders.size}`);
console.log(`date range in data: ${minD} .. ${maxD}`);
