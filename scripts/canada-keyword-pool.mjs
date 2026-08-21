/** READ-ONLY. What is actually available to drip into Canada?
 *   1. keywords sitting PAUSED in the Canadian account
 *   2. US winners that have no Canadian copy
 *   3. Canadian search terms that have converted
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const A='https://advertising-api.amazon.com', CA=process.env.ADS_PROFILE_ID_CA, US=process.env.ADS_PROFILE_ID;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(url,opts,tries=6){for(let i=0;i<tries;i++){try{const r=await fetch(url,opts);return r;}catch(e){await sleep(4000);}}throw new Error('connect failed');}
let tok;for(let i=0;i<6;i++){try{tok=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();if(tok?.access_token)break;}catch(e){}await sleep(3000);}
const H=(pid,ct)=>({Authorization:`Bearer ${tok.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':pid,'Content-Type':ct,'Accept':ct});
const KW='application/vnd.spKeyword.v3+json';

const caK=await (await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H(CA,KW),body:JSON.stringify({maxResults:1000})})).json();
const caAll=caK.keywords||[];
const key=k=>`${k.keywordText.toLowerCase()}|${k.matchType}`;
const caHave=new Set(caAll.map(key));
const caText=new Set(caAll.map(k=>k.keywordText.toLowerCase()));
console.log(`=== 1. CANADIAN ACCOUNT: ${caAll.length} keywords ===`);
const byState={};for(const k of caAll)byState[k.state]=(byState[k.state]||0)+1;
console.log('   by state:',JSON.stringify(byState));
console.log('   PAUSED ones (candidates to switch back on):');
for(const k of caAll.filter(k=>k.state==='PAUSED')) console.log(`     $${String(k.bid).padEnd(5)} ${k.matchType.padEnd(7)} ${k.keywordText}`);
const mt={};for(const k of caAll.filter(k=>k.state==='ENABLED'))mt[k.matchType]=(mt[k.matchType]||0)+1;
console.log('   enabled by match type:',JSON.stringify(mt));

console.log(`\n=== 2. US WINNERS WITH NO CANADIAN COPY ===`);
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const j=await db.execute("select rows_json from ads_report_jobs where key like 'engine-mtd|SPONSORED_PRODUCTS%' and status='COMPLETED' order by requested_at desc limit 1");
const rows=JSON.parse(j.rows[0]?.rows_json||'[]');
const usWin=rows.filter(r=>(+r.sales14d||0)>0&&(+r.cost||0)>0&&(+r.sales14d)/(+r.cost)>=2)
  .sort((a,b)=>(b.sales14d/b.cost)-(a.sales14d/a.cost));
let missing=0, present=0;
for(const w of usWin){
  const t=String(w.keyword||'').toLowerCase();
  const has=caText.has(t);
  if(has) present++; else missing++;
  console.log(`   ${has?'in CA  ':'MISSING'}  ${(w.sales14d/w.cost).toFixed(1).padStart(5)}x  $${(+w.cost).toFixed(2).padStart(5)} -> $${(+w.sales14d).toFixed(2).padStart(6)}  ${w.keyword}`);
}
console.log(`   ${missing} of ${usWin.length} US winners have no Canadian copy at all`);

console.log(`\n=== 3. US LIFETIME WINNERS (deeper pool than this month) ===`);
try{
  const lt=await db.execute("select word, sum(spend) s, sum(sales) v, sum(orders) o from kw_lifetime group by word having v>0 and s>0 and v*1.0/s>=2.0 and o>=1 order by v desc limit 200");
  const cands=lt.rows.filter(r=>!caText.has(String(r.word).toLowerCase()));
  console.log(`   ${lt.rows.length} US lifetime winners at 2x+, ${cands.length} with no Canadian copy`);
  for(const r of cands.slice(0,30)) console.log(`     ${(r.v/r.s).toFixed(1).padStart(5)}x  ${String(r.o).padStart(3)} ord  $${Number(r.v).toFixed(2).padStart(8)} on $${Number(r.s).toFixed(2)}  ${r.word}`);
}catch(e){console.log('   kw_lifetime unavailable:',e.message);}
