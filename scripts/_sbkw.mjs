import { readFileSync } from 'node:fs';
const r=readFileSync('/Users/williamholdeman/projects/PA-AMZN/.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const A='https://advertising-api.amazon.com';
const j=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();
const H={Authorization:`Bearer ${j.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID};
// campaigns first: a keyword inside a PAUSED campaign cannot be written at all
const cr=await fetch(`${A}/sb/v4/campaigns/list`,{method:'POST',headers:{...H,'Content-Type':'application/vnd.sbcampaignresource.v4+json',Accept:'application/vnd.sbcampaignresource.v4+json'},body:JSON.stringify({maxResults:100})});
const camps=new Map();
if(cr.ok){const cj=await cr.json();for(const c of (cj.campaigns||[]))camps.set(String(c.campaignId),{name:c.name,state:c.state});}
else console.log('campaigns',cr.status,(await cr.text()).slice(0,200));
const KR='application/vnd.sbkeyword.v3+json';
const res=await fetch(`${A}/sb/keywords`,{headers:{...H,'Content-Type':'application/json',Accept:KR}});
let kws=[];
if(!res.ok){console.log('kw read',res.status,(await res.text()).slice(0,300));}
else {const kj=await res.json(); kws=Array.isArray(kj)?kj:(kj.keywords||[]);}
console.log(`SB keywords: ${kws.length}`);
const want=(process.argv[2]||'phone security').toLowerCase();
console.log(`\n--- ENABLED keywords in ENABLED campaigns ---`);
for(const k of kws){
  const c=camps.get(String(k.campaignId))||{};
  if(k.state!=='ENABLED'||c.state!=='ENABLED')continue;
  console.log(`  ${String(k.keywordId).padEnd(16)} $${String(k.bid??'-').padEnd(5)} ${String(k.matchType).padEnd(7)} ${k.keywordText}   [${c.name?.slice(0,40)}]`);
}
console.log(`\n--- every copy of "${want}" ---`);
for(const k of kws.filter(k=>k.keywordText.toLowerCase()===want)){
  const c=camps.get(String(k.campaignId))||{};
  console.log(`  kw=${k.state.padEnd(9)} camp=${String(c.state).padEnd(9)} $${k.bid} ${k.matchType} id=${k.keywordId} adGroupId=${k.adGroupId} [${c.name}]`);
}
