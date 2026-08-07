/** READ-ONLY. Sponsored Brands SEARCH TERM spend month-to-date, legacy v2. */
import { readFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib';
const r=readFileSync('/Users/williamholdeman/projects/PA-AMZN/.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const A='https://advertising-api.amazon.com';
const j=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();
const H={Authorization:`Bearer ${j.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json'};
const today=new Date(Date.now()-7*3600*1000).toISOString().slice(0,10);
const days=[]; for(let d=new Date(today.slice(0,8)+'01T00:00:00Z');d.toISOString().slice(0,10)<=today;d.setUTCDate(d.getUTCDate()+1))days.push(d.toISOString().slice(0,10));
const agg=new Map();
for(const day of days){
  const c=await fetch(`${A}/v2/hsa/keywords/report`,{method:'POST',headers:H,body:JSON.stringify({reportDate:day.replace(/-/g,''),segment:'query',metrics:'clicks,cost,attributedSales14d,attributedConversions14d,keywordText,matchType'})});
  if(!c.ok){console.error(day,'create',c.status,(await c.text()).slice(0,150));continue;}
  const {reportId}=await c.json(); if(!reportId){console.error(day,'no id');continue;}
  let rows=null;
  for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,5000));
    const st=await (await fetch(`${A}/v2/reports/${reportId}`,{headers:H})).json().catch(()=>({}));
    if(st.status==='FAILURE'){console.error(day,'FAILURE');break;}
    if(st.status!=='SUCCESS')continue;
    const dl=await fetch(`${A}/v2/reports/${reportId}/download`,{headers:H,redirect:'follow'});
    const b=Buffer.from(await dl.arrayBuffer()); let t;try{t=gunzipSync(b).toString()}catch{t=b.toString()}
    rows=JSON.parse(t);break;}
  if(!rows){console.error(day,'timeout');continue;}
  let s=0;
  for(const x of rows){const cost=Number(x.cost||0);s+=cost;
    const q=x.query??x.searchTerm??x.keywordText; if(!q)continue;
    if(!cost&&!Number(x.clicks||0))continue;
    const a=agg.get(q)||{q,spend:0,sales:0,orders:0,clicks:0,kw:x.keywordText,match:x.matchType};
    a.spend+=cost;a.sales+=Number(x.attributedSales14d||0);a.orders+=Number(x.attributedConversions14d||0);a.clicks+=Number(x.clicks||0);agg.set(q,a);}
  console.error(`${day}  ${rows.length} rows  $${s.toFixed(2)}  sample keys: ${Object.keys(rows[0]||{}).join(',')}`);
}
const out=[...agg.values()].sort((a,b)=>b.spend-a.spend);
console.log(`\nSB SEARCH TERMS ${days[0]} .. ${today}\n`);
for(const a of out) console.log(`  $${a.spend.toFixed(2).padStart(7)} ${String(a.clicks).padStart(3)}clk ${String(a.orders).padStart(2)}ord $${a.sales.toFixed(2).padStart(7)}  ${a.q}   [kw: ${a.kw} ${a.match}]${a.spend>=4&&a.orders===0?'  <<< OVER $4 NO SALE':''}`);
console.log(`\n${out.filter(a=>a.spend>=4&&a.orders===0).length} search term(s) past $4 with zero orders.`);
