/** READ-ONLY. Every advertising type on this account: what exists, what is on, what it spends,
 *  and what it has ever returned. No writes of any kind.
 *
 *  Covers Sponsored Products, Sponsored Brands (incl. video), Sponsored Display and Sponsored TV,
 *  and probes for the ad types the account does NOT have, so "what else is there" has an answer.
 *
 *  RUN: node scripts/ad-types.mjs
 */
import { readFileSync } from 'node:fs'; import { URL } from 'node:url';
import { createClient } from '@libsql/client';
function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const A='https://advertising-api.amazon.com';
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const tok=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();
const H={Authorization:`Bearer ${tok.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID};
const money=n=>'$'+Number(n||0).toFixed(2);

// ---- what each product's campaign list looks like: endpoint, method, media type ----
const PRODUCTS=[
  {key:'SPONSORED_PRODUCTS', name:'Sponsored Products', path:'/sp/campaigns/list', method:'POST',
   ct:'application/vnd.spCampaign.v3+json', body:{maxResults:500}, pick:j=>j.campaigns||[]},
  {key:'SPONSORED_BRANDS',   name:'Sponsored Brands',   path:'/sb/v4/campaigns/list', method:'POST',
   ct:'application/vnd.sbcampaignresource.v4+json', body:{maxResults:100}, pick:j=>j.campaigns||[]},
  {key:'SPONSORED_DISPLAY',  name:'Sponsored Display',  path:'/sd/campaigns', method:'GET',
   ct:'application/json', pick:j=>Array.isArray(j)?j:(j.campaigns||[])},
];

// Budget usage bypasses the report queue entirely and returns a live percentage-of-budget-consumed.
// Each product needs its OWN vendor media type; a generic application/json returns nothing useful.
const USAGE={
  SPONSORED_PRODUCTS:{path:'/sp/campaigns/budget/usage', ct:'application/vnd.spcampaignbudgetusage.v1+json'},
  SPONSORED_BRANDS:  {path:'/sb/campaigns/budget/usage', ct:'application/vnd.sbcampaignbudgetusage.v1+json'},
  SPONSORED_DISPLAY: {path:'/sd/campaigns/budget/usage', ct:'application/vnd.sdcampaignbudgetusage.v1+json'},
};
//
// TRAP, measured 2026-08-07: the response carries `usageUpdatedTimestamp`, and Amazon does NOT
// refresh it continuously. At 16:12Z every campaign still read 07:00:00Z — the reset moment — with
// budgetUsagePercent 0.0. That is "not updated since the day rolled over", NOT "nothing spent".
// Read at 07:10Z it instead returns the PREVIOUS day's final figure, which is how $6.42 was
// reported as "spent today" that morning when it was really yesterday's tail.
// So the freshness stamp is returned alongside the number and always printed. Never quote a spend
// figure from this endpoint without saying how old it is.
async function spentToday(key, enabledIds){
  const u=USAGE[key]; if(!u||!enabledIds.length) return null;
  let spent=0, seen=0, newest=null;
  for(let i=0;i<enabledIds.length;i+=10){                     // the endpoint caps the batch
    const r=await fetch(`${A}${u.path}`,{method:'POST',headers:{...H,'Content-Type':u.ct,Accept:u.ct},
      body:JSON.stringify({campaignIds:enabledIds.slice(i,i+10)})});
    if(!r.ok) continue;
    const j=await r.json();
    for(const row of (j.success||[])){
      seen++;
      spent += Number(row.budget||0) * Number(row.budgetUsagePercent||0) / 100;
      const ts=row.usageUpdatedTimestamp;
      if(ts && (!newest || ts>newest)) newest=ts;
    }
  }
  return seen ? {spent, asOf:newest} : null;                   // null means "unreadable", not "$0"
}

console.log('='.repeat(78));
console.log('EVERY AD TYPE ON THIS ACCOUNT      profile '+process.env.ADS_PROFILE_ID+'      '+new Date().toISOString().slice(0,16)+'Z');
console.log('='.repeat(78));

const live={};
for(const p of PRODUCTS){
  const init={method:p.method,headers:{...H,'Content-Type':p.ct,Accept:p.ct}};
  if(p.body) init.body=JSON.stringify(p.body);
  const res=await fetch(`${A}${p.path}`,init);
  const text=await res.text();
  if(!res.ok){
    let why=text.slice(0,110).replace(/\s+/g,' ');
    console.log(`\n${p.name.padEnd(20)} NOT AVAILABLE  (${res.status})  ${why}`);
    live[p.key]=null; continue;
  }
  let camps=[]; try{ camps=p.pick(JSON.parse(text)); }catch{}
  const by=c=>String(c.state||'').toUpperCase();
  const on=camps.filter(c=>by(c)==='ENABLED'), paused=camps.filter(c=>by(c)==='PAUSED'), arch=camps.filter(c=>by(c)==='ARCHIVED');
  const budget=on.reduce((s,c)=>s+Number(c.budget?.budget??c.budget??c.dailyBudget??0),0);
  live[p.key]={camps,on,paused,arch,budget};
  console.log(`\n${p.name.padEnd(20)} ${String(camps.length).padStart(3)} campaigns   ${String(on.length).padStart(2)} ENABLED, ${paused.length} paused, ${arch.length} archived   ${money(budget)}/day authorised`);
  for(const c of on.slice(0,10)) console.log(`     on   ${money(c.budget?.budget??c.budget??c.dailyBudget??0).padStart(8)}/day  ${(c.name||'').slice(0,52)}`);
}

// ---- today's spend, from budget usage (bypasses the report queue entirely) ----
console.log('\n'+'-'.repeat(78));
console.log('SPENT TODAY  (Amazon\'s ad day resets 07:00 UTC / midnight Pacific)');
console.log('-'.repeat(78));
let todayTotal=0, stale=false;
for(const p of PRODUCTS){
  if(!live[p.key]) continue;
  const ids=live[p.key].on.map(c=>String(c.campaignId));
  const r=await spentToday(p.key, ids);
  if(!r){ console.log(`  ${p.name.padEnd(20)} ${'unreadable'.padStart(9)}   of ${money(live[p.key].budget)}/day authorised`); continue; }
  todayTotal+=r.spent;
  const ageMin=r.asOf ? Math.round((Date.now()-Date.parse(r.asOf))/60000) : null;
  const fresh = ageMin===null ? '' : ageMin>90 ? `   figure is ${Math.floor(ageMin/60)}h old — STALE` : `   as of ${r.asOf.slice(11,16)}Z`;
  if(ageMin!==null && ageMin>90) stale=true;
  console.log(`  ${p.name.padEnd(20)} ${money(r.spent).padStart(9)}   of ${money(live[p.key].budget)}/day authorised${fresh}`);
}
console.log(`  ${'TOTAL'.padEnd(20)} ${money(todayTotal).padStart(9)}`);
if(stale) console.log(`\n  ^ Amazon has not refreshed budget usage since the 07:00Z reset. Treat these as a FLOOR,\n    not as today's spend. For a real figure use a report, or sb-mtd.mjs for Sponsored Brands.`);

// ---- lifetime, from our own database (console exports back to 2019) ----
console.log('\n'+'-'.repeat(78));
console.log('LIFETIME BY AD TYPE  (our own database: console exports, 2019 onward)');
console.log('-'.repeat(78));
// campaign_lifetime is the AUTHORITATIVE total: it covers every campaign since 2019 including auto
// campaigns and Sponsored Display, which have no keyword rows at all. kw_lifetime is keyword-level
// only, so reading the account total off it flatters the result by excluding the campaigns that
// have no keywords. Both are shown, because the gap is the point.
const AD_TYPE={SP:'Sponsored Products', SB:'Sponsored Brands', SBV:'Sponsored Brands video', SD:'Sponsored Display'};
const cl=await db.execute(`SELECT COALESCE(ad_type,'?') t, COUNT(*) n, ROUND(SUM(spend_usd),2) spend,
  ROUND(SUM(sales_usd),2) sales, SUM(purchases) ord FROM campaign_lifetime GROUP BY t ORDER BY spend DESC`);
console.log('  ad type                    campaigns      spend         sales   orders   return');
let ts=0,tsa=0,tord=0;
for(const r of cl.rows){
  const s=Number(r.spend), sa=Number(r.sales); ts+=s; tsa+=sa; tord+=Number(r.ord||0);
  const roas=s>0?sa/s:0;
  console.log(`  ${(AD_TYPE[r.t]||r.t).padEnd(26)} ${String(r.n).padStart(5)} ${money(s).padStart(11)} ${money(sa).padStart(13)} ${String(r.ord).padStart(8)}   ${roas.toFixed(2)}x  ${roas>=1.92?'PROFITABLE':'LOSES MONEY'}`);
}
console.log(`  ${'EVERY CAMPAIGN SINCE 2019'.padEnd(26)} ${''.padStart(5)} ${money(ts).padStart(11)} ${money(tsa).padStart(13)} ${String(tord).padStart(8)}   ${(tsa/ts).toFixed(2)}x  ${tsa/ts>=1.92?'PROFITABLE':'LOSES MONEY'}`);
console.log(`\n  Break-even is 1.92x: $9.49 price - $0.62 COGS - $1.42 referral - $2.52 FBA.`);
console.log(`  Anything under that line loses money on every sale it makes.`);

const kw=await db.execute(`SELECT ROUND(SUM(spend),2) s, ROUND(SUM(sales),2) sa FROM kw_lifetime`);
const ks=Number(kw.rows[0].s), ksa=Number(kw.rows[0].sa);
console.log(`\n  (keyword-level rows alone read ${money(ks)} -> ${money(ksa)}, ${(ksa/ks).toFixed(2)}x. That EXCLUDES`);
console.log(`   auto campaigns and Sponsored Display, which have no keywords, so it is not the account total.)`);

// ---- ad types this account does NOT run ----
console.log('\n'+'-'.repeat(78));
console.log('WHAT ELSE EXISTS  (things Amazon sells that this account is not using)');
console.log('-'.repeat(78));
const probes=[
  ['Amazon DSP',            '/dsp/advertisers',        'programmatic display/video off Amazon; usually agency or $$ minimum'],
  ['Brand Store',           '/stores/list',            'free brand storefront page'],
  ['Posts / brand feed',    '/posts',                  'free organic brand social feed on Amazon'],
];
for(const [name,path,note] of probes){
  try{
    const r=await fetch(`${A}${path}`,{headers:{...H,Accept:'application/json'}});
    console.log(`  ${name.padEnd(22)} ${String(r.status).padEnd(5)} ${r.ok?'AVAILABLE':'not available via this API token'}   — ${note}`);
  }catch(e){ console.log(`  ${name.padEnd(22)} error  — ${note}`); }
}
console.log('\n  Sponsored TV, Sponsored Display video, Brand Store and Posts do not need a new API:');
console.log('  they need CREATIVE. That is the gate, not access.');
