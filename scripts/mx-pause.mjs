/** Pause every Mexican Sponsored Products campaign. William 2026-08-26: "Let's pause Mexico".
 *  Proves the write TWICE: the per-item response body, then a re-read comparing state AND
 *  lastUpdateDateTime, because a state read-back alone cannot tell a landed write from a reverted one.
 *  RUN: node scripts/mx-pause.mjs [--live]   (default is a dry run) */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const LIVE=process.argv.includes('--live');
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const pid=process.env.ADS_PROFILE_ID_MX;
const CT='application/vnd.spCampaign.v3+json';
const H=()=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':pid,'Content-Type':CT,'Accept':CT});
const list=async()=>((await (await rq(`${A}/sp/campaigns/list`,{method:'POST',headers:H(),body:JSON.stringify({maxResults:100,includeExtendedDataFields:true})})).json()).campaigns)||[];

const before=await list();
const targets=before.filter(c=>String(c.state).toUpperCase()==='ENABLED');
console.log(`\nMEXICO profile ${pid}: ${before.length} campaigns, ${targets.length} ENABLED\n`);
for(const c of before) console.log(`   ${String(c.state).padEnd(8)} "${c.name}"  last change ${String(c.extendedData?.lastUpdateDateTime||'?').slice(0,19)}`);
if(!targets.length){console.log('\nnothing to pause.');process.exit(0);}
if(!LIVE){console.log(`\nDRY RUN. would pause ${targets.length}. re-run with --live`);process.exit(0);}

const wasStamp=new Map(before.map(c=>[String(c.campaignId),String(c.extendedData?.lastUpdateDateTime||'')]));
const r=await rq(`${A}/sp/campaigns`,{method:'PUT',headers:H(),body:JSON.stringify({campaigns:targets.map(c=>({campaignId:c.campaignId,state:'PAUSED'}))})});
const body=await r.json();
const ok=(body?.campaigns?.success||[]).length, bad=(body?.campaigns?.error||[]).length;
console.log(`\nPUT ${r.status}: ${ok} accepted, ${bad} refused`);
if(bad) console.log(JSON.stringify(body.campaigns.error).slice(0,400));

await sleep(4000);
const after=await list();
let proven=0;
for(const c of after.filter(c=>targets.some(t=>String(t.campaignId)===String(c.campaignId)))){
  const now=String(c.extendedData?.lastUpdateDateTime||'');
  const moved=now && now!==wasStamp.get(String(c.campaignId));
  const paused=String(c.state).toUpperCase()==='PAUSED';
  if(paused&&moved) proven++;
  console.log(`   ${paused?'PAUSED ':'STILL  '} ${moved?'timestamp moved':'TIMESTAMP UNCHANGED'}  "${c.name}"  ${now.slice(0,19)}`);
}
console.log(`\nVERIFIED PAUSED (state changed AND timestamp moved): ${proven} of ${targets.length}`);
