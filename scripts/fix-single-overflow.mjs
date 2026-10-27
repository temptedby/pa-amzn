/** Ad group 254674058751981 is at Amazon's targeting-clauses-per-ad-group cap, so the last 17
 *  shortlist words could not be created there. Give the Single campaign a fresh ad group with its
 *  own verified product ad and put the overflow in it. */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim(); }
const A='https://advertising-api.amazon.com';
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const V={G:'application/vnd.spAdGroup.v3+json',P:'application/vnd.spProductAd.v3+json',K:'application/vnd.spKeyword.v3+json'};
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const H=(t)=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
const call=async(m,p,t,b)=>{const r=await fetch(A+p,{method:m,headers:H(t),body:JSON.stringify(b)});const x=await r.text();let j=null;try{j=JSON.parse(x);}catch{};return{status:r.status,j,txt:x,ok:r.ok};};
const post=(p,t,b)=>call('POST',p,t,b);
async function L(p,t,k,e={}){let o=[],tok=null;do{const b={maxResults:500,includeExtendedDataFields:true,...e};if(tok)b.nextToken=tok;
 const r=await post(p,t,b); if(!r.ok){console.log('UNREAD '+r.status);break;} o.push(...(r.j?.[k]||[])); tok=r.j?.nextToken||null;}while(tok);return o;}
const CAMP='212260116772958', SKU='57-P4AJ-J4AC', NAME='Single shortlist overflow';

const {createClient}=await import('@libsql/client');
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const rows=(await db.execute({sql:`select word, match_type, sum(spend) sp, sum(clicks) clk, sum(orders) ord, sum(sales) sa
  from kw_day where day<=? group by 1,2 having sum(orders)>0`,args:['2026-10-09']})).rows;
const seen=new Map();
for(const x of rows.map(x=>({word:String(x.word),mt:String(x.match_type),roas:(x.sa||0)/(x.sp||1),cpc:x.clk?x.sp/x.clk:0}))
  .filter(x=>x.roas>=1.5&&['BROAD','PHRASE','EXACT'].includes(x.mt)).sort((a,b)=>b.roas-a.roas))
  { const k=x.word.toLowerCase()+'|'+x.mt; if(!seen.has(k)) seen.set(k,x); }
const PLAN=[...seen.values()].map(x=>({...x,bid:Math.min(0.85,Math.max(0.10,Math.round(x.cpc*100)/100))}));

const ags=await L('/sp/adGroups/list',V.G,'adGroups');
const kws=await L('/sp/keywords/list',V.K,'keywords');
const myAg=new Set(ags.filter(a=>String(a.campaignId)===CAMP).map(a=>String(a.adGroupId)));
const enabled=new Set(kws.filter(k=>myAg.has(String(k.adGroupId))&&k.state==='ENABLED').map(k=>String(k.keywordText).toLowerCase()+'|'+k.matchType));
const missing=PLAN.filter(p=>!enabled.has(p.word.toLowerCase()+'|'+p.mt));
console.log('Single campaign is missing '+missing.length+' of the '+PLAN.length+' shortlist words');
if(!missing.length){ console.log('nothing to do'); process.exit(0); }

let host=ags.find(a=>String(a.campaignId)===CAMP&&a.name===NAME);
if(!host){
  const r=await post('/sp/adGroups',V.G,{adGroups:[{campaignId:CAMP,name:NAME,state:'ENABLED',defaultBid:0.85}]});
  const id=r.j?.adGroups?.success?.[0]?.adGroupId;
  if(!id){ console.log('FAILED ad group '+r.status+' '+r.txt.slice(0,300)); process.exit(1); }
  host={adGroupId:id}; console.log('created ad group '+id);
} else console.log('reusing ad group '+host.adGroupId);
const gid=String(host.adGroupId);

const ads=await L('/sp/productAds/list',V.P,'productAds',{campaignIdFilter:{include:[CAMP]}});
let ad=ads.find(a=>String(a.adGroupId)===gid&&a.sku===SKU);
if(!ad){
  const r=await post('/sp/productAds',V.P,{productAds:[{campaignId:CAMP,adGroupId:gid,sku:SKU,state:'ENABLED'}]});
  const id=r.j?.productAds?.success?.[0]?.adId;
  if(!id){ console.log('FAILED product ad '+r.status+' '+r.txt.slice(0,300)); process.exit(1); }
  console.log('created product ad '+id+' on sku '+SKU);
} else console.log('product ad already present');

const r=await post('/sp/keywords',V.K,{keywords:missing.map(p=>({campaignId:CAMP,adGroupId:gid,keywordText:p.word,matchType:p.mt,state:'ENABLED',bid:p.bid}))});
console.log('keywords '+r.status+' success '+(r.j?.keywords?.success||[]).length+' error '+(r.j?.keywords?.error||[]).length);
for(const e of (r.j?.keywords?.error||[]).slice(0,4)) console.log('  '+JSON.stringify(e).slice(0,220));

console.log('\n  waiting 40s for the new ad to settle...');
await new Promise(s=>setTimeout(s,40000));
const a2=await L('/sp/productAds/list',V.P,'productAds',{campaignIdFilter:{include:[CAMP]}});
for(const x of a2.filter(x=>String(x.adGroupId)===gid)) console.log('  ad '+x.sku+' '+x.state+' '+(x.extendedData?.servingStatus||'?'));
const k2=await L('/sp/keywords/list',V.K,'keywords');
const ag2=await L('/sp/adGroups/list',V.G,'adGroups');
const my2=new Set(ag2.filter(a=>String(a.campaignId)===CAMP).map(a=>String(a.adGroupId)));
const en2=k2.filter(k=>my2.has(String(k.adGroupId))&&k.state==='ENABLED');
const on=en2.filter(k=>PLAN.some(p=>p.word.toLowerCase()===String(k.keywordText).toLowerCase()&&p.mt===k.matchType));
console.log('\n  Single campaign now: '+en2.length+' enabled keywords, '+on.length+' on the shortlist, '+(en2.length-on.length)+' off-list');
const distinct=new Set(on.map(k=>String(k.keywordText).toLowerCase()+'|'+k.matchType));
console.log('  distinct shortlist words covered: '+distinct.size+' of '+PLAN.length);
