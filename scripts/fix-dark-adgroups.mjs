/**
 * REPAIR, 2026-10-08. redirect-ads-to-3pack.mjs paused 19 Single ads but its create pass failed
 * with "merchantSku is empty" ($.productAds[0].sku): a seller account must create a product ad by
 * SKU, not by ASIN. The pause was not gated on the create, so 8 ad groups were left with no
 * enabled ad at all. This creates the 3-Pack ad BY SKU in every live ad group that has no enabled
 * ad, then reads the state back from Amazon.
 */
import {readFileSync} from 'fs';
for(const l of readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z_0-9]+)=(.*)$/);if(m)process.env[m[1]]??=m[2].replace(/^["']|["']$/g,'');}
const LIVE=process.argv.includes('--live');
const THREE='B097MK5VZ4', THREE_SKU='CPH-BLCK-3';
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
const C=new Map(camps.map(c=>[String(c.campaignId),c]));
const liveAgs=ags.filter(a=>a.state==='ENABLED'&&C.get(String(a.campaignId))?.state==='ENABLED');
const enabledByAg={};
for(const a of ads.filter(x=>x.state==='ENABLED')){const k=String(a.adGroupId);(enabledByAg[k]=enabledByAg[k]||[]).push(a);}
const dark=liveAgs.filter(a=>!(enabledByAg[String(a.adGroupId)]||[]).length);
console.log(LIVE?'=== LIVE\n':'=== DRY RUN (add --live)\n');
console.log('live ad groups: '+liveAgs.length+'    with NO enabled ad (dark): '+dark.length+'\n');
for(const a of dark) console.log('  dark: '+String(C.get(String(a.campaignId)).name).slice(0,40).padEnd(42)+' / '+String(a.name).slice(0,28));
if(!dark.length){console.log('\nnothing to repair.');process.exit(0);}
if(LIVE){
  console.log('\n--- creating 3-Pack ads BY SKU ('+THREE_SKU+')');
  for(let i=0;i<dark.length;i+=20){
    const chunk=dark.slice(i,i+20);
    const body={productAds:chunk.map(a=>({campaignId:String(a.campaignId),adGroupId:String(a.adGroupId),sku:THREE_SKU,state:'ENABLED'}))};
    const r=await fetch('https://advertising-api.amazon.com/sp/productAds',{method:'POST',headers:H(AD),body:JSON.stringify(body)});
    const t=await r.text();
    console.log('  POST '+r.status+'  adIds returned '+(t.match(/"adId"/g)||[]).length);
    if((t.match(/"adId"/g)||[]).length<chunk.length) console.log('    '+t.replace(/\s+/g,' ').slice(0,420));
    await new Promise(s=>setTimeout(s,1500));
  }
  console.log('\n=== READ-BACK from Amazon');
  await new Promise(s=>setTimeout(s,8000));
  const after=await list('/sp/productAds/list',AD,'productAds');
  const byAg2={};
  for(const a of after.filter(x=>x.state==='ENABLED')){const k=String(a.adGroupId);(byAg2[k]=byAg2[k]||[]).push(a);}
  const stillDark=liveAgs.filter(a=>!(byAg2[String(a.adGroupId)]||[]).length);
  console.log('  live ad groups still dark: '+stillDark.length+(stillDark.length?'  <-- NOT FIXED':'  <-- clean'));
  for(const a of stillDark) console.log('     '+String(C.get(String(a.campaignId)).name).slice(0,40)+' / '+a.name);
  console.log('  3-Pack ads ENABLED: '+after.filter(a=>a.asin===THREE&&a.state==='ENABLED').length);
  console.log('  Single ads ENABLED in a live ad group: '+after.filter(a=>a.asin==='B07Y5GZP1T'&&a.state==='ENABLED'&&byAg2[String(a.adGroupId)]).length);
}
process.exit(0);
