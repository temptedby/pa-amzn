/**
 * Read the Flippa financials Google Sheet to learn its structure before we fill
 * Feb-May 2026 numbers. Uses the hello@ token (spreadsheets scope).
 * RUN: node scripts/sheets-read.mjs
 */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const SHEET='1E19KQM3XioMBYQX_LSAthxNpGP6eQJKsqxCWv8dnClU';
const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const api=(p)=>fetch(`https://sheets.googleapis.com/v4/spreadsheets/${p}`,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{const t=await r.text();if(!r.ok)throw new Error(`${r.status}: ${t.slice(0,300)}`);return JSON.parse(t);});
try{
  const meta=await api(`${SHEET}?fields=properties.title,sheets.properties(title,sheetId,gridProperties)`);
  console.log('Spreadsheet:',meta.properties?.title);
  console.log('Tabs:');
  for(const s of meta.sheets||[]) console.log(`  - "${s.properties.title}" (gid=${s.properties.sheetId}, ${s.properties.gridProperties?.rowCount}x${s.properties.gridProperties?.columnCount})`);
  // Read the first tab's top-left block to see the layout.
  const first=meta.sheets?.[0]?.properties?.title;
  if(first){
    const vals=await api(`${SHEET}/values/${encodeURIComponent(first)}!A1:N40`);
    console.log(`\nValues from "${first}" (A1:N40):`);
    (vals.values||[]).forEach((row,i)=>console.log(String(i+1).padStart(3),'|',row.map(c=>String(c).slice(0,16)).join(' | ')));
  }
}catch(e){
  if(/SERVICE_DISABLED|has not been used/.test(e.message)) console.error('\nGoogle Sheets API is not enabled yet. Enable it on the Sheets tab, wait ~1 min, rerun.');
  else console.error('\nError:',e.message);
  process.exit(1);
}
