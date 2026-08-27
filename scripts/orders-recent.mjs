/** READ-ONLY. Recent orders straight from the Orders API (no report queue), all NA marketplaces. */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const SP='https://sellingpartnerapi-na.amazon.com';
const MKTS={ATVPDKIKX0DER:'US',A2EUQ1WTGCTBG2:'CA',A1AM78C64UM0Y8:'MX',A2Q3Y263D00KWC:'BR'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const days=+((process.argv.find(a=>a.startsWith('--days='))||'--days=8').split('=')[1]);
const after=new Date(Date.now()-days*864e5).toISOString();
let next=null, all=[];
do{
  const u=next?`${SP}/orders/v0/orders?NextToken=${encodeURIComponent(next)}&MarketplaceIds=${Object.keys(MKTS).join(',')}`
              :`${SP}/orders/v0/orders?CreatedAfter=${after}&MarketplaceIds=${Object.keys(MKTS).join(',')}`;
  const r=await (await fetch(u,{headers:{'x-amz-access-token':tok}})).json();
  if(r.errors){console.log(JSON.stringify(r.errors).slice(0,300));break;}
  all.push(...(r.payload?.Orders||[]));
  next=r.payload?.NextToken||null;
  await sleep(1200);
}while(next && all.length<400);
const byDay={};
for(const o of all){
  const d=o.PurchaseDate.slice(0,10);
  const mk=MKTS[o.MarketplaceId]||o.MarketplaceId;
  const k=`${d} ${mk}`;
  byDay[k]??={n:0,units:0,amt:0,ccy:'',st:{}};
  byDay[k].n++; byDay[k].units+=o.NumberOfItemsShipped+o.NumberOfItemsUnshipped;
  byDay[k].amt+=+(o.OrderTotal?.Amount||0); byDay[k].ccy=o.OrderTotal?.CurrencyCode||byDay[k].ccy;
  byDay[k].st[o.OrderStatus]=(byDay[k].st[o.OrderStatus]||0)+1;
}
console.log(`orders created in the last ${days} days (UTC purchase date):\n`);
console.log('day        mkt  orders units    amount  statuses');
for(const k of Object.keys(byDay).sort().reverse()){
  const v=byDay[k];
  console.log(`${k.padEnd(12)} ${String(v.n).padStart(5)} ${String(v.units).padStart(5)} ${(v.amt).toFixed(2).padStart(9)} ${v.ccy}  ${JSON.stringify(v.st)}`);
}
console.log(`\nTOTAL orders ${all.length}`);
