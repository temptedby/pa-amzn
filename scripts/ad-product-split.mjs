/** READ-ONLY. Month-to-date US spend split by ad product and campaign: SP, SD (v3) and SB (v2 HSA).
 *  RUN: node scripts/ad-product-split.mjs [--start=2026-08-01] [--end=YYYY-MM-DD] */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const START=arg('start','2026-08-01'), END=arg('end',new Date().toISOString().slice(0,10));
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
const V3='application/vnd.createasyncreportrequest.v3+json';
async function v3(label,cfg){
  const cr=await (await rq(`${A}/reporting/reports`,{method:'POST',headers:H(V3),body:JSON.stringify(cfg)})).json();
  let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
  if(!rid){console.error(label,'create failed',JSON.stringify(cr).slice(0,200));return [];}
  for(let i=0;i<180;i++){await sleep(8000);
    const s=await (await rq(`${A}/reporting/reports/${rid}`,{headers:H(V3)})).json();
    if(s.status==='COMPLETED')return JSON.parse(gunzipSync(Buffer.from(await (await rq(s.url)).arrayBuffer())).toString());
    if(s.status==='FAILURE'){console.error(label,'FAILURE');return [];}}
  console.error(label,'timeout');return [];
}
async function sbDay(day){
  const HH={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json'};
  const cr=await rq(`${A}/v2/hsa/campaigns/report`,{method:'POST',headers:HH,body:JSON.stringify({reportDate:day.replace(/-/g,''),metrics:'campaignId,campaignName,impressions,clicks,cost,attributedSales14d'})});
  if(!cr.ok)return null; const {reportId}=await cr.json(); if(!reportId)return null;
  for(let i=0;i<45;i++){await sleep(6000);
    const st=await (await rq(`${A}/v2/reports/${reportId}`,{headers:HH})).json().catch(()=>({}));
    if(st.status==='FAILURE')return null; if(st.status!=='SUCCESS')continue;
    const b=Buffer.from(await (await rq(`${A}/v2/reports/${reportId}/download`,{headers:HH,redirect:'follow'})).arrayBuffer());
    let t; try{t=gunzipSync(b).toString();}catch{t=b.toString();} return JSON.parse(t);}
  return null;
}
const days=[];for(let d=new Date(START+'T12:00:00Z');d<=new Date(END+'T12:00:00Z');d=new Date(d.getTime()+864e5))days.push(d.toISOString().slice(0,10));
const [sp,sd,...sbAll]=await Promise.all([
  v3('SP',{name:`split-sp-${START}-${END}`,startDate:START,endDate:END,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['campaign'],columns:['campaignName','cost','sales14d','clicks','impressions'],reportTypeId:'spCampaigns',timeUnit:'SUMMARY',format:'GZIP_JSON'}}),
  v3('SD',{name:`split-sd-${START}-${END}`,startDate:START,endDate:END,configuration:{adProduct:'SPONSORED_DISPLAY',groupBy:['campaign'],columns:['campaignName','cost','sales','clicks','impressions'],reportTypeId:'sdCampaigns',timeUnit:'SUMMARY',format:'GZIP_JSON'}}),
  ...days.map(d=>sbDay(d).catch(()=>null)),
]);
const line=(p,name,c,s,cl,im)=>console.log(`${p.padEnd(4)} ${String(name).slice(0,44).padEnd(44)} ${c.toFixed(2).padStart(9)} ${s.toFixed(2).padStart(9)} ${(c?(s/c).toFixed(2):'-').padStart(6)} ${String(cl).padStart(7)} ${String(im).padStart(9)}`);
console.log(`\nUS ad spend by campaign, ${START} to ${END}\n`);
console.log(`prod ${'campaign'.padEnd(44)} ${'spend'.padStart(9)} ${'sales'.padStart(9)} ${'ROAS'.padStart(6)} ${'clicks'.padStart(7)} ${'imps'.padStart(9)}`);
let T={};
for(const r of sp.sort((a,b)=>b.cost-a.cost)){line('SP',r.campaignName,+r.cost||0,+r.sales14d||0,r.clicks||0,r.impressions||0);T.SP??=[0,0];T.SP[0]+=+r.cost||0;T.SP[1]+=+r.sales14d||0;}
for(const r of sd.sort((a,b)=>b.cost-a.cost)){line('SD',r.campaignName,+r.cost||0,+r.sales||0,r.clicks||0,r.impressions||0);T.SD??=[0,0];T.SD[0]+=+r.cost||0;T.SD[1]+=+r.sales||0;}
const sb={};let sbMiss=0;
for(const rows of sbAll){if(!rows){sbMiss++;continue;}for(const r of rows){sb[r.campaignName]??=[0,0,0,0];sb[r.campaignName][0]+=r.cost||0;sb[r.campaignName][1]+=r.attributedSales14d||0;sb[r.campaignName][2]+=r.clicks||0;sb[r.campaignName][3]+=r.impressions||0;}}
for(const [n,v] of Object.entries(sb).sort((a,b)=>b[1][0]-a[1][0])){line('SB',n,v[0],v[1],v[2],v[3]);T.SB??=[0,0];T.SB[0]+=v[0];T.SB[1]+=v[1];}
console.log('');
let gc=0,gs=0;
for(const [p,v] of Object.entries(T)){gc+=v[0];gs+=v[1];console.log(`${p}  spend $${v[0].toFixed(2).padStart(8)}   sales $${v[1].toFixed(2).padStart(8)}   ROAS ${(v[1]/v[0]).toFixed(2)}`);}
console.log(`US TOTAL spend $${gc.toFixed(2)}   ad sales $${gs.toFixed(2)}   ROAS ${(gs/gc).toFixed(2)}`);
if(sbMiss)console.log(`(SB: ${sbMiss} of ${days.length} days not returned)`);
