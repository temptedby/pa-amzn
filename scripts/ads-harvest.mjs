/** ~90-day ad review (chunked into 30d windows; API max range is 31d). Preview only.
 *  (A) CAMPAIGNS: which paused campaigns historically converted -> RELAUNCH candidates; enabled ones to scale.
 *  (B) HARVEST: converting SEARCH TERMS not yet keywords -> add as exact/phrase.
 *  (C) KEYWORDS: turn off (>=$4/0 ord), raise (ACOS<25%), lower (ACOS>=60%).
 *  RUN: node scripts/ads-harvest.mjs */
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

// 3 x 30-day windows (~90d total)
const W=[];for(let i=0;i<3;i++){const e=new Date(Date.now()-i*30*864e5);const s=new Date(e.getTime()-29*864e5);W.push([iso(s),iso(e)]);}

async function one(reportTypeId,groupBy,columns,sd,ed){
  const cfg={name:'h',startDate:sd,endDate:ed,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy,columns,reportTypeId,timeUnit:'SUMMARY',format:'GZIP_JSON'}};
  const cr=await fetch(`${A}/reporting/reports`,{method:'POST',headers:H('application/vnd.createasyncreportrequest.v3+json'),body:JSON.stringify(cfg)}).then(r=>r.json());
  let rid=cr.reportId; if(!rid&&cr.code==='425'){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/);if(m)rid=m[1];}
  if(!rid){console.log(`   [${sd}..${ed}] create failed ${JSON.stringify(cr).slice(0,120)}`);return [];}
  let url;for(let i=0;i<70;i++){await sleep(9000);const s=await fetch(`${A}/reporting/reports/${rid}`,{headers:H('application/vnd.createasyncreportrequest.v3+json')}).then(r=>r.json());if(s.status==='COMPLETED'){url=s.url;break;}if(s.status==='FAILURE'){console.log(`   [${sd}..${ed}] FAILURE`);return [];}}
  if(!url){console.log(`   [${sd}..${ed}] timeout`);return [];}
  return JSON.parse(gunzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).toString());
}
async function chunked(label,reportTypeId,groupBy,columns){
  console.log(`\n>>> ${label} (~90d, 3 windows)`);
  const all=[];for(const [s,e] of W){const rows=await one(reportTypeId,groupBy,columns,s,e);process.stdout.write(`   ${s}..${e}: ${rows.length} rows\n`);all.push(...rows);}
  return all;
}
const add=(m,k,r)=>{const o=m.get(k)||{cost:0,clicks:0,sales:0,ord:0};o.cost+=r.cost||0;o.clicks+=r.clicks||0;o.sales+=r.sales14d||0;o.ord+=r.purchases14d||0;m.set(k,o);};
const acos=o=>o.sales>0?o.cost/o.sales:null, pc=a=>a==null?'∞':(a*100).toFixed(0)+'%';

// existing keywords
const kws=[];let next;do{const r=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify({maxResults:1000,...(next?{nextToken:next}:{})})}).then(r=>r.json());(r.keywords||[]).forEach(k=>kws.push(k));next=r.nextToken;}while(next);
const kwText=new Set(kws.map(k=>(k.keywordText||'').toLowerCase().trim()));
const kById={};for(const k of kws)kById[String(k.keywordId)]={t:k.keywordText,state:k.state,bid:k.bid};

// campaigns (state + budget)
const camps={};{let nt;do{const r=await fetch(`${A}/sp/campaigns/list`,{method:'POST',headers:H('application/vnd.spCampaign.v3+json'),body:JSON.stringify({maxResults:500,...(nt?{nextToken:nt}:{})})}).then(r=>r.json());(r.campaigns||[]).forEach(c=>camps[String(c.campaignId)]={name:c.name,state:c.state,budget:c.budget?.budget});nt=r.nextToken;}while(nt);}
console.log(`keywords ${kws.length} (enabled ${kws.filter(k=>k.state==='ENABLED').length})  campaigns ${Object.keys(camps).length} (enabled ${Object.values(camps).filter(c=>c.state==='ENABLED').length}, paused ${Object.values(camps).filter(c=>c.state==='PAUSED').length})`);

// (A) CAMPAIGNS history
const cr=await chunked('CAMPAIGNS','spCampaigns',['campaign'],['campaignId','campaignName','clicks','cost','sales14d','purchases14d']);
const cm=new Map();for(const r of cr) add(cm,String(r.campaignId),r);
const relaunch=[],scaleC=[];
for(const [id,o] of cm){const c=camps[id]||{};const a=acos(o);
  if(o.ord>0&&a!=null&&a<0.40){ if(c.state==='PAUSED') relaunch.push({id,name:c.name,a,ord:o.ord,sales:o.sales,budget:c.budget}); else scaleC.push({id,name:c.name,a,ord:o.ord,sales:o.sales}); }}
relaunch.sort((x,y)=>x.a-y.a);scaleC.sort((x,y)=>x.a-y.a);
console.log(`\n=== RELAUNCH candidates: PAUSED campaigns that converted <40% ACOS (90d): ${relaunch.length} ===`);
relaunch.slice(0,20).forEach(c=>console.log(`  ACOS ${pc(c.a)}  ${c.ord} ord  $${c.sales.toFixed(2)} sales  budget $${c.budget??'?'}  "${(c.name||'').slice(0,46)}"`));
console.log(`\n=== ENABLED campaigns converting well (scale): ${scaleC.length} ===`);
scaleC.slice(0,15).forEach(c=>console.log(`  ACOS ${pc(c.a)}  ${c.ord} ord  $${c.sales.toFixed(2)} sales  "${(c.name||'').slice(0,46)}"`));

// (B) HARVEST search terms
const st=await chunked('SEARCH TERMS','spSearchTerm',['searchTerm'],['searchTerm','keyword','matchType','clicks','cost','sales14d','purchases14d']);
const sm=new Map();for(const r of st){if(!r.searchTerm)continue;const o=sm.get(r.searchTerm)||{cost:0,clicks:0,sales:0,ord:0,via:r.matchType};o.cost+=r.cost||0;o.clicks+=r.clicks||0;o.sales+=r.sales14d||0;o.ord+=r.purchases14d||0;sm.set(r.searchTerm,o);}
const harvest=[...sm].filter(([t,o])=>o.ord>0 && !kwText.has(t.toLowerCase().trim()) && !/^b0[a-z0-9]{8}$/i.test(t)).sort((a,b)=>b[1].ord-a[1].ord);
console.log(`\n=== HARVEST: converting search terms NOT yet keywords: ${harvest.length} ===`);
harvest.slice(0,40).forEach(([t,o])=>console.log(`  ${String(o.ord).padStart(2)} ord  ACOS ${pc(acos(o))}  $${o.cost.toFixed(2)}  "${t}"  (via ${o.via})`));

// (C) KEYWORD perf
const kt=await chunked('KEYWORDS','spTargeting',['targeting'],['keywordId','keyword','clicks','cost','sales14d','purchases14d']);
const km=new Map();for(const r of kt) add(km,String(r.keywordId),{cost:r.cost,clicks:r.clicks,sales14d:r.sales14d,purchases14d:r.purchases14d});
const off=[],up=[],down=[];
for(const [id,o] of km){const k=kById[id];if(!k)continue;const a=acos(o);
  if(k.state==='ENABLED'&&o.cost>=4&&o.ord===0) off.push({t:k.t,cost:o.cost});
  else if(o.ord>0&&a!=null){ if(a<0.25)up.push({t:k.t,a,bid:k.bid}); else if(a>=0.60)down.push({t:k.t,a,bid:k.bid}); }}
off.sort((a,b)=>b.cost-a.cost);up.sort((a,b)=>a.a-b.a);down.sort((a,b)=>b.a-a.a);
console.log(`\n=== TURN OFF (>=$4 spend, 0 orders, 90d): ${off.length} ===`);off.slice(0,20).forEach(x=>console.log(`  $${x.cost.toFixed(2)}  "${x.t}"`));
console.log(`\n=== RAISE (ACOS<25%): ${up.length} ===`);up.slice(0,20).forEach(x=>console.log(`  ${pc(x.a)}  bid $${x.bid}  "${x.t}"`));
console.log(`\n=== LOWER (ACOS>=60%): ${down.length} ===`);down.slice(0,20).forEach(x=>console.log(`  ${pc(x.a)}  bid $${x.bid}  "${x.t}"`));
console.log('\nDONE.');
