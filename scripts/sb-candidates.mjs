/** READ-ONLY. Which paused Sponsored Brands keywords are worth switching back on?
 *
 *  No writes of any kind: no Amazon mutations, no database inserts. Pure report.
 *
 *  Eligibility comes from LIFETIME history in kw_lifetime (console exports, 2019 onward), because
 *  SB reports return COMPLETED with zero rows for this profile and per-keyword ACOS is unknowable.
 *  Gate discovered 2026-08-06: a keyword inside a PAUSED campaign cannot be written at all, so the
 *  campaign must be ENABLED for the row to be actionable.
 *
 *  RUN: node scripts/sb-candidates.mjs [--n=10] [--minRoas=1.92]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { URL } from 'node:url';

function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const A='https://advertising-api.amazon.com';
const arg=(n,d)=>{const a=process.argv.find(x=>x.startsWith(`--${n}=`));return a?a.split('=')[1]:d;};
const N=Number(arg('n',10)), MIN_ROAS=Number(arg('minRoas',1.92));

const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN||process.env.TURSO_AUTH_TOKEN});
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const base={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID};

const camps=await fetch(`${A}/sb/v4/campaigns/list`,{method:'POST',headers:{...base,'Content-Type':'application/vnd.sbcampaignresource.v4+json','Accept':'application/vnd.sbcampaignresource.v4+json'},body:JSON.stringify({maxResults:100})}).then(r=>r.json());
const cInfo=new Map((camps.campaigns||[]).map(c=>[String(c.campaignId),{state:c.state,name:c.name,budget:c.budget?.budget}]));
const kws=await fetch(`${A}/sb/keywords`,{headers:{...base,'Content-Type':'application/json','Accept':'application/vnd.sbkeyword.v3+json'}}).then(r=>r.json());

const lt=new Map();
for(const row of (await db.execute(`SELECT word, match_type, SUM(spend) s, SUM(sales) sa, SUM(orders) o
   FROM kw_lifetime WHERE ad_product='SPONSORED_BRANDS' GROUP BY word, match_type`)).rows){
  const s=Number(row.s||0); if(s<=0) continue;
  lt.set(`${String(row.word).trim().toLowerCase()}|${String(row.match_type).toUpperCase()}`,
    {spend:s,sales:Number(row.sa||0),orders:Number(row.o||0),roas:Number(row.sa||0)/s});
}

const cands=[];
for(const k of kws){
  if(k.state!=='paused') continue;
  const c=cInfo.get(String(k.campaignId));
  if(!c||c.state!=='ENABLED') continue;
  const m=lt.get(`${(k.keywordText||'').trim().toLowerCase()}|${(k.matchType||'').toUpperCase()}`);
  if(!m||m.orders<2||m.roas<MIN_ROAS) continue;
  cands.push({k,m,c});
}
cands.sort((a,b)=>b.m.sales-a.m.sales);

console.log(`paused SB keywords in ENABLED campaigns at >= ${MIN_ROAS}x lifetime with 2+ orders: ${cands.length}`);
console.log(`\ntop ${Math.min(N,cands.length)} by lifetime sales:\n`);
console.log('  lifetime sales    roas   ord   bid    keyword');
let sales=0, spend=0;
for(const {k,m} of cands.slice(0,N)){
  sales+=m.sales; spend+=m.spend;
  console.log(`  $${m.sales.toFixed(2).padStart(9)}  ${m.roas.toFixed(2).padStart(5)}  ${String(m.orders).padStart(4)}  $${String(k.bid).padStart(4)}   ${k.keywordText} (${k.matchType})`);
}
console.log(`\n  those ${Math.min(N,cands.length)} words: $${spend.toFixed(2)} lifetime spend -> $${sales.toFixed(2)} sales`);

const cset=new Map();
for(const {k,c} of cands.slice(0,N)) cset.set(String(k.campaignId),c);
console.log('\nEXPOSURE — the campaigns they sit in:');
let cap=0;
for(const [,c] of cset){ cap+=Number(c.budget||0); console.log(`  $${String(c.budget).padStart(6)}/day  ${(c.name||'').slice(0,52)}`); }
console.log(`  worst case, whole budget consumed: $${cap.toFixed(2)}/day`);
console.log('\n  SB sales are not reportable, so there is NO per-keyword ACOS and NO $4 rule here.');
console.log('  Visibility is campaign-level daily spend. Kill switch is per keyword and instant.');
