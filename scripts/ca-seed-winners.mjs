/** Seed Canada with the US keywords that have PROVEN they convert. William 2026-08-26:
 *  "yes add proven winners to the keywords and ad strategies".
 *
 *  Source of truth is kw_lifetime, deduped to one row per (word, match type) because the table holds
 *  ~20 overlapping CSV exports and summing across `source` multiple-counts everything.
 *  Bar: 2+ lifetime orders AND 2x+ lifetime ROAS. Added as EXACT + PHRASE, skipping anything Canada
 *  already has. READ-ONLY unless --live.
 *  RUN: node scripts/ca-seed-winners.mjs [--top=40] [--bid=0.35] [--live] */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const TOP=+arg('top',40), BID=+arg('bid',0.35), LIVE=process.argv.includes('--live');
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const pid=process.env.ADS_PROFILE_ID_CA;
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':pid,'Content-Type':ct,'Accept':ct});

// ---- the winners, deduped
const r=await db.execute(`select lower(word) w, match_type mt, max(spend) spend, max(sales) sales, max(orders) o
  from kw_lifetime where coalesce(ad_product,'SPONSORED_PRODUCTS')='SPONSORED_PRODUCTS'
    and coalesce(marketplace,'US')='US' and word is not null and word<>'' and word not like 'asin=%'
  group by lower(word), match_type`);
const byWord=new Map();
for(const x of r.rows){const g=byWord.get(x.w)||{w:x.w,spend:0,sales:0,o:0};g.spend+=+x.spend;g.sales+=+x.sales;g.o+=+x.o;byWord.set(x.w,g);}
const winners=[...byWord.values()].filter(x=>x.o>=2&&x.spend>0&&x.sales/x.spend>=2)
  .map(x=>({...x,roas:x.sales/x.spend})).sort((a,b)=>b.roas-a.roas);

// ---- Amazon's hard limits: 80 chars, 10 words, no free-standing dash
const valid=t=>t.length<=80 && t.trim().split(/\s+/).length<=10 && !/(^|\s)[-–—]+(\s|$)/.test(t);

// ---- what Canada already has, and where to put them
const camps=((await (await rq(`${A}/sp/campaigns/list`,{method:'POST',headers:H('application/vnd.spCampaign.v3+json'),body:JSON.stringify({maxResults:100})})).json()).campaigns)||[];
const ags=((await (await rq(`${A}/sp/adGroups/list`,{method:'POST',headers:H('application/vnd.spAdGroup.v3+json'),body:JSON.stringify({maxResults:100})})).json()).adGroups)||[];
const kws=((await (await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify({maxResults:1000})})).json()).keywords)||[];
const have=new Set(kws.map(k=>`${k.adGroupId}|${String(k.matchType).toUpperCase()}|${String(k.keywordText).toLowerCase()}`));
// Manual keywords need a manual (non-auto) ad group. The Auto campaign takes targets, not keywords.
const autoCampIds=new Set(camps.filter(c=>String(c.targetingType||'').toUpperCase()==='AUTO').map(c=>String(c.campaignId)));
const target=ags.find(g=>!autoCampIds.has(String(g.campaignId)) && String(g.state).toUpperCase()==='ENABLED');
if(!target){console.log('no enabled MANUAL ad group in Canada to add to.');process.exit(1);}
const camp=camps.find(c=>String(c.campaignId)===String(target.campaignId));
console.log(`\nCanada target: ad group "${target.name}" in campaign "${camp?.name}" (${camp?.state})`);
console.log(`Canada already has ${kws.length} keywords. ${winners.length} US winners qualify (2+ orders, 2x+).\n`);

const adds=[];
for(const w of winners.slice(0,TOP)){
  if(!valid(w.w)) continue;
  for(const mt of ['EXACT','PHRASE']){
    if(have.has(`${target.adGroupId}|${mt}|${w.w}`)) continue;
    adds.push({campaignId:String(target.campaignId),adGroupId:String(target.adGroupId),
               keywordText:w.w,matchType:mt,state:'ENABLED',bid:BID,_roas:w.roas,_o:w.o});
  }
}
console.log(`  ROAS  ord   keyword`);
for(const w of winners.slice(0,TOP)) console.log(`  ${w.roas.toFixed(1).padStart(4)}x ${String(w.o).padStart(4)}   ${w.w}${valid(w.w)?'':'   << SKIPPED: too long for Amazon'}`);
console.log(`\n${adds.length} keywords would be created at CAD ${BID.toFixed(2)} (${adds.length/2} words x EXACT + PHRASE).`);
console.log(`Trial exposure at the CAD 5.50 kill bar: CAD ${(adds.length*5.5).toFixed(2)} worst case, against a CAD 15/day budget.`);
if(!LIVE){console.log(`\nDRY RUN. re-run with --live`);process.exit(0);}

const CT='application/vnd.spKeyword.v3+json';
const res=await rq(`${A}/sp/keywords`,{method:'POST',headers:H(CT),body:JSON.stringify({keywords:adds.map(({_roas,_o,...k})=>k)})});
const body=await res.json();
const ok=(body?.keywords?.success||[]).length, bad=(body?.keywords?.error||[]).length;
console.log(`\nPOST ${res.status}: ${ok} created, ${bad} refused`);
if(bad) console.log(JSON.stringify(body.keywords.error).slice(0,600));
await sleep(4000);
const after=((await (await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H(CT),body:JSON.stringify({maxResults:1000})})).json()).keywords)||[];
const now=new Set(after.map(k=>`${k.adGroupId}|${String(k.matchType).toUpperCase()}|${String(k.keywordText).toLowerCase()}`));
const proven=adds.filter(a=>now.has(`${a.adGroupId}|${a.matchType}|${a.keywordText}`)).length;
console.log(`VERIFIED PRESENT on a fresh read: ${proven} of ${adds.length}.  Canada now holds ${after.length} keywords.`);
