/** Validate Flippa numbers: compare computed payout vs ACTUAL PNC Amazon deposits,
 *  and pull refunds + service fees that the first pass ignored.
 *  RUN: node scripts/flippa-validate.mjs "/path/pnc.csv" */
import { readFileSync } from 'node:fs';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {SP_API_CLIENT_ID:CID,SP_API_CLIENT_SECRET:CS,SP_API_REFRESH_TOKEN:RT}=process.env;
const MO=['2026-02','2026-03','2026-04','2026-05'];
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}else if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c!=='\r')f+=c;}if(f.length||row.length){row.push(f);rows.push(row);}return rows;}

// PNC actual Amazon deposits per month
const pnc=parseCSV(readFileSync(process.argv[2],'utf8'));
const dep={}; for(const m of MO) dep[m]=0;
for(const r of pnc.slice(1)){
  const date=(r[0]||'').replace(/PENDING - /,''); const desc=(r[1]||''); const amt=parseFloat((r[2]||'').replace(/[^0-9.\-]/g,''))*((r[2]||'').includes('-')?-1:1);
  let mo; const m1=date.match(/^(\d{4})-(\d{2})/); const m2=date.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if(m1) mo=`${m1[1]}-${m1[2]}`; else if(m2) mo=`${m2[3]}-${m2[1]}`; else continue;
  if(!(mo in dep)) continue;
  if(/AMAZON/i.test(desc) && amt>0) dep[mo]+=amt;
}

// SP-API Finances: revenue, item fees, refunds, service fees
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const rev={},itemFee={},refund={},svcFee={}; for(const m of MO){rev[m]=itemFee[m]=refund[m]=svcFee[m]=0;}
let nt; do{
  const qs=new URLSearchParams(nt?{NextToken:nt}:{PostedAfter:'2026-02-01T00:00:00Z',PostedBefore:'2026-06-01T00:00:00Z',MaxResultsPerPage:'100'});
  const t=await fetch(`https://sellingpartnerapi-na.amazon.com/finances/v0/financialEvents?${qs}`,{headers:{'x-amz-access-token':tok}}).then(r=>r.text());
  const ev=JSON.parse(t).payload?.FinancialEvents||{}; nt=JSON.parse(t).payload?.NextToken;
  for(const s of ev.ShipmentEventList||[]){const mo=(s.PostedDate||'').slice(0,7);if(!(mo in rev))continue;for(const it of s.ShipmentItemList||[]){for(const c of it.ItemChargeList||[])if(c.ChargeType==='Principal')rev[mo]+=+(c.ChargeAmount?.CurrencyAmount||0);for(const f of it.ItemFeeList||[])itemFee[mo]+=Math.abs(+(f.FeeAmount?.CurrencyAmount||0));}}
  for(const s of ev.RefundEventList||[]){const mo=(s.PostedDate||'').slice(0,7);if(!(mo in refund))continue;for(const it of s.ShipmentItemAdjustmentList||[]){for(const c of it.ItemChargeAdjustmentList||[])if(c.ChargeType==='Principal')refund[mo]+=+(c.ChargeAmount?.CurrencyAmount||0);}}
  for(const s of ev.ServiceFeeEventList||[]){const mo=(s.PostedDate||'').slice(0,7);if(!(mo in svcFee))continue;for(const f of s.FeeList||[])svcFee[mo]+=Math.abs(+(f.FeeAmount?.CurrencyAmount||0));}
} while(nt);

const f=n=>`$${n.toFixed(2)}`;
console.log('Month   | GrossRev | ItemFees | Refunds | SvcFees | Computed Payout(B-fees-refunds-svc) | PNC ACTUAL deposits | diff');
for(const m of MO){
  const computedD=rev[m]-itemFee[m]+refund[m]-svcFee[m]; // refund is negative principal
  console.log(`${m} | ${f(rev[m]).padStart(8)} | ${f(itemFee[m]).padStart(8)} | ${f(refund[m]).padStart(7)} | ${f(svcFee[m]).padStart(7)} | ${f(computedD).padStart(12)} | ${f(dep[m]).padStart(12)} | ${f(computedD-dep[m])}`);
}
