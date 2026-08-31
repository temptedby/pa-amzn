import { createClient } from '@libsql/client'; import fs from 'node:fs';
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<6;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(8000);continue;}return r;}catch{await sleep(3000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const CT='application/vnd.spKeyword.v3+json';
const h={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':CT,Accept:CT};
const paused=[];let next;
do{const r=await rq(`${A}/sp/keywords/list`,{method:'POST',headers:h,body:JSON.stringify({maxResults:1000,stateFilter:{include:['PAUSED']},...(next?{nextToken:next}:{})})});
   const j=await r.json();(j.keywords??[]).forEach(k=>{if(k.state==='PAUSED')paused.push(k)});next=j.nextToken;}while(next);
const lt=new Map();
const r=await db.execute(`SELECT word,match_type,SUM(spend) spend,SUM(sales) sales,SUM(orders) orders FROM kw_lifetime WHERE COALESCE(ad_product,'SPONSORED_PRODUCTS')='SPONSORED_PRODUCTS' AND COALESCE(marketplace,'US')='US' GROUP BY word,match_type`);
for(const x of r.rows){const s=Number(x.spend||0);if(s<=0)continue;lt.set(`${String(x.word).toLowerCase().trim()}|${String(x.match_type).toUpperCase()}`,{roas:Number(x.sales||0)/s,orders:Number(x.orders||0),spend:s});}
const match=paused.map(k=>({k,e:lt.get(`${String(k.keywordText).toLowerCase().trim()}|${String(k.matchType).toUpperCase()}`)})).filter(x=>x.e);
console.log(`paused ${paused.length}, with lifetime history ${match.length}\n`);
console.log('ROAS bar   minOrders=1   minOrders=2   (both require a past conversion)');
for(const bar of [1.92,2.00,2.70]){
  const o1=match.filter(x=>x.e.orders>=1&&x.e.roas>=bar).length;
  const o2=match.filter(x=>x.e.orders>=2&&x.e.roas>=bar).length;
  console.log(`  ${bar.toFixed(2)}x  ${String(o1).padStart(11)}   ${String(o2).padStart(11)}`);
}
const cur=match.filter(x=>x.e.orders>=2&&x.e.roas>=1.92);
const nw =match.filter(x=>x.e.orders>=2&&x.e.roas>=2.00);
console.log(`\ncurrent code (1.92x, 2+ orders): ${cur.length}`);
console.log(`your rule    (2.00x, 2+ orders): ${nw.length}   -> ${cur.length-nw.length} fewer`);
const dropped=cur.filter(c=>!nw.includes(c));
console.log('\nDROPPED by moving 1.92 -> 2.00:');
for(const d of dropped) console.log(`  ${d.e.roas.toFixed(2)}x lifetime  (${(d.e.roas*0.556).toFixed(2)}x at today's price)  ${d.e.orders} ord  ${d.k.matchType} ${d.k.keywordText}`);
console.log('\nOf the words your rule WOULD still turn on, at today\'s $9.49 price:');
const resc=nw.map(x=>x.e.roas*0.556);
console.log(`  clear 2.67x break-even : ${resc.filter(v=>v>=2.67).length}`);
console.log(`  clear the 1.5x kill bar: ${resc.filter(v=>v>=1.5).length}`);
console.log(`  below the 1.5x kill bar: ${resc.filter(v=>v<1.5).length}`);
