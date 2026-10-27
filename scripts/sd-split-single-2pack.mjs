/**
 * Sponsored Display: halve every Single/2-Pack campaign and mirror it onto the 2-Pack.
 * William 2026-10-27: "cut the spend in half and then you copy it and make a two-pack option
 * that's exactly the same but points to the two-pack ... together they do the full spend."
 *
 * Per campaign:
 *   1. budget -> half (min $1)
 *   2. original keeps ONLY the Single ad (57-P4AJ-J4AC). Every other enabled ad is paused.
 *      If the Single ad sits paused in an ad group it is enabled, never created.
 *   3. a mirror campaign is built with the same tactic, ad groups, bids and ENABLED targets,
 *      carrying only the 2-Pack ad (CPH-BLCK-2), at the same halved budget.
 *   4. the mirror is born PAUSED and only enabled once every ad group has an ad and a target.
 *
 * SKUs 34-MR1G-UASV and FY-2WDI-19GH are NOT BUYABLE and are never used; matching on ASIN
 * instead of SKU is what darkened four ad groups on 2026-10-23.
 *
 * Dry run by default. --apply writes. --only=<campaignId> does one campaign. Resumable: an
 * existing mirror of the same name is adopted rather than duplicated.
 */
import fs from 'node:fs';
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const APPLY=process.argv.includes('--apply');
const ONLY=(process.argv.find(a=>a.startsWith('--only='))||'').split('=')[1]||null;
const SINGLE_SKU='57-P4AJ-J4AC', SINGLE_ASIN='B07Y5GZP1T';
const TWO_SKU='CPH-BLCK-2',     TWO_ASIN='B097MGPCPC';
const DEAD_SKU=new Set(['34-MR1G-UASV','FY-2WDI-19GH']);
const TAG=' [2PK]';
// Pro is a different product line, not a Single/2-Pack campaign. Left alone pending William.
const SKIP=new Set(['561597227719873']);
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const h={Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':'application/json',Accept:'application/json'};
const A='https://advertising-api.amazon.com';
const GET=async p=>{const r=await fetch(A+p,{headers:h}); const t=await r.text(); if(!r.ok) throw new Error('UNREAD '+p+' '+r.status+' '+t.slice(0,200)); return JSON.parse(t);};
const SEND=async(m,p,body)=>{const r=await fetch(A+p,{method:m,headers:h,body:JSON.stringify(body)}); const t=await r.text();
  let j=null; try{j=JSON.parse(t)}catch{} return {ok:r.ok,status:r.status,json:j,text:t};};

let camps=await GET('/sd/campaigns'), ags=await GET('/sd/adGroups'), ads=await GET('/sd/productAds'), tgs=await GET('/sd/targets');
const todo=camps.filter(c=>c.state==='enabled'&&!SKIP.has(String(c.campaignId))&&!String(c.name).includes(TAG.trim())
  &&(!ONLY||String(c.campaignId)===ONLY));
console.log((APPLY?'APPLYING':'DRY RUN')+(ONLY?'  (only '+ONLY+')':'')+'\n');
const plan=[], dark=[];
for(const c of todo.sort((a,b)=>b.budget-a.budget)){
  const half=Math.max(1,Math.round(c.budget/2*100)/100);
  const myAg=ags.filter(a=>String(a.campaignId)===String(c.campaignId)&&a.state==='enabled');
  // A campaign with no enabled ad group cannot spend, so there is nothing to halve and nothing
  // to mirror. Waking it would be new spend William has not asked for. Reported, not touched.
  if(!myAg.length){dark.push(c);continue;}
  const steps={singleOn:[],othersOff:[],mirrorAg:[]};
  for(const a of myAg){
    const mine=ads.filter(x=>String(x.adGroupId)===String(a.adGroupId));
    const single=mine.find(x=>x.sku===SINGLE_SKU);
    if(single&&single.state!=='enabled') steps.singleOn.push(single);
    for(const x of mine) if(x.state==='enabled'&&x.sku!==SINGLE_SKU) steps.othersOff.push(x);
    const t=tgs.filter(x=>String(x.adGroupId)===String(a.adGroupId)&&x.state==='enabled');
    steps.mirrorAg.push({src:a,targets:t});
  }
  const liveSingle=myAg.filter(a=>ads.some(x=>String(x.adGroupId)===String(a.adGroupId)&&x.sku===SINGLE_SKU));
  // Halving is NOT idempotent. If the mirror already exists this campaign was halved on an
  // earlier run, so leave the budget alone. Re-running halved one campaign to $2.50 on 10-27.
  const alreadySplit=camps.some(x=>String(x.name)===String(c.name).slice(0,160)+TAG);
  plan.push({c,half:alreadySplit?c.budget:half,alreadySplit,myAg,steps,liveSingle:liveSingle.length});
}
console.log('campaign          budget -> half   ad groups  Single ad present  enable Single  pause others  targets to mirror');
for(const p of plan) console.log('  '+String(p.c.campaignId).padEnd(18)+('$'+p.c.budget).padEnd(7)+'-> $'+String(p.half).padEnd(8)
  +String(p.myAg.length).padStart(5)+String(p.liveSingle+'/'+p.myAg.length).padStart(18)+String(p.steps.singleOn.length).padStart(14)
  +String(p.steps.othersOff.length).padStart(14)+String(p.steps.mirrorAg.reduce((t,x)=>t+x.targets.length,0)).padStart(18)+'  '+String(p.c.name).slice(0,34));
const totOld=plan.reduce((t,p)=>t+p.c.budget,0), totNew=plan.reduce((t,p)=>t+p.half,0);
console.log('\n  Display Single/2-Pack budget now $'+totOld.toFixed(2)+'/day');
console.log('  after the split: Single $'+totNew.toFixed(2)+' + 2-Pack $'+totNew.toFixed(2)+' = $'+(totNew*2).toFixed(2)+'/day');
for(const c of dark) console.log('  NOTHING TO MIRROR  $'+c.budget+'  '+c.campaignId+'  '+String(c.name).slice(0,40)+'   (no enabled ad group, cannot spend)');
for(const s of SKIP) {const c=camps.find(x=>String(x.campaignId)===s); if(c) console.log('  LEFT ALONE  $'+c.budget+'  '+s+'  '+c.name.slice(0,44)+'   (Pro, a different product)');}
if(!APPLY){console.log('\nnothing written. add --apply');process.exit(0);}

for(const p of plan){
  const cid=String(p.c.campaignId);
  console.log('\n######## '+cid+'  '+String(p.c.name).slice(0,46));
  // 1. halve the original
  let r={status:'skipped',ok:true};
  if(p.alreadySplit) console.log('  budget left at $'+p.c.budget+' (already split on an earlier run)');
  else { r=await SEND('PUT','/sd/campaigns',[{campaignId:Number(cid),budget:p.half}]);
    console.log('  budget -> $'+p.half+'   http '+r.status+'  '+(r.ok?'ok':r.text.slice(0,160))); }
  // 2. the original becomes Single only
  if(p.steps.singleOn.length){
    r=await SEND('PUT','/sd/productAds',p.steps.singleOn.map(x=>({adId:Number(x.adId),state:'enabled'})));
    console.log('  enable Single ad x'+p.steps.singleOn.length+'   http '+r.status+'  '+(r.ok?'ok':r.text.slice(0,160)));
  }
  if(p.steps.othersOff.length){
    r=await SEND('PUT','/sd/productAds',p.steps.othersOff.map(x=>({adId:Number(x.adId),state:'paused'})));
    console.log('  pause non-Single ads x'+p.steps.othersOff.length+'   http '+r.status+'  '+(r.ok?'ok':r.text.slice(0,160)));
  }
  // 3. the mirror, born paused
  const mName=String(p.c.name).slice(0,160)+TAG;
  let mirror=camps.find(x=>String(x.name)===mName);
  if(!mirror){
    r=await SEND('POST','/sd/campaigns',[{name:mName,tactic:p.c.tactic,budget:p.half,budgetType:p.c.budgetType||'daily',
      costType:p.c.costType||'cpc',state:'paused',startDate:new Date().toISOString().slice(0,10).replace(/-/g,''),
      deliveryProfile:p.c.deliveryProfile||'as_soon_as_possible'}]);
    const id=r.json?.[0]?.campaignId;
    console.log('  create mirror   http '+r.status+'  '+(id?'campaignId '+id:JSON.stringify(r.json||r.text).slice(0,240)));
    if(!id) {console.log('  ABORT this campaign, mirror not created'); continue;}
    mirror={campaignId:id,name:mName}; camps=await GET('/sd/campaigns');
  } else console.log('  mirror already exists: '+mirror.campaignId);
  const mid=Number(mirror.campaignId);
  const existAg=(await GET('/sd/adGroups')).filter(a=>String(a.campaignId)===String(mid));
  let built=0, withAd=0, withTgt=0;
  for(const {src,targets} of p.steps.mirrorAg){
    let ag=existAg.find(a=>String(a.name)===String(src.name));
    if(!ag){
      r=await SEND('POST','/sd/adGroups',[{name:src.name,campaignId:mid,defaultBid:src.defaultBid,state:'enabled',
        tactic:src.tactic,bidOptimization:src.bidOptimization,creativeType:src.creativeType}]);
      const id=r.json?.[0]?.adGroupId;
      if(!id){console.log('  ad group "'+src.name+'" FAILED http '+r.status+' '+JSON.stringify(r.json||r.text).slice(0,220)); continue;}
      ag={adGroupId:id,name:src.name};
    }
    built++;
    // the 2-Pack ad, by SKU. never by ASIN.
    const curAds=(await GET('/sd/productAds')).filter(x=>String(x.adGroupId)===String(ag.adGroupId));
    if(!curAds.some(x=>x.sku===TWO_SKU&&x.state==='enabled')){
      const pausedTwo=curAds.find(x=>x.sku===TWO_SKU);
      r=pausedTwo
        ? await SEND('PUT','/sd/productAds',[{adId:Number(pausedTwo.adId),state:'enabled'}])
        : await SEND('POST','/sd/productAds',[{campaignId:mid,adGroupId:Number(ag.adGroupId),sku:TWO_SKU,state:'enabled'}]);
      if(r.ok) withAd++; else console.log('  2-Pack ad FAILED in '+ag.adGroupId+' http '+r.status+' '+JSON.stringify(r.json||r.text).slice(0,220));
    } else withAd++;
    const curT=(await GET('/sd/targets')).filter(x=>String(x.adGroupId)===String(ag.adGroupId));
    const need=targets.filter(t=>!curT.some(x=>JSON.stringify(x.expression)===JSON.stringify(t.expression)));
    if(need.length){
      r=await SEND('POST','/sd/targets',need.map(t=>({campaignId:mid,adGroupId:Number(ag.adGroupId),
        expression:t.expression,expressionType:t.expressionType||'manual',bid:t.bid,state:'enabled'})));
      const okN=(r.json||[]).filter(x=>x.code==='SUCCESS').length;
      if(okN) withTgt+=okN;
      if(okN<need.length) console.log('  targets: '+okN+'/'+need.length+' created, http '+r.status+' '+JSON.stringify(r.json||r.text).slice(0,260));
    } else withTgt+=curT.length;
  }
  console.log('  mirror built: '+built+' ad groups, '+withAd+' with a 2-Pack ad, '+withTgt+' targets');
  // 4. enable only if every ad group carries an ad
  if(built>0&&withAd===built){
    r=await SEND('PUT','/sd/campaigns',[{campaignId:mid,state:'enabled'}]);
    console.log('  ENABLE mirror   http '+r.status+'  '+(r.ok?'ok':r.text.slice(0,160)));
  } else console.log('  mirror LEFT PAUSED: '+withAd+' of '+built+' ad groups have a 2-Pack ad');
}
console.log('\n--- read-back ---');
camps=await GET('/sd/campaigns'); ags=await GET('/sd/adGroups'); ads=await GET('/sd/productAds'); tgs=await GET('/sd/targets');
const N={[SINGLE_ASIN]:'Single',[TWO_ASIN]:'2-Pack','B097MK5VZ4':'3-Pack','B0BLLJLSDP':'Pro'};
let tb=0;
console.log('budget  campaign          state     ad groups  enabled ads                 targets  name');
for(const c of camps.filter(x=>x.state==='enabled').sort((a,b)=>b.budget-a.budget)){ tb+=c.budget;
  const ag=ags.filter(a=>String(a.campaignId)===String(c.campaignId)&&a.state==='enabled');
  const en=ads.filter(x=>ag.some(a=>String(a.adGroupId)===String(x.adGroupId))&&x.state==='enabled');
  const t=tgs.filter(x=>ag.some(a=>String(a.adGroupId)===String(x.adGroupId))&&x.state==='enabled');
  const byA={}; for(const x of en){const k=N[x.asin]||x.asin; byA[k]=(byA[k]||0)+1;}
  console.log(('$'+c.budget).padEnd(8)+String(c.campaignId).padEnd(18)+String(c.state).padEnd(10)+String(ag.length).padStart(6)+'     '
   +(Object.entries(byA).map(([k,v])=>v+'x'+k).join(' ')||'NONE').padEnd(28)+String(t.length).padStart(6)+'  '+String(c.name).slice(0,40));}
console.log('Display total authorised now $'+tb.toFixed(2)+'/day');
