/** A tombstoned keyword must never be ENABLED. William 2026-10-06: "we are no longer resetting
 *  monthly we are keeping keywords dead unless they convert now not historically".
 *
 *  NO EXEMPTION FOR A GOOD-LOOKING DUPLICATE. William 2026-10-07, asked directly whether a
 *  tombstoned keyword returning 1.5x or better on SETTLED data should survive its bad twin:
 *  "no exempt of the duplicate". Tombstones are keyed on word + match type, so killing the copy
 *  that spent $9.27 at 1.02x also kills the copy that returned 5.33x on $2.53. That is the rule as
 *  stated, and it is consistent: 5.33x on settled data is history, and history no longer revives a
 *  word. Only converting NOW does.
 *  Dry run by default. RUN: node scripts/pause-zombies.mjs [--live] */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const LIVE=process.argv.includes('--live');
const A='https://advertising-api.amazon.com';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const KCT='application/vnd.spKeyword.v3+json';
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':KCT,'Accept':KCT};
let kws=[],next;
do{ const r=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H,body:JSON.stringify({maxResults:500,stateFilter:{include:['ENABLED']},...(next?{nextToken:next}:{})})});
  const j=await r.json(); kws=kws.concat(j.keywords||[]); next=j.nextToken; }while(next);
const { createClient } = await import('@libsql/client');
const db = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
const tomb=new Set((await db.execute('SELECT dead_key FROM kw_tombstone')).rows.map(r=>String(r.dead_key)));
const perf=new Map();
for(const x of (await db.execute(`SELECT keyword_id, ROUND(SUM(spend),2) sp, SUM(orders) ord, ROUND(SUM(sales),2) sa FROM kw_day WHERE ad_product='SPONSORED_PRODUCTS' AND day<='2026-09-23' GROUP BY keyword_id`)).rows) perf.set(String(x.keyword_id),{sp:+x.sp,ord:+x.ord,sa:+x.sa});
const z=kws.filter(k=>tomb.has(`${(k.keywordText||'').toLowerCase()}|${k.matchType}`));
console.log(`enabled ${kws.length}   tombstones ${tomb.size}   tombstoned AND enabled: ${z.length}`);
if(!z.length){ console.log('Nothing to do.'); process.exit(0); }
let spend=0;
console.log('\n   settled    roas  ord   bid   match    keyword');
for(const k of z.sort((a,b)=>(perf.get(String(b.keywordId))?.sp||0)-(perf.get(String(a.keywordId))?.sp||0))){
  const p=perf.get(String(k.keywordId))||{sp:0,ord:0,sa:0}; spend+=p.sp;
  const r=p.sp>0?(p.sa/p.sp).toFixed(2)+'x':'    -';
  console.log(`  ${('$'+p.sp.toFixed(2)).padStart(8)} ${String(r).padStart(7)} ${String(p.ord).padStart(3)} ${('$'+(k.bid??0).toFixed(2)).padStart(6)}  ${String(k.matchType).padEnd(7)} ${k.keywordText}`);
}
console.log(`\n${z.length} keywords, $${spend.toFixed(2)} of settled spend behind them`);
if(!LIVE){ console.log('\nDRY RUN. Nothing changed. Add --live to apply.'); process.exit(0); }
// Amazon caps a keyword PUT, so write in batches.
let done=0;
for(let i=0;i<z.length;i+=100){
  const batch=z.slice(i,i+100);
  const put=await fetch(`${A}/sp/keywords`,{method:'PUT',headers:H,body:JSON.stringify({keywords:batch.map(k=>({keywordId:String(k.keywordId),state:'PAUSED'}))})});
  console.log(`PUT batch ${i/100+1} (${batch.length}) -> ${put.status}`);
  if(!put.ok) console.log((await put.text()).slice(0,400)); else done+=batch.length;
}
await new Promise(r=>setTimeout(r,4000));
let ver=[],n2;
do{ const r=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H,body:JSON.stringify({maxResults:500,...(n2?{nextToken:n2}:{})})});
  const j=await r.json(); ver=ver.concat(j.keywords||[]); n2=j.nextToken; }while(n2);
const now=new Map(ver.map(k=>[String(k.keywordId),k.state]));
let ok=0,bad=0;
for(const k of z){ if(now.get(String(k.keywordId))==='PAUSED') ok++; else { bad++; console.log(`  STILL ${now.get(String(k.keywordId))}: ${k.matchType} ${k.keywordText}`); } }
console.log(`\nverified on a fresh read: ${ok} PAUSED, ${bad} not`);
const st=ver.reduce((m,k)=>{m[k.state]=(m[k.state]||0)+1;return m;},{});
console.log('live states now:', JSON.stringify(st));
