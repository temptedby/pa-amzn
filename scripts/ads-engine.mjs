/** Daily ad engine — PREVIEW across the whole US account (no changes unless MODE=live).
 * Pulls all keywords + a 14d performance report, then proposes:
 *   - KILL: enabled keyword, spend >= $4, 0 orders (14d)  -> pause
 *   - SCALE: enabled, orders>0, ACOS < 25%  -> bid +20%   | <40% -> +10%
 *   - CUT:   enabled, orders>0, ACOS >= 60% -> bid -15%
 *   - RELAUNCH: PAUSED keyword that was profitable (orders>0, ACOS<40% in 14d) -> re-enable
 * Harvest (search terms -> new keywords) is a separate pass (ads-harvest). Bid floor $0.10, cap $2.50.
 * RUN: node scripts/ads-engine.mjs        (preview)
 *      MODE=live node scripts/ads-engine.mjs  (apply)
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {ADS_CLIENT_ID:CID,ADS_CLIENT_SECRET:CS,ADS_REFRESH_TOKEN:RT,ADS_PROFILE_ID:PID}=process.env;
const LIVE=process.env.MODE==='live';
const BASE='https://advertising-api.amazon.com';
const FLOOR=0.10, CAP=2.50;
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PID,'Content-Type':ct,'Accept':ct});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const iso=d=>d.toISOString().slice(0,10);

// keywords (all states)
const kws=[]; let next;
do{const r=await fetch(`${BASE}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify({maxResults:1000,...(next?{nextToken:next}:{})})}).then(r=>r.json());(r.keywords||[]).forEach(k=>kws.push(k));next=r.nextToken;}while(next);
const K={}; for(const k of kws) K[String(k.keywordId)]={bid:k.bid,state:k.state,text:k.keywordText};
console.log(`keywords: ${kws.length}`);

// 14d report
const cfg={name:'eng',startDate:iso(new Date(Date.now()-14*864e5)),endDate:iso(new Date()),configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['targeting'],columns:['keywordId','keyword','impressions','clicks','cost','sales14d','purchases14d'],reportTypeId:'spTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}};
const cr=await fetch(`${BASE}/reporting/reports`,{method:'POST',headers:H('application/vnd.createasyncreportrequest.v3+json'),body:JSON.stringify(cfg)}).then(r=>r.json());
// 425 = duplicate of a recent identical report; reuse the referenced report id
let rid=cr.reportId;
if(!rid && cr.code==='425'){ const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m) rid=m[1]; }
if(!rid){console.error('create report failed:',JSON.stringify(cr));process.exit(1);}
console.log('report',rid,'polling...');
let url; for(let i=0;i<90;i++){await sleep(10000);const s=await fetch(`${BASE}/reporting/reports/${rid}`,{headers:H('application/vnd.createasyncreportrequest.v3+json')}).then(r=>r.json());if(i%3===0)process.stdout.write(`[${s.status}]`);if(s.status==='COMPLETED'){url=s.url;break;}if(s.status==='FAILURE'){console.error('\nreport FAILURE:',JSON.stringify(s));process.exit(1);}}
console.log('');
if(!url){console.error('report did not complete in time');process.exit(1);}
const rows=JSON.parse(gunzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).toString());

const round=n=>Math.max(FLOOR,Math.min(CAP,+n.toFixed(2)));
const kill=[],scale=[],cut=[],relaunch=[];
for(const r of rows){
  const k=K[String(r.keywordId)]; if(!k) continue;
  const acos=r.sales14d>0?r.cost/r.sales14d:null;
  if(k.state==='ENABLED' && r.cost>=4 && (r.purchases14d||0)===0){ kill.push({id:r.keywordId,text:r.keyword,cost:r.cost}); continue; }
  if((r.purchases14d||0)>0 && acos!=null){
    if(k.state==='PAUSED' && acos<0.40){ relaunch.push({id:r.keywordId,text:r.keyword,acos,sales:r.sales14d}); continue; }
    if(k.state==='ENABLED'){
      if(acos<0.25) scale.push({id:r.keywordId,text:r.keyword,acos,from:k.bid,to:round(k.bid*1.2)});
      else if(acos<0.40) scale.push({id:r.keywordId,text:r.keyword,acos,from:k.bid,to:round(k.bid*1.1)});
      else if(acos>=0.60) cut.push({id:r.keywordId,text:r.keyword,acos,from:k.bid,to:round(k.bid*0.85)});
    }
  }
}
const f=n=>`$${(n||0).toFixed(2)}`, pc=a=>a==null?'n/a':`${(a*100).toFixed(0)}%`;
console.log(`\n=== PREVIEW (14d) ===  kill:${kill.length}  scale-up:${scale.length}  cut:${cut.length}  relaunch-paused-winner:${relaunch.length}`);
console.log('\nKILL (>=$4, 0 orders -> pause):'); kill.slice(0,15).forEach(x=>console.log(`  ${f(x.cost)} wasted  ${x.text}`));
console.log('\nSCALE UP (low ACOS -> raise bid):'); scale.slice(0,15).forEach(x=>console.log(`  ACOS ${pc(x.acos)}  ${f(x.from)}->${f(x.to)}  ${x.text}`));
console.log('\nCUT (high ACOS -> lower bid):'); cut.slice(0,15).forEach(x=>console.log(`  ACOS ${pc(x.acos)}  ${f(x.from)}->${f(x.to)}  ${x.text}`));
console.log('\nRELAUNCH paused winners (re-enable):'); relaunch.slice(0,15).forEach(x=>console.log(`  ACOS ${pc(x.acos)}  ${f(x.sales)} sales  ${x.text}`));

if(LIVE){
  const put=(b)=>fetch(`${BASE}/sp/keywords`,{method:'PUT',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify(b)}).then(async r=>({ok:r.ok,t:(await r.text()).slice(0,150)}));
  if(kill.length) console.log('kill ->',(await put({keywords:kill.map(x=>({keywordId:String(x.id),state:'PAUSED'}))})).ok);
  if(scale.length) console.log('scale ->',(await put({keywords:scale.map(x=>({keywordId:String(x.id),bid:x.to}))})).ok);
  if(cut.length) console.log('cut ->',(await put({keywords:cut.map(x=>({keywordId:String(x.id),bid:x.to}))})).ok);
  if(relaunch.length) console.log('relaunch ->',(await put({keywords:relaunch.map(x=>({keywordId:String(x.id),state:'ENABLED'}))})).ok);
  console.log('APPLIED.');
} else console.log('\n(preview only — run MODE=live to apply)');
