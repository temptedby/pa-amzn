/** Pause Sponsored Brands keywords by exact text. Preview unless MODE=pause.
 *
 *  Big ids: SB keyword ids exceed 2^53, so JSON.parse silently corrupts them. Ids are lifted out of
 *  the raw response text by regex and grafted back on by position, the same trick sb-v2.ts uses.
 *  Write recipe (2026-08-06): PUT /sb/keywords, Content-Type application/json,
 *  Accept application/vnd.sbkeywordresponse.v3+json, BARE ARRAY, adGroupId required,
 *  and the campaign must be ENABLED or it 207s and silently does nothing.
 *
 *  RUN: node scripts/sb-pause.mjs "phone security"            (preview)
 *       MODE=pause node scripts/sb-pause.mjs "phone security"
 */
import { readFileSync } from 'node:fs'; import { URL } from 'node:url';
function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const LIVE=process.env.MODE==='pause';
const words=process.argv.slice(2).map(s=>s.toLowerCase().trim());
if(!words.length){console.error('usage: node scripts/sb-pause.mjs "word" ["word2"]');process.exit(1);}
const A='https://advertising-api.amazon.com';
const tk=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();
const H={Authorization:`Bearer ${tk.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID};

function parseIds(text,fields){
  const rows=JSON.parse(text);
  for(const f of fields){
    const re=new RegExp(`"${f}"\\s*:\\s*(\\d+)`,'g'); const found=[]; let m;
    while((m=re.exec(text))!==null) found.push(m[1]);
    if(found.length===rows.length) rows.forEach((r,i)=>{r[f]=found[i];});
  }
  return rows;
}

const cres=await fetch(`${A}/sb/v4/campaigns/list`,{method:'POST',headers:{...H,'Content-Type':'application/vnd.sbcampaignresource.v4+json',Accept:'application/vnd.sbcampaignresource.v4+json'},body:JSON.stringify({maxResults:100})});
const ctext=await cres.text();
const camps=new Map();
if(cres.ok){for(const c of parseIds(JSON.parse(ctext).campaigns?ctext.slice(ctext.indexOf('['),ctext.lastIndexOf(']')+1):ctext,['campaignId'])||[]){}}
// simpler + safe: campaign ids fit as strings via a direct regex scan over the raw payload
{ const cj=JSON.parse(ctext); const list=cj.campaigns||[];
  const ids=[...ctext.matchAll(/"campaignId"\s*:\s*"?(\d+)"?/g)].map(m=>m[1]);
  list.forEach((c,i)=>camps.set(ids[i]??String(c.campaignId),{name:c.name,state:String(c.state||'').toUpperCase()})); }

const kres=await fetch(`${A}/sb/keywords`,{headers:{...H,'Content-Type':'application/json',Accept:'application/vnd.sbkeyword.v3+json'}});
const ktext=await kres.text();
if(!kres.ok){console.error('read',kres.status,ktext.slice(0,300));process.exit(1);}
const kws=parseIds(ktext,['keywordId','adGroupId','campaignId']);
console.log(`SB keywords read: ${kws.length}`);

const hits=kws.filter(k=>words.includes(String(k.keywordText).toLowerCase().trim()));
if(!hits.length){console.log('no match');process.exit(0);}
const targets=[];
for(const k of hits){
  const c=camps.get(String(k.campaignId))||{};
  const st=String(k.state||'').toUpperCase();
  const cst=c.state||'?';
  const writable=st==='ENABLED'&&cst==='ENABLED';
  console.log(`  kw=${st.padEnd(8)} camp=${cst.padEnd(8)} $${k.bid}  ${String(k.matchType).toUpperCase().padEnd(7)} ${k.keywordText}  id=${k.keywordId}  [${c.name||'?'}]${writable?'   -> PAUSE':st==='ENABLED'?'   (campaign not ENABLED, cannot write)':'   (already off)'}`);
  if(writable) targets.push({keywordId:String(k.keywordId),adGroupId:String(k.adGroupId),state:'PAUSED'});
}
if(!targets.length){console.log('\nnothing to pause.');process.exit(0);}
if(!LIVE){console.log(`\nPREVIEW. ${targets.length} keyword(s) would be paused. Re-run with MODE=pause.`);process.exit(0);}

const put=await fetch(`${A}/sb/keywords`,{method:'PUT',headers:{...H,'Content-Type':'application/json',Accept:'application/vnd.sbkeywordresponse.v3+json'},body:JSON.stringify(targets)});
const ptext=await put.text();
console.log(`\nPUT /sb/keywords -> ${put.status}\n${ptext.slice(0,800)}`);

// CBC: never trust the response. Read the keywords back and print their real state.
await new Promise(r=>setTimeout(r,3000));
const vres=await fetch(`${A}/sb/keywords`,{headers:{...H,'Content-Type':'application/json',Accept:'application/vnd.sbkeyword.v3+json'}});
const vtext=await vres.text();
const after=parseIds(vtext,['keywordId','adGroupId','campaignId']).filter(k=>words.includes(String(k.keywordText).toLowerCase().trim()));
console.log('\n=== read back from Amazon ===');
for(const k of after) console.log(`  ${String(k.state).toUpperCase().padEnd(8)} $${k.bid}  ${String(k.matchType).toUpperCase().padEnd(7)} ${k.keywordText}`);
