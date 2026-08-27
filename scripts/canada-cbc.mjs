/** CBC. Everything below is a live call, not our record. */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const SP='https://sellingpartnerapi-na.amazon.com', CA='A2EUQ1WTGCTBG2', SELLER='ACXMWZZUZKFVD';
const A='https://advertising-api.amazon.com', CA_PROFILE='2269012516456949';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let spTok;for(let i=0;i<6;i++){try{const j=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();spTok=j.access_token;if(spTok)break;}catch(e){}await sleep(3000);}
const SH={'x-amz-access-token':spTok,'content-type':'application/json'};
async function jget(u){for(let i=0;i<6;i++){try{const r=await fetch(u,{headers:SH});if(r.status===429){await sleep(8000);continue;}return{ok:r.ok,status:r.status,j:await r.json()};}catch(e){await sleep(4000);}}return{ok:false,status:0,j:{}};}

console.log('=== 1. CANADIAN PRICES, from the BUYER side (Pricing API, not our listing record) ===');
const EXPECT={'B07Y5GZP1T':['Single',18.72],'B0BLLJLSDP':['Pro',20.72],'B097MGPCPC':['2-Pack',22.75],'B097MK5VZ4':['3-Pack',26.94]};
for(const [asin,[name,want]] of Object.entries(EXPECT)){
  const r=await jget(`${SP}/products/pricing/v0/items/${asin}/offers?MarketplaceId=${CA}&ItemCondition=New`);
  const offers=r.ok?(r.j.payload?.Offers||[]):[];
  const mine=offers.find(o=>o.MyOffer===true||o.SellerId===SELLER);
  const got=mine?.ListingPrice?.Amount;
  console.log(`  ${name.padEnd(8)} live CAD ${String(got??'-').padStart(6)}  expected ${String(want).padStart(6)}  ${got===want?'MATCH':'DIFFERS'}   buyBox=${mine?(mine.IsBuyBoxWinner?'OURS':'not ours'):'no offer'}  totalOffers=${offers.length}`);
  await sleep(2600);
}

console.log('\n=== 2. CANADIAN CAMPAIGN, live (should be UNCHANGED — the fix was blocked) ===');
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})}).then(r=>r.json());
const H=ct=>({Authorization:`Bearer ${tok.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':CA_PROFILE,'Content-Type':ct,'Accept':ct});
const c=await fetch(`${A}/sp/campaigns/list`,{method:'POST',headers:H('application/vnd.spCampaign.v3+json'),body:JSON.stringify({maxResults:100})}).then(r=>r.json());
const camp=(c.campaigns||[])[0];
console.log(`  budget ${camp?.budget?.budget} CAD/day   state ${camp?.state}`);
const p=await fetch(`${A}/sp/productAds/list`,{method:'POST',headers:H('application/vnd.spProductAd.v3+json'),body:JSON.stringify({maxResults:100})}).then(r=>r.json());
console.log(`  product ads: ${(p.productAds||[]).map(x=>x.asin+':'+x.state).join(', ')}`);
const k=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify({maxResults:1000})}).then(r=>r.json());
const en=(k.keywords||[]).filter(x=>x.state==='ENABLED');
const d={};for(const x of en)d[x.bid]=(d[x.bid]||0)+1;
console.log(`  enabled keywords ${en.length}, top bids:`, JSON.stringify(Object.fromEntries(Object.entries(d).sort((a,b)=>b[1]-a[1]).slice(0,5))));
console.log(`\n  => campaign is ${camp?.budget?.budget===100?'UNCHANGED, as expected':'CHANGED'}`);
