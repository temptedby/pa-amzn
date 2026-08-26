/** READ-ONLY. August kills that still have an identical-match ENABLED twin, and what those twins cost.
 *  RUN: node scripts/dupe-twins.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
let next=null,all=[];
do{const r=await (await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify({maxResults:1000,...(next?{nextToken:next}:{})})})).json();all.push(...(r.keywords||[]));next=r.nextToken||null;}while(next);
const enabled=all.filter(k=>k.state==='ENABLED');
const key=k=>String(k.keywordText).toLowerCase()+'|'+String(k.matchType).toUpperCase();
const byKey=new Map(); for(const k of enabled){const q=key(k);if(!byKey.has(q))byKey.set(q,[]);byKey.get(q).push(k);}
const led=(await db.execute("select keyword_id, word, match_type, kill_spend, killed_at from kw_kill_ledger where month='2026-08'")).rows;
const spend=new Map();
for(const row of (await db.execute("select keyword_id, round(sum(spend),2) s, round(sum(sales),2) sa from kw_day where day>='2026-08-01' group by keyword_id")).rows) spend.set(String(row.keyword_id),{s:+row.s,sa:+row.sa});
let same=0, sameSpend=0, killedSpend=0;
console.log('KILLED this month with an ENABLED twin of the SAME word AND SAME match type:\n');
for(const r of led){
  const twins=byKey.get(String(r.word).toLowerCase()+'|'+String(r.match_type).toUpperCase())||[];
  if(twins.length){ same++; killedSpend+=+r.kill_spend;
    const ts=twins.map(t=>`$${t.bid} (Aug $${(spend.get(String(t.keywordId))?.s||0).toFixed(2)})`).join(', ');
    sameSpend+=twins.reduce((t,k)=>t+(spend.get(String(k.keywordId))?.s||0),0);
    console.log(`  killed $${(+r.kill_spend).toFixed(2).padStart(6)} ${String(r.match_type).toUpperCase().padEnd(7)} "${r.word}"  -> ${twins.length} live: ${ts}`);
  }
}
console.log(`\n${same} of ${led.length} August kills have an identical-match twin still ENABLED.`);
console.log(`Those kills stopped $${killedSpend.toFixed(2)} of spend; their live twins have already taken $${sameSpend.toFixed(2)} this August.`);
