/** Switch on the DEDICATED 3-Pack campaign so the 3-Pack test actually runs.
 *  William 2026-10-06: "update with focus on 3 pack" + "make sure the active words are all following the rules".
 *
 *  Why a dedicated campaign: the eight 3-Pack ads added to the Single's ad groups on 2026-09-30 took
 *  0 impressions and $0.00 in six days. Amazon serves one ad per ad group per auction and the Single
 *  (480 reviews) wins every time, so a product ad in a shared ad group buys no traffic.
 *
 *  Rules applied before enabling: the 11 enabled keywords carry 2023 bids of $2.00-$2.50, above
 *  BID_CONFIRM_CEILING ($0.85) and ~3x the $0.78/click the 3-Pack can afford at the measured 9.09%
 *  CVR. They are set to REINTRO_START_BID ($0.25) so the bid ladder climbs them from underneath.
 *  Budget is left exactly as it is ($2/day). No new spending commitment.
 *
 *  RUN: node scripts/three-pack-test-on.mjs            (dry run, default)
 *       node scripts/three-pack-test-on.mjs --apply
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const APPLY=process.argv.includes('--apply');
const CID='305834701368758', ENTRY=0.25, CEILING=0.85;
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
const tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const H=ct=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,Accept:ct});
const KW='application/vnd.spKeyword.v3+json', CA='application/vnd.spCampaign.v3+json';

let kws=[],n;
do{const k=await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H(KW),body:JSON.stringify({maxResults:1000,includeExtendedDataFields:true,campaignIdFilter:{include:[CID]},...(n?{nextToken:n}:{})})});
  const j=JSON.parse(await k.text()); (j.keywords||[]).forEach(x=>kws.push(x)); n=j.nextToken;}while(n);
// Never switch a tombstoned word back on. The campaign's EXACT "phone tether retractable" was
// retired on 2026-10-06 having spent the bar with no sale; enabling it would undo that.
const { createClient } = await import('@libsql/client');
const _db = createClient({ url: process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN });
const _dead = new Set((await _db.execute('SELECT dead_key FROM kw_tombstone')).rows.map(r => String(r.dead_key)));
const _dk = (t, m) => String(t).trim().toLowerCase().replace(/\s+/g, ' ') + '|' + String(m).trim().toUpperCase();
console.log(`${_dead.size} tombstoned words on record; any of them here stays off.`);
// SKIPPING a tombstoned keyword is not enough. These sit ENABLED inside a PAUSED campaign, so
// enabling the campaign makes them serve. They must be PAUSED explicitly. Learned the hard way at
// 2026-10-06T21:16Z: EXACT "phone tether retractable" went live at $2.50, over cap and ceiling.
const _tomb = kws.filter(k => k.state === 'ENABLED' && _dead.has(_dk(k.keywordText, k.matchType)));
for (const k of _tomb) console.log(`  PAUSE  $${Number(k.bid).toFixed(2)} ${k.matchType} "${k.keywordText}"  tombstoned, must not serve`);
if (APPLY && _tomb.length) {
  const _r = await rq(`${A}/sp/keywords`, { method: 'PUT', headers: H(KW), body: JSON.stringify({ keywords: _tomb.map(k => ({ keywordId: k.keywordId, state: 'PAUSED' })) }) });
  const _t = await _r.text();
  console.log(_r.ok ? `tombstoned keywords paused: ${JSON.parse(_t).keywords?.success?.length ?? 0}` : `PAUSE FAILED ${_r.status} ${_t.slice(0,200)}`);
}
const over=kws.filter(k=>k.state==='ENABLED'&&Number(k.bid)>CEILING&&!_dead.has(_dk(k.keywordText,k.matchType)));
console.log(`3-Pack campaign ${CID}`);
console.log(`  ${kws.length} keywords, ${kws.filter(k=>k.state==='ENABLED').length} enabled, ${over.length} above the $${CEILING} confirm ceiling`);
for(const k of over) console.log(`    $${Number(k.bid).toFixed(2)} -> $${ENTRY.toFixed(2)}  ${k.matchType} "${k.keywordText}"`);
if(!APPLY){console.log(`\nDRY RUN. Would reduce ${over.length} bids to $${ENTRY} and set the campaign ENABLED on its existing $2/day.`);process.exit(0);}

const pr=await rq(`${A}/sp/keywords`,{method:'PUT',headers:H(KW),body:JSON.stringify({keywords:over.map(k=>({keywordId:k.keywordId,bid:ENTRY}))})});
const pt=await pr.text();
if(!pr.ok){console.error(`bid PUT -> ${pr.status} ${pt.slice(0,400)}`);process.exit(1);}
const pj=JSON.parse(pt);
console.log(`\nbids: ${pj.keywords?.success?.length??0} set to $${ENTRY}, ${pj.keywords?.error?.length??0} refused`);
for(const e of (pj.keywords?.error||[])) console.error('   refused:',JSON.stringify(e).slice(0,200));

const cr=await rq(`${A}/sp/campaigns`,{method:'PUT',headers:H(CA),body:JSON.stringify({campaigns:[{campaignId:CID,state:'ENABLED'}]})});
const ct=await cr.text();
if(!cr.ok){console.error(`campaign PUT -> ${cr.status} ${ct.slice(0,400)}`);process.exit(1);}
console.log(`campaign: ${JSON.parse(ct).campaigns?.success?.length??0} enabled, ${JSON.parse(ct).campaigns?.error?.length??0} refused`);

// READ BACK. A write is not landed until Amazon says so.
await sleep(4000);
const vr=await rq(`${A}/sp/campaigns/list`,{method:'POST',headers:H(CA),body:JSON.stringify({campaignIdFilter:{include:[CID]}})});
const vc=(await vr.json()).campaigns?.[0];
console.log(`\nREAD BACK  campaign state=${vc?.state}  budget=$${vc?.budget?.budget}/day`);
let v=[],m;
do{const k=await rq(`${A}/sp/keywords/list`,{method:'POST',headers:H(KW),body:JSON.stringify({maxResults:1000,includeExtendedDataFields:true,campaignIdFilter:{include:[CID]},...(m?{nextToken:m}:{})})});
  const j=JSON.parse(await k.text()); (j.keywords||[]).forEach(x=>v.push(x)); m=j.nextToken;}while(m);
for(const k of v.filter(k=>k.state==='ENABLED')) console.log(`  bid $${Number(k.bid).toFixed(2)}  ${String(k.matchType).padEnd(6)} "${k.keywordText}"  serving=${k.extendedData?.servingStatus||'?'}  lastUpdate=${k.extendedData?.lastUpdateDateTime||'?'}`);
const still=v.filter(k=>k.state==='ENABLED'&&Number(k.bid)>CEILING).length;
console.log(`\n${still===0?'OK':'VIOLATION'}: ${still} enabled keywords remain above the $${CEILING} ceiling`);
