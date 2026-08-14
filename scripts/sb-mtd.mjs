/** READ-ONLY. Sponsored Brands month-to-date spend per word, via legacy v2 day reports.
 *  v3 returns COMPLETED with zero rows for this profile's single-ad-group campaigns.
 *  RUN: node scripts/sb-mtd.mjs [YYYY-MM-01]
 */
import { readFileSync, writeFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib';
const r=readFileSync('/Users/williamholdeman/projects/PA-AMZN/.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const A='https://advertising-api.amazon.com';
const j=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();
const H={Authorization:`Bearer ${j.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json'};
const today=new Date(Date.now()-7*3600*1000).toISOString().slice(0,10);  // account day resets 07:00Z
const from=process.argv[2]||today.slice(0,8)+'01';
const days=[]; for(let d=new Date(from+'T00:00:00Z');d.toISOString().slice(0,10)<=today;d.setUTCDate(d.getUTCDate()+1)) days.push(d.toISOString().slice(0,10));
const agg=new Map();
for(const day of days){
  const c=await fetch(`${A}/v2/hsa/keywords/report`,{method:'POST',headers:H,body:JSON.stringify({reportDate:day.replace(/-/g,''),metrics:'clicks,cost,attributedSales14d,attributedConversions14d,keywordText,matchType,campaignName'})});
  if(!c.ok){console.error(`${day} create ${c.status}`);continue;}
  const {reportId}=await c.json(); if(!reportId){console.error(day,'no reportId');continue;}
  let rows=null;
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,5000));
    const st=await (await fetch(`${A}/v2/reports/${reportId}`,{headers:H})).json().catch(()=>({}));
    if(st.status==='FAILURE'){console.error(day,'FAILURE');break;}
    if(st.status!=='SUCCESS')continue;
    const dl=await fetch(`${A}/v2/reports/${reportId}/download`,{headers:H,redirect:'follow'});
    const b=Buffer.from(await dl.arrayBuffer()); let t; try{t=gunzipSync(b).toString()}catch{t=b.toString()}
    rows=JSON.parse(t); break;
  }
  if(!rows){console.error(day,'timeout');continue;}
  let s=0;
  for(const x of rows){
    const cost=Number(x.cost||0); s+=cost;
    if(!cost&&!Number(x.clicks||0))continue;
    const k=`${String(x.keywordText).toLowerCase()}|${String(x.matchType).toUpperCase()}`;
    const a=agg.get(k)||{text:x.keywordText,match:String(x.matchType).toUpperCase(),spend:0,sales:0,orders:0,clicks:0,camp:x.campaignName};
    a.spend+=cost; a.sales+=Number(x.attributedSales14d||0); a.orders+=Number(x.attributedConversions14d||0); a.clicks+=Number(x.clicks||0);
    agg.set(k,a);
  }
  console.error(`${day}  ${rows.length} rows  $${s.toFixed(2)}`);
}
const out=[...agg.values()].sort((a,b)=>b.spend-a.spend);
console.log(`\nSPONSORED BRANDS ${days[0]} .. ${today}\n`);
let tot=0,totS=0;
for(const a of out){tot+=a.spend;totS+=a.sales;
  const flag=a.spend>=4&&a.orders===0?'  <<< OVER $4, NO SALE':'';
  console.log(`  $${a.spend.toFixed(2).padStart(7)}  ${String(a.clicks).padStart(3)}clk ${String(a.orders).padStart(2)}ord  $${a.sales.toFixed(2).padStart(7)}  ${a.match.padEnd(7)} ${a.text}${flag}`);}
console.log(`\n  TOTAL $${tot.toFixed(2)} spend, $${totS.toFixed(2)} sales`);
const over=out.filter(a=>a.spend>=4&&a.orders===0);
console.log(`\n${over.length} word(s) past $4 with zero orders, $${over.reduce((s,a)=>s+a.spend,0).toFixed(2)} burned.`);
writeFileSync('/private/tmp/claude-501/-Users-williamholdeman-projects-PA-AMZN/9536683e-8ed4-4593-94f4-212a1f8f2f1b/scratchpad/sb-mtd.json',JSON.stringify(out,null,1));
