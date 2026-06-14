/** Weekend review: ad performance since the 06-11 apply + status of the 14 new keywords. */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const A='https://advertising-api.amazon.com';const sleep=ms=>new Promise(r=>setTimeout(r,ms));const iso=d=>d.toISOString().slice(0,10);
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
const NEW=['phone tethered','securisee phone tether','retractable phone holder for disabled person','retractable phone holder with belt clip','cell phone case with tether strap','retractable tool tether','wired anti theft phone strap'];

// keyword states (confirm the adds + pauses)
const kws=[];let next;do{const r=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify({maxResults:1000,...(next?{nextToken:next}:{})})}).then(r=>r.json());(r.keywords||[]).forEach(k=>kws.push(k));next=r.nextToken;}while(next);
const byTM={};for(const k of kws)byTM[(k.keywordText||'').toLowerCase()+'|'+k.matchType]=k;
console.log('=== NEW keywords status (added 06-11) ===');
for(const t of NEW)for(const mt of ['EXACT','PHRASE']){const k=byTM[t+'|'+mt];console.log(`  ${mt.padEnd(6)} "${t}": ${k?k.state+' bid $'+k.bid:'NOT FOUND'}`);}
const offCheck=['cell phone tether tab heavy duty','holdmate','leash for iphone'];
console.log('\n=== paused wasters status ===');
for(const t of offCheck){const m=kws.filter(k=>(k.keywordText||'').toLowerCase()===t);console.log(`  "${t}": ${m.map(k=>k.matchType+'='+k.state).join(', ')||'?'}`);}

// performance since the apply
const start=iso(new Date(Date.UTC(2026,5,11))), end=iso(new Date());
async function rep(cfg){const cr=await fetch(`${A}/reporting/reports`,{method:'POST',headers:H('application/vnd.createasyncreportrequest.v3+json'),body:JSON.stringify(cfg)}).then(r=>r.json());let rid=cr.reportId;if(!rid&&cr.code==='425'){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/);if(m)rid=m[1];}if(!rid){console.log('create fail',JSON.stringify(cr).slice(0,150));return null;}let url;for(let i=0;i<70;i++){await sleep(9000);const s=await fetch(`${A}/reporting/reports/${rid}`,{headers:H('application/vnd.createasyncreportrequest.v3+json')}).then(r=>r.json());if(s.status==='COMPLETED'){url=s.url;break;}if(s.status==='FAILURE')return null;}if(!url)return null;return JSON.parse(gunzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).toString());}
console.log(`\n=== ADS since apply (${start}..${end}) ===`);
const rows=await rep({name:'wk',startDate:start,endDate:end,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['campaign'],columns:['impressions','clicks','cost','sales14d','purchases14d','campaignName'],reportTypeId:'spCampaigns',timeUnit:'SUMMARY',format:'GZIP_JSON'}});
if(rows){let C=0,K=0,S=0,O=0;for(const r of rows){C+=r.cost||0;K+=r.clicks||0;S+=r.sales14d||0;O+=r.purchases14d||0;}
  console.log(`  spend $${C.toFixed(2)} | sales $${S.toFixed(2)} | clicks ${K} | orders ${O} | ACOS ${S>0?(C/S*100).toFixed(0)+'%':'∞'} | CVR ${K>0?(O/K*100).toFixed(1)+'%':'-'}`);
  rows.filter(r=>r.cost>0).sort((a,b)=>b.cost-a.cost).slice(0,8).forEach(r=>console.log(`    $${(r.cost||0).toFixed(2)} / ${r.purchases14d||0} ord / ${r.clicks||0} clk  ${(r.campaignName||'').slice(0,44)}`));}
// keyword-level for new terms
const kt=await rep({name:'kt',startDate:start,endDate:end,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['targeting'],columns:['keyword','clicks','cost','sales14d','purchases14d'],reportTypeId:'spTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}});
if(kt){const ns=new Set(NEW);const hit=kt.filter(r=>ns.has((r.keyword||'').toLowerCase()));console.log('\n=== new keywords activity since apply ===');if(hit.length)hit.forEach(r=>console.log(`  "${r.keyword}"  ${r.clicks||0} clk $${(r.cost||0).toFixed(2)} ${r.purchases14d||0} ord`));else console.log('  (no impressions yet on the new keywords)');}
console.log('\nDONE.');
