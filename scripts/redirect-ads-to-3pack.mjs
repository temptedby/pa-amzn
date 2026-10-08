/**
 * Redirect Sponsored Products from the Single to the 3-Pack.
 * William 2026-10-08: "I would just like all our ads to start going to the three-pack instead of
 * the single-pack. Just redirect it. They can still access the single-pack on the page."
 *
 * Why this works rather than building new campaigns:
 *   - All four ASINs are one variation family (parent B0CJHLWB7F), verified live, so the Single
 *     stays selectable on the 3-Pack's page.
 *   - 44.7% of our ad sales over the last 30 days were already for a DIFFERENT ASIN than the one
 *     advertised ($330.25 of $738.32), including one Single ad group whose only order was a
 *     $16.49 3-Pack. The click keeps its credit whichever variation the shopper buys.
 *   - Amazon serves ONE ad per ad group per auction and favours the ad with history, which is why
 *     the 3-Pack ads added on 09-30 took 151 impressions and ZERO clicks in 8 days while the
 *     Single took 54,140. Pausing the Single inside the SAME ad group hands over the keyword
 *     history instead of starting from zero.
 *
 * Two passes:
 *   1. ensure every enabled ad group that advertises the Single also has an ENABLED 3-Pack ad
 *      (create where missing), so pausing the Single never leaves an ad group dark;
 *   2. pause every enabled Single product ad.
 *
 * Dry run by default. --live to apply. Reads state back from Amazon afterwards.
 */
import {readFileSync} from 'fs';
for(const l of readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z_0-9]+)=(.*)$/);if(m)process.env[m[1]]??=m[2].replace(/^["']|["']$/g,'');}
const LIVE=process.argv.includes('--live');
const SINGLE='B07Y5GZP1T', THREE='B097MK5VZ4', THREE_SKU='CPH-BLCK-3';
const CID=process.env.ADS_CLIENT_ID, CS=process.env.ADS_CLIENT_SECRET, RT=process.env.ADS_REFRESH_TOKEN, PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const AD='application/vnd.spProductAd.v3+json';
const H=(t)=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
async function list(path,type,key){let o=[],tok=null;do{const b={maxResults:500};if(tok)b.nextToken=tok;
  const r=await fetch('https://advertising-api.amazon.com'+path,{method:'POST',headers:H(type),body:JSON.stringify(b)});
  if(!r.ok){console.log(path+' '+r.status+' '+(await r.text()).slice(0,200));break;}
  const j=await r.json();o.push(...(j[key]||[]));tok=j.nextToken||null;}while(tok);return o;}

const camps=await list('/sp/campaigns/list','application/vnd.spCampaign.v3+json','campaigns');
const ags  =await list('/sp/adGroups/list','application/vnd.spAdGroup.v3+json','adGroups');
const ads  =await list('/sp/productAds/list',AD,'productAds');
const C=new Map(camps.map(c=>[String(c.campaignId),c])), A=new Map(ags.map(a=>[String(a.adGroupId),a]));
const liveAg=(id)=>{const a=A.get(String(id)); if(!a||a.state!=='ENABLED') return null; const c=C.get(String(a.campaignId)); return (c&&c.state==='ENABLED')?{a,c}:null;};

const singles=ads.filter(a=>a.asin===SINGLE&&a.state==='ENABLED'&&liveAg(a.adGroupId));
const agsWithSingle=[...new Set(singles.map(a=>String(a.adGroupId)))];
const has3=new Set(ads.filter(a=>a.asin===THREE&&a.state==='ENABLED').map(a=>String(a.adGroupId)));
const needs3=agsWithSingle.filter(id=>!has3.has(id));

console.log(LIVE?'=== LIVE\n':'=== DRY RUN (add --live to apply)\n');
console.log('enabled Single ads in live ad groups : '+singles.length);
console.log('ad groups advertising the Single     : '+agsWithSingle.length);
console.log('  of those, already have a 3-Pack ad : '+(agsWithSingle.length-needs3.length)+'   (handover is immediate)');
console.log('  of those, need a 3-Pack ad created : '+needs3.length);
for(const id of needs3){const x=liveAg(id);console.log('      + '+String(x.c.name).slice(0,38).padEnd(40)+' / '+String(x.a.name).slice(0,26));}

if(LIVE&&needs3.length){
  console.log('\n--- pass 1: creating 3-Pack ads');
  let created=0;
  for(let i=0;i<needs3.length;i+=20){
    const chunk=needs3.slice(i,i+20);
    // A SELLER account must create by sku; `asin` returns 207 missingValueError "merchantSku is empty".
    const body={productAds:chunk.map(id=>({campaignId:String(A.get(id).campaignId),adGroupId:String(id),sku:THREE_SKU,state:'ENABLED'}))};
    const r=await fetch('https://advertising-api.amazon.com/sp/productAds',{method:'POST',headers:H(AD),body:JSON.stringify(body)});
    const t=await r.text();
    const n=(t.match(/"adId"/g)||[]).length; created+=n;
    console.log('  POST '+r.status+'  adIds returned '+n+' of '+chunk.length);
    if(n<chunk.length) console.log('    '+t.replace(/\s+/g,' ').slice(0,300));
    await new Promise(s=>setTimeout(s,1500));
  }
  // 2026-10-08: pass 2 used to run regardless. The create failed (asin vs sku) and 8 live ad
  // groups were left with NO enabled ad for ~12 minutes. Never pause what was not replaced.
  if(created<needs3.length){
    console.log('\nABORT: only '+created+' of '+needs3.length+' 3-Pack ads were created.');
    console.log('Pausing the Single now would leave '+(needs3.length-created)+' ad group(s) dark.');
    console.log('An ad group holding a PAUSED 3-Pack ad cannot be created into; enable it instead');
    console.log('with scripts/enable-paused-3pack-ads.mjs --live, then re-run this.');
    process.exit(2);
  }
}
if(LIVE&&singles.length){
  console.log('\n--- pass 2: pausing '+singles.length+' Single ads');
  let ok=0;
  for(let i=0;i<singles.length;i+=100){
    const chunk=singles.slice(i,i+100);
    const body={productAds:chunk.map(a=>({adId:String(a.adId),state:'PAUSED'}))};
    const r=await fetch('https://advertising-api.amazon.com/sp/productAds',{method:'PUT',headers:H(AD),body:JSON.stringify(body)});
    const t=await r.text();
    ok+=(t.match(/"adId"/g)||[]).length;
    console.log('  PUT '+r.status+'  batch '+chunk.length);
    if(!r.ok) console.log('    '+t.replace(/\s+/g,' ').slice(0,250));
    await new Promise(s=>setTimeout(s,1500));
  }
  console.log('  reported ok: '+ok);
  console.log('\n=== READ-BACK from Amazon');
  await new Promise(s=>setTimeout(s,8000));
  const after=await list('/sp/productAds/list',AD,'productAds');
  const cnt=(asin,st)=>after.filter(a=>a.asin===asin&&a.state===st).length;
  console.log('  Single ENABLED '+cnt(SINGLE,'ENABLED')+'   PAUSED '+cnt(SINGLE,'PAUSED'));
  console.log('  3-Pack ENABLED '+cnt(THREE,'ENABLED')+'   PAUSED '+cnt(THREE,'PAUSED'));
  const stillLive=after.filter(a=>a.asin===SINGLE&&a.state==='ENABLED'&&liveAg(a.adGroupId)).length;
  console.log('  Single ads still ENABLED inside a live ad group: '+stillLive+(stillLive?'  <-- NOT DONE':'  <-- clean'));
}
process.exit(0);
