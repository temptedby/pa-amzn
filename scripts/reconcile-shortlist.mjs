/**
 * ONE definition of the shortlist, applied identically to both sides, because an A/B with
 * different keyword sets is not an A/B.
 *
 * Definition: settled kw_day through 2026-10-09, aggregated by (word, matchType) across every
 * keyword_id, kept when combined ROAS >= 1.50x. Aggregating by keyword_id first and deduping after
 * gave 54 words and overstated some of them, because the same word running in two ad groups is one
 * auction entity and only its combined record is real.
 *
 * DRY RUN BY DEFAULT.
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim(); }
const APPLY=process.argv.includes('--apply');
const A='https://advertising-api.amazon.com';
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const V={G:'application/vnd.spAdGroup.v3+json',K:'application/vnd.spKeyword.v3+json',P:'application/vnd.spProductAd.v3+json'};
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const H=(t)=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
const call=async(m,p,t,b)=>{const r=await fetch(A+p,{method:m,headers:H(t),body:JSON.stringify(b)});const x=await r.text();let j=null;try{j=JSON.parse(x);}catch{};return{status:r.status,j,txt:x,ok:r.ok};};
const post=(p,t,b)=>call('POST',p,t,b), put=(p,t,b)=>call('PUT',p,t,b);
async function L(p,t,k,e={}){let o=[],tok=null;do{const b={maxResults:500,includeExtendedDataFields:true,...e};if(tok)b.nextToken=tok;
 const r=await post(p,t,b); if(!r.ok){console.log('UNREAD '+r.status);break;} o.push(...(r.j?.[k]||[])); tok=r.j?.nextToken||null;}while(tok);return o;}

const SIDES=[{tag:'Single',cid:'212260116772958',sku:'57-P4AJ-J4AC'},
             {tag:'2-Pack',cid:'212881454178968',sku:'CPH-BLCK-2'}];
const {createClient}=await import('@libsql/client');
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const rows=(await db.execute({sql:`select lower(word) w, match_type mt, sum(spend) sp, sum(clicks) clk,
  sum(orders) ord, sum(sales) sa from kw_day where day<=? group by 1,2 having sum(orders)>0`,args:['2026-10-09']})).rows;
const PLAN=rows.map(x=>({w:String(x.w),mt:String(x.mt),sp:x.sp||0,clk:x.clk||0,ord:x.ord||0,sa:x.sa||0}))
 .map(x=>({...x,roas:x.sa/x.sp,bid:Math.min(0.85,Math.max(0.10,Math.round((x.clk?x.sp/x.clk:0.5)*100)/100))}))
 .filter(x=>x.roas>=1.5&&['BROAD','PHRASE','EXACT'].includes(x.mt));
const WANT=new Map(PLAN.map(p=>[p.w+'|'+p.mt,p]));
const sum=(a,f)=>a.reduce((t,x)=>t+f(x),0);
console.log(`ONE shortlist: ${PLAN.length} words.  settled $${sum(PLAN,x=>x.sp).toFixed(2)} spend, ${sum(PLAN,x=>x.ord)} orders,`
 +` $${sum(PLAN,x=>x.sa).toFixed(2)} sales, ROAS ${(sum(PLAN,x=>x.sa)/sum(PLAN,x=>x.sp)).toFixed(2)}x`);
console.log(`  net with the goods sunk (break-even 1.71x): $${(sum(PLAN,x=>x.sa)*(5.55/9.49)-sum(PLAN,x=>x.sp)).toFixed(2)}\n`);

const ags=await L('/sp/adGroups/list',V.G,'adGroups');
const kws=await L('/sp/keywords/list',V.K,'keywords');
const ads=await L('/sp/productAds/list',V.P,'productAds');
const key=(k)=>String(k.keywordText).toLowerCase()+'|'+k.matchType;
const ops={enable:[],pause:[],create:[]};
for(const s of SIDES){
  const myAgs=ags.filter(a=>String(a.campaignId)===s.cid&&a.state==='ENABLED');
  // only ad groups that can actually serve this side's product
  const serving=myAgs.filter(a=>ads.some(x=>String(x.adGroupId)===String(a.adGroupId)&&x.state==='ENABLED'
    &&x.sku===s.sku&&(x.extendedData?.servingStatus||'')==='AD_STATUS_LIVE'));
  const ids=new Set(serving.map(a=>String(a.adGroupId)));
  const mine=kws.filter(k=>ids.has(String(k.adGroupId)));
  const enabled=mine.filter(k=>k.state==='ENABLED');
  const haveEnabled=new Set(enabled.map(key));
  const offList=enabled.filter(k=>!WANT.has(key(k)));
  const pausedBy=new Map(); for(const k of mine.filter(k=>k.state==='PAUSED')) if(!pausedBy.has(key(k))) pausedBy.set(key(k),k);
  const missing=[...WANT.keys()].filter(k=>!haveEnabled.has(k));
  const canEnable=missing.filter(k=>pausedBy.has(k));
  const mustCreate=missing.filter(k=>!pausedBy.has(k));
  // capacity: spread creates over the serving ad groups, newest (emptiest) first
  const cap=serving.map(a=>({id:String(a.adGroupId),n:kws.filter(k=>String(k.adGroupId)===String(a.adGroupId)).length})).sort((x,y)=>x.n-y.n);
  console.log(`${s.tag}  campaign ${s.cid}: ${serving.length} serving ad group(s) ${cap.map(c=>c.id+'('+c.n+' kw)').join(' ')}`);
  console.log(`   enabled now ${enabled.length}  on-list ${enabled.length-offList.length}  OFF-LIST to pause ${offList.length}`);
  console.log(`   missing ${missing.length}: enable ${canEnable.length} paused, create ${mustCreate.length}`);
  for(const k of offList) ops.pause.push({keywordId:String(k.keywordId)});
  for(const k of canEnable){ const p=WANT.get(k); ops.enable.push({keywordId:String(pausedBy.get(k).keywordId),bid:p.bid}); }
  let ci=0;
  for(const k of mustCreate){ const p=WANT.get(k);
    ops.create.push({campaignId:s.cid,adGroupId:cap[ci%cap.length].id,keywordText:p.w,matchType:p.mt,state:'ENABLED',bid:p.bid}); ci++; }
}
console.log(`\nSUMMARY  pause ${ops.pause.length} off-list, enable ${ops.enable.length}, create ${ops.create.length}`);
if(!APPLY){ console.log('\nDRY RUN. --apply to write.'); process.exit(0); }
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
for(const c of chunk(ops.enable,100)){ const r=await put('/sp/keywords',V.K,{keywords:c.map(x=>({keywordId:x.keywordId,state:'ENABLED',bid:x.bid}))});
  console.log('  enable '+r.status+' ok '+(r.j?.keywords?.success||[]).length+' err '+(r.j?.keywords?.error||[]).length); }
for(const c of chunk(ops.create,100)){ const r=await post('/sp/keywords',V.K,{keywords:c});
  console.log('  create '+r.status+' ok '+(r.j?.keywords?.success||[]).length+' err '+(r.j?.keywords?.error||[]).length);
  for(const e of (r.j?.keywords?.error||[]).slice(0,2)) console.log('    '+JSON.stringify(e).slice(0,200)); }
for(const c of chunk(ops.pause,100)){ const r=await put('/sp/keywords',V.K,{keywords:c.map(x=>({keywordId:x.keywordId,state:'PAUSED'}))});
  console.log('  pause '+r.status+' ok '+(r.j?.keywords?.success||[]).length); }
console.log('\n--- read-back');
const k2=await L('/sp/keywords/list',V.K,'keywords');
const ag2=await L('/sp/adGroups/list',V.G,'adGroups');
for(const s of SIDES){
  const ids=new Set(ag2.filter(a=>String(a.campaignId)===s.cid).map(a=>String(a.adGroupId)));
  const en=k2.filter(k=>ids.has(String(k.adGroupId))&&k.state==='ENABLED');
  const on=en.filter(k=>WANT.has(key(k)));
  const distinct=new Set(on.map(key));
  console.log(`  ${s.tag}: ${en.length} enabled, ${distinct.size}/${PLAN.length} shortlist words covered, ${en.length-on.length} off-list`);
}
