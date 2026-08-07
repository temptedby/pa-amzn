import { readFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib';
const r=readFileSync('/Users/williamholdeman/projects/PA-AMZN/.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const A='https://advertising-api.amazon.com';
const j=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();
const H={Authorization:`Bearer ${j.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json'};
for(const day of ['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07']){
  const v2=day.replace(/-/g,'');
  const c=await fetch(`${A}/v2/hsa/keywords/report`,{method:'POST',headers:H,body:JSON.stringify({reportDate:v2,metrics:'clicks,cost,attributedSales14d,attributedConversions14d,keywordText,matchType'})});
  if(!c.ok){console.log(day,'CREATE FAIL',c.status,(await c.text()).slice(0,120));continue;}
  const {reportId}=await c.json();
  let done=false;
  for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,6000));
    const st=await (await fetch(`${A}/v2/reports/${reportId}`,{headers:H})).json().catch(()=>({}));
    if(st.status==='FAILURE'){console.log(day,'FAILURE');done=true;break;}
    if(st.status!=='SUCCESS')continue;
    const dl=await fetch(`${A}/v2/reports/${reportId}/download`,{headers:H,redirect:'follow'});
    const b=Buffer.from(await dl.arrayBuffer()); let t; try{t=gunzipSync(b).toString()}catch{t=b.toString()}
    const rows=JSON.parse(t); const spend=rows.reduce((s,r)=>s+Number(r.cost||0),0);
    console.log(`${day}  rows=${String(rows.length).padStart(4)}  spend=$${spend.toFixed(2)}`);
    done=true;break;}
  if(!done)console.log(day,'TIMEOUT');
}
