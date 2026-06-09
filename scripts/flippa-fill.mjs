/**
 * Assemble the Feb-May 2026 P&L for the Flippa sheet:
 *   B Gross Revenue + C Amazon Fees  ← SP-API Finances (financialEvents)
 *   F Ad Spend + G Other Expenses    ← Amex CSV (Paco excluded as add-back)
 *   D Monthly Payouts = B - C ; H = C+E+F+G ; I = B - H
 * Prints the assembled rows for review. (Sheet write is a separate step.)
 * RUN: node scripts/flippa-fill.mjs "/path/to/amex.csv"
 */
import { readFileSync } from 'node:fs';

function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const { SP_API_CLIENT_ID:CID, SP_API_CLIENT_SECRET:CS, SP_API_REFRESH_TOKEN:RT } = process.env;
const MONTHS = ['2026-02','2026-03','2026-04','2026-05'];
const NAME = { '2026-02':'February 2026','2026-03':'March 2026','2026-04':'April 2026','2026-05':'May 2026' };

// ---- SP-API Finances ----
async function spToken(){
  const r = await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS}).toString()});
  const j = await r.json(); if(!r.ok) throw new Error('LWA: '+JSON.stringify(j)); return j.access_token;
}
async function finances(token){
  const rev={}, fee={};
  for(const m of MONTHS){ rev[m]=0; fee[m]=0; }
  let nextToken; const after='2026-02-01T00:00:00Z', before='2026-06-01T00:00:00Z';
  do{
    const qs=new URLSearchParams(nextToken?{NextToken:nextToken}:{PostedAfter:after,PostedBefore:before,MaxResultsPerPage:'100'});
    const r=await fetch(`https://sellingpartnerapi-na.amazon.com/finances/v0/financialEvents?${qs}`,{headers:{'x-amz-access-token':token}});
    const t=await r.text(); if(!r.ok) throw new Error(`Finances ${r.status}: ${t.slice(0,300)}`);
    const ev=JSON.parse(t).payload?.FinancialEvents||{};
    for(const s of ev.ShipmentEventList||[]){
      const mo=(s.PostedDate||'').slice(0,7); if(!(mo in rev)) continue;
      for(const it of s.ShipmentItemList||[]){
        for(const c of it.ItemChargeList||[]) if(c.ChargeType==='Principal') rev[mo]+=Number(c.ChargeAmount?.CurrencyAmount||0);
        for(const f of it.ItemFeeList||[]) fee[mo]+=Math.abs(Number(f.FeeAmount?.CurrencyAmount||0));
      }
    }
    nextToken=JSON.parse(t).payload?.NextToken;
  } while(nextToken);
  return { rev, fee };
}

// ---- Amex (F ad spend, G other excl Paco) ----
function parseCSV(t){const rows=[];let row=[],field='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){field+='"';i++;}else q=false;}else field+=c;}else if(c==='"')q=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}else if(c!=='\r')field+=c;}if(field.length||row.length){row.push(field);rows.push(row);}return rows;}
function amex(path){
  const rows=parseCSV(readFileSync(path,'utf8'));
  const head=rows[0].map(h=>h.trim()); const ix=n=>head.findIndex(h=>h.toLowerCase()===n.toLowerCase());
  const di=ix('Date'),ai=ix('Amount'),de=ix('Description');
  const ad={}, other={}, paco={}; for(const m of MONTHS){ad[m]=0;other[m]=0;paco[m]=0;}
  for(const r of rows.slice(1)){
    const mm=(r[di]||'').match(/^(\d{2})\/\d{2}\/2026$/); if(!mm) continue; const mo=`2026-${mm[1]}`; if(!(mo in ad)) continue;
    const amt=parseFloat((r[ai]||'0').replace(/[$,]/g,'')); if(!(amt>0)) continue;
    const d=(r[de]||'');
    if(/PACOSERVICES/i.test(d)){ paco[mo]+=amt; continue; }            // add-back, excluded
    if(/AMZN\.COM\/BILL/i.test(d)) ad[mo]+=amt;                          // Amazon ad billing
    else other[mo]+=amt;                                                 // everything else (incl Google WS, software, Cynthia, supplies)
  }
  return { ad, other, paco };
}

const f=n=>`$${n.toFixed(2)}`;
const amexPath = process.argv[2];
const token = await spToken();
const { rev, fee } = await finances(token);
const { ad, other, paco } = amex(amexPath);

console.log('\nMonth        | B Gross Rev | C Amz Fees | D Payouts | F Ad Spend | G Other | H Tot Exp | I Net    | (Paco add-back)');
const out={};
for(const m of MONTHS){
  const B=rev[m], C=fee[m], D=B-C, F=ad[m], G=other[m], E=0, H=C+E+F+G, I=B-H;
  out[m]={B,C,D,E,F,G,H,I,paco:paco[m]};
  console.log(`${NAME[m].padEnd(13)}| ${f(B).padStart(11)} | ${f(C).padStart(10)} | ${f(D).padStart(9)} | ${f(F).padStart(10)} | ${f(G).padStart(7)} | ${f(H).padStart(9)} | ${f(I).padStart(8)} | ${f(paco[m])}`);
}
console.log('\nReview vs your historical months (~$3-7k revenue, ~30-40% fees). If sane, I write these to the sheet.');
console.log(JSON.stringify(out));
