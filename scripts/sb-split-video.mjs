/**
 * Sponsored Brands: halve the Single video campaign and mirror it onto the 2-Pack.
 * William 2026-10-27: "all the ads ... cut the spend in half and then you copy it and make a
 * two-pack option that's exactly the same but points to the two-pack."
 *
 * The mirror reuses the SAME video asset with the 2-Pack ASIN and a 2-Pack detail page, carries
 * the same keywords at the same bids, and is born PAUSED. A Brands video creative goes to
 * PENDING_MODERATION_REVIEW on create, so the mirror is only enabled once the ad exists; whether
 * Amazon then approves the creative is reported, never assumed.
 *
 * SB ids exceed JS safe-integer range. Every id is handled as a STRING. JSON.parse rounds
 * 144237866129902226 to ...240, and every write against the rounded id 404s.
 *
 * Dry run by default. --apply writes.
 */
import fs from 'node:fs';
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const APPLY=process.argv.includes('--apply');
const SRC='253195759002574';
const TWO_ASIN='B097MGPCPC';
const TAG=' [2PK]';
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const A='https://advertising-api.amazon.com';
const base={Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF};
const CT={camp:'application/vnd.sbcampaignresource.v4+json',ag:'application/vnd.sbadgroupresource.v4+json',ad:'application/vnd.sbadresource.v4+json'};
const call=async(m,p,ct,body)=>{const o={method:m,headers:{...base,Accept:ct}}; if(body!==undefined){o.headers['Content-Type']=ct;o.body=JSON.stringify(body);}
  const r=await fetch(A+p,o); const t=await r.text(); let j=null; try{j=JSON.parse(t)}catch{} return {ok:r.ok,status:r.status,j,t};};

const cl=await call('POST','/sb/v4/campaigns/list',CT.camp,{maxResults:100});
if(!cl.ok){console.log('UNREAD campaigns '+cl.status+' '+cl.t.slice(0,200));process.exit(1);}
const camps=cl.j.campaigns||[];
const src=camps.find(c=>String(c.campaignId)===SRC);
if(!src){console.log('source campaign '+SRC+' not found');process.exit(1);}
const al=await call('POST','/sb/v4/ads/list',CT.ad,{maxResults:50,campaignIdFilter:{include:[SRC]}});
const srcAd=(al.j?.ads||[])[0];
// keywords: GET, vendor Accept, NO Content-Type. ids are read as text to avoid rounding.
const kr=await fetch(A+'/sb/keywords?campaignIdFilter='+SRC+'&stateFilter=enabled',{headers:{...base,Accept:'application/vnd.sbkeyword.v3+json'}});
const kwTxt=await kr.text();
const kws=kr.ok?JSON.parse(kwTxt).map(k=>({keywordText:k.keywordText,matchType:k.matchType,bid:k.bid})):null;
if(!kws){console.log('UNREAD keywords '+kr.status+' '+kwTxt.slice(0,200));process.exit(1);}
const half=Math.round(src.budget/2*100)/100;
const mName=String(src.name).replace('B07Y5GZP1T',TWO_ASIN)+TAG;
const existing=camps.find(c=>String(c.name)===mName);
const bids=kws.map(k=>k.bid).sort((a,b)=>a-b);
console.log((APPLY?'APPLYING':'DRY RUN')+'\n');
console.log('source        '+SRC+'  $'+src.budget+'/day  '+src.name.slice(0,54));
console.log('  creative    '+srcAd?.creative?.type+'   asins '+JSON.stringify(srcAd?.creative?.asins)+'   video '+JSON.stringify(srcAd?.creative?.videoAssetIds));
console.log('  landing     '+srcAd?.landingPage?.pageType+'  '+srcAd?.landingPage?.url);
console.log('  serving     '+srcAd?.extendedData?.servingStatus+'   creativeStatus '+srcAd?.creative?.creativeStatus);
console.log('  keywords    '+kws.length+'   bids min $'+bids[0].toFixed(2)+'  median $'+bids[bids.length>>1].toFixed(2)+'  max $'+bids[bids.length-1].toFixed(2)
  +'   over $0.85: '+bids.filter(b=>b>0.85).length);
console.log('\nplan');
console.log('  1. '+SRC+' budget $'+src.budget+' -> $'+half);
console.log('  2. create "'+mName.slice(0,70)+'"  $'+half+'/day, PAUSED');
console.log('  3. one ad group, '+kws.length+' keywords at the same bids');
console.log('  4. VIDEO ad, asin '+TWO_ASIN+', the SAME video asset, landing page /dp/'+TWO_ASIN);
console.log('  5. enable the mirror once the ad exists. Creative approval is Amazon\'s and is reported, not assumed.');
if(existing) console.log('\n  a mirror already exists: '+existing.campaignId+' ($'+existing.budget+', '+existing.state+')');
if(!APPLY){console.log('\nnothing written. add --apply');process.exit(0);}

let mid=existing?String(existing.campaignId):null;
if(!mid){
  const body={campaigns:[{name:mName,budget:half,budgetType:'DAILY',costType:src.costType,goal:src.goal,kpi:src.kpi,
    state:'PAUSED',startDate:new Date().toISOString().slice(0,10),bidding:src.bidding,
    // The source video campaign's record carries no brandEntityId, but a seller create demands
    // one (CAMPAIGN_EMPTY_BRAND_ENTITY_ID). Borrow it from any other campaign on the profile.
    brandEntityId: src.brandEntityId || camps.map(c=>c.brandEntityId).find(Boolean),...(src.smartDefault?{smartDefault:src.smartDefault}:{}),
    isMultiAdGroupsEnabled:false}]};
  const r=await call('POST','/sb/v4/campaigns',CT.camp,body);
  mid=r.j?.campaigns?.success?.[0]?.campaignId!==undefined?String(r.j.campaigns.success[0].campaignId):null;
  console.log('\ncreate campaign  http '+r.status+'  '+(mid?'campaignId '+mid:JSON.stringify(r.j||r.t).slice(0,500)));
  if(!mid) process.exit(1);
} else console.log('\nadopting existing mirror '+mid);
// halve the source only once
if(!existing){
  const r=await call('PUT','/sb/v4/campaigns',CT.camp,{campaigns:[{campaignId:SRC,budget:half}]});
  console.log('halve source     http '+r.status+'  '+(r.ok?'$'+half:JSON.stringify(r.j||r.t).slice(0,300)));
} else console.log('source budget left alone (mirror already existed)');
// ad group
const agl=await call('POST','/sb/v4/adGroups/list',CT.ag,{maxResults:50,campaignIdFilter:{include:[mid]}});
let agid=(agl.j?.adGroups||[])[0]?.adGroupId; if(agid!==undefined) agid=String(agid);
if(!agid){
  const r=await call('POST','/sb/v4/adGroups',CT.ag,{adGroups:[{campaignId:mid,name:'AdGroup1',state:'ENABLED'}]});
  agid=r.j?.adGroups?.success?.[0]?.adGroupId!==undefined?String(r.j.adGroups.success[0].adGroupId):null;
  console.log('create ad group  http '+r.status+'  '+(agid?'adGroupId '+agid:JSON.stringify(r.j||r.t).slice(0,400)));
  if(!agid) process.exit(1);
} else console.log('ad group exists  '+agid);
// keywords, POST /sb/keywords (v3 style, array body, vendor content type)
const kr2=await fetch(A+'/sb/keywords?campaignIdFilter='+mid+'&stateFilter=enabled',{headers:{...base,Accept:'application/vnd.sbkeyword.v3+json'}});
const have=new Set(kr2.ok?JSON.parse(await kr2.text()).map(k=>String(k.keywordText).toLowerCase()+'|'+k.matchType):[]);
const need=kws.filter(k=>!have.has(String(k.keywordText).toLowerCase()+'|'+k.matchType));
console.log('keywords: '+have.size+' already there, '+need.length+' to create');
const chunk=(a,n)=>a.length?[a.slice(0,n),...chunk(a.slice(n),n)]:[];
let made=0;
for(const g of chunk(need,100)){
  const r=await fetch(A+'/sb/keywords',{method:'POST',headers:{...base,'Content-Type':'application/vnd.sbkeyword.v3+json',Accept:'application/vnd.sbkeyword.v3+json'},
    body:JSON.stringify(g.map(k=>({campaignId:mid,adGroupId:agid,keywordText:k.keywordText,matchType:k.matchType,bid:k.bid,state:'enabled'})))});
  const t=await r.text(); let j=null; try{j=JSON.parse(t)}catch{}
  const ok=Array.isArray(j)?j.filter(x=>x.code==='SUCCESS').length:0; made+=ok;
  console.log('  batch '+g.length+'  http '+r.status+'  created '+ok);
  if(ok<g.length){const errs=(Array.isArray(j)?j:[]).filter(x=>x.code!=='SUCCESS').slice(0,4); for(const e of errs) console.log('    '+JSON.stringify(e).slice(0,220)); if(!j) console.log('    '+t.slice(0,300));}
}
// the video ad
const al2=await call('POST','/sb/v4/ads/list',CT.ad,{maxResults:50,campaignIdFilter:{include:[mid]}});
if(!(al2.j?.ads||[]).length){
  const body={ads:[{campaignId:mid,adGroupId:agid,name:'2-Pack video',state:'ENABLED',
    creative:{type:'VIDEO',asins:[TWO_ASIN],videoAssetIds:srcAd.creative.videoAssetIds},
    landingPage:{pageType:'DETAIL_PAGE',url:'https://www.amazon.com/dp/'+TWO_ASIN}}]};
  const r=await call('POST','/sb/v4/ads',CT.ad,body);
  const ok=r.j?.ads?.success?.length||0;
  console.log('create video ad  http '+r.status+'  '+(ok?'ok':JSON.stringify(r.j||r.t).slice(0,600)));
} else console.log('video ad exists');
// enable only if the ad is really there
const al3=await call('POST','/sb/v4/ads/list',CT.ad,{maxResults:50,campaignIdFilter:{include:[mid]}});
const mAd=(al3.j?.ads||[])[0];
if(mAd){
  const r=await call('PUT','/sb/v4/campaigns',CT.camp,{campaigns:[{campaignId:mid,state:'ENABLED'}]});
  console.log('enable mirror    http '+r.status+'  '+(r.ok?'ok':JSON.stringify(r.j||r.t).slice(0,300)));
  console.log('\nmirror ad: creativeStatus '+mAd.creative?.creativeStatus+'   servingStatus '+mAd.extendedData?.servingStatus);
} else console.log('\nmirror LEFT PAUSED: no ad was created, so it must not be allowed to hold budget');
const fin=await call('POST','/sb/v4/campaigns/list',CT.camp,{maxResults:100});
console.log('\n--- Brands, read back ---');
for(const c of (fin.j?.campaigns||[]).filter(c=>c.state==='ENABLED'))
  console.log('  $'+String(c.budget).padEnd(6)+String(c.campaignId).padEnd(20)+String(c.state).padEnd(9)+String(c.name).slice(0,56));
