/** BACOS / TACOS vs ACOS, day by day: ad spend and ad sales against TOTAL product sales.
 *  Read-only. Pulls SP + SD (v3 daily), SB (v2 HSA, one call per day) and the all-orders report.
 *
 *  BACOS (blended ACOS) = ad spend / TOTAL revenue. William's goal, 2026-10-07: keep it under 40%.
 *  Break-even is the contribution margin, 37.4% before refunds and 33.7% after, so 40% is a hair
 *  past break-even rather than profitable. The target is printed alongside the measured figure.
 *
 *  Ad sales are credited to the CLICK date and total sales to the ORDER date, so the daily organic
 *  column swings; the month-level figure is the sound one.
 *
 *  WINDOWS (2026-10-07): every upstream report has a hard cap and EXCEEDS IT SILENTLY. The Ads v3
 *  reports cap at 31 days; the all-orders report caps at 30 and answers an over-long request with
 *  processingStatus DONE and the error as its only line. The old default here was 2026-08-01 to
 *  yesterday, i.e. 67 days, so SP, SD and orders all came back empty while SB (fetched a day at a
 *  time) survived -- and the script still printed a month total. It reported "ad spend $95.65,
 *  total sales $0.00, TACOS Infinity%" when October's SP spend alone was $288.85.
 *  Both sides are now CHUNKED under their caps, and a failed source is fatal to the total rather
 *  than invisible in it. "Not found" is a violation, never a pass.
 *  RUN: node scripts/tacos.mjs [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--target=0.40] */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const envtxt=readFileSync(new URL('../.env.local',import.meta.url),'utf8');
for(const l of envtxt.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const A='https://advertising-api.amazon.com', SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const arg=n=>(process.argv.find(a=>a.startsWith('--'+n+'='))||'').split('=')[1];
// Default to the CURRENT month, which is both what we want and safely inside every cap.
const today=new Date(Date.now()-864e5).toISOString().slice(0,10);
const START=arg('start')||today.slice(0,7)+'-01', END=arg('end')||today;
const TARGET=parseFloat(arg('target')||'0.40');
const MARGIN=3.55/9.49, REFUND=0.099;

const ADS_MAX_DAYS=31, ORDERS_MAX_DAYS=30;
const dnum=s=>new Date(s+'T12:00:00Z').getTime();
const diso=t=>new Date(t).toISOString().slice(0,10);
/** Inclusive [start,end] split into chunks of at most maxDays days. */
function chunks(start,end,maxDays){
  const out=[]; let s=dnum(start); const e=dnum(end);
  if(e<s) return out;
  while(s<=e){ const stop=Math.min(e, s+(maxDays-1)*864e5); out.push([diso(s),diso(stop)]); s=stop+864e5; }
  return out;
}
const ERRORS=[];   // any source that did not answer. Non-empty => no month total is printed.

const adTok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const AH=ct=>({Authorization:`Bearer ${adTok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
const V3='application/vnd.createasyncreportrequest.v3+json';

/** One v3 report for ONE window. Throws rather than returning [] so a failure cannot vanish. */
async function v3once(label,cfg){
  let cr=await (await fetch(`${A}/reporting/reports`,{method:'POST',headers:AH(V3),body:JSON.stringify(cfg)})).json();
  let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
  if(!rid) throw new Error(`${label} create failed: ${JSON.stringify(cr).slice(0,200)}`);
  for(let i=0;i<200;i++){ await sleep(10000);
    const s=await (await fetch(`${A}/reporting/reports/${rid}`,{headers:AH(V3)})).json();
    if(s.status==='COMPLETED'){ const b=Buffer.from(await (await fetch(s.url)).arrayBuffer()); return JSON.parse(gunzipSync(b).toString()); }
    if(s.status==='FAILURE') throw new Error(`${label} FAILURE: ${JSON.stringify(s.failureReason||s).slice(0,200)}`); }
  throw new Error(`${label} timed out in the report queue`);
}
/** Chunked v3: every window must answer, or the source is marked unread. */
async function v3(label,build){
  const ws=chunks(START,END,ADS_MAX_DAYS);
  const all=[];
  for(const [a,b] of ws){
    try{ const rows=await v3once(`${label} ${a}..${b}`,build(a,b)); all.push(...rows); console.error(`  ${label} ${a}..${b} ok (${rows.length} rows)`); }
    catch(e){ ERRORS.push(e.message); console.error(`  ${label} ${a}..${b} FAILED: ${e.message}`); }
  }
  return all;
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
/** One all-orders report for ONE window, under the 30-day cap. Returns the TSV text. */
async function ordersOnce(a,b){
  const body={reportType:'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',marketplaceIds:[MKT],
    dataStartTime:a+'T00:00:00Z', dataEndTime:new Date(dnum(b)+864e5-12*3600e3).toISOString()};
  const cr=await spf('/reports/2021-06-30/reports',{method:'POST',body:JSON.stringify(body)});
  if(!cr.ok) throw new Error(`orders create ${cr.status}: ${cr.text.slice(0,150)}`);
  const rid=cr.json.reportId; let docId,status;
  for(let i=0;i<80;i++){await sleep(6000);const st=await spf(`/reports/2021-06-30/reports/${rid}`);status=st.json?.processingStatus;
    if(status==='DONE'){docId=st.json.reportDocumentId;break;}
    if(status==='FATAL'||status==='CANCELLED') throw new Error(`orders ${status}`);}
  if(!docId) throw new Error(`orders timed out (last status ${status})`);
  const doc=await spf(`/reports/2021-06-30/documents/${docId}`);
  const buf=Buffer.from(await (await fetch(doc.json.url)).arrayBuffer());
  const txt=doc.json.compressionAlgorithm==='GZIP'?gunzipSync(buf).toString():buf.toString();
  // An over-long window answers DONE with the error as its ONLY line. Catch that explicitly.
  if(/Date range exceeded/i.test(txt)) throw new Error(`orders window ${a}..${b} rejected: ${txt.trim().slice(0,120)}`);
  return txt;
}
/** Chunked all-orders. Each chunk keeps its own header, so rows are parsed per chunk. */
async function allOrders(){
  const out=[];
  for(const [a,b] of chunks(START,END,ORDERS_MAX_DAYS)){
    try{ const t=await ordersOnce(a,b); out.push(t); console.error(`  orders ${a}..${b} ok`); }
    catch(e){ ERRORS.push(e.message); console.error(`  orders ${a}..${b} FAILED: ${e.message}`); }
  }
  return out;
}

const days=[]; for(let d=new Date(START+'T12:00:00Z'); d<=new Date(END+'T12:00:00Z'); d=new Date(d.getTime()+864e5)) days.push(d.toISOString().slice(0,10));
console.error(`window ${START}..${END} (${days.length} days)  ads chunks ${chunks(START,END,ADS_MAX_DAYS).length}  orders chunks ${chunks(START,END,ORDERS_MAX_DAYS).length}`);

const [spRows, sdRows, ordersTexts, ...sbAll] = await Promise.all([
  v3('SP',(a,b)=>({name:`tacos-sp-${a}-${b}`,startDate:a,endDate:b,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['campaign'],columns:['date','cost','sales14d','purchases14d','clicks','impressions'],reportTypeId:'spCampaigns',timeUnit:'DAILY',format:'GZIP_JSON'}})),
  v3('SD',(a,b)=>({name:`tacos-sd-${a}-${b}`,startDate:a,endDate:b,configuration:{adProduct:'SPONSORED_DISPLAY',groupBy:['campaign'],columns:['date','cost','sales','purchases','clicks','impressions'],reportTypeId:'sdCampaigns',timeUnit:'DAILY',format:'GZIP_JSON'}})),
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

let orderRows=0;
for(const ordersTxt of ordersTexts){
  const lines=ordersTxt.split('\n').filter(Boolean); if(lines.length<2) continue;
  const hdr=lines[0].split('\t');
  const di=hdr.indexOf('purchase-date'), qi=hdr.indexOf('quantity'), pi=hdr.indexOf('item-price'),
        si=hdr.findIndex(h=>/item-status|order-status/.test(h)), ci=hdr.indexOf('sales-channel');
  if(di<0||pi<0){ ERRORS.push(`orders chunk missing columns: ${hdr.join('|').slice(0,160)}`); continue; }
  for(const l of lines.slice(1)){const c=l.split('\t');
    // The all-orders report ignores the marketplace filter, so the channel is read, not requested.
    if(ci>=0 && c[ci] && !/amazon\.com/i.test(c[ci])) continue;
    if((c[si]||'').toLowerCase().includes('cancel'))continue;
    const raw=c[di]||''; if(!raw)continue;
    const day=new Date(new Date(raw).getTime()-7*3600e3).toISOString().slice(0,10);  // purchase-date is UTC; Amazon's day is Pacific
    touch(day); agg[day].rev+=parseFloat(c[pi]||'0')||0; agg[day].units+=parseInt(c[qi]||'0',10)||0; orderRows++;}
}
if(sbMissing.length) console.log('SB days not returned:',sbMissing.join(', '));
console.log('\nday          ad spend   ad sales   ACOS    total sales  units   BACOS   organic $   org %');
let T={c:0,s:0,r:0,u:0};
for(const d of Object.keys(agg).sort()){
  if(d<START||d>END) continue;
  const a=agg[d]; const c=a.spC+a.sbC+a.sdC, s=a.spS+a.sbS+a.sdS;
  T.c+=c;T.s+=s;T.r+=a.rev;T.u+=a.units;
  const acos=s>0?(c/s*100).toFixed(0)+'%':'  -  ';
  const bacos=a.rev>0?(c/a.rev*100).toFixed(0)+'%':'  -  ';
  const org=a.rev-s;
  console.log(d, ('$'+c.toFixed(2)).padStart(10), ('$'+s.toFixed(2)).padStart(10), String(acos).padStart(6), ('$'+a.rev.toFixed(2)).padStart(12), String(a.units).padStart(5), String(bacos).padStart(7), ('$'+org.toFixed(2)).padStart(11), (a.rev>0?(org/a.rev*100).toFixed(0)+'%':'-').padStart(6));
}

// A total built on a source that did not answer is worse than no total at all.
if(ERRORS.length){
  console.log(`\n=== UNREAD. ${ERRORS.length} source(s) did not answer, so NO month total is printed. ===`);
  for(const e of ERRORS) console.log('  - '+e);
  console.log('\nRe-run a shorter window, e.g. --start=2026-10-01 --end=2026-10-07.');
  process.exit(2);
}
if(!orderRows){
  console.log('\n=== UNREAD. The all-orders report returned no rows, so total sales and BACOS cannot be computed. ===');
  process.exit(2);
}
console.log('\nMONTH '+START+'..'+END);
console.log('  ad spend     $'+T.c.toFixed(2)+'   (SP/SD/SB combined)');
console.log('  ad sales     $'+T.s.toFixed(2)+'   ACOS '+(T.s>0?(T.c/T.s*100).toFixed(0)+'%':'-')+'   ROAS '+(T.c>0?(T.s/T.c).toFixed(2)+'x':'-'));
console.log('  total sales  $'+T.r.toFixed(2)+'   units '+T.u+'   organic $'+(T.r-T.s).toFixed(2)+' ('+((T.r-T.s)/T.r*100).toFixed(0)+'%)');
const bacos=T.c/T.r;
console.log('\n  BACOS        '+(bacos*100).toFixed(1)+'%        TARGET '+(TARGET*100).toFixed(0)+'%   '+(bacos<=TARGET?'PASS':'OVER by '+((bacos-TARGET)*100).toFixed(1)+' points'));
console.log('  break-even   '+(MARGIN*100).toFixed(1)+'% before refunds, '+(MARGIN*(1-REFUND)*100).toFixed(1)+'% after '+(REFUND*100).toFixed(1)+'%');
const allowed=TARGET*T.r, nd=days.length;
console.log('  at '+(TARGET*100).toFixed(0)+'% BACOS this window allowed $'+allowed.toFixed(2)+' of ad spend ($'+(allowed/nd).toFixed(2)+'/day); we spent $'+T.c.toFixed(2)+' ($'+(T.c/nd).toFixed(2)+'/day)'+(T.c>allowed?', '+(T.c/allowed).toFixed(2)+'x over':''));
console.log('  BACOS '+(TARGET*100).toFixed(0)+'% holds at any spend once ad ROAS reaches '+(1/TARGET).toFixed(2)+'x; we are at '+(T.c>0?(T.s/T.c).toFixed(2):'0')+'x');
