/** ALL-TIME sales + units custom report (Option A from the 6-step research).
 *  Stitches SP-API all-orders reports in ~31-day windows back from today until it hits
 *  Amazon's order-data retention / launch boundary (N empty windows in a row), then sums
 *  units (quantity) + sales (item-price), broken out by ASIN and by month. Read-only.
 *  Writes confabulator/alltime-sales-report-<date>.md. RUN: node scripts/alltime-report.mjs */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const iso=d=>d.toISOString();
let tok, tokAt=0;
async function token(){ // refresh hourly
  if(tok && (Date.now()-tokAt)<3000_000) return tok;
  tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
  tokAt=Date.now(); return tok;
}
const sp=async(p,init)=>{const t=await token();const r=await fetch(`${SP}${p}`,{...init,headers:{'x-amz-access-token':t,'content-type':'application/json',...(init?.headers||{})}});const tx=await r.text();return{ok:r.ok,status:r.status,json:tx?JSON.parse(tx):null,text:tx};};

async function windowReport(sd, ed){
  // create with backoff on 429 (createReport rate limit ~1/min after burst)
  let cr;
  for(let a=0;a<6;a++){
    cr=await sp('/reports/2021-06-30/reports',{method:'POST',body:JSON.stringify({reportType:'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',marketplaceIds:[MKT],dataStartTime:iso(sd),dataEndTime:iso(ed)})});
    if(cr.status===429){await sleep(61000);continue;}
    break;
  }
  if(!cr.ok) return {err:`create ${cr.status} ${cr.text.slice(0,80)}`};
  const rid=cr.json.reportId; let docId,status;
  for(let i=0;i<48;i++){await sleep(5000);const st=await sp(`/reports/2021-06-30/reports/${rid}`);status=st.json?.processingStatus;if(status==='DONE'){docId=st.json.reportDocumentId;break;}if(/FATAL|CANCELLED/.test(status))return{err:status};}
  if(!docId) return {err:status||'timeout'};
  const doc=await sp(`/reports/2021-06-30/documents/${docId}`);
  const buf=Buffer.from(await (await fetch(doc.json.url)).arrayBuffer());
  const txt=doc.json.compressionAlgorithm==='GZIP'?gunzipSync(buf).toString():buf.toString();
  const lines=txt.split('\n').filter(Boolean);
  if(lines.length<2) return {rows:0,units:0,sales:0,byAsin:{},byMonth:{}};
  const h=lines[0].split('\t');
  const qi=h.indexOf('quantity'), pi=h.findIndex(x=>x==='item-price'), ai=h.indexOf('asin'), si=h.indexOf('item-status'), di=h.indexOf('purchase-date');
  let units=0,sales=0; const byAsin={},byMonth={};
  for(const l of lines.slice(1)){const c=l.split('\t');const stat=(c[si]||'').toLowerCase();if(stat.includes('cancel'))continue;
    const q=parseInt(c[qi]||'0',10)||0, p=parseFloat(c[pi]||'0')||0, asin=c[ai]||'?', mo=(c[di]||'').slice(0,7);
    units+=q; sales+=p;
    byAsin[asin]=byAsin[asin]||{u:0,s:0}; byAsin[asin].u+=q; byAsin[asin].s+=p;
    if(mo){byMonth[mo]=byMonth[mo]||{u:0,s:0}; byMonth[mo].u+=q; byMonth[mo].s+=p;}
  }
  return {rows:lines.length-1,units,sales,byAsin,byMonth};
}

const DAY=864e5, CHUNK=31, MAX_WINDOWS=40, STOP_AFTER_EMPTY=3;
let end=new Date(Date.now()-2*DAY); // skip last 2 days (settling)
let totU=0,totS=0,emptyStreak=0,windows=0,reached=null;
const ASIN={},MONTH={}; const log=[];
console.log('all-time report: stitching ~31-day all-orders windows back from', iso(end).slice(0,10));
for(let w=0; w<MAX_WINDOWS; w++){
  const sd=new Date(end.getTime()-CHUNK*DAY);
  const r=await windowReport(sd,end);
  windows++;
  if(r.err){console.log(`  ${iso(sd).slice(0,10)}..${iso(end).slice(0,10)}: ERR ${r.err}`);end=sd;continue;}
  console.log(`  ${iso(sd).slice(0,10)}..${iso(end).slice(0,10)}: ${r.units} units, $${r.sales.toFixed(2)} (${r.rows} rows)`);
  log.push({from:iso(sd).slice(0,10),to:iso(end).slice(0,10),units:r.units,sales:r.sales});
  totU+=r.units; totS+=r.sales;
  for(const[a,v] of Object.entries(r.byAsin)){ASIN[a]=ASIN[a]||{u:0,s:0};ASIN[a].u+=v.u;ASIN[a].s+=v.s;}
  for(const[m,v] of Object.entries(r.byMonth)){MONTH[m]=MONTH[m]||{u:0,s:0};MONTH[m].u+=v.u;MONTH[m].s+=v.s;}
  if(r.rows===0){emptyStreak++; if(emptyStreak>=STOP_AFTER_EMPTY){console.log(`  (${STOP_AFTER_EMPTY} empty windows — hit retention/launch boundary)`);break;}}
  else {emptyStreak=0; reached=iso(sd).slice(0,10);}
  end=sd;
  await sleep(7000); // ease createReport rate limit
}
const months=Object.keys(MONTH).sort();
const today=iso(new Date()).slice(0,10);
let md=`# Phone Assured — All-Time Sales & Units (SP-API all-orders, stitched)\n\nGenerated ${today}. Source: GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL, ${windows} windows, ex-cancelled.\n\n`;
md+=`## Total (within Amazon's ~2-yr order-data retention)\n- UNITS: ${totU}\n- SALES: $${totS.toFixed(2)}\n- Reachable start: ${reached||'n/a'} -> ${iso(new Date(Date.now()-2*DAY)).slice(0,10)}\n\n`;
md+=`## By ASIN\n| ASIN | Units | Sales |\n|---|---|---|\n`+Object.entries(ASIN).sort((a,b)=>b[1].u-a[1].u).map(([a,v])=>`| ${a} | ${v.u} | $${v.s.toFixed(2)} |`).join('\n')+'\n\n';
md+=`## By Month\n| Month | Units | Sales |\n|---|---|---|\n`+months.map(m=>`| ${m} | ${MONTH[m].u} | $${MONTH[m].s.toFixed(2)} |`).join('\n')+'\n\n';
md+=`## Note\nThis API report reaches ~2 years (Amazon order-data retention). Any sales older than the reachable start are not included; lifetime totals beyond that (William's ~18,000 units / 8,926 ad-attributed from Campaign Manager) remain the authoritative all-time figure. Cross-check: Seller Central Reports -> Payments -> Date Range Reports -> Summary.\n`;
const out=new URL(`../confabulator/alltime-sales-report-${today}.md`,import.meta.url);
writeFileSync(out, md);
console.log(`\n=== ALL-TIME (reachable) ===\nUNITS: ${totU}\nSALES: $${totS.toFixed(2)}\nstart reached: ${reached}\nwrote: confabulator/alltime-sales-report-${today}.md`);
