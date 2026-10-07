/** READ-ONLY. Sponsored Display per-target SETTLED spend vs the $4 / 1.5x rule.
 *
 *  William's rule, 2026-10-07: anything over $4 spend returning under 1.5x goes off. Display has no
 *  kill path of its own, so this is how Display gets judged at all.
 *
 *  SETTLED means on or before 14 days ago, so nothing is judged inside the attribution window.
 *
 *  WHY THE POLL IS 40 MINUTES. This repo had Display reports on record at "10-15 min". Measured
 *  2026-10-07: the same report took **1,800 seconds**. An 800s poll gave up and printed nothing,
 *  which read as "Display is clean" when it meant "we could not look". Those are different answers.
 *  Result that day: 28 targets, $14.83 total settled spend, ZERO above $4, and every single target
 *  on zero orders -- so no $4-based rule can reach any of Display, by construction.
 *  RUN: node scripts/sd-settled-check.mjs */
import { readFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const A='https://advertising-api.amazon.com', sleep=ms=>new Promise(r=>setTimeout(r,ms));
const START='2026-08-24', END='2026-09-23';
let tok,tokAt=0;
const mint=async()=>{ if(tok&&Date.now()-tokAt<2400e3) return tok;
  tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
  tokAt=Date.now(); return tok; };
const V3='application/vnd.createasyncreportrequest.v3+json';
const hdr=async()=>({Authorization:`Bearer ${await mint()}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':V3,'Accept':V3});
const cfg={name:`sd-settled-long-${Date.now()}`,startDate:START,endDate:END,configuration:{adProduct:'SPONSORED_DISPLAY',groupBy:['targeting'],columns:['targetingId','targetingText','cost','sales','purchases','clicks','impressions'],reportTypeId:'sdTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}};
const cr=await fetch(`${A}/reporting/reports`,{method:'POST',headers:await hdr(),body:JSON.stringify(cfg)});
const ct=await cr.text(); let rid;
try{ const j=JSON.parse(ct); rid=j.reportId; if(!rid){const m=String(j.detail||'').match(/([0-9a-f-]{36})/); if(m) rid=m[1];} }catch{}
console.log(`SD report create HTTP ${cr.status}  id=${rid||'NONE'}`);
if(!rid){ console.log(ct.slice(0,300)); console.log('SD UNREAD'); process.exit(1); }
let rows=null;
for(let i=0;i<240;i++){ await sleep(10000);
  const s=await (await fetch(`${A}/reporting/reports/${rid}`,{headers:await hdr()})).json();
  if(i%12===0) console.log(`  ...${(i+1)*10}s status=${s.status}`);
  if(s.status==='COMPLETED'){ rows=JSON.parse(gunzipSync(Buffer.from(await (await fetch(s.url)).arrayBuffer())).toString()); console.log(`  COMPLETED after ~${(i+1)*10}s, ${rows.length} rows`); break; }
  if(s.status==='FAILURE'){ console.log('  FAILURE: '+JSON.stringify(s).slice(0,200)); break; } }
if(rows===null){ console.log('\nSD report never completed -> SD REMAINS UNREAD'); process.exit(2); }
const agg=new Map();
for(const r of rows){ const id=String(r.targetingId);
  const o=agg.get(id)||{t:r.targetingText,sp:0,sa:0,ord:0,ck:0,im:0};
  o.sp+=r.cost||0; o.sa+=r.sales||0; o.ord+=r.purchases||0; o.ck+=r.clicks||0; o.im+=r.impressions||0; agg.set(id,o); }
const tot=[...agg.values()].reduce((a,b)=>a+b.sp,0);
console.log(`\n=== SPONSORED DISPLAY, settled ${START}..${END}`);
console.log(`targets with data ${agg.size}   total settled spend $${tot.toFixed(2)}`);
const over=[...agg.entries()].filter(([,o])=>o.sp>=4);
console.log(`targets with >=$4 settled spend: ${over.length}`);
console.log('   spend    roas  ord   ck    RULE    target');
for(const [id,o] of over.sort((a,b)=>b[1].sp-a[1].sp)){ const r=o.sp>0?o.sa/o.sp:0;
  console.log(`  ${('$'+o.sp.toFixed(2)).padStart(7)} ${r.toFixed(2).padStart(6)}x ${String(o.ord).padStart(3)} ${String(o.ck).padStart(4)}   ${(!(o.ord>0&&o.sa>0&&r>=1.5))?'KILL':'keep'}   ${o.t} [${id}]`); }
console.log('\ntop 8 by spend regardless of the bar:');
for(const [id,o] of [...agg.entries()].sort((a,b)=>b[1].sp-a[1].sp).slice(0,8)){ const r=o.sp>0?o.sa/o.sp:0;
  console.log(`  ${('$'+o.sp.toFixed(2)).padStart(7)} ${r.toFixed(2).padStart(6)}x ${String(o.ord).padStart(3)}ord ${String(o.ck).padStart(4)}ck ${String(o.im).padStart(7)}imp  ${o.t}`); }
