/** OUR OWN HISTORY. Pull every day Amazon will still serve and keep it forever.
 *
 *  William 2026-08-23: "make sure we are saving data from this month to go back further once we
 *  build over time, to not just rely on Amazon's 65 day limit."
 *
 *  Amazon serves roughly 65 to 95 days of report history and then drops it. Every rule that reasons
 *  about a keyword's past is built on that sand: the three-month retirement rule needs three
 *  consecutive months, and by month four Amazon has forgotten month one. This writes the data into
 *  tables we own, at DAY grain, so nothing has to be recomputed from a window that has expired.
 *
 *  IDEMPOTENT. Re-running upserts. A sale attributed late updates the day it BELONGS to, not the
 *  day we noticed it, which is the whole point of keeping the day grain rather than a running total.
 *
 *  Reports are requested in <=31-day chunks because the Ads API refuses wider ones, and the queue
 *  can take 30 minutes in the 12-13Z window, so this is slow by nature. Run it and walk away.
 *
 *  RUN: node scripts/archive-history.mjs                # back as far as Amazon will go
 *       node scripts/archive-history.mjs --days=40      # shorter, for the daily top-up
 *       node scripts/archive-history.mjs --dry          # show what it would write
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const DAYS=+arg('days',95), DRY=process.argv.includes('--dry');
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const V3='application/vnd.createasyncreportrequest.v3+json';
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':V3,'Accept':V3};
const iso=d=>d.toISOString().slice(0,10);

/** <=31-day windows, newest first, so the most valuable data lands even if a later chunk fails. */
function windows(days){
  const out=[]; const today=new Date(iso(new Date())+'T12:00:00Z');
  let end=new Date(today);
  while((today-end)/864e5 < days){
    const start=new Date(end.getTime()-30*864e5);
    const floor=new Date(today.getTime()-days*864e5);
    out.push([iso(start<floor?floor:start), iso(end)]);
    end=new Date((start<floor?floor:start).getTime()-864e5);
    if(end<floor) break;
  }
  return out;
}

async function daily(start,end){
  const cr=await (await rq(`${A}/reporting/reports`,{method:'POST',headers:H,body:JSON.stringify({
    name:`archive-${start}-${end}`,startDate:start,endDate:end,
    configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['targeting'],
      columns:['date','keywordId','keyword','matchType','campaignId','adGroupId','impressions','clicks','cost','purchases14d','sales14d'],
      reportTypeId:'spTargeting',timeUnit:'DAILY',format:'GZIP_JSON'}})})).json();
  let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
  // A window older than Amazon's retention answers with an explicit error naming the earliest date
  // it will serve. That is not a failure, it is the edge of history, and it is worth printing.
  if(!rid) return {err:String(cr.detail||JSON.stringify(cr)).slice(0,220)};
  for(let i=0;i<200;i++){await sleep(8000);
    const s=await (await rq(`${A}/reporting/reports/${rid}`,{headers:H})).json();
    if(s.status==='COMPLETED') return {rows:JSON.parse(gunzipSync(Buffer.from(await (await rq(s.url)).arrayBuffer())).toString())};
    if(s.status==='FAILURE') return {err:'report FAILURE'};}
  return {err:'timeout'};
}

const wins=windows(DAYS);
console.log(`archiving Sponsored Products, ${wins.length} windows, newest first:`);
for(const [a,b] of wins) console.log(`   ${a} .. ${b}`);
console.log('');

const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
if(!DRY){
  // Strip the leading comment lines from each chunk first. schema.sql documents every table above
  // its definition, so splitting on ';' leaves each statement preceded by its comment block and an
  // anchored /^CREATE/ test matches nothing. That silently created no tables and the first insert
  // failed with "no such table: main.kw_day".
  const stmts = readFileSync(new URL('../src/lib/db/schema.sql',import.meta.url),'utf8')
    .split(';')
    .map(x => x.split('\n').filter(l => !/^\s*--/.test(l)).join('\n').trim())
    .filter(x => /^CREATE\s+(TABLE|INDEX)/i.test(x) && /(kw_day|kw_month|ad_day_observation)/.test(x));
  if(!stmts.length) throw new Error('no history-table DDL found in schema.sql — refusing to run');
  // Tables before indexes, whatever order they appear in the file.
  for(const stmt of stmts.filter(x=>/^CREATE\s+TABLE/i.test(x))) await db.execute(stmt);
  for(const stmt of stmts.filter(x=>/^CREATE\s+INDEX/i.test(x))) await db.execute(stmt);
  console.log(`DDL applied: ${stmts.length} statements`);
  console.log('tables ready: kw_day, kw_month, ad_day_observation\n');
}

const now=new Date().toISOString(); const today=iso(new Date());
let written=0, earliest=null, latest=null; const errs=[];
const monthAgg=new Map();

for(const [start,end] of wins){
  const r=await daily(start,end);
  if(r.err){ errs.push(`${start}..${end}: ${r.err}`); console.log(`  ${start}..${end}  NOT AVAILABLE — ${r.err}`); continue; }
  const rows=r.rows.filter(x=>x.keywordId!=null && x.date);
  console.log(`  ${start}..${end}  ${rows.length} keyword-days`);
  for(const x of rows){
    const day=String(x.date), kid=String(x.keywordId);
    if(!earliest||day<earliest) earliest=day;
    if(!latest||day>latest) latest=day;
    const spend=+x.cost||0, clicks=+x.clicks||0, imps=+x.impressions||0, orders=+x.purchases14d||0, sales=+x.sales14d||0;
    if(!DRY){
      await db.execute({sql:`INSERT INTO kw_day (keyword_id,day,word,match_type,campaign_id,ad_group_id,ad_product,spend,clicks,impressions,orders,sales,first_seen_at,updated_at)
        VALUES (?,?,?,?,?,?,'SPONSORED_PRODUCTS',?,?,?,?,?,?,?)
        ON CONFLICT(keyword_id,day,ad_product) DO UPDATE SET
          spend=excluded.spend, clicks=excluded.clicks, impressions=excluded.impressions,
          orders=excluded.orders, sales=excluded.sales, word=excluded.word,
          match_type=excluded.match_type, updated_at=excluded.updated_at`,
        args:[kid,day,x.keyword??null,x.matchType??null,x.campaignId!=null?String(x.campaignId):null,x.adGroupId!=null?String(x.adGroupId):null,spend,clicks,imps,orders,sales,now,now]});
    }
    written++;
    const mk=`${kid}|${day.slice(0,7)}`;
    const m=monthAgg.get(mk)??{kid,month:day.slice(0,7),word:x.keyword??null,mt:x.matchType??null,spend:0,clicks:0,imps:0,orders:0,sales:0,days:0};
    m.spend+=spend;m.clicks+=clicks;m.imps+=imps;m.orders+=orders;m.sales+=sales;if(spend>0)m.days++;
    monthAgg.set(mk,m);
  }
  // account-level reading of each day AS SEEN TODAY, so the settling curve builds itself
  if(!DRY){
    const perDay=new Map();
    for(const x of rows){const d=String(x.date);const o=perDay.get(d)??{s:0,c:0,or:0,sa:0};o.s+=+x.cost||0;o.c+=+x.clicks||0;o.or+=+x.purchases14d||0;o.sa+=+x.sales14d||0;perDay.set(d,o);}
    for(const [d,o] of perDay) await db.execute({sql:`INSERT INTO ad_day_observation (day,observed_on,ad_product,spend,clicks,orders,sales)
      VALUES (?,?,'SPONSORED_PRODUCTS',?,?,?,?) ON CONFLICT(day,observed_on,ad_product) DO UPDATE SET
      spend=excluded.spend, clicks=excluded.clicks, orders=excluded.orders, sales=excluded.sales`,
      args:[d,today,o.s,o.c,o.or,o.sa]});
  }
}

if(!DRY){
  for(const m of monthAgg.values()){
    await db.execute({sql:`INSERT INTO kw_month (keyword_id,month,word,match_type,ad_product,spend,clicks,impressions,orders,sales,days_with_spend,updated_at)
      VALUES (?,?,?,?,'SPONSORED_PRODUCTS',?,?,?,?,?,?,?)
      ON CONFLICT(keyword_id,month,ad_product) DO UPDATE SET
        spend=excluded.spend, clicks=excluded.clicks, impressions=excluded.impressions,
        orders=excluded.orders, sales=excluded.sales, days_with_spend=excluded.days_with_spend,
        word=excluded.word, match_type=excluded.match_type, updated_at=excluded.updated_at`,
      args:[m.kid,m.month,m.word,m.mt,m.spend,m.clicks,m.imps,m.orders,m.sales,m.days,now]});
  }
}

console.log(`\n${DRY?'WOULD WRITE':'WROTE'} ${written} keyword-days`);
console.log(`history now held: ${earliest??'-'} to ${latest??'-'}`);
if(!DRY){
  const mo=(await db.execute(`select month, count(distinct keyword_id) kws, round(sum(spend),2) spend, round(sum(sales),2) sales, sum(orders) orders from kw_month group by 1 order by 1`)).rows;
  console.log('\nper-month archive we now own, independent of Amazon:');
  console.log('month     keywords     spend     sales  orders');
  for(const r of mo) console.log(`${r.month}  ${String(r.kws).padStart(8)}  ${String(r.spend).padStart(8)}  ${String(r.sales).padStart(8)}  ${String(r.orders).padStart(6)}`);
  console.log(`\nthe three-month retirement rule needs 3 consecutive months. We now have ${mo.length}.`);
}
if(errs.length){ console.log('\nWINDOWS AMAZON WOULD NOT SERVE (this is the edge of its retention):'); for(const e of errs) console.log('  -',e); }
