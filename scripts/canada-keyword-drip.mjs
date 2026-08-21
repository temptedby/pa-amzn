/** Drips proven US keywords into the Canadian account, 5 phrases a day as PHRASE + EXACT.
 *
 *  William 2026-08-21: "maybe just 5 per day and key the same $4 limit and add new search words as
 *  they convert as phrase and exact words", then "1 by 1 all equally important".
 *
 *  So there is NO ranking. Candidates are taken in a fixed order and every one gets the same CAD
 *  0.35 entry bid and the same CAD 4 trial. Deliberately not the 08-08 low-spend-first rule, which
 *  was about un-flooring existing US keywords, and not a proven-volume-first rule either.
 *
 *  The $4 kill and the converting-search-term harvest are NOT here. Both already live in
 *  runAdEngine and apply to Canada as soon as the Canadian run is deployed.
 *
 *  State is the account itself: a candidate already present in Canada is skipped, so the drip
 *  advances on its own and re-running is safe. A per-day guard stops a second run adding a second
 *  batch.
 *
 *  RUN: node scripts/canada-keyword-drip.mjs --dry    show today's batch, add nothing
 *       node scripts/canada-keyword-drip.mjs          add today's batch, then read it back
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const DRY=process.argv.includes('--dry');
const A='https://advertising-api.amazon.com';
const CA=process.env.ADS_PROFILE_ID_CA, AD_GROUP='277016880094866', CAMPAIGN='255794866012989';
const PER_DAY=5, BID=0.35, MATCH=['PHRASE','EXACT'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<6;i++){try{return await fetch(u,o);}catch(e){await sleep(4000);}}throw new Error('connect failed after 6 tries');}
let tok;for(let i=0;i<6;i++){try{tok=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();if(tok?.access_token)break;}catch(e){}await sleep(3000);}
const H=ct=>({Authorization:`Bearer ${tok.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':CA,'Content-Type':ct,'Accept':ct});
const KW='application/vnd.spKeyword.v3+json';

// A candidate has to be a keyword Amazon will actually accept.
//   asin="..."   is a product TARGET, not a keyword
//   +phone +leash is broad-modified syntax and Canada has no BROAD ad group
//   a free-standing dash is refused with PATTERN_NOT_MATCHED (proved live 2026-08-07)
//   Amazon caps a keyword at 80 characters and 10 words
const usable=w=>{
  const t=String(w||'').trim();
  if(!t) return false;
  if(/^asin=/i.test(t)) return false;
  if(t.includes('+')) return false;
  if(/(^|\s)[-–—](\s|$)/.test(t)) return false;
  if(t.length>80) return false;
  if(t.split(/\s+/).length>10) return false;
  if(!/^[a-z0-9 '&.]+$/i.test(t)) return false;
  return true;
};

const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const lt=await db.execute("select word, sum(spend) s, sum(sales) v, sum(orders) o from kw_lifetime group by word having v>0 and s>0 and v*1.0/s>=2.0 and o>=1 order by word asc");
const proven=lt.rows.filter(r=>usable(r.word));

const kres=await (await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H(KW),body:JSON.stringify({maxResults:1000,includeExtendedDataFields:true})})).json();
const caAll=kres.keywords||[];
const have=new Set(caAll.map(k=>`${k.keywordText.toLowerCase()}|${k.matchType}`));
const haveText=new Set(caAll.map(k=>k.keywordText.toLowerCase()));

const today=new Date().toISOString().slice(0,10);
const addedToday=new Set(caAll.filter(k=>String(k.extendedData?.creationDateTime||'').slice(0,10)===today).map(k=>k.keywordText.toLowerCase()));

const pool=proven.filter(r=>!haveText.has(String(r.word).toLowerCase()));
console.log(`pool: ${lt.rows.length} US lifetime winners at 2x+, ${proven.length} usable as keywords, ${pool.length} with no Canadian copy`);
console.log(`already added to Canada today: ${addedToday.size} phrases`);
const room=Math.max(0, PER_DAY-addedToday.size);
if(!room){ console.log(`\nToday's ${PER_DAY} are already in. Nothing to do.`); process.exit(0); }

const batch=pool.slice(0,room);
console.log(`\n=== ${DRY?'DRY RUN':'ADDING'} ${batch.length} phrases as ${MATCH.join(' + ')} at CAD ${BID} ===`);
for(const r of batch) console.log(`  ${(r.v/r.s).toFixed(1).padStart(5)}x  ${String(r.o).padStart(3)} US orders  "${r.word}"`);
const ops=[];
for(const r of batch) for(const m of MATCH){
  if(have.has(`${String(r.word).toLowerCase()}|${m}`)) continue;
  ops.push({campaignId:CAMPAIGN,adGroupId:AD_GROUP,keywordText:String(r.word),matchType:m,state:'ENABLED',bid:BID});
}
console.log(`\n${ops.length} keyword rows to create`);
if(DRY){ console.log('Dry run. Nothing added.'); process.exit(0); }

const res=await rq(`${A}/sp/keywords`,{method:'POST',headers:H(KW),body:JSON.stringify({keywords:ops})});
const j=await res.json().catch(()=>({}));
const ok=(j.keywords?.success||[]).length, bad=(j.keywords?.error||[]);
console.log(`HTTP ${res.status}  success ${ok}  error ${bad.length}`);
for(const e of bad.slice(0,6)) console.log('   ', JSON.stringify(e).slice(0,200));

console.log('\n=== READ-BACK FROM AMAZON ===');
await sleep(6000);
const k2=await (await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H(KW),body:JSON.stringify({maxResults:1000,includeExtendedDataFields:true})})).json();
const wanted=new Set(batch.map(b=>String(b.word).toLowerCase()));
const landed=(k2.keywords||[]).filter(k=>wanted.has(k.keywordText.toLowerCase()));
for(const k of landed.sort((a,b)=>a.keywordText.localeCompare(b.keywordText)))
  console.log(`  ${k.state.padEnd(8)} $${String(k.bid).padEnd(5)} ${k.matchType.padEnd(7)} "${k.keywordText}"  created ${String(k.extendedData?.creationDateTime||'').slice(0,19)}`);
console.log(`\n${landed.length} of ${ops.length} verified live in Canada. Total Canadian keywords now ${(k2.keywords||[]).length}.`);
