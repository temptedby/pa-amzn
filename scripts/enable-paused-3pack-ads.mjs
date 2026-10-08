/** Enable the EXISTING paused 3-Pack ad (sku CPH-BLCK-3) in every live ad group that is dark.
 *  The create path 409s on these because the ad already exists in PAUSED state. */
import {readFileSync} from 'fs';
for(const l of readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z_0-9]+)=(.*)$/);if(m)process.env[m[1]]??=m[2].replace(/^["']|["']$/g,'');}
const LIVE=process.argv.includes('--live');
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
const byAg={}; for(const a of ads){const k=String(a.adGroupId);(byAg[k]=byAg[k]||[]).push(a);}
const dark=liveAgs.filter(a=>!(byAg[String(a.adGroupId)]||[]).filter(x=>x.state==='ENABLED').length);
const targets=[];
for(const ag of dark){
  const cand=(byAg[String(ag.adGroupId)]||[]).find(a=>a.sku==='CPH-BLCK-3');
  if(cand) targets.push({adId:String(cand.adId),ag:ag.name,c:C.get(String(ag.campaignId)).name});
  else console.log('  NO CPH-BLCK-3 ad in '+ag.name+' ('+ag.adGroupId+') -> needs a create, not an enable');
}
console.log((LIVE?'=== LIVE':'=== DRY RUN')+'   dark ad groups '+dark.length+'   enabling '+targets.length+'\n');
for(const t of targets) console.log('  enable adId '+t.adId+'   '+String(t.c).slice(0,38)+' / '+t.ag);
if(LIVE&&targets.length){
  const r=await fetch('https://advertising-api.amazon.com/sp/productAds',{method:'PUT',headers:H(AD),
    body:JSON.stringify({productAds:targets.map(t=>({adId:t.adId,state:'ENABLED'}))})});
  const txt=await r.text();
  console.log('\n  PUT '+r.status+'   adIds in response '+(txt.match(/"adId"/g)||[]).length);
  if(!r.ok||r.status===207) console.log('  '+txt.replace(/\s+/g,' ').slice(0,400));
  console.log('\n=== READ-BACK (30s pause so Amazon indexes it)');
  await new Promise(s=>setTimeout(s,30000));
  const after=await list('/sp/productAds/list',AD,'productAds');
  const by2={}; for(const a of after.filter(x=>x.state==='ENABLED')){const k=String(a.adGroupId);(by2[k]=by2[k]||[]).push(a);}
  const still=liveAgs.filter(a=>!(by2[String(a.adGroupId)]||[]).length);
  console.log('  live ad groups: '+liveAgs.length+'   still dark: '+still.length+(still.length?'  <-- NOT FIXED':'  <-- CLEAN'));
  for(const a of still) console.log('     '+C.get(String(a.campaignId)).name.slice(0,40)+' / '+a.name);
  const liveIds=new Set(liveAgs.map(a=>String(a.adGroupId)));
  console.log('  3-Pack ads enabled in live ad groups: '+after.filter(a=>a.asin==='B097MK5VZ4'&&a.state==='ENABLED'&&liveIds.has(String(a.adGroupId))).length);
  console.log('  Single ads enabled in live ad groups: '+after.filter(a=>a.asin==='B07Y5GZP1T'&&a.state==='ENABLED'&&liveIds.has(String(a.adGroupId))).length);
}
process.exit(0);
