/** READ-ONLY. What does the Canadian shelf look like? Catalog search on Amazon.ca for our terms,
 *  then the live buy-box price for each result. */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const SP='https://sellingpartnerapi-na.amazon.com';
const arg=n=>(process.argv.find(a=>a.startsWith('--'+n+'='))||'').split('=')[1];
const MARKET=(arg('market')||'CA').toUpperCase();
const MKTS={CA:['A2EUQ1WTGCTBG2','CAD'],MX:['A1AM78C64UM0Y8','MXN'],BR:['A2Q3Y263D00KWC','BRL'],US:['ATVPDKIKX0DER','USD']};
const [CA,CCY]=MKTS[MARKET]||MKTS.CA;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let tok;
for(let i=0;i<6;i++){try{const j=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();tok=j.access_token;if(tok)break;}catch(e){}await sleep(3000);}
const H={'x-amz-access-token':tok,'content-type':'application/json'};
async function jget(u){for(let i=0;i<7;i++){try{const r=await fetch(u,{headers:H});if(r.status===429){await sleep(9000);continue;}return{ok:r.ok,status:r.status,j:await r.json()};}catch(e){await sleep(4000);}}return{ok:false,status:0,j:{}};}

// Search in the language people there actually use, otherwise the shelf comes back empty.
const TERMS={
  CA:['retractable phone tether','phone tether','anti theft phone strap','phone lanyard retractable'],
  US:['retractable phone tether','phone tether','anti theft phone strap','phone lanyard retractable'],
  MX:['cordon para celular','correa antirrobo celular','cordon retractil celular','correa para celular'],
  BR:['cordao para celular','corda antifurto celular','cordao retratil celular','alca para celular'],
}[MARKET];
const found=new Map();
for(const t of TERMS){
  const r=await jget(`${SP}/catalog/2022-04-01/items?marketplaceIds=${CA}&keywords=${encodeURIComponent(t)}&includedData=summaries&pageSize=20`);
  if(!r.ok){console.log(`search "${t}" HTTP ${r.status} ${JSON.stringify(r.j).slice(0,120)}`);await sleep(2500);continue;}
  for(const it of r.j.items||[]){
    const s=(it.summaries||[])[0]||{};
    if(!found.has(it.asin)) found.set(it.asin,{asin:it.asin,brand:s.brand||'',title:(s.itemName||'').slice(0,70),terms:[]});
    found.get(it.asin).terms.push(t);
  }
  console.log(`search "${t}": ${(r.j.items||[]).length} results`);
  await sleep(2500);
}
console.log(`\n${found.size} distinct ASINs on the ${MARKET} shelf. Pulling buy-box prices...\n`);
const rows=[];
for(const f of [...found.values()].slice(0,30)){
  const r=await jget(`${SP}/products/pricing/v0/items/${f.asin}/offers?MarketplaceId=${CA}&ItemCondition=New`);
  let price=null,ship=null,prime=null,n=0;
  if(r.ok){
    const offers=r.j.payload?.Offers||[]; n=offers.length;
    const bb=offers.find(o=>o.IsBuyBoxWinner)||offers[0];
    if(bb){price=bb.ListingPrice?.Amount; ship=bb.Shipping?.Amount; prime=bb.PrimeInformation?.IsOfferPrime;}
  }
  rows.push({...f,price,n,prime});
  await sleep(2600);
}
rows.sort((a,b)=>(a.price??999)-(b.price??999));
console.log(`  ${CCY.padEnd(6)} offers  brand              title`);
for(const r of rows) console.log(`  ${r.price==null?'   -  ':String(r.price.toFixed(2)).padStart(6)}  ${String(r.n).padStart(5)}  ${String(r.brand).slice(0,17).padEnd(17)}  ${r.title}`);
const p=rows.map(r=>r.price).filter(x=>x!=null).sort((a,b)=>a-b);
if(p.length) console.log(`\nn=${p.length}  min ${p[0].toFixed(2)}  median ${p[Math.floor(p.length/2)].toFixed(2)}  max ${p[p.length-1].toFixed(2)}  mean ${(p.reduce((a,b)=>a+b,0)/p.length).toFixed(2)}  (${CCY})`);
