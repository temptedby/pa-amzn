/** READ-ONLY. Every WORD past the $4 line with no sale, month to date, SP and SB together.
 *
 *  Why a word and not a keyword: the $4 rule has always been evaluated per keyword ID, and the
 *  account holds up to 18 copies of the same word. Each copy stays under $4, the word blows past
 *  it, and nothing fires. This report aggregates by (text, match type) the way William states the
 *  rule, then lists every live copy so a kill can pause all of them at once.
 *
 *  SP spend comes from the engine's own cached MTD report (ads_report_jobs) so there is no queue
 *  wait. SB comes from the legacy v2 HSA day reports, which is the only path that returns rows for
 *  this profile's single-ad-group campaigns.
 *
 *  RUN: node scripts/over4.mjs [--line=4] [--json]
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';
import { createClient } from '@libsql/client';

function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const LINE=Number((process.argv.find(a=>a.startsWith('--line='))||'--line=4').split('=')[1]);
const JSON_OUT=process.argv.includes('--json');
const A='https://advertising-api.amazon.com';
const KW_CT='application/vnd.spKeyword.v3+json';
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const key=(t,m)=>`${String(t).toLowerCase().trim()}|${String(m).toUpperCase()}`;
const log=(...a)=>{if(!JSON_OUT)console.log(...a);};

async function token(){
  const j=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();
  return j.access_token;
}
const H=t=>({Authorization:`Bearer ${t}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID});

/** Amazon's advertising day runs 07:00Z to 07:00Z. Before 07:00Z we are still in yesterday. */
const accountDay=(at=Date.now())=>new Date(at-7*3600*1000).toISOString().slice(0,10);

/** SP: the engine already pulled month-to-date at 06:00. Reuse it rather than re-queue. */
async function spMtd(){
  const r=await db.execute("SELECT key,rows_json,collected_at FROM ads_report_jobs WHERE purpose='engine-mtd' AND status='COMPLETED' AND rows_json IS NOT NULL ORDER BY collected_at DESC LIMIT 1");
  if(!r.rows.length) return {rows:[],note:'no cached engine-mtd report'};
  const j=r.rows[0];
  const window=String(j.key).split('|').slice(3,5).join(' .. ');
  return {rows:JSON.parse(String(j.rows_json)),note:`cached ${window}, collected ${j.collected_at}`};
}

/** SB: legacy v2, one report per day. v3 returns COMPLETED with zero rows for these campaigns. */
async function sbDay(t,day){
  const v2=day.slice(0,4)+day.slice(5,7)+day.slice(8,10);
  const c=await fetch(`${A}/v2/hsa/keywords/report`,{method:'POST',headers:{...H(t),'Content-Type':'application/json'},body:JSON.stringify({reportDate:v2,metrics:'clicks,cost,attributedSales14d,attributedConversions14d,keywordText,matchType'})});
  if(!c.ok) return null;
  const {reportId}=await c.json(); if(!reportId) return null;
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,7000));
    const st=await (await fetch(`${A}/v2/reports/${reportId}`,{headers:H(t)})).json().catch(()=>({}));
    if(st.status==='FAILURE') return null;
    if(st.status!=='SUCCESS') continue;
    const dl=await fetch(`${A}/v2/reports/${reportId}/download`,{headers:H(t),redirect:'follow'});
    const b=Buffer.from(await dl.arrayBuffer());
    let txt; try{txt=gunzipSync(b).toString()}catch{txt=b.toString()}
    return JSON.parse(txt);
  }
  return null;
}

async function liveKeywords(t){
  let next=null,out=[];
  do{
    const res=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:{...H(t),'Content-Type':KW_CT,Accept:KW_CT},body:JSON.stringify({maxResults:1000,...(next?{nextToken:next}:{})})});
    if(!res.ok) break;
    const j=await res.json(); out.push(...(j.keywords||[])); next=j.nextToken;
  }while(next);
  return out;
}

const t=await token();
const today=accountDay();
const days=[]; for(let d=new Date(today+'T00:00:00Z');;){const s=d.toISOString().slice(0,10); if(s>today)break; if(s>='2026-08-01')days.unshift(s); d.setUTCDate(d.getUTCDate()-1); if(s<='2026-08-01')break;}
days.sort();

log(`OVER $${LINE.toFixed(2)} WITH NO SALE — ${days[0]} .. ${today}\n`);

const sp=await spMtd();
log(`Sponsored Products: ${sp.note}`);
const [sbDays,live]=await Promise.all([
  (async()=>{const o=[];for(const d of days){const r=await sbDay(t,d);o.push([d,r]);}return o;})(),
  liveKeywords(t),
]);
log(`Sponsored Brands:   ${sbDays.filter(([,r])=>r).length}/${days.length} days returned`);
log(`live SP keywords:   ${live.length}\n`);

// aggregate by word
const agg=new Map();
const bump=(t_,m,prod,cost,sales,orders,clicks)=>{
  const k=key(t_,m); if(!k.startsWith('|')&&!agg.has(k)) agg.set(k,{text:t_,match:String(m).toUpperCase(),sp:0,sb:0,sales:0,orders:0,clicks:0});
  const a=agg.get(k); if(!a) return;
  a[prod]+=cost; a.sales+=sales; a.orders+=orders; a.clicks+=clicks;
};
for(const r of sp.rows) bump(r.keyword??r.keywordText,r.matchType??'',"sp",Number(r.cost||0),Number(r.sales14d||0),Number(r.purchases14d||0),Number(r.clicks||0));
for(const [,rows] of sbDays){ if(!rows) continue;
  for(const r of rows) bump(r.keywordText,r.matchType,"sb",Number(r.cost||0),Number(r.attributedSales14d||0),Number(r.attributedConversions14d||0),Number(r.clicks||0)); }

const copies=new Map();
for(const k of live){const c=copies.get(key(k.keywordText,k.matchType))||[];c.push(k);copies.set(key(k.keywordText,k.matchType),c);}

const over=[...agg.values()].filter(a=>(a.sp+a.sb)>=LINE&&a.orders===0).sort((x,y)=>(y.sp+y.sb)-(x.sp+x.sb));

if(JSON_OUT){
  console.log(JSON.stringify(over.map(a=>({...a,total:+(a.sp+a.sb).toFixed(2),
    enabledIds:(copies.get(key(a.text,a.match))||[]).filter(k=>k.state==='ENABLED').map(k=>String(k.keywordId))})),null,2));
} else {
  let total=0;
  for(const a of over){
    const sum=a.sp+a.sb; total+=sum;
    const cs=copies.get(key(a.text,a.match))||[];
    const en=cs.filter(k=>k.state==='ENABLED');
    const src=[a.sp>0?`SP $${a.sp.toFixed(2)}`:null,a.sb>0?`SB $${a.sb.toFixed(2)}`:null].filter(Boolean).join(' + ');
    console.log(`$${sum.toFixed(2).padStart(7)}  ${String(a.clicks).padStart(3)} clicks  0 orders  ${a.match.padEnd(7)} ${a.text}`);
    console.log(`          ${src}   |  ${cs.length} copies live, ${en.length} ENABLED${en.length?': '+en.map(k=>`$${k.bid}`).join(' '):' (nothing to pause in SP)'}`);
  }
  console.log(`\n${over.length} words past $${LINE.toFixed(2)} with zero orders. $${total.toFixed(2)} burned month to date.`);
  const pausable=over.reduce((n,a)=>n+(copies.get(key(a.text,a.match))||[]).filter(k=>k.state==='ENABLED').length,0);
  console.log(`${pausable} enabled Sponsored Products keywords would be paused by a kill that pauses every copy.`);
}
