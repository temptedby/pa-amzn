/**
 * reroute-single-mirror-2pack.mjs
 *
 * William 2026-10-23: "look up all the ads you switched to 3pack, return them to 1 pack, duplicate
 * all the ads and make the same ads for 2 packs, cut the ad spend budget for each campaign in half
 * since we doubled the number of campaigns"
 *
 * A: every ad group holding a live 3-Pack ad is returned to the Single (sku 57-P4AJ-J4AC, the only
 *    Single sku PROVEN AD_STATUS_LIVE today). Match by SKU ONLY -- matching by ASIN is what made me
 *    adopt dead-sku ads earlier tonight and dark four ad groups.
 * B: each of those campaigns has its budget halved.
 * C: a mirror campaign is created per original, identical structure, advertising CPH-BLCK-2, at the
 *    same halved budget. So per original pair the authorised total is unchanged but split 50/50.
 * D: nothing is paused until a replacement ad is confirmed AD_STATUS_LIVE, and a mirror whose ad is
 *    not buyable is left PAUSED rather than enabled empty.
 *
 * NOT TOUCHED: 212260116772958 and 212881454178968. They are already the Single/2-Pack pair with
 * the identical 45-word shortlist, which is what this whole exercise is for.
 *
 * DRY RUN BY DEFAULT. --apply writes. --skip-dead omits the two campaigns that have no targeting of
 * any kind and therefore cannot serve any ASIN.
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim(); }
const APPLY=process.argv.includes('--apply'), SKIP_DEAD=process.argv.includes('--skip-dead');
const SINGLE_SKU='57-P4AJ-J4AC', TWO_SKU='CPH-BLCK-2', THREE='B097MK5VZ4';
const ALREADY_PAIRED=['212260116772958','212881454178968'];
const DEAD_NO_TARGETING=['169523688985886','318828473615896'];
const A='https://advertising-api.amazon.com';
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const V={C:'application/vnd.spCampaign.v3+json',G:'application/vnd.spAdGroup.v3+json',P:'application/vnd.spProductAd.v3+json',K:'application/vnd.spKeyword.v3+json',T:'application/vnd.spTargetingClause.v3+json'};
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const H=(t)=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
const call=async(m,p,t,b)=>{const r=await fetch(A+p,{method:m,headers:H(t),body:JSON.stringify(b)});const x=await r.text();let j=null;try{j=JSON.parse(x);}catch{};return{ok:r.ok,status:r.status,j,txt:x};};
const post=(p,t,b)=>call('POST',p,t,b), put=(p,t,b)=>call('PUT',p,t,b);
async function L(p,t,k,e={}){let o=[],tok=null;do{const b={maxResults:500,includeExtendedDataFields:true,...e};if(tok)b.nextToken=tok;
 const r=await post(p,t,b); if(!r.ok){console.log('  UNREAD '+p+' '+r.status+' '+r.txt.slice(0,140));break;} o.push(...(r.j?.[k]||[])); tok=r.j?.nextToken||null;}while(tok);return o;}
const ss=(a)=>a.extendedData?.servingStatus||a.servingStatus||'?';
const DEAD=['NOT_BUYABLE','MISSING_IMAGE','MISSING_DECORATION','INELIGIBLE','ASIN_NOT_BUYABLE','OUT_OF_STOCK'];
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};

let camps=await L('/sp/campaigns/list',V.C,'campaigns');
let ags=await L('/sp/adGroups/list',V.G,'adGroups');
let ads=await L('/sp/productAds/list',V.P,'productAds');
let kws=await L('/sp/keywords/list',V.K,'keywords');
let tgs=await L('/sp/targets/list',V.T,'targetingClauses');
const CM=new Map(camps.map(c=>[String(c.campaignId),c]));

// which campaigns are in scope: enabled, holding a live 3-Pack ad, not already paired
const scopeIds=[...new Set(ads.filter(a=>a.asin===THREE&&a.state==='ENABLED').map(a=>{
  const g=ags.find(x=>String(x.adGroupId)===String(a.adGroupId)); return g?String(g.campaignId):null;}).filter(Boolean))]
  .filter(id=>CM.get(id)?.state==='ENABLED'&&!ALREADY_PAIRED.includes(id))
  .filter(id=>!(SKIP_DEAD&&DEAD_NO_TARGETING.includes(id)));
console.log('IN SCOPE: '+scopeIds.length+' campaigns'+(SKIP_DEAD?'  (--skip-dead active)':''));

const plan=[];
for(const id of scopeIds){
  const c=CM.get(id);
  const myAgs=ags.filter(a=>String(a.campaignId)===id&&a.state==='ENABLED');
  const half=Math.max(1, Math.round((c.budget?.budget||2)/2*100)/100);
  const p={id,name:c.name,budget:c.budget?.budget,half,c,ags:[]};
  for(const g of myAgs){
    const gid=String(g.adGroupId);
    const mine=ads.filter(x=>String(x.adGroupId)===gid);
    const sing=mine.find(x=>x.sku===SINGLE_SKU);
    const enabledOthers=mine.filter(x=>x.state==='ENABLED'&&x.sku!==SINGLE_SKU);
    p.ags.push({gid,name:g.name,defaultBid:g.defaultBid,
      singleAction: sing? (sing.state==='ENABLED'?'already enabled':'enable '+sing.adId) : 'create on '+SINGLE_SKU,
      singleAdId: sing?String(sing.adId):null, pauseAds:enabledOthers.map(x=>({adId:String(x.adId),sku:x.sku,asin:x.asin})),
      kws:kws.filter(x=>String(x.adGroupId)===gid&&x.state==='ENABLED').map(x=>({keywordText:x.keywordText,matchType:x.matchType,bid:x.bid})),
      tgs:tgs.filter(x=>String(x.adGroupId)===gid&&x.state==='ENABLED').map(x=>({expression:x.expression,expressionType:x.expressionType,bid:x.bid}))});
  }
  plan.push(p);
}
let totOld=0,totNew=0,nAg=0,nKw=0,nTg=0,nPause=0,nCreate=0,nEnable=0;
for(const p of plan){
  totOld+=p.budget||0; totNew+=p.half*2;
  console.log(`\n=== ${p.id}  "${String(p.name).slice(0,40)}"   $${p.budget} -> $${p.half} each side`);
  for(const g of p.ags){
    nAg++; nKw+=g.kws.length; nTg+=g.tgs.length; nPause+=g.pauseAds.length;
    if(g.singleAction.startsWith('create')) nCreate++; else if(g.singleAction.startsWith('enable')) nEnable++;
    console.log(`    ag ${g.gid}  Single: ${g.singleAction}   pause ${g.pauseAds.length} ad(s) [${g.pauseAds.map(a=>a.sku).join(' ')}]   ${g.kws.length} kw  ${g.tgs.length} tgt`);
  }
  console.log(`    mirror -> "${String(p.name).slice(0,34)} - 2PK"  ${p.ags.length} ad group(s) on ${TWO_SKU}`);
}
console.log(`\nSUMMARY`);
console.log(`  campaigns rerouted to Single     ${plan.length}   mirrors created ${plan.length}`);
console.log(`  ad groups touched                ${nAg}   mirrored ad groups ${nAg}`);
console.log(`  Single ads: enable ${nEnable}, create ${nCreate}.  Ads paused after verification: ${nPause}`);
console.log(`  keywords copied to mirrors ${nKw}, targeting clauses copied ${nTg}`);
console.log(`  authorised: $${totOld.toFixed(2)}/day -> $${totNew.toFixed(2)}/day across twice the campaigns, split 50/50 by ASIN`);
if(!APPLY){ console.log('\n=========== DRY RUN. Nothing written. ==========='); process.exit(0); }

// ---------------- A: Single ads live first
console.log('\n--- A: bring the Single up in every ad group');
const toEnable=[],toCreate=[];
for(const p of plan) for(const g of p.ags){
  if(g.singleAdId && g.singleAction.startsWith('enable')) toEnable.push({adId:g.singleAdId});
  else if(!g.singleAdId) toCreate.push({campaignId:p.id,adGroupId:g.gid,sku:SINGLE_SKU,state:'ENABLED'});
}
for(const c of chunk(toEnable,50)){ const r=await put('/sp/productAds',V.P,{productAds:c.map(x=>({adId:x.adId,state:'ENABLED'}))});
  console.log(`  enable ${r.status} ok ${(r.j?.productAds?.success||[]).length} err ${(r.j?.productAds?.error||[]).length}`); }
for(const c of chunk(toCreate,50)){ const r=await post('/sp/productAds',V.P,{productAds:c});
  console.log(`  create ${r.status} ok ${(r.j?.productAds?.success||[]).length} err ${(r.j?.productAds?.error||[]).length}`);
  for(const e of (r.j?.productAds?.error||[]).slice(0,3)) console.log('    '+JSON.stringify(e).slice(0,200)); }
console.log('  waiting 45s for servingStatus...');
await new Promise(s=>setTimeout(s,45000));
ads=await L('/sp/productAds/list',V.P,'productAds');

// ---------------- pause the rest, only where the Single is confirmed live
console.log('\n--- A2: pause the old ads, only where the Single is confirmed LIVE');
const pauseNow=[]; let refused=0;
for(const p of plan) for(const g of p.ags){
  const sing=ads.find(x=>String(x.adGroupId)===g.gid&&x.sku===SINGLE_SKU&&x.state==='ENABLED'&&!DEAD.includes(ss(x)));
  if(!sing){ refused++; console.log(`  ag ${g.gid} REFUSED: Single not live (${ads.filter(x=>String(x.adGroupId)===g.gid&&x.sku===SINGLE_SKU).map(x=>x.state+'/'+ss(x)).join(',')||'absent'}) — leaving its ads alone`); continue; }
  for(const a of ads.filter(x=>String(x.adGroupId)===g.gid&&x.state==='ENABLED'&&String(x.adId)!==String(sing.adId))) pauseNow.push({adId:String(a.adId)});
}
for(const c of chunk(pauseNow,50)){ const r=await put('/sp/productAds',V.P,{productAds:c.map(x=>({adId:x.adId,state:'PAUSED'}))});
  console.log(`  pause ${r.status} ok ${(r.j?.productAds?.success||[]).length}`); }
console.log(`  paused ${pauseNow.length} ads; ${refused} ad group(s) left untouched`);

// ---------------- B: halve the originals
console.log('\n--- B: halve the original budgets');
for(const c of chunk(plan,10)){ const r=await put('/sp/campaigns',V.C,{campaigns:c.map(p=>({campaignId:p.id,budget:{budget:p.half,budgetType:'DAILY'}}))});
  console.log(`  budgets ${r.status} ok ${(r.j?.campaigns?.success||[]).length}`); }

// ---------------- C: mirrors, born PAUSED
console.log('\n--- C: 2-Pack mirrors');
const mirrors=[];
for(const p of plan){
  const nm=String(p.name).slice(0,100)+' - 2PK';
  const exists=camps.find(c=>c.name===nm);
  let cid=exists?String(exists.campaignId):null;
  if(!cid){
    const body={name:nm,targetingType:p.c.targetingType||'MANUAL',state:'PAUSED',startDate:'2026-10-23',
      budget:{budget:p.half,budgetType:'DAILY'}};
    if(p.c.dynamicBidding) body.dynamicBidding=p.c.dynamicBidding;
    const r=await post('/sp/campaigns',V.C,{campaigns:[body]});
    cid=r.j?.campaigns?.success?.[0]?.campaignId;
    if(!cid){ console.log(`  FAILED mirror for ${p.id}: ${r.status} ${r.txt.slice(0,260)}`); continue; }
  }
  console.log(`  mirror ${cid} for ${p.id}  "${nm.slice(0,40)}"`);
  const m={cid:String(cid),src:p.id,ags:[]};
  for(const g of p.ags){
    const r=await post('/sp/adGroups',V.G,{adGroups:[{campaignId:String(cid),name:g.name||('ag '+g.gid),state:'ENABLED',defaultBid:g.defaultBid??0.85}]});
    const gid=r.j?.adGroups?.success?.[0]?.adGroupId;
    if(!gid){ console.log(`    FAILED ad group: ${r.status} ${r.txt.slice(0,200)}`); continue; }
    const pa=await post('/sp/productAds',V.P,{productAds:[{campaignId:String(cid),adGroupId:String(gid),sku:TWO_SKU,state:'ENABLED'}]});
    const adId=pa.j?.productAds?.success?.[0]?.adId;
    if(!adId) console.log(`    product ad FAILED: ${pa.status} ${pa.txt.slice(0,200)}`);
    if(g.kws.length) for(const c2 of chunk(g.kws,100)){
      const rk=await post('/sp/keywords',V.K,{keywords:c2.map(k=>({campaignId:String(cid),adGroupId:String(gid),keywordText:k.keywordText,matchType:k.matchType,state:'ENABLED',bid:k.bid??0.85}))});
      if((rk.j?.keywords?.error||[]).length) console.log(`    kw err ${(rk.j.keywords.error).length}: ${JSON.stringify(rk.j.keywords.error[0]).slice(0,160)}`); }
    if(g.tgs.length) for(const c2 of chunk(g.tgs,100)){
      const rt=await post('/sp/targets',V.T,{targetingClauses:c2.map(t=>({campaignId:String(cid),adGroupId:String(gid),expression:t.expression,expressionType:t.expressionType||'MANUAL',state:'ENABLED',bid:t.bid??0.85}))});
      if((rt.j?.targetingClauses?.error||[]).length) console.log(`    tgt err ${(rt.j.targetingClauses.error).length}: ${JSON.stringify(rt.j.targetingClauses.error[0]).slice(0,160)}`); }
    m.ags.push({gid:String(gid),adId:adId?String(adId):null});
    console.log(`    ag ${gid}  ad ${adId}  ${g.kws.length} kw  ${g.tgs.length} tgt`);
  }
  mirrors.push(m);
}
console.log('\n  waiting 45s, then verifying each mirror before enabling it...');
await new Promise(s=>setTimeout(s,45000));
ads=await L('/sp/productAds/list',V.P,'productAds');
for(const m of mirrors){
  const bad=m.ags.filter(g=>{const a=ads.find(x=>String(x.adId)===g.adId); return !a||DEAD.includes(ss(a));});
  if(bad.length===m.ags.length&&m.ags.length){ console.log(`  mirror ${m.cid}: every ad unbuyable, LEFT PAUSED`); continue; }
  const r=await put('/sp/campaigns',V.C,{campaigns:[{campaignId:m.cid,state:'ENABLED'}]});
  console.log(`  mirror ${m.cid} -> ENABLED (${r.status})`+(bad.length?`  note: ${bad.length}/${m.ags.length} ad group(s) not buyable`:''));
}
console.log('\n--- D: final read-back');
const c2=await L('/sp/campaigns/list',V.C,'campaigns');
const a2=await L('/sp/productAds/list',V.P,'productAds');
const g2=await L('/sp/adGroups/list',V.G,'adGroups');
const en=c2.filter(x=>x.state==='ENABLED');
console.log(`  enabled campaigns ${en.length}, authorised $${en.reduce((t,x)=>t+(x.budget?.budget||0),0).toFixed(2)}/day`);
const byAsin={};
for(const a of a2.filter(a=>a.state==='ENABLED'&&g2.some(g=>String(g.adGroupId)===String(a.adGroupId)&&g.state==='ENABLED'&&en.some(c=>String(c.campaignId)===String(g.campaignId))))){
  const k=a.asin+'/'+ss(a).replace('AD_STATUS_',''); byAsin[k]=(byAsin[k]||0)+1; }
console.log('  live ads by asin/serving: '+JSON.stringify(byAsin,null,0));
