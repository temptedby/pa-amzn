/** READ-ONLY sweep: anything past $4 month-to-date and unprofitable that is STILL ENABLED,
 *  across Sponsored Products, Sponsored Brands and Sponsored Display.
 *
 *  The question William keeps asking and the one the logs cannot answer: is anything overspending
 *  RIGHT NOW? ad_engine_log records what we asked Amazon to do; this checks what Amazon actually
 *  has enabled, per entity, against its own month-to-date spend. Reports, never writes.
 *
 *  Differs from ad-overspend.mjs, which reports spend but does not check live ENABLED state, so it
 *  flags words that were already paused days ago.
 *
 *  RUN: node scripts/overspend-sweep.mjs
 */
import { readFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib';
import { createClient } from '@libsql/client';
const r=readFileSync('/Users/williamholdeman/projects/PA-AMZN/.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const A='https://advertising-api.amazon.com', KILL=4, PIVOT=0.52;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})}).then(x=>x.json());
const H=ct=>({Authorization:`Bearer ${tok.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
const now=new Date(), iso=d=>d.toISOString().slice(0,10);
const START=iso(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1))), END=iso(now);
const bad=(sp,or,sa)=>sp>=KILL && (or===0 || (sa>0? sp/sa>=PIVOT : true));

async function report(label,conf,maxPolls=110){
  const cr=await fetch(`${A}/reporting/reports`,{method:'POST',headers:H('application/vnd.createasyncreportrequest.v3+json'),body:JSON.stringify(conf)}).then(r=>r.json());
  let rid=cr.reportId;
  if(!rid&&String(cr.code)==='425'){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/);if(m)rid=m[1];}
  if(!rid){console.log(`  ${label}: cannot create ${JSON.stringify(cr).slice(0,120)}`);return null;}
  for(let i=0;i<maxPolls;i++){
    const s=await fetch(`${A}/reporting/reports/${rid}`,{headers:H('application/vnd.createasyncreportrequest.v3+json')}).then(r=>r.json());
    if(s.status==='COMPLETED') return JSON.parse(gunzipSync(Buffer.from(await (await fetch(s.url)).arrayBuffer())).toString());
    if(s.status==='FAILURE'){console.log(`  ${label}: FAILED`);return null;}
    await sleep(10000);
  }
  console.log(`  ${label}: still pending`); return null;
}

console.log(`OVERSPEND SWEEP  ${START}..${END}   bar: $${KILL} MTD and unprofitable (0 orders or ACOS >= ${PIVOT*100}%)\n`);
let offenders=0;

// ---- Sponsored Products, per keyword id ----
{
  const rows=await report('SP',{name:`sw-sp-${Date.now()}`,startDate:START,endDate:END,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['targeting'],columns:['keywordId','keyword','matchType','cost','sales14d','purchases14d'],reportTypeId:'spTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}});
  console.log('SPONSORED PRODUCTS (per keyword id)');
  if(rows){
    let live=[],next;
    do{const b={maxResults:1000,stateFilter:{include:['ENABLED']}}; if(next)b.nextToken=next;
      const res=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify(b)}).then(r=>r.json());
      live.push(...(res.keywords||[])); next=res.nextToken;}while(next);
    const en=new Set(live.map(k=>String(k.keywordId)));
    const hits=rows.filter(x=>bad(x.cost||0,x.purchases14d||0,x.sales14d||0)&&en.has(String(x.keywordId)));
    console.log(`  ${rows.length} rows, ${en.size} enabled keywords`);
    if(!hits.length) console.log('  CLEAN: nothing past the bar is still enabled');
    hits.sort((a,b)=>b.cost-a.cost).forEach(x=>{offenders++;console.log(`  STILL ON  $${x.cost.toFixed(2)}  ${x.purchases14d||0} ord  ${x.sales14d?((x.cost/x.sales14d)*100).toFixed(0)+'%':'no sale'}  [${x.matchType}] ${x.keyword}  id=${x.keywordId}`);});
  }
}
// ---- Sponsored Display, per target ----
{
  const rows=await report('SD',{name:`sw-sd-${Date.now()}`,startDate:START,endDate:END,configuration:{adProduct:'SPONSORED_DISPLAY',groupBy:['targeting'],columns:['targetingId','targetingText','cost','sales','purchases'],reportTypeId:'sdTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}});
  console.log('\nSPONSORED DISPLAY (per target)');
  if(rows){
    let tg=[],s0=0; for(;;){const p=await fetch(`${A}/sd/targets?count=500&startIndex=${s0}`,{headers:H('application/json')}).then(r=>r.json()); if(!Array.isArray(p)||!p.length)break; tg=tg.concat(p); if(p.length<500)break; s0+=500;}
    const en=new Set(tg.filter(t=>String(t.state).toUpperCase()==='ENABLED').map(t=>String(t.targetId)));
    const hits=rows.filter(x=>bad(x.cost||0,x.purchases||0,x.sales||0)&&en.has(String(x.targetingId)));
    console.log(`  ${rows.length} rows, ${en.size} enabled targets, $${rows.reduce((a,b)=>a+(b.cost||0),0).toFixed(2)} MTD`);
    if(!hits.length) console.log('  CLEAN: nothing past the bar is still enabled');
    hits.sort((a,b)=>b.cost-a.cost).forEach(x=>{offenders++;console.log(`  STILL ON  $${x.cost.toFixed(2)}  ${x.purchases||0} ord  ${x.targetingText}  id=${x.targetingId}`);});
  }
}
// ---- Sponsored Brands, per keyword id, from our own sb_daily ----
{
  console.log('\nSPONSORED BRANDS (per keyword id, from sb_daily)');
  const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
  const q=await db.execute({sql:`SELECT keyword_id, MAX(keyword_text) t, MAX(match_type) m, SUM(cost) c, SUM(sales) s, SUM(orders) o
      FROM sb_daily WHERE day >= ? AND day <= ? GROUP BY keyword_id`,args:[START,END]});
  const rows=q.rows.map(x=>({id:String(x.keyword_id),t:x.t,m:x.m,c:Number(x.c||0),s:Number(x.s||0),o:Number(x.o||0)}));
  console.log(`  ${rows.length} keyword ids in sb_daily, $${rows.reduce((a,b)=>a+b.c,0).toFixed(2)} MTD`);
  const kw=await fetch(`${A}/sb/keywords?count=1000`,{headers:H('application/json')}).then(r=>r.json()).catch(()=>[]);
  const en=new Set((Array.isArray(kw)?kw:[]).filter(k=>String(k.state).toUpperCase()==='ENABLED').map(k=>String(k.keywordId)));
  console.log(`  ${en.size} enabled SB keywords readable`);
  const hits=rows.filter(x=>bad(x.c,x.o,x.s)&&en.has(x.id));
  if(!hits.length) console.log('  CLEAN: nothing past the bar is still enabled');
  hits.sort((a,b)=>b.c-a.c).forEach(x=>{offenders++;console.log(`  STILL ON  $${x.c.toFixed(2)}  ${x.o} ord  [${x.m}] ${x.t}  id=${x.id}`);});
}
console.log(`\n${'='.repeat(70)}\nTOTAL still enabled past the bar: ${offenders}`);
