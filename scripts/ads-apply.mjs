/** Apply high-confidence ad fixes to the live US account:
 *   - PAUSE bleeders (>=$4 spent, 0 orders, 14d)
 *   - RAISE winners (orders, ACOS <40%) bid +50% (cap $2.00)
 *   - ADD "holdmate" as a campaign negative on the bleeders' campaigns
 *  Re-pulls the report to target exact keywordIds. RUN: node scripts/ads-apply.mjs */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {ADS_CLIENT_ID:CID,ADS_CLIENT_SECRET:CS,ADS_REFRESH_TOKEN:RT,ADS_PROFILE_ID:PID}=process.env;
const BASE='https://advertising-api.amazon.com';
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PID,'Content-Type':ct,'Accept':ct});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const iso=d=>d.toISOString().slice(0,10);

// bids per keyword
const kws=[]; let next;
do{const r=await fetch(`${BASE}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify({maxResults:1000,...(next?{nextToken:next}:{})})}).then(r=>r.json());(r.keywords||[]).forEach(k=>kws.push(k));next=r.nextToken;}while(next);
const bid={}; for(const k of kws) bid[k.keywordId]=k.bid;

// report
const cfg={name:'apply',startDate:iso(new Date(Date.now()-14*864e5)),endDate:iso(new Date()),configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['targeting'],columns:['keywordId','keyword','impressions','clicks','cost','sales14d','purchases14d','campaignId','adGroupId'],reportTypeId:'spTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}};
const reportId=(await fetch(`${BASE}/reporting/reports`,{method:'POST',headers:H('application/vnd.createasyncreportrequest.v3+json'),body:JSON.stringify(cfg)}).then(r=>r.json())).reportId;
console.log('report',reportId,'polling...'); let url;
for(let i=0;i<40;i++){await sleep(8000);const s=await fetch(`${BASE}/reporting/reports/${reportId}`,{headers:H('application/vnd.createasyncreportrequest.v3+json')}).then(r=>r.json());if(s.status==='COMPLETED'){url=s.url;break;}if(s.status==='FAILURE'){console.error('FAILURE');process.exit(1);}}
const rows=JSON.parse(gunzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).toString());

const bleeders=rows.filter(r=>r.cost>=4 && (r.purchases14d||0)===0);
const winners=rows.filter(r=>(r.purchases14d||0)>0 && r.sales14d>0 && (r.cost/r.sales14d)<0.40);
console.log(`bleeders=${bleeders.length} winners=${winners.length}`);

async function put(path,ct,body){const r=await fetch(`${BASE}${path}`,{method:'PUT',headers:H(ct),body:JSON.stringify(body)});return {ok:r.ok,status:r.status,t:(await r.text()).slice(0,200)};}
async function post(path,ct,body){const r=await fetch(`${BASE}${path}`,{method:'POST',headers:H(ct),body:JSON.stringify(body)});return {ok:r.ok,status:r.status,t:(await r.text()).slice(0,200)};}

// 1) Pause bleeders
if(bleeders.length){const r=await put('/sp/keywords','application/vnd.spKeyword.v3+json',{keywords:bleeders.map(b=>({keywordId:String(b.keywordId),state:'PAUSED'}))});console.log('PAUSE bleeders:',r.status, r.ok?'ok':r.t);bleeders.forEach(b=>console.log(`   paused ${b.keyword} ($${(b.cost||0).toFixed(2)} wasted)`));}
// 2) Raise winners +50% cap $2
if(winners.length){const ups=winners.map(w=>({keywordId:String(w.keywordId),bid:Math.min(2, +((bid[w.keywordId]||0.37)*1.5).toFixed(2))}));const r=await put('/sp/keywords','application/vnd.spKeyword.v3+json',{keywords:ups});console.log('RAISE winners:',r.status, r.ok?'ok':r.t);winners.forEach((w,i)=>console.log(`   ${w.keyword}: $${bid[w.keywordId]} -> $${ups[i].bid} (ACOS ${(w.cost/w.sales14d*100).toFixed(0)}%)`));}
// 3) Negative "holdmate" on bleeders' campaigns
const camps=[...new Set(bleeders.map(b=>String(b.campaignId)))];
if(camps.length){const r=await post('/sp/campaignNegativeKeywords','application/vnd.spCampaignNegativeKeyword.v3+json',{campaignNegativeKeywords:camps.map(c=>({campaignId:c,keywordText:'holdmate',matchType:'NEGATIVE_PHRASE',state:'ENABLED'}))});console.log('NEGATIVE holdmate:',r.status, r.ok?'ok':r.t);}
console.log('\nDone.');
