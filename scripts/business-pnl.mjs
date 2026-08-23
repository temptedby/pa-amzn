/** READ-ONLY. The whole month at the REAL $2.00 all-in unit cost: every unit sold, ad and organic,
 *  what Amazon took, what we kept, and whether the month is actually up or down.
 *  William 2026-08-21: "$2 a unit our real all in costs". */
// Ad spend is NOT computed here. It is measured by scripts/tacos.mjs and passed in.
// A hardcoded default went stale on 2026-08-23 and understated the month's loss by $129.
const AD_ARG=(process.argv.find(a=>a.startsWith('--ad='))||'').split('=')[1];
if(!AD_ARG){console.log('\n  NO --ad= GIVEN. Run `node scripts/tacos.mjs` first, then pass its month ad spend:\n  node scripts/business-pnl.mjs --ad=868.21\n');process.exit(1);}
const AD=Number(AD_ARG);

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const SP='https://sellingpartnerapi-na.amazon.com';
const COST=2.00;
const FEE={'57-P4AJ-J4AC':[9.49,1.42,2.52],'UG-SVG8-LB0P':[10.49,1.57,3.44],'CPH-BLCK-2':[13.49,2.02,3.44],'CPH-BLCK-3':[16.49,2.47,3.54]};
const NAME={'57-P4AJ-J4AC':'Single','UG-SVG8-LB0P':'Pro','CPH-BLCK-2':'2-Pack','CPH-BLCK-3':'3-Pack'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<7;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch(e){await sleep(4000);}}throw new Error('x');}
let tok;for(let i=0;i<6;i++){try{const j=await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json();tok=j.access_token;if(tok)break;}catch(e){}await sleep(3000);}
const H={'x-amz-access-token':tok,'content-type':'application/json'};
// all-orders report, August. It ignores the marketplace filter, so read sales-channel per row.
const cr=await (await rq(`${SP}/reports/2021-06-30/reports`,{method:'POST',headers:H,body:JSON.stringify({
  reportType:'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
  dataStartTime:'2026-08-01T00:00:00Z', dataEndTime:new Date().toISOString(),
  marketplaceIds:['ATVPDKIKX0DER']})})).json();
let rid=cr.reportId; if(!rid){console.log('create failed',JSON.stringify(cr).slice(0,200));process.exit(1);}
let doc=null;
for(let i=0;i<60;i++){ await sleep(10000);
  const s=await (await rq(`${SP}/reports/2021-06-30/reports/${rid}`,{headers:H})).json();
  if(s.processingStatus==='DONE'){doc=s.reportDocumentId;break;}
  if(['CANCELLED','FATAL'].includes(s.processingStatus)){console.log('report',s.processingStatus);process.exit(1);}
}
if(!doc){console.log('report never finished');process.exit(1);}
const d=await (await rq(`${SP}/reports/2021-06-30/documents/${doc}`,{headers:H})).json();
let buf=Buffer.from(await (await rq(d.url)).arrayBuffer());
if(d.compressionAlgorithm==='GZIP') buf=gunzipSync(buf);
const lines=buf.toString('utf8').split('\n').filter(Boolean);
const head=lines[0].split('\t').map(x=>x.trim());
const ix=n=>head.indexOf(n);
const iSku=ix('sku'), iQty=ix('quantity'), iCh=ix('sales-channel'), iSt=ix('order-status'), iAmt=ix('item-price');
const tally={};
for(const line of lines.slice(1)){
  const c=line.split('\t');
  if(/cancel/i.test(c[iSt]||'')) continue;
  if(!/amazon\.com$/i.test((c[iCh]||'').trim())) continue;
  const sku=(c[iSku]||'').trim(), q=Number(c[iQty]||0);
  if(!FEE[sku]||!q) continue;
  tally[sku]=(tally[sku]||0)+q;
}
console.log(`AUGUST TO DATE, US, at a $${COST.toFixed(2)} all-in unit cost\n`);
console.log('          units    revenue   Amazon took   our cost   contribution');
let U=0,R=0,C=0;
for(const [sku,q] of Object.entries(tally)){
  const [p,ref,fba]=FEE[sku]; const rev=p*q, amz=(ref+fba)*q, cost=COST*q, con=rev-amz-cost;
  U+=q; R+=rev; C+=con;
  console.log(`${NAME[sku].padEnd(8)} ${String(q).padStart(6)}  ${rev.toFixed(2).padStart(9)}  ${amz.toFixed(2).padStart(11)}  ${cost.toFixed(2).padStart(9)}  ${con.toFixed(2).padStart(12)}`);
}
console.log(`${'TOTAL'.padEnd(8)} ${String(U).padStart(6)}  ${R.toFixed(2).padStart(9)}  ${''.padStart(11)}  ${''.padStart(9)}  ${C.toFixed(2).padStart(12)}`);
console.log(`\nblended break-even ACOS ${(100*C/R).toFixed(1)}%   (ROAS ${(R/C).toFixed(2)}x)`);
console.log(`\nad spend so far          $${AD.toFixed(2)}`);
console.log(`contribution on ALL units $${C.toFixed(2)}   (ad-driven AND organic)`);
console.log(`MONTH SO FAR              $${(C-AD).toFixed(2)}  ${C-AD<0?'DOWN':'UP'}`);
console.log(`\nto break even on the month we would need ad spend under $${C.toFixed(2)}, i.e. TACOS under ${(100*C/R).toFixed(1)}% of revenue.`);
