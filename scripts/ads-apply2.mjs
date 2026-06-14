/** Apply the 90-day review to the live US account:
 *   TURN OFF 4 wasters; RAISE 4 converters (+20%, cap $2.50); LOWER worst bleeders (-20%, floor $0.10);
 *   ADD 7 converting search terms as EXACT keywords into the one converting campaign.
 *  Dry-run by default. RUN: MODE=live node scripts/ads-apply2.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const A='https://advertising-api.amazon.com';
const LIVE=process.env.MODE==='live';
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,'Accept':ct});
const round=(n,f=0.10,c=2.50)=>Math.max(f,Math.min(c,+n.toFixed(2)));
const norm=s=>s.toLowerCase().trim();

const OFF=['cell phone tether tab heavy duty','iphone retractable tether','holdmate','leash for iphone'];
const RAISE=['phone assured retractable phone tether','retractable phone holder belt clip','cell phone lanyard'];
const LOWER=['phone leash iphone 11','retractable phone lanyard tether','anti theft phone strap','cell phone tether retractable','cell phone case tether','phone tether tab','retractable cord for phone'];
const ADD=['phone tethered','securisee phone tether','retractable phone holder for disabled person','retractable phone holder with belt clip','cell phone case with tether strap','retractable tool tether','wired anti theft phone strap'];

// keyword list -> text map (id, state, bid, campaignId, adGroupId)
const kws=[];let next;do{const r=await fetch(`${A}/sp/keywords/list`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify({maxResults:1000,...(next?{nextToken:next}:{})})}).then(r=>r.json());(r.keywords||[]).forEach(k=>kws.push(k));next=r.nextToken;}while(next);
const byText=new Map();for(const k of kws){const t=norm(k.keywordText);if(!byText.has(t))byText.set(t,k);}
const have=new Set(kws.map(k=>k.matchType+'|'+norm(k.keywordText)));

// ADDs must go into a MANUAL keyword-targeted ad group (auto campaigns reject keywords).
// Use the ad group of an existing converting manual keyword so we know it's manual + enabled.
const anchor=byText.get(norm('phone assured retractable phone tether'))||byText.get(norm('cell phone lanyard'));
let camps=[],nt;do{const r=await fetch(`${A}/sp/campaigns/list`,{method:'POST',headers:H('application/vnd.spCampaign.v3+json'),body:JSON.stringify({maxResults:500,...(nt?{nextToken:nt}:{})})}).then(r=>r.json());(r.campaigns||[]).forEach(c=>camps.push(c));nt=r.nextToken;}while(nt);
const campById=Object.fromEntries(camps.map(c=>[String(c.campaignId),c]));
const conv={campaignId:anchor.campaignId,name:campById[String(anchor.campaignId)]?.name||'(anchor campaign)'};
const adGroup={adGroupId:anchor.adGroupId,name:'(anchor keyword ad group)'};
console.log(`ADD target (manual): campaign "${conv.name}" (${conv.campaignId}) state=${campById[String(conv.campaignId)]?.state} type=${campById[String(conv.campaignId)]?.targetingType}  adGroup ${adGroup.adGroupId}`);

// build operations
const offOps=[],bidOps=[],addOps=[];
for(const t of OFF){const k=byText.get(norm(t));if(k&&k.state!=='PAUSED')offOps.push({keywordId:String(k.keywordId),state:'PAUSED',_t:t,_bid:k.bid});}
for(const t of RAISE){const k=byText.get(norm(t));if(k)bidOps.push({keywordId:String(k.keywordId),bid:round((k.bid||0.37)*1.2),_t:t,_from:k.bid,_d:'raise'});}
for(const t of LOWER){const k=byText.get(norm(t));if(k&&(k.bid||0)>0.12)bidOps.push({keywordId:String(k.keywordId),bid:round((k.bid)*0.8),_t:t,_from:k.bid,_d:'lower'});}
for(const t of ADD){for(const mt of ['EXACT','PHRASE']){if(have.has(mt+'|'+norm(t))){console.log(`  skip ${mt} (exists): ${t}`);continue;}addOps.push({campaignId:String(conv.campaignId),adGroupId:String(adGroup.adGroupId),keywordText:t,matchType:mt,state:'ENABLED',bid:0.50});}}

console.log(`\nPLAN  turnOff=${offOps.length}  bidChanges=${bidOps.length}  addKeywords=${addOps.length}  (LIVE=${LIVE})`);
offOps.forEach(o=>console.log(`  OFF   "${o._t}" (was $${o._bid})`));
bidOps.forEach(o=>console.log(`  ${o._d.toUpperCase().padEnd(5)} "${o._t}"  $${o._from}->$${o.bid}`));
addOps.forEach(o=>console.log(`  ADD   ${o.matchType.padEnd(6)} "${o.keywordText}" @ $${o.bid}`));

if(!LIVE){console.log('\n(dry-run — MODE=live to apply)');process.exit(0);}
const put=b=>fetch(`${A}/sp/keywords`,{method:'PUT',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify(b)}).then(async r=>({s:r.status,t:(await r.text()).slice(0,300)}));
const post=b=>fetch(`${A}/sp/keywords`,{method:'POST',headers:H('application/vnd.spKeyword.v3+json'),body:JSON.stringify(b)}).then(async r=>({s:r.status,t:(await r.text()).slice(0,400)}));
if(offOps.length){const r=await put({keywords:offOps.map(({_t,_bid,...o})=>o)});console.log('\nTURN OFF:',r.s,r.t);}
if(bidOps.length){const r=await put({keywords:bidOps.map(({_t,_from,_d,...o})=>o)});console.log('BID CHANGES:',r.s,r.t);}
if(addOps.length){const r=await post({keywords:addOps});console.log('ADD KEYWORDS:',r.s,r.t);}
console.log('\nAPPLIED.');
