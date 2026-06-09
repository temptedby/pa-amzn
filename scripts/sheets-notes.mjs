/** Dump cells that have NOTES from the Flippa sheet (expense attribution). */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const SHEET='1E19KQM3XioMBYQX_LSAthxNpGP6eQJKsqxCWv8dnClU';
const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const col=(i)=>String.fromCharCode(65+i);
const d=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}?includeGridData=true&fields=sheets(properties.title,data(rowData(values(formattedValue,note))))`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
for(const s of d.sheets||[]){
  console.log(`\n===== ${s.properties.title} — cells with notes =====`);
  const rows=s.data?.[0]?.rowData||[];
  rows.forEach((row,ri)=>(row.values||[]).forEach((c,ci)=>{ if(c.note){ console.log(`${col(ci)}${ri+1} [${(c.formattedValue||'').slice(0,18)}]: ${c.note.replace(/\n/g,' / ').slice(0,260)}`); }}));
}
