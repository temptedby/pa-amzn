/** Turn OFF every ENABLED keyword with >=$4 SETTLED spend returning under 1.5x.
 *  William 2026-10-07: "aything over $4 spend that has less than 1.5x roas should be turned off".
 *  SETTLED means on or before 14 days ago, so nothing is judged inside the attribution window
 *  (William 2026-10-06: "mind the attribution of 14 days").
 *  Judged PER keywordId, never per word: "cell phone lanyard tab" is 0.00x on $8.52 as a PHRASE
 *  and 2.21x on $4.29 as an EXACT, and only the first should go.
 *  Dry run by default. RUN: node scripts/kill-under-roas.mjs [--live] */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const LIVE=process.argv.includes('--live');
const KILL_SPEND=4, KILL_MIN_ROAS=1.5, ATTRIB=14;
const cutoff=new Date(Date.now()-ATTRIB*864e5).toISOString().slice(0,10);
const A='https://advertising-api.amazon.com';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const KCT='application/vnd.spKeyword.v3+json';
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':KCT,'Accept':KCT};
let kws=[],next;
do{ const r=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H,body:JSON.stringify({maxResults:500,stateFilter:{include:['ENABLED']},...(next?{nextToken:next}:{})})});
  const j=await r.json(); kws=kws.concat(j.keywords||[]); next=j.nextToken; }while(next);
const { createClient } = await import('@libsql/client');
const db = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
const perf=new Map();
for(const x of (await db.execute({sql:`SELECT keyword_id, ROUND(SUM(spend),2) sp, SUM(orders) ord, ROUND(SUM(sales),2) sa
  FROM kw_day WHERE ad_product='SPONSORED_PRODUCTS' AND day<=? GROUP BY keyword_id HAVING SUM(spend)>=?`,
  args:[cutoff,KILL_SPEND]})).rows) perf.set(String(x.keyword_id),{sp:+x.sp,ord:+x.ord,sa:+x.sa});

const hit=[];
for(const k of kws){
  const p=perf.get(String(k.keywordId)); if(!p) continue;          // no settled $4 -> not judged
  const roas=p.sp>0?p.sa/p.sp:0;
  if(p.ord>0 && p.sa>0 && roas>=KILL_MIN_ROAS) continue;           // passes the bar
  hit.push({id:String(k.keywordId),text:k.keywordText,mt:k.matchType,bid:k.bid,...p,roas});
}
hit.sort((a,b)=>b.sp-a.sp);
console.log(`settled cutoff ${cutoff}   enabled keywords ${kws.length}   with >=$${KILL_SPEND} settled spend ${perf.size}`);
console.log(`\nFAILING the ${KILL_MIN_ROAS}x bar: ${hit.length} keywords, $${hit.reduce((a,b)=>a+b.sp,0).toFixed(2)} of settled spend\n`);
console.log('   spend    roas  ord   bid   match    keyword');
for(const h of hit) console.log(`  ${('$'+h.sp.toFixed(2)).padStart(7)} ${h.roas.toFixed(2).padStart(6)}x ${String(h.ord).padStart(3)} ${('$'+(h.bid??0).toFixed(2)).padStart(6)}  ${String(h.mt).padEnd(7)} ${h.text}`);
if(!hit.length){ console.log('\nNothing to do.'); process.exit(0); }
if(!LIVE){ console.log('\nDRY RUN. Nothing changed. Add --live to apply.'); process.exit(0); }

const put=await fetch(`${A}/sp/keywords`,{method:'PUT',headers:H,body:JSON.stringify({keywords:hit.map(h=>({keywordId:h.id,state:'PAUSED'}))})});
const pt=await put.text();
console.log(`\nPUT /sp/keywords -> ${put.status}`);
if(!put.ok){ console.log(pt.slice(0,600)); process.exit(1); }

// CBC: a write is not done until Amazon says so on a fresh read.
await new Promise(r=>setTimeout(r,4000));
let ver=[],n2;
do{ const r=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H,body:JSON.stringify({maxResults:500,...(n2?{nextToken:n2}:{})})});
  const j=await r.json(); ver=ver.concat(j.keywords||[]); n2=j.nextToken; }while(n2);
const now=new Map(ver.map(k=>[String(k.keywordId),k.state]));
let ok=0,bad=0;
for(const h of hit){ const s=now.get(h.id); if(s==='PAUSED') ok++; else { bad++; console.log(`  STILL ${s}: ${h.mt} ${h.text}`); } }
console.log(`\nverified on a fresh read: ${ok} PAUSED, ${bad} not`);

// Record the ones that never converted, so no path can reopen them.
let tombed=0;
for(const h of hit){
  if(h.ord>0) continue;
  try{ const r=await db.execute({sql:`INSERT INTO kw_tombstone (dead_key, word, match_type, reason, evidence, killed_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(dead_key) DO NOTHING`,
    args:[`${h.text.toLowerCase()}|${h.mt}`,h.text,h.mt,'never_converted',
          JSON.stringify({settled_spend:h.sp,orders:0,cutoff}),new Date().toISOString()]});
    tombed+=r.rowsAffected||0; }catch(e){ console.log('tombstone failed:',e.message); }
}
console.log(`tombstoned (never converted): ${tombed}`);
