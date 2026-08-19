/** TACOS vs ACOS, day by day: ad spend and ad sales against TOTAL product sales.
 *  Read-only. Pulls SP + SD (v3 daily), SB (v2 HSA, one call per day) and the all-orders report.
 *  Ad sales are credited to the CLICK date and total sales to the ORDER date, so the daily organic
 *  column swings; the month-level figure is the sound one.
 *  RUN: node scripts/tacos.mjs */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const envtxt=readFileSync('.env.local','utf8');
for(const l of envtxt.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const A='https://advertising-api.amazon.com', SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const START='2026-08-01', END='2026-08-19';

const adTok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const AH=ct=>({Authorization:`Bearer ${adTok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
const V3='application/vnd.createasyncreportrequest.v3+json';

async function v3(label,cfg){
  let cr=await (await fetch(`${A}/reporting/reports`,{method:'POST',headers:AH(V3),body:JSON.stringify(cfg)})).json();
  let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
  if(!rid){console.error(label,'create failed',JSON.stringify(cr).slice(0,200));return [];}
  for(let i=0;i<200;i++){ await sleep(10000);
    const s=await (await fetch(`${A}/reporting/reports/${rid}`,{headers:AH(V3)})).json();
    if(s.status==='COMPLETED'){ const b=Buffer.from(await (await fetch(s.url)).arrayBuffer()); console.error(label,'ok'); return JSON.parse(gunzipSync(b).toString()); }
    if(s.status==='FAILURE'){ console.error(label,'FAILURE'); return []; } }
  console.error(label,'timeout'); return [];
}
async function sbDay(day){
  const H={Authorization:`Bearer ${adTok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json'};
  const cr=await fetch(`${A}/v2/hsa/campaigns/report`,{method:'POST',headers:H,body:JSON.stringify({reportDate:day.replace(/-/g,''),metrics:'campaignId,campaignName,impressions,clicks,cost,attributedSales14d,attributedConversions14d'})});
  if(!cr.ok) return null;
  const {reportId}=await cr.json(); if(!reportId) return null;
  for(let i=0;i<45;i++){ await sleep(6000);
    const st=await (await fetch(`${A}/v2/reports/${reportId}`,{headers:H})).json().catch(()=>({}));
    if(st.status==='FAILURE') return null;
    if(st.status!=='SUCCESS') continue;
    const dl=await fetch(`${A}/v2/reports/${reportId}/download`,{headers:H,redirect:'follow'});
    const b=Buffer.from(await dl.arrayBuffer());
    let t; try{t=gunzipSync(b).toString();}catch{t=b.toString();}
    return JSON.parse(t);
  }
  return null;
}
// --- SP-API all-orders for true product sales ---
const spTok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const spf=async(p,init)=>{const r=await fetch(`${SP}${p}`,{...init,headers:{'x-amz-access-token':spTok,'content-type':'application/json',...(init?.headers||{})}});const t=await r.text();return{ok:r.ok,status:r.status,json:t?JSON.parse(t):null,text:t};};
async function allOrders(){
  const body={reportType:'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',marketplaceIds:[MKT],dataStartTime:'2026-07-31T00:00:00Z',dataEndTime:'2026-08-20T00:00:00Z'};
  const cr=await spf('/reports/2021-06-30/reports',{method:'POST',body:JSON.stringify(body)});
  if(!cr.ok){console.error('orders create',cr.status,cr.text.slice(0,150));return null;}
  const rid=cr.json.reportId; let docId,status;
  for(let i=0;i<80;i++){await sleep(6000);const st=await spf(`/reports/2021-06-30/reports/${rid}`);status=st.json?.processingStatus;if(status==='DONE'){docId=st.json.reportDocumentId;break;}if(status==='FATAL'||status==='CANCELLED'){console.error('orders',status);return null;}}
  if(!docId){console.error('orders timeout',status);return null;}
  const doc=await spf(`/reports/2021-06-30/documents/${docId}`);
  const buf=Buffer.from(await (await fetch(doc.json.url)).arrayBuffer());
  const txt=doc.json.compressionAlgorithm==='GZIP'?gunzipSync(buf).toString():buf.toString();
  console.error('orders ok');
  return txt;
}

const days=[]; for(let d=new Date(START+'T12:00:00Z'); d<=new Date(END+'T12:00:00Z'); d=new Date(d.getTime()+864e5)) days.push(d.toISOString().slice(0,10));

const [spRows, sdRows, ordersTxt, ...sbAll] = await Promise.all([
  v3('SP',{name:`tacos-sp-${Date.now()}`,startDate:START,endDate:END,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['campaign'],columns:['date','cost','sales14d','purchases14d','clicks','impressions'],reportTypeId:'spCampaigns',timeUnit:'DAILY',format:'GZIP_JSON'}}),
  v3('SD',{name:`tacos-sd-${Date.now()}`,startDate:START,endDate:END,configuration:{adProduct:'SPONSORED_DISPLAY',groupBy:['campaign'],columns:['date','cost','sales','purchases','clicks','impressions'],reportTypeId:'sdCampaigns',timeUnit:'DAILY',format:'GZIP_JSON'}}),
  allOrders(),
  ...days.map(d=>sbDay(d).then(r=>({day:d,rows:r})).catch(()=>({day:d,rows:null}))),
]);

const agg={};
const touch=d=>agg[d]??={spC:0,spS:0,sbC:0,sbS:0,sdC:0,sdS:0,rev:0,units:0,cl:0,im:0};
for(const r of spRows){const d=r.date;touch(d);agg[d].spC+=r.cost||0;agg[d].spS+=r.sales14d||0;agg[d].cl+=r.clicks||0;agg[d].im+=r.impressions||0;}
for(const r of sdRows){const d=r.date;touch(d);agg[d].sdC+=r.cost||0;agg[d].sdS+=r.sales||0;agg[d].cl+=r.clicks||0;agg[d].im+=r.impressions||0;}
const sbMissing=[];
for(const s of sbAll){ if(!s.rows){sbMissing.push(s.day);continue;} touch(s.day);
  for(const r of s.rows){agg[s.day].sbC+=r.cost||0;agg[s.day].sbS+=r.attributedSales14d||0;} }

if(ordersTxt){
  const lines=ordersTxt.split('\n').filter(Boolean); const hdr=lines[0].split('\t');
  const di=hdr.indexOf('purchase-date'), qi=hdr.indexOf('quantity'), pi=hdr.indexOf('item-price'), si=hdr.findIndex(h=>/item-status|order-status/.test(h));
  for(const l of lines.slice(1)){const c=l.split('\t');
    if((c[si]||'').toLowerCase().includes('cancel'))continue;
    const raw=c[di]||''; if(!raw)continue;
    const day=new Date(new Date(raw).getTime()-7*3600e3).toISOString().slice(0,10);  // Pacific
    touch(day); agg[day].rev+=parseFloat(c[pi]||'0')||0; agg[day].units+=parseInt(c[qi]||'0',10)||0;}
}
if(sbMissing.length) console.log('SB days not returned:',sbMissing.join(', '));
console.log('\nday          ad spend   ad sales   ACOS    total sales  units   TACOS   organic $   org %');
let T={c:0,s:0,r:0,u:0};
for(const d of Object.keys(agg).sort()){
  if(d<START||d>END) continue;
  const a=agg[d]; const c=a.spC+a.sbC+a.sdC, s=a.spS+a.sbS+a.sdS;
  T.c+=c;T.s+=s;T.r+=a.rev;T.u+=a.units;
  const acos=s>0?(c/s*100).toFixed(0)+'%':'  -  ';
  const tacos=a.rev>0?(c/a.rev*100).toFixed(0)+'%':'  -  ';
  const org=a.rev-s;
  console.log(d, ('$'+c.toFixed(2)).padStart(10), ('$'+s.toFixed(2)).padStart(10), String(acos).padStart(6), ('$'+a.rev.toFixed(2)).padStart(12), String(a.units).padStart(5), String(tacos).padStart(7), ('$'+org.toFixed(2)).padStart(11), (a.rev>0?(org/a.rev*100).toFixed(0)+'%':'-').padStart(6));
}
console.log('\nMONTH        ad spend $'+T.c.toFixed(2)+'   ad sales $'+T.s.toFixed(2)+'   ACOS '+(T.c/T.s*100).toFixed(0)+'%   total sales $'+T.r.toFixed(2)+'   units '+T.u+'   TACOS '+(T.c/T.r*100).toFixed(0)+'%   organic $'+(T.r-T.s).toFixed(2)+' ('+((T.r-T.s)/T.r*100).toFixed(0)+'%)');
