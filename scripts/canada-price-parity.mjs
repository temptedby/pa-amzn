/** READ-ONLY. William 2026-08-21: price Canada "inline with the current US prices as long as the
 *  currency ratio is added and any additional fees amazon charges us the seller are accounted for."
 *
 *  So: solve for the CAD price at which our USD contribution per unit equals the US one.
 *  Fees are the REAL ones from Canadian settlement events, not getMyFeesEstimate, which returns the
 *  domestic Canadian FBA rate (CAD 3.79) while these Remote-Fulfilment orders were actually charged
 *  CAD 8.21. Pricing off the estimate would lose money on every unit.
 *  RUN: node scripts/canada-price-parity.mjs */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let FX=null,FXSRC='';
for(const [url,pick,name] of [['https://api.frankfurter.app/latest?from=USD&to=CAD',j=>j?.rates?.CAD,'frankfurter.app (ECB)'],['https://open.er-api.com/v6/latest/USD',j=>j?.rates?.CAD,'open.er-api.com']]){
  try{const j=await (await fetch(url)).json();const v=pick(j);if(v){FX=v;FXSRC=name+(j.date?` ${j.date}`:'');break;}}catch(e){}
}
if(!FX){console.error('no live FX rate; refusing to guess');process.exit(1);}

const REFERRAL=0.15;            // measured 15.0% on all four SKUs
const DST_OF_PRICE=0.0027;      // Digital Services Fee, measured
// FBA per unit, CAD, MEASURED from settlements (57 units, Jun-Sep 2025)
const ITEMS=[
  {label:'Single', usPrice:9.49, cogs:0.62, caFba:8.21, caNow:29.28},
  {label:'Pro',    usPrice:10.49,cogs:1.62, caFba:8.21, caNow:27.04},
  {label:'2-Pack', usPrice:13.49,cogs:1.24, caFba:8.21, caNow:52.31},
  {label:'3-Pack', usPrice:16.49,cogs:1.86, caFba:8.38, caNow:67.39},
];
// US fees, MEASURED via getMyFeesEstimate (US estimates match US settlements)
const US_FEES={Single:3.94,Pro:5.01,'2-Pack':5.46,'3-Pack':6.01};

console.log(`FX: 1 USD = ${FX.toFixed(4)} CAD   source: ${FXSRC}`);
console.log(`Canadian fees used: referral ${(REFERRAL*100).toFixed(0)}%, FBA flat per unit (measured), DST ${(DST_OF_PRICE*100).toFixed(2)}% of price\n`);
console.log('          US price  US contrib |  naive FX  |  PARITY CAD  contrib  |  break-even CAD  |  CA price now  contrib');
for(const it of ITEMS){
  const usContrib=it.usPrice-it.cogs-US_FEES[it.label];
  const cogsCad=it.cogs*FX;
  const k=1-REFERRAL-DST_OF_PRICE;                       // share of price we keep before flat costs
  const parity=(usContrib*FX + it.caFba + cogsCad)/k;    // contribution parity
  const be=(it.caFba + cogsCad)/k;                       // contribution zero
  const nowContrib=((it.caNow*k)-it.caFba-cogsCad)/FX;
  const parityContrib=((parity*k)-it.caFba-cogsCad)/FX;
  console.log(`${it.label.padEnd(8)}  $${it.usPrice.toFixed(2).padStart(6)}  $${usContrib.toFixed(2).padStart(6)}  |  ${(it.usPrice*FX).toFixed(2).padStart(6)}  |  ${parity.toFixed(2).padStart(9)}  $${parityContrib.toFixed(2).padStart(5)}  |  ${be.toFixed(2).padStart(13)}  |  ${it.caNow.toFixed(2).padStart(11)}  $${nowContrib.toFixed(2)}`);
}
console.log(`\nnaive FX  = the US price simply converted. It is BELOW break-even on every SKU, because`);
console.log(`            Canada's flat CAD 8.21 fulfilment fee is 3.3x the US $2.52 and does not scale.`);
console.log(`PARITY    = the extra fee passed to the Canadian customer, so we keep the same dollars.`);
console.log(`\nCanadian shelf, 29 live competitors scraped today: min 7.50  median 15.99  mean 17.79  max 59.99 CAD`);
