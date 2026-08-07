/** Why did a word blow past $4? Day by day, and per live copy. READ-ONLY. */
import { readFileSync } from 'node:fs'; import { URL } from 'node:url';
import { createClient } from '@libsql/client';
const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const WORD=(process.argv[2]||'cell phone lanyards for women').toLowerCase();
const c=await db.execute('select * from kw_daily limit 1'); console.log('kw_daily cols:',c.columns.join(' | '),'\n');
const rows=await db.execute({sql:`SELECT day, match_type, ROUND(SUM(spend),2) s, ROUND(SUM(sales),2) sa, SUM(orders) o, SUM(clicks) cl
  FROM kw_daily WHERE lower(trim(word))=? GROUP BY day, match_type ORDER BY day`, args:[WORD]});
console.log(`"${WORD}" — every day it spent, by match type:\n`);
let run=0, month='';
for(const r of rows.rows){
  const m=String(r.day).slice(0,7);
  if(m!==month){ month=m; run=0; console.log(`  --- ${month} (the $4 rule resets each month) ---`); }
  run+=Number(r.s);
  const flag = run>4 ? '  <-- word is past $4 for the month' : '';
  console.log(`   ${r.day}  ${String(r.match_type).padEnd(7)} $${String(Number(r.s).toFixed(2)).padStart(5)}  ${String(r.cl||0).padStart(2)}clk ${r.o||0}ord  $${Number(r.sa).toFixed(2).padStart(5)}   month-to-date $${run.toFixed(2)}${flag}`);
}
// how many live copies of this word exist, and what did EACH spend
const A='https://advertising-api.amazon.com', CT='application/vnd.spKeyword.v3+json';
const t=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();
const H={Authorization:`Bearer ${t.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':CT,Accept:CT};
let next=null,kws=[];do{const res=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H,body:JSON.stringify({maxResults:1000,...(next?{nextToken:next}:{})})});const jj=await res.json();kws.push(...(jj.keywords||[]));next=jj.nextToken;}while(next);
const copies=kws.filter(k=>(k.keywordText||'').toLowerCase().trim()===WORD);
console.log(`\nlive copies of "${WORD}": ${copies.length}`);
for(const k of copies) console.log(`   ${k.state.padEnd(9)} $${String(k.bid).padEnd(5)} ${k.matchType.padEnd(7)} id=${k.keywordId}`);
