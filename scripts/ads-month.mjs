/** This-month ad performance + which ASINs are advertised + converting search terms.
 *  Verbose. RUN: node scripts/ads-month.mjs */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const iso=d=>d.toISOString().slice(0,10);
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});

async function report(label,cfg){
  console.log(`\n>>> ${label}  (${cfg.startDate}..${cfg.endDate}, ${cfg.configuration.reportTypeId})`);
  const cr=await fetch(`${A}/reporting/reports`,{method:'POST',headers:H('application/vnd.createasyncreportrequest.v3+json'),body:JSON.stringify(cfg)}).then(r=>r.json());
  let rid=cr.reportId; if(!rid&&cr.code==='425'){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/);if(m){rid=m[1];console.log('  (425 dup -> reuse',rid+')');}}
  if(!rid){console.log('  create failed:',JSON.stringify(cr));return null;}
  let url;for(let i=0;i<80;i++){await sleep(9000);const s=await fetch(`${A}/reporting/reports/${rid}`,{headers:H('application/vnd.createasyncreportrequest.v3+json')}).then(r=>r.json());if(s.status==='COMPLETED'){url=s.url;break;}if(s.status==='FAILURE'){console.log('  FAILURE',JSON.stringify(s).slice(0,200));return null;}if(i%4===0)process.stdout.write(`[${s.status}]`);}
  process.stdout.write('\n');
  if(!url){console.log('  did not complete');return null;}
  return JSON.parse(gunzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).toString());
}
const today=iso(new Date());
const m1=iso(new Date(Date.UTC(2026,5,1)));   // Jun 1
const prevS=iso(new Date(Date.UTC(2026,4,1))); // May 1
const prevE=iso(new Date(Date.UTC(2026,4,31)));// May 31

for(const [lbl,s,e] of [['THIS MONTH (Jun)',m1,today],['LAST MONTH (May)',prevS,prevE]]){
  const rows=await report(lbl,{name:'m',startDate:s,endDate:e,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['campaign'],columns:['impressions','clicks','cost','sales14d','purchases14d','campaignName','campaignId'],reportTypeId:'spCampaigns',timeUnit:'SUMMARY',format:'GZIP_JSON'}});
  if(!rows)continue;
  let C=0,K=0,S=0,O=0,I=0;for(const r of rows){C+=r.cost||0;K+=r.clicks||0;S+=r.sales14d||0;O+=r.purchases14d||0;I+=r.impressions||0;}
  console.log(`  TOTALS  spend=$${C.toFixed(2)} sales=$${S.toFixed(2)} clicks=${K} orders=${O} impr=${I}`);
  console.log(`  ACOS=${S>0?(C/S*100).toFixed(0)+'%':'∞ no sales'}  CVR=${K>0?(O/K*100).toFixed(2)+'%':'—'}  CPC=$${K>0?(C/K).toFixed(2):'—'}  CTR=${I>0?(K/I*100).toFixed(2)+'%':'—'}`);
  rows.filter(r=>r.cost>0).sort((a,b)=>b.cost-a.cost).slice(0,10).forEach(r=>console.log(`    $${(r.cost||0).toFixed(2).padStart(7)} / ${String(r.purchases14d||0).padStart(2)} ord / ${String(r.clicks||0).padStart(3)} clk  ${(r.campaignName||'').slice(0,46)}`));
}

// which ASINs are advertised (advertised product report)
const adp=await report('ADVERTISED ASINs (Jun)',{name:'ap',startDate:m1,endDate:today,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['advertiser'],columns:['advertisedAsin','advertisedSku','clicks','cost','sales14d','purchases14d'],reportTypeId:'spAdvertisedProduct',timeUnit:'SUMMARY',format:'GZIP_JSON'}});
if(adp){
  const byAsin={};for(const r of adp){const a=r.advertisedAsin||r.advertisedSku||'?';(byAsin[a]??=({c:0,o:0,k:0,s:0}));byAsin[a].c+=r.cost||0;byAsin[a].o+=r.purchases14d||0;byAsin[a].k+=r.clicks||0;byAsin[a].s+=r.sales14d||0;}
  console.log('\n  spend by advertised ASIN:');
  Object.entries(byAsin).sort((a,b)=>b[1].c-a[1].c).forEach(([a,v])=>console.log(`    ${a}  $${v.c.toFixed(2)} spend / ${v.o} orders / ${v.k} clk / $${v.s.toFixed(2)} sales  ACOS ${v.s>0?(v.c/v.s*100).toFixed(0)+'%':'∞'}`));
}
console.log('\nDONE.');
