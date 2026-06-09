/**
 * Insert Feb-May 2026 into the Flippa sheet (tab "12 Mo Trailing July 31 2025")
 * after Jan 2026 (row 19), matching the existing formula pattern, and extend the
 * Total + Average ranges. Paco excluded (add-back). Verified numbers below.
 * RUN: node scripts/flippa-write.mjs
 */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const SHEET='1E19KQM3XioMBYQX_LSAthxNpGP6eQJKsqxCWv8dnClU';
const TAB='12 Mo Trailing July 31 2025';
const SHEET_ID=1391964038;

// B Gross Rev, D Payouts(=B-Amazon fees), F Ad Spend, G Other (excl Paco). E=0.
const DATA=[
  { name:'February 2026', B:3957.22, D:2474.49, F:1655.82, G:714.55 },
  { name:'March 2026',    B:2984.92, D:1713.17, F:1051.41, G:535.67 },
  { name:'April 2026',    B:2183.29, D:1227.61, F:237.76,  G:24.51 },
  { name:'May 2026',      B:2247.00, D:1301.01, F:515.80,  G:164.86 },
];

const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const api=(p,init)=>fetch(`https://sheets.googleapis.com/v4/spreadsheets/${p}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init?.headers||{})}}).then(async r=>{const t=await r.text();if(!r.ok)throw new Error(`${r.status}: ${t.slice(0,400)}`);return t?JSON.parse(t):{};});

// 1) Insert 4 rows after Jan 2026 (row 19 = index 18; insert at index 19).
await api(`${SHEET}:batchUpdate`,{method:'POST',body:JSON.stringify({requests:[
  {insertDimension:{range:{sheetId:SHEET_ID,dimension:'ROWS',startIndex:19,endIndex:23},inheritFromBefore:true}}
]})});

// 2) Write the 4 months (rows 20-23) with values + per-row formulas, matching row 19.
const rowVals=DATA.map((d,i)=>{const r=20+i;return [d.name,d.B,`=B${r}-D${r}`,d.D,0,d.F,d.G,`=C${r}+E${r}+F${r}+G${r}`,`=D${r}-E${r}-F${r}-G${r}`,''];});

// 3) Total row shifted to 25; extend its sums to :23. Average row shifted to 29.
await api(`${SHEET}/values:batchUpdate`,{method:'POST',body:JSON.stringify({
  valueInputOption:'USER_ENTERED',
  data:[
    { range:`${TAB}!A20:J23`, values: rowVals },
    { range:`${TAB}!B25:I25`, values: [['=sum(B2:B23)','=sum(C2:C23)','=sum(D2:D23)','=sum(E2:E23)','=sum(F2:F23)','=sum(G2:G23)','','=sum(I2:I23)']] },
    { range:`${TAB}!B29`, values: [['=sum(B2:B23)/22']] },
  ],
})});

console.log('Wrote Feb-May 2026 (rows 20-23), extended Total (row 25) + Average (row 29).');
// 4) Read back rows 19-25 to confirm.
const back=await api(`${SHEET}/values/${encodeURIComponent(TAB)}!A19:I25`);
console.log('\nVerify:');
(back.values||[]).forEach((row,i)=>console.log((19+i)+' | '+row.map(c=>String(c).slice(0,12)).join(' | ')));
