/**
 * Repair for reroute-estate-split.mjs: it adopted ads matched by ASIN, which picked up old paused
 * ads on DEAD SKUs, then paused the working 3-Pack ads beside them. Match by SKU only, verify
 * AD_STATUS_LIVE, and if a target SKU will not go live, put the 3-Pack ad back rather than leave
 * the ad group dark.
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim(); }
const APPLY = process.argv.includes('--apply');
const A='https://advertising-api.amazon.com';
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const V={C:'application/vnd.spCampaign.v3+json',G:'application/vnd.spAdGroup.v3+json',P:'application/vnd.spProductAd.v3+json',K:'application/vnd.spKeyword.v3+json'};
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const H=(t)=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
const call=async(m,p,t,b)=>{const r=await fetch(A+p,{method:m,headers:H(t),body:JSON.stringify(b)});const x=await r.text();let j=null;try{j=JSON.parse(x);}catch{};return{ok:r.ok,status:r.status,j,txt:x};};
const post=(p,t,b)=>call('POST',p,t,b), put=(p,t,b)=>call('PUT',p,t,b);
async function L(p,t,k,e={}){let o=[],tok=null;do{const b={maxResults:500,includeExtendedDataFields:true,...e};if(tok)b.nextToken=tok;
 const r=await post(p,t,b); if(!r.ok){console.log('UNREAD '+p+' '+r.status);break;} o.push(...(r.j?.[k]||[])); tok=r.j?.nextToken||null;}while(tok);return o;}

// SKUs PROVEN AD_STATUS_LIVE earlier today in the sandbox campaigns. Nothing else is trusted.
const TARGET = [
  { tag:'Single', campaignId:'212260116772958', sku:'57-P4AJ-J4AC', ags:['254674058751981','219702094951415'] },
  { tag:'2-Pack', campaignId:'212881454178968', sku:'CPH-BLCK-2',   ags:['228378364538869','56637396195261','248025453146582'] },
];
const ss=(a)=>a.extendedData?.servingStatus||a.servingStatus||'?';

let ads=await L('/sp/productAds/list',V.P,'productAds');
console.log('=== current state of the five ad groups');
for(const t of TARGET) for(const g of t.ags){
  const mine=ads.filter(a=>String(a.adGroupId)===g);
  console.log(`  ag ${g}  (${t.tag})`);
  for(const a of mine) console.log(`     ${String(a.sku).padEnd(16)} ${a.asin}  ${String(a.state).padEnd(8)} ${ss(a)}`);
}
if(!APPLY){ console.log('\nDRY RUN. --apply to repair.'); process.exit(0); }

console.log('\n--- creating ads on the proven SKUs');
const want=[];
for(const t of TARGET) for(const g of t.ags){
  const have=ads.find(a=>String(a.adGroupId)===g && a.sku===t.sku);
  if(have && have.state==='ENABLED'){ console.log(`  ag ${g} already has ENABLED sku ${t.sku}`); continue; }
  if(have){ const r=await put('/sp/productAds',V.P,{productAds:[{adId:String(have.adId),state:'ENABLED'}]});
    console.log(`  ag ${g} enabled existing sku ${t.sku} (${r.status})`); continue; }
  want.push({campaignId:t.campaignId,adGroupId:g,sku:t.sku,state:'ENABLED',tag:t.tag});
}
if(want.length){
  const r=await post('/sp/productAds',V.P,{productAds:want.map(({campaignId,adGroupId,sku,state})=>({campaignId,adGroupId,sku,state}))});
  console.log(`  create ${r.status}  success ${(r.j?.productAds?.success||[]).length}  error ${(r.j?.productAds?.error||[]).length}`);
  for(const e of (r.j?.productAds?.error||[])) console.log('    ERROR '+JSON.stringify(e).slice(0,240));
}
console.log('\n  waiting 45s for servingStatus to settle...');
await new Promise(s=>setTimeout(s,45000));
ads=await L('/sp/productAds/list',V.P,'productAds');

console.log('\n--- verdict per ad group, and repair');
const DEAD=['NOT_BUYABLE','MISSING_IMAGE','MISSING_DECORATION','INELIGIBLE','ASIN_NOT_BUYABLE','OUT_OF_STOCK'];
for(const t of TARGET) for(const g of t.ags){
  const mine=ads.filter(a=>String(a.adGroupId)===g);
  const good=mine.find(a=>a.sku===t.sku && a.state==='ENABLED' && !DEAD.includes(ss(a)));
  const live=mine.filter(a=>a.state==='ENABLED' && !DEAD.includes(ss(a)));
  if(good){
    const junk=mine.filter(a=>a.state==='ENABLED' && String(a.adId)!==String(good.adId));
    if(junk.length){ const r=await put('/sp/productAds',V.P,{productAds:junk.map(a=>({adId:String(a.adId),state:'PAUSED'}))});
      console.log(`  ag ${g} ${t.tag} LIVE on ${t.sku}; paused ${junk.length} other ad(s) (${r.status})`); }
    else console.log(`  ag ${g} ${t.tag} LIVE on ${t.sku}, sole ad`);
    continue;
  }
  if(live.length){ console.log(`  ag ${g} ${t.tag} sku not live, but ${live.length} other ad(s) ARE serving: ${live.map(a=>a.sku+'/'+ss(a)).join(', ')} — leaving them`); continue; }
  // nothing can serve: put the 3-Pack back rather than leave the ad group dark
  const three=mine.filter(a=>a.asin==='B097MK5VZ4');
  if(three.length){ const r=await put('/sp/productAds',V.P,{productAds:[{adId:String(three[0].adId),state:'ENABLED'}]});
    console.log(`  ag ${g} DARK — restored 3-Pack ad ${three[0].adId} on sku ${three[0].sku} (${r.status})`); }
  else console.log(`  ag ${g} DARK and no 3-Pack ad to restore. NEEDS A HUMAN.`);
}
console.log('\n  waiting 30s, then final read-back...');
await new Promise(s=>setTimeout(s,30000));
ads=await L('/sp/productAds/list',V.P,'productAds');
for(const t of TARGET) for(const g of t.ags){
  const mine=ads.filter(a=>String(a.adGroupId)===g && a.state==='ENABLED');
  console.log(`  ag ${g} (${t.tag}): `+(mine.length?mine.map(a=>`${a.sku}/${a.asin}/${ss(a)}`).join('  '):'NOTHING ENABLED'));
}
