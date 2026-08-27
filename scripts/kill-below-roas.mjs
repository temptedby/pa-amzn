/** Pause every enabled KEYWORD that has spent the kill bar this month and is returning less than
 *  MIN_ROAS. William 2026-08-23: "ROAS below 1.5, we turn it off ... then you wait for it to be
 *  above two again with the attribution, or you leave it off."
 *
 *  Kills are written to kw_kill_ledger for THIS month, which is the table the engine's in-month
 *  revival reads. A word paused here is reconsidered automatically once attribution lifts it back
 *  above REVIVE_MIN_ROAS. Pausing outside the ledger would strand it.
 *
 *  Writes are verified twice: the 207 body is read per item, then the keyword is re-read and its
 *  lastUpdateDateTime compared, because a state read-back alone cannot tell a landed write from a
 *  reverted one.
 *
 *  RUN: node scripts/kill-below-roas.mjs                 # dry run, changes nothing
 *       node scripts/kill-below-roas.mjs --live          # apply
 *       node scripts/kill-below-roas.mjs --roas=1.5 --bar=4 --cache=/tmp/x.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const LIVE=process.argv.includes('--live');
const MIN_ROAS=+arg('roas',1.5), BAR=+arg('bar',4);
const START=arg('start',new Date().toISOString().slice(0,7)+'-01'), END=arg('end',new Date().toISOString().slice(0,10));
const MONTH=START.slice(0,7);
const CACHE=arg('cache','');
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
const V3='application/vnd.createasyncreportrequest.v3+json';
const KW_CT='application/vnd.spKeyword.v3+json';

// ---- month-to-date performance per target
let rows;
if(CACHE && existsSync(CACHE)){ rows=JSON.parse(readFileSync(CACHE,'utf8')); console.log(`using cached report (${rows.length} rows)`); }
else{
  const cr=await (await rq(`${A}/reporting/reports`,{method:'POST',headers:H(V3),body:JSON.stringify({
    name:`kill-below-roas-${START}-${END}`,startDate:START,endDate:END,
    configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['targeting'],
      columns:['keywordId','keyword','keywordType','matchType','campaignName','impressions','clicks','cost','purchases14d','sales14d'],
      reportTypeId:'spTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}})})).json();
  let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
  if(!rid){console.log('report create failed',JSON.stringify(cr).slice(0,300));process.exit(1);}
  console.log('report requested, this takes 3 to 30 minutes depending on the hour...');
  let url=null;
  for(let i=0;i<200;i++){await sleep(8000);
    const s=await (await rq(`${A}/reporting/reports/${rid}`,{headers:H(V3)})).json();
    if(s.status==='COMPLETED'){url=s.url;break;} if(s.status==='FAILURE'){console.log('report FAILURE');process.exit(1);}}
  if(!url){console.log('report did not complete');process.exit(1);}
  rows=JSON.parse(gunzipSync(Buffer.from(await (await rq(url)).arrayBuffer())).toString());
  if(CACHE) writeFileSync(CACHE,JSON.stringify(rows));
}

// ---- live keyword state. includeExtendedDataFields is REQUIRED: without it extendedData
// comes back undefined and the lastUpdateDateTime proof below compares undefined to
// undefined, reporting every write that DID land as unproven.
const live=new Map();
let next=null;
do{
  const r=await (await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H(KW_CT),body:JSON.stringify({maxResults:1000,includeExtendedDataFields:true,...(next?{nextToken:next}:{})})})).json();
  for(const k of (r.keywords||[])) live.set(String(k.keywordId),k);
  next=r.nextToken||null;
}while(next);

const picks=[];
for(const r of rows){
  const c=+r.cost||0, s=+r.sales14d||0;
  if(c < BAR) continue;
  const roas = c ? s/c : 0;
  if(roas >= MIN_ROAS) continue;
  const k=live.get(String(r.keywordId));
  if(!k) continue;                                   // product/auto target, not a keyword
  if(String(k.state).toUpperCase()!=='ENABLED') continue;
  picks.push({keywordId:String(r.keywordId), text:r.keyword||k.keywordText, matchType:(r.matchType||k.matchType||'').toLowerCase(),
              spend:c, sales:s, roas, clicks:r.clicks||0, bid:k.bid, before:k.extendedData?.lastUpdateDateTime});
}
picks.sort((a,b)=>b.spend-a.spend);

console.log(`\n${LIVE?'PAUSING':'WOULD PAUSE'}: enabled keywords with $${BAR}+ spent ${START} to ${END} and ROAS under ${MIN_ROAS}x\n`);
console.log('  spend   sales   ROAS  clicks   bid   match     keyword');
let tot=0;
for(const p of picks){tot+=p.spend;
  console.log(`${p.spend.toFixed(2).padStart(7)} ${p.sales.toFixed(2).padStart(7)} ${p.roas.toFixed(2).padStart(6)} ${String(p.clicks).padStart(7)} ${String(p.bid).padStart(5)}  ${p.matchType.padEnd(8)} ${p.text}`);}
console.log(`\n${picks.length} keywords, $${tot.toFixed(2)} spent this month.`);
if(!picks.length) process.exit(0);
if(!LIVE){console.log('\nDry run. Nothing changed. Add --live to apply.');process.exit(0);}

// ---- pause, in batches, reading the 207 per item
const applied=new Set();
for(let i=0;i<picks.length;i+=100){
  const batch=picks.slice(i,i+100);
  const r=await rq(`${A}/sp/keywords`,{method:'PUT',headers:H(KW_CT),body:JSON.stringify({keywords:batch.map(p=>({keywordId:p.keywordId,state:'PAUSED'}))})});
  const body=await r.json().catch(()=>({}));
  const succ=body?.keywords?.success||[]; const errs=body?.keywords?.error||[];
  for(const s of succ){const idx=s.index??-1; if(idx>=0&&batch[idx]) applied.add(batch[idx].keywordId);}
  console.log(`\nPUT ${r.status}: ${succ.length} accepted, ${errs.length} refused`);
  for(const e of errs.slice(0,5)) console.log('  refused:',JSON.stringify(e).slice(0,200));
}

// ---- prove it landed: re-read and compare lastUpdateDateTime
await sleep(6000);
const after=new Map(); next=null;
do{
  const r=await (await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H(KW_CT),body:JSON.stringify({maxResults:1000,includeExtendedDataFields:true,...(next?{nextToken:next}:{})})})).json();
  for(const k of (r.keywords||[])) after.set(String(k.keywordId),k);
  next=r.nextToken||null;
}while(next);

let proven=0, failed=[];
for(const p of picks){
  const k=after.get(p.keywordId);
  const nowState=String(k?.state||'?').toUpperCase();
  const stamp=k?.extendedData?.lastUpdateDateTime;
  const moved=stamp && stamp!==p.before;
  if(nowState==='PAUSED' && moved) proven++;
  else failed.push(`${p.text} [${p.matchType}] state=${nowState} stampMoved=${!!moved}`);
}
console.log(`\nVERIFIED PAUSED (state changed AND lastUpdateDateTime moved): ${proven} of ${picks.length}`);
for(const f of failed) console.log('  NOT PROVEN:',f);

// ---- ledger, so the engine's in-month revival owns them from here
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
await db.execute(`CREATE TABLE IF NOT EXISTS kw_kill_ledger (
  keyword_id TEXT NOT NULL, month TEXT NOT NULL, word TEXT, match_type TEXT,
  killed_at TEXT NOT NULL, kill_spend REAL, revived_at TEXT, revive_roas REAL,
  PRIMARY KEY (keyword_id, month))`);
const at=new Date().toISOString(); let logged=0;
for(const p of picks){
  const k=after.get(p.keywordId);
  if(String(k?.state||'').toUpperCase()!=='PAUSED') continue;
  await db.execute({sql:`INSERT INTO kw_kill_ledger (keyword_id, month, word, match_type, killed_at, kill_spend)
    VALUES (?,?,?,?,?,?) ON CONFLICT(keyword_id, month) DO NOTHING`,
    args:[p.keywordId,MONTH,p.text,p.matchType,at,p.spend]});
  logged++;
}
console.log(`ledgered for ${MONTH}: ${logged} (the engine will reconsider each one once attribution lifts it back over the revive bar)`);
