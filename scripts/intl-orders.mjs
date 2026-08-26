/** READ-ONLY. Orders by marketplace, split ORGANIC vs AD-ATTRIBUTED.
 *
 *  Built 2026-08-26 for William's Mexico experiment: advertising is paused, the Buy Box is ours on
 *  all four SKUs, so does Mexico sell anything on its own? Nothing else in this repo would notice
 *  if it did.
 *
 *  Two sources, deliberately:
 *    orders   - the all-orders report, keyed on `sales-channel`. The marketplace FILTER is ignored
 *               by this report (all-orders-ignores-marketplace-filter), so the channel column is the
 *               only trustworthy split. Amazon caps this report at 30 days.
 *    ad sales - the Ads API per marketplace, so ORGANIC = orders minus ad-attributed.
 *
 *  A marketplace whose ad report will not complete is reported as UNREAD, never as zero.
 *  RUN: node scripts/intl-orders.mjs [--days=30]
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const DAYS=Math.min(30,+arg('days',30));
const SP='https://sellingpartnerapi-na.amazon.com', A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}

// ---------- orders, by sales channel
const spTok=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json().then?.(j=>j.access_token) ?? null;
const spTok2=spTok ?? (await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const sp=async(p,init)=>{const r=await rq(`${SP}${p}`,{...init,headers:{'x-amz-access-token':spTok2,'content-type':'application/json',...(init?.headers||{})}});const t=await r.text();return{ok:r.ok,status:r.status,json:t?JSON.parse(t):null,text:t};};
const END=new Date().toISOString(), START=new Date(Date.now()-(DAYS-1)*864e5).toISOString();
const c=await sp('/reports/2021-06-30/reports',{method:'POST',body:JSON.stringify({
  reportType:'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',dataStartTime:START,dataEndTime:END,
  marketplaceIds:['ATVPDKIKX0DER','A2EUQ1WTGCTBG2','A1AM78C64UM0Y8']})});
if(!c.ok){console.log('orders report create failed:',c.status,c.text.slice(0,200));process.exit(1);}
let doc=null;
for(let i=0;i<90;i++){await sleep(9000);const s=await sp(`/reports/2021-06-30/reports/${c.json.reportId}`);
  if(s.json?.processingStatus==='DONE'){doc=s.json.reportDocumentId;break;}
  if(['CANCELLED','FATAL'].includes(s.json?.processingStatus)){console.log('orders report',s.json.processingStatus);process.exit(1);}}
if(!doc){console.log('orders report did not finish. NOTHING is reported.');process.exit(2);}
const d=await sp(`/reports/2021-06-30/documents/${doc}`);
let buf=Buffer.from(await (await rq(d.json.url)).arrayBuffer()); try{buf=gunzipSync(buf);}catch{}
const lines=buf.toString('utf8').split('\n').filter(Boolean);
const head=lines[0].split('\t').map(h=>h.trim()), ix=n=>head.indexOf(n);
const iCh=ix('sales-channel'),iQ=ix('quantity'),iP=ix('item-price'),iS=ix('order-status'),iC=ix('currency'),iD=ix('purchase-date');
const chan=new Map();
for(const l of lines.slice(1)){
  const f=l.split('\t'); const ch=(f[iCh]||'').trim(); if(!ch) continue;
  const g=chan.get(ch)||{orders:0,units:0,rev:0,cancelled:0,cur:(f[iC]||'').trim(),last:''};
  if(/cancel/i.test((f[iS]||'').trim())) g.cancelled++; else {g.orders++;g.units+=+(f[iQ]||0);g.rev+=+(f[iP]||0);}
  const dt=(f[iD]||'').slice(0,10); if(dt>g.last) g.last=dt;
  chan.set(ch,g);
}

// ---------- ad-attributed, per marketplace
const adTok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const V3='application/vnd.createasyncreportrequest.v3+json';
const iso=d=>d.toISOString().slice(0,10);
const adFor=async(pid)=>{
  if(!pid) return {state:'no profile configured'};
  const H=ct=>({Authorization:`Bearer ${adTok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':pid,'Content-Type':ct,'Accept':ct});
  const cr=await (await rq(`${A}/reporting/reports`,{method:'POST',headers:H(V3),body:JSON.stringify({
    name:`intl-orders-${pid}`,startDate:iso(new Date(Date.now()-(DAYS-1)*864e5)),endDate:iso(new Date()),
    configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['campaign'],
      columns:['impressions','clicks','cost','purchases14d','sales14d'],
      reportTypeId:'spCampaigns',timeUnit:'SUMMARY',format:'GZIP_JSON'}})})).json();
  let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
  if(!rid) return {state:'could not request: '+JSON.stringify(cr).slice(0,90)};
  for(let i=0;i<200;i++){await sleep(9000);
    const s=await (await rq(`${A}/reporting/reports/${rid}`,{headers:H(V3)})).json();
    if(s.status==='COMPLETED'){
      const rows=JSON.parse(gunzipSync(Buffer.from(await (await rq(s.url)).arrayBuffer())).toString());
      const t=k=>rows.reduce((a,r)=>a+(+r[k]||0),0);
      return {state:'ok',cost:t('cost'),orders:t('purchases14d'),sales:t('sales14d'),clicks:t('clicks'),imp:t('impressions')};
    }
    if(s.status==='FAILURE') return {state:'report FAILED'};
  }
  return {state:'report did not complete'};
};
const ads={
  'Amazon.com'   : await adFor(process.env.ADS_PROFILE_ID),
  'Amazon.ca'    : await adFor(process.env.ADS_PROFILE_ID_CA),
  'Amazon.com.mx': await adFor(process.env.ADS_PROFILE_ID_MX),
};

console.log(`\nORDERS BY MARKETPLACE, last ${DAYS} days, ORGANIC vs ADVERTISED\n`);
console.log('  channel          orders  units    revenue   ad orders   ORGANIC   ad spend   last order');
for(const [ch,g] of [...chan].sort((a,b)=>b[1].orders-a[1].orders)){
  const a=ads[ch];
  const adO = a && a.state==='ok' ? a.orders : null;
  const org = adO===null ? '  UNREAD' : String(g.orders-adO).padStart(8);
  const spend = a && a.state==='ok' ? `${g.cur} ${a.cost.toFixed(2)}` : (a?a.state:'-');
  console.log(`  ${ch.padEnd(15)} ${String(g.orders).padStart(6)} ${String(g.units).padStart(6)} ${g.cur} ${g.rev.toFixed(2).padStart(9)} ${String(adO??'  UNREAD').padStart(11)} ${org}   ${String(spend).padEnd(12)} ${g.last}`);
}
for(const [ch,a] of Object.entries(ads))
  if(a.state!=='ok') console.log(`\n  ${ch}: ad figures UNREAD (${a.state}). Organic is NOT inferred for it.`);
console.log(`\nORGANIC = orders minus ad-attributed. A channel whose ad report will not complete is reported UNREAD, never as zero.`);
