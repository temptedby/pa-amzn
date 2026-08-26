/** READ-ONLY PREVIEW of William's 2026-08-26 rule: if we are not switching a word off, cut its bid
 *  80%. Two triggers, deliberately separate: converting under 1.5x at ANY spend, or $4 with no sale.
 *  Plus every ENABLED copy of a word that has earned a switch-off.
 *
 *  Month-to-date numbers come from OUR kw_day archive, not from a fresh Amazon report, so this runs
 *  in seconds rather than behind a 30-minute report queue. Live bid and state come from Amazon.
 *  WRITES NOTHING.
 *  RUN: node scripts/emergency-cut-preview.mjs [--bar=4] [--roas=1.5] [--cut=0.8] [--floor=0.10]
 */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const BAR=+arg('bar',4), MINROAS=+arg('roas',1.5), CUT=+arg('cut',0.8), FLOOR=+arg('floor',0.10);
const MONTH=new Date().toISOString().slice(0,7);
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});

let next=null,all=[];
do{const r=await (await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify({maxResults:1000,...(next?{nextToken:next}:{})})})).json();all.push(...(r.keywords||[]));next=r.nextToken||null;}while(next);

const mtd=new Map();
for(const r of (await db.execute({sql:"select keyword_id, word, round(sum(spend),2) s, round(sum(sales),2) sa, sum(orders) o from kw_day where day like ? group by keyword_id",args:[MONTH+'%']})).rows)
  mtd.set(String(r.keyword_id),{word:String(r.word||''),spend:+r.s,sales:+r.sa,orders:+r.o});

const key=w=>String(w??'').trim().toLowerCase().replace(/\s+/g,' ');
const qualifies=p=>(p.orders>0&&p.sales>0)?(p.sales/p.spend)<MINROAS:(p.spend>=BAR);
const cutTo=b=>{const f=Math.round(FLOOR*100),c=Math.max(f,Math.round((b>0?b:FLOOR)*100));return Math.max(f,Math.round(c*(1-CUT)))/100;};

// words that have earned a switch-off this month, whatever their state is now
const killedWords=new Set();
for(const [,p] of mtd) if(p.spend>=BAR&&(p.orders<=0||p.sales<=0||p.sales/p.spend<MINROAS)) killedWords.add(key(p.word));

const cuts=[],atFloor=[];
for(const k of all){
  if(k.state!=='ENABLED') continue;
  const p=mtd.get(String(k.keywordId))||{spend:0,sales:0,orders:0};
  const q=qualifies(p), ov=killedWords.has(key(k.keywordText));
  if(!q&&!ov) continue;
  const from=k.bid>0?k.bid:FLOOR, to=cutTo(from);
  if(to>=from){atFloor.push(k);continue;}
  cuts.push({id:String(k.keywordId),word:k.keywordText,match:k.matchType,from,to,trigger:q?'qualified':'overlap',
             spend:p.spend,roas:p.spend>0?p.sales/p.spend:0,orders:p.orders});
}
cuts.sort((a,b)=>(b.from-b.to)-(a.from-a.to));
const f=n=>Number(n).toFixed(2);
console.log(`\nEMERGENCY ${Math.round(CUT*100)}% CUT PREVIEW — US Sponsored Products, ${MONTH}.  bar $${BAR}, ROAS floor ${MINROAS}x, bid floor $${FLOOR}.`);
console.log(`${all.filter(k=>k.state==='ENABLED').length} enabled keywords. ${killedWords.size} distinct words have earned a switch-off this month.\n`);
console.log('  from     to   trigger    Aug spend   ROAS  match    keyword');
for(const c of cuts.slice(0,30))
  console.log(`  $${f(c.from).padStart(5)} $${f(c.to).padStart(5)}  ${c.trigger.padEnd(9)} $${f(c.spend).padStart(7)} ${(c.orders?c.roas.toFixed(2):'  -  ').padStart(6)}  ${String(c.match).toLowerCase().padEnd(7)} ${String(c.word).slice(0,42)}`);
if(cuts.length>30) console.log(`  ... and ${cuts.length-30} more`);
const q=cuts.filter(c=>c.trigger==='qualified'), ov=cuts.filter(c=>c.trigger==='overlap');
const sumBid=a=>a.reduce((t,c)=>t+c.from,0), sumTo=a=>a.reduce((t,c)=>t+c.to,0);
console.log(`\n${cuts.length} keywords would be cut this run.`);
console.log(`  ${q.length.toString().padStart(4)} qualified (own numbers)   bids $${f(sumBid(q))} -> $${f(sumTo(q))}`);
console.log(`  ${ov.length.toString().padStart(4)} overlap a switched-off word   bids $${f(sumBid(ov))} -> $${f(sumTo(ov))}`);
console.log(`  ${atFloor.length.toString().padStart(4)} already at the $${FLOOR} floor, nothing to cut`);
console.log(`\nTotal bid exposure $${f(sumBid(cuts))} -> $${f(sumTo(cuts))}, a ${(100*(1-sumTo(cuts)/sumBid(cuts))).toFixed(0)}% reduction in what we are willing to pay per click on these words.`);
console.log(`NOTE: a bid is a ceiling, not a spend. This does not predict a dollar saving; it removes these words from the top of the auction.`);
