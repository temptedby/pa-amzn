/** READ-ONLY. Can a shopper in each country actually buy each SKU right now?
 *  Answered from the BUYER side via the Pricing API, not from listing status, because a listing can
 *  read DISCOVERABLE and carry a price while no offer is visible to anyone. */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const SP='https://sellingpartnerapi-na.amazon.com', SELLER='ACXMWZZUZKFVD';
const MKT={US:['ATVPDKIKX0DER','USD'],CA:['A2EUQ1WTGCTBG2','CAD'],MX:['A1AM78C64UM0Y8','MXN'],BR:['A2Q3Y263D00KWC','BRL']};
const ASIN={'B07Y5GZP1T':'Single','B0BLLJLSDP':'Pro','B097MGPCPC':'2-Pack','B097MK5VZ4':'3-Pack'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<7;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('x');}
let tok;for(let i=0;i<6;i++){try{const j=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();tok=j.access_token;if(tok)break;}catch(e){}await sleep(3000);}
const H={'x-amz-access-token':tok,'content-type':'application/json'};
console.log('CAN A SHOPPER BUY IT? (our offer, visible, in that country\'s store)\n');
console.log('        Single            Pro               2-Pack            3-Pack');
for(const [cc,[id,ccy]] of Object.entries(MKT)){
  const cells=[];
  for(const asin of Object.keys(ASIN)){
    const r=await rq(`${SP}/products/pricing/v0/items/${asin}/offers?MarketplaceId=${id}&ItemCondition=New`,{headers:H});
    let cell='ERR';
    if(r.ok){
      const j=await r.json();
      const offers=j.payload?.Offers||[];
      const mine=offers.find(o=>o.MyOffer===true||o.SellerId===SELLER);
      cell = mine ? `YES ${String(mine.ListingPrice?.Amount).padStart(7)}${mine.IsBuyBoxWinner?'*':' '}` : `no  (${offers.length} rivals)`;
    } else { cell=`HTTP${r.status}`; }
    cells.push(cell.padEnd(17));
    await sleep(2600);
  }
  console.log(`${cc} ${ccy}  ${cells.join(' ')}`);
}
console.log('\n* = we hold the Buy Box.  "no" = our offer is not visible to shoppers there.');
