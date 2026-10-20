/**
 * REVERT KEYWORD ADS TO THE SINGLE, KEEP THE 3-PACK ON PRODUCT TARGETING.
 * William 2026-10-20: "Revert keywords to the single. Keep the three pack on [ASIN] targeting.
 * We want to send traffic to the three-pack."
 *
 * WHY. Matched daily rates, settled, excluding the 10-08 switch day itself:
 *     Single (09-06..10-07)   5,676 impr/day  38.03 clicks/day  6.2% CVR  0.69x
 *     3-Pack (10-09..)          407 impr/day   5.92 clicks/day  2.8% CVR  0.25x
 *   Conversion HALVED, not just impressions. The 3-Pack carries 14 reviews at 3.6 stars against
 *   the Single's 482 at 3.8, reviews no longer pool (Amazon's Feb-May 2026 variation split), and
 *   the 3-Pack's own swatch is labelled "Black". Stock also decides it: 24 3-Packs + 10 inbound
 *   against 104 Singles + 40 inbound.
 *
 * SPLIT. An ad group is KEYWORD-driven or TARGETING-driven, read live from Amazon:
 *   keyword-driven   -> re-enable the Single ad, pause the 3-Pack ad   (the revert)
 *   targeting-driven -> leave the 3-Pack exactly as it is             (William's test)
 * An ad group holding both is reported and SKIPPED rather than guessed at.
 *
 * SAFETY. Two passes, and pass 2 is gated on pass 1 fully succeeding, because on 10-08 an
 * ungated pause left 8 ad groups dark for 12 minutes. The Single ads already exist as PAUSED
 * with their 2021-2022 creation dates, so this restores history rather than starting from zero.
 *
 * SKU GATE. B07Y5GZP1T has three SKUs and only 57-P4AJ-J4AC carries an offer (104 units + 40
 * inbound at the 10-18 snapshot). FY-2WDI-19GH is absent from the inventory feed entirely, so
 * enabling it would mint another NOT_BUYABLE ad -- which is exactly what left campaign
 * 324534995037875 dark since 10-08 (sku 4N-06WS-Y02E, 0 stock). Only SKUs with fba+inbound > 0
 * may be enabled, read from the inventory table, and every refusal is printed.
 *
 * RUN:  node scripts/revert-keywords-to-single.mjs            (dry run)
 *       node scripts/revert-keywords-to-single.mjs --live     (applies, then reads back)
 */
import fs from 'node:fs';
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].trim();}
const LIVE=process.argv.includes('--live');
const SINGLE='B07Y5GZP1T', THREE='B097MK5VZ4';
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID;
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const TAD='application/vnd.spProductAd.v3+json';
const H=t=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
async function list(p,t,k){let o=[],tok=null;do{const b={maxResults:500,includeExtendedDataFields:true};if(tok)b.nextToken=tok;
 const r=await fetch('https://advertising-api.amazon.com'+p,{method:'POST',headers:H(t),body:JSON.stringify(b)});
 if(!r.ok){console.log('READ FAIL '+p+' '+r.status+' '+(await r.text()).slice(0,200));process.exit(1);}
 const j=await r.json();o.push(...(j[k]||[]));tok=j.nextToken||null;}while(tok);return o;}

const {createClient}=await import('@libsql/client');
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const inv=await db.execute('select sku, quantity_fba, quantity_inbound, last_checked_at from inventory');
const BUYABLE=new Set(inv.rows.filter(r=>(r.quantity_fba||0)+(r.quantity_inbound||0)>0).map(r=>String(r.sku)));
const SNAP=inv.rows[0]?.last_checked_at;
console.log('SKU gate: '+BUYABLE.size+' SKUs carry stock or inbound, per the inventory snapshot of '+SNAP);
console.log('  (SP-API is down, so this snapshot is the freshest stock reading available)\n');

const camps=await list('/sp/campaigns/list','application/vnd.spCampaign.v3+json','campaigns');
const ags  =await list('/sp/adGroups/list','application/vnd.spAdGroup.v3+json','adGroups');
const ads  =await list('/sp/productAds/list',TAD,'productAds');
const kws  =await list('/sp/keywords/list','application/vnd.spKeyword.v3+json','keywords');
const tgs  =await list('/sp/targets/list','application/vnd.spTargetingClause.v3+json','targetingClauses');
const C=new Map(camps.map(c=>[String(c.campaignId),c]));
const liveAgs=ags.filter(a=>a.state==='ENABLED'&&C.get(String(a.campaignId))?.state==='ENABLED');

const nKw=id=>kws.filter(k=>String(k.adGroupId)===id&&k.state==='ENABLED').length;
const nTg=id=>tgs.filter(t=>String(t.adGroupId)===id&&t.state==='ENABLED').length;
const adsIn=id=>ads.filter(a=>String(a.adGroupId)===id);

console.log(LIVE?'=== LIVE\n':'=== DRY RUN  (add --live to apply)\n');
const toEnable=[], toPause=[], skipped=[], keep=[], noSingle=[], refused=[];
for(const a of liveAgs){
  const id=String(a.adGroupId), k=nKw(id), t=nTg(id), mine=adsIn(id);
  const single=mine.filter(x=>x.asin===SINGLE), three=mine.filter(x=>x.asin===THREE&&x.state==='ENABLED');
  const kind=k&&t?'BOTH':k?'keyword':t?'targeting':'neither';
  const row={id,camp:String(a.campaignId),name:String(a.name).slice(0,26),cn:String(C.get(String(a.campaignId)).name).slice(0,30),k,t,kind,single,three};
  if(kind==='targeting'||kind==='neither') keep.push(row);
  else if(kind==='BOTH') skipped.push(row);
  else if(!single.length) noSingle.push(row);
  else {
    const cands=single.filter(x=>x.state!=='ENABLED');
    const okSku=cands.filter(x=>BUYABLE.has(String(x.sku)));
    const noStock=cands.filter(x=>!BUYABLE.has(String(x.sku)));
    for(const x of noStock) refused.push({...row,adId:x.adId,sku:x.sku});
    if(!okSku.length){ noSingle.push({...row,why:'no Single SKU with stock'}); continue; }
    // one ad per ad group wins anyway: enable the single best-stocked SKU, not every duplicate
    const best=okSku.sort((a,b)=>String(a.sku)==='57-P4AJ-J4AC'?-1:1)[0];
    toEnable.push({...row,adId:best.adId,sku:best.sku});
    toPause.push(...three.map(x=>({...row,adId:x.adId,sku:x.sku})));
  }
}
console.log('live ad groups: '+liveAgs.length);
console.log('camp              ad group          kw  tgt  kind        action');
for(const r of [...toEnable.map(r=>({...r,act:'ENABLE Single '+r.sku}))])
  console.log(r.camp.padEnd(17)+r.id.padEnd(17)+String(r.k).padStart(3)+String(r.t).padStart(5)+'  '+r.kind.padEnd(11)+r.act);
for(const r of toPause) console.log(r.camp.padEnd(17)+r.id.padEnd(17)+String(r.k).padStart(3)+String(r.t).padStart(5)+'  '+r.kind.padEnd(11)+'PAUSE 3-Pack '+r.sku);
console.log('\nKEEP the 3-Pack (product-targeting ad groups, William\'s test):');
for(const r of keep) console.log('  '+r.camp.padEnd(17)+r.id.padEnd(17)+'kw '+String(r.k).padStart(3)+'  targets '+String(r.t).padStart(3)+'   '+r.cn);
if(skipped.length){console.log('\nSKIPPED, holds BOTH keywords and targets (not guessing):');
 for(const r of skipped) console.log('  '+r.camp.padEnd(17)+r.id.padEnd(17)+'kw '+r.k+'  targets '+r.t+'   '+r.cn);}
if(noSingle.length){console.log('\nSKIPPED, keyword ad group with NO enableable Single ad:');
 for(const r of noSingle) console.log('  '+r.camp.padEnd(17)+r.id.padEnd(17)+'kw '+String(r.k).padStart(3)+'   '+r.cn+(r.why?'   ('+r.why+')':''));}
if(refused.length){console.log('\nREFUSED to enable, SKU has no offer (would mint a NOT_BUYABLE ad):');
 for(const r of refused) console.log('  '+r.camp.padEnd(17)+r.id.padEnd(17)+r.sku+'   '+r.cn);}
console.log(`\nsummary: enable ${toEnable.length} Single ads, pause ${toPause.length} 3-Pack ads, keep ${keep.length} targeting ad groups on the 3-Pack`);
if(!toEnable.length){console.log('\nnothing to do.');process.exit(0);}
if(!LIVE){console.log('\nnothing was changed.');process.exit(0);}

console.log('\n--- PASS 1: enable the Single ads');
let ok=0;
for(let i=0;i<toEnable.length;i+=50){
  const ch=toEnable.slice(i,i+50);
  const r=await fetch('https://advertising-api.amazon.com/sp/productAds',{method:'PUT',headers:H(TAD),
    body:JSON.stringify({productAds:ch.map(x=>({adId:String(x.adId),state:'ENABLED'}))})});
  const t=await r.text(); const n=(t.match(/"adId"/g)||[]).length; ok+=n;
  console.log('  PUT '+r.status+'  '+n+'/'+ch.length);
  if(!r.ok) console.log('    '+t.slice(0,400));
  await new Promise(s=>setTimeout(s,1500));
}
if(ok<toEnable.length){console.log('\nPASS 1 INCOMPLETE ('+ok+'/'+toEnable.length+'). NOT pausing the 3-Pack. No ad group left dark.');process.exit(1);}
console.log('\n--- PASS 2: pause the 3-Pack ads in those same ad groups');
for(let i=0;i<toPause.length;i+=50){
  const ch=toPause.slice(i,i+50);
  const r=await fetch('https://advertising-api.amazon.com/sp/productAds',{method:'PUT',headers:H(TAD),
    body:JSON.stringify({productAds:ch.map(x=>({adId:String(x.adId),state:'PAUSED'}))})});
  console.log('  PUT '+r.status+'  '+((await r.text()).match(/"adId"/g)||[]).length+'/'+ch.length);
  await new Promise(s=>setTimeout(s,1500));
}
console.log('\n--- READ-BACK from Amazon');
await new Promise(s=>setTimeout(s,8000));
const after=await list('/sp/productAds/list',TAD,'productAds');
const S=new Map(after.map(a=>[String(a.adId),a]));
let bad=0, dark=0;
for(const x of toEnable) if(S.get(String(x.adId))?.state!=='ENABLED'){bad++;console.log('  NOT ENABLED: '+x.id+' '+x.sku);}
for(const x of toPause)  if(S.get(String(x.adId))?.state!=='PAUSED'){bad++;console.log('  NOT PAUSED: '+x.id+' '+x.sku);}
for(const a of liveAgs){ const live=after.filter(x=>String(x.adGroupId)===String(a.adGroupId)&&x.state==='ENABLED'
  &&x.extendedData?.servingStatus==='AD_STATUS_LIVE'); if(!live.length){dark++;console.log('  DARK ad group: '+a.adGroupId+' '+String(a.name).slice(0,30));} }
console.log('\nverified: '+(toEnable.length+toPause.length-bad)+'/'+(toEnable.length+toPause.length)+' writes landed.  dark ad groups: '+dark);
