/** Point Sponsored Display at the four ASINs we can actually sell.
 *
 *  William 2026-08-13: "Only have four ASINs anyway. So we need to be able to push those four
 *  ASINs, please."
 *
 *  Four of the eight ASINs Display advertises have zero stock and zero inbound, so those ads cannot
 *  win a placement while still reading as "enabled" in the console. The $50/day Black Combo
 *  Retarget campaign advertises ONLY a dead ASIN, which is why it has never spent.
 *
 *  Prefers RE-ENABLING an existing paused ad over creating a new one: the ad keeps its id and its
 *  history, and we do not litter the account with duplicates.
 *
 *  RUN: node scripts/sd-push-live-asins.mjs            # dry run, changes nothing
 *       node scripts/sd-push-live-asins.mjs --apply
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const APPLY=process.argv.includes('--apply');
const A='https://advertising-api.amazon.com';
// SELLER ACCOUNTS CREATE PRODUCT ADS BY SKU, NOT ASIN. Amazon refused all 42 creates on
// 2026-08-13 with "Product ad did not specify sku for create operation" while happily accepting
// the pause and re-enable operations, which key on adId. So the create path needs the SKU that
// actually holds the stock. These are the four with inventory, read from the inventory table the
// same day (fba 202 / 12 / 19 / 23).
const LIVE=['B07Y5GZP1T','B097MK5VZ4','B097MGPCPC','B0BLLJLSDP'];   // in stock 2026-08-13
const SKU={
  B07Y5GZP1T:'57-P4AJ-J4AC',   // flagship, 202 units
  B097MK5VZ4:'CPH-BLCK-3',     // 3-pack, 12
  B097MGPCPC:'CPH-BLCK-2',     // 2-pack, 19
  B0BLLJLSDP:'UG-SVG8-LB0P',   // Pro, 23
};
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json','Accept':'application/json'};
const call=async(path,method='GET',body)=>{const r=await fetch(`${A}${path}`,{method,headers:H,body:body?JSON.stringify(body):undefined});const t=await r.text();let j;try{j=JSON.parse(t);}catch{}return{status:r.status,ok:r.ok,json:j,text:t};};

const camps=(await call('/sd/campaigns')).json||[];
const groups=(await call('/sd/adGroups')).json||[];
const ads=(await call('/sd/productAds')).json||[];
const liveSet=new Set(LIVE);
const enabledCamps=camps.filter(c=>String(c.state).toLowerCase()==='enabled');

const pauseOps=[], enableOps=[], createOps=[];
for(const c of enabledCamps){
  for(const g of groups.filter(g=>String(g.campaignId)===String(c.campaignId) && String(g.state).toLowerCase()==='enabled')){
    const mine=ads.filter(a=>String(a.adGroupId)===String(g.adGroupId));
    // 1. switch off anything advertising a product we cannot ship
    for(const a of mine) if(String(a.state).toLowerCase()==='enabled' && !liveSet.has(a.asin))
      pauseOps.push({adId:a.adId,asin:a.asin,camp:c.name});
    // 2. make sure each sellable ASIN has an enabled ad here
    for(const asin of LIVE){
      if(mine.some(a=>a.asin===asin && String(a.state).toLowerCase()==='enabled')) continue;
      const paused=mine.find(a=>a.asin===asin && String(a.state).toLowerCase()!=='enabled');
      if(paused) enableOps.push({adId:paused.adId,asin,camp:c.name,group:g.adGroupId});
      else createOps.push({campaignId:c.campaignId,adGroupId:g.adGroupId,asin,camp:c.name});
    }
  }
}
const show=(t,rows,f)=>{console.log(`\n${t}: ${rows.length}`);for(const r of rows) console.log('   '+f(r));};
show('PAUSE ads for out-of-stock ASINs',pauseOps,r=>`adId ${r.adId}  ${r.asin}  ${String(r.camp).slice(0,42)}`);
show('RE-ENABLE existing paused ads for sellable ASINs',enableOps,r=>`adId ${r.adId}  ${r.asin}  ${String(r.camp).slice(0,42)}`);
show('CREATE new ads for sellable ASINs',createOps,r=>`${r.asin}  group ${r.adGroupId}  ${String(r.camp).slice(0,42)}`);

if(!APPLY){ console.log('\n(dry run — nothing changed. add --apply)'); process.exit(0); }

const report=(label,res,n)=>{
  const items=Array.isArray(res.json)?res.json:(res.json?.productAds||[]);
  const ok=items.filter(i=>String(i.code??'').toUpperCase()==='SUCCESS').length;
  console.log(`  ${label}: HTTP ${res.status}, ${ok}/${n} SUCCESS`);
  for(const i of items) if(String(i.code??'').toUpperCase()!=='SUCCESS') console.log(`     refused: ${JSON.stringify(i).slice(0,140)}`);
  return ok;
};
console.log('\nAPPLYING');
if(pauseOps.length){
  const r=await call('/sd/productAds','PUT',pauseOps.map(o=>({adId:Number(o.adId),state:'paused'})));
  report('pause',r,pauseOps.length);
}
if(enableOps.length){
  const r=await call('/sd/productAds','PUT',enableOps.map(o=>({adId:Number(o.adId),state:'enabled'})));
  report('re-enable',r,enableOps.length);
}
if(createOps.length){
  const r=await call('/sd/productAds','POST',createOps.map(o=>({
    campaignId:Number(o.campaignId), adGroupId:Number(o.adGroupId),
    sku:SKU[o.asin], state:'enabled',
  })));
  report('create',r,createOps.length);
}
// READ BACK. The response is not the truth; the account is.
const after=(await call('/sd/productAds')).json||[];
let deadOn=0, liveOn=0;
for(const c of enabledCamps) for(const g of groups.filter(g=>String(g.campaignId)===String(c.campaignId)&&String(g.state).toLowerCase()==='enabled'))
  for(const a of after.filter(a=>String(a.adGroupId)===String(g.adGroupId)&&String(a.state).toLowerCase()==='enabled'))
    liveSet.has(a.asin)?liveOn++:deadOn++;
console.log(`\nREAD BACK from the account: ${liveOn} enabled ads on sellable ASINs, ${deadOn} still on out-of-stock ASINs.`);
