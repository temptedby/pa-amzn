/** Finish the shortlist in both rerouted campaigns. A keyword that already exists PAUSED cannot be
 *  created again — the create 422s — so it has to be ENABLED. That is why 49 of 72 were refused. */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim(); }
const APPLY=process.argv.includes('--apply');
const A='https://advertising-api.amazon.com';
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const K='application/vnd.spKeyword.v3+json', G='application/vnd.spAdGroup.v3+json';
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const H=(t)=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
const call=async(m,p,t,b)=>{const r=await fetch(A+p,{method:m,headers:H(t),body:JSON.stringify(b)});const x=await r.text();let j=null;try{j=JSON.parse(x);}catch{};return{status:r.status,j,txt:x,ok:r.ok};};
const post=(p,t,b)=>call('POST',p,t,b), put=(p,t,b)=>call('PUT',p,t,b);
async function L(p,t,k,e={}){let o=[],tok=null;do{const b={maxResults:500,includeExtendedDataFields:true,...e};if(tok)b.nextToken=tok;
 const r=await post(p,t,b); if(!r.ok){console.log('UNREAD '+r.status);break;} o.push(...(r.j?.[k]||[])); tok=r.j?.nextToken||null;}while(tok);return o;}

const SIDES=[{tag:'Single',cid:'212260116772958',host:'254674058751981'},
             {tag:'2-Pack',cid:'212881454178968',host:'228378364538869'}];
const {createClient}=await import('@libsql/client');
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const rows=(await db.execute({sql:`select keyword_id, word, match_type, sum(spend) sp, sum(clicks) clk, sum(orders) ord, sum(sales) sa
  from kw_day where day<=? group by 1,2,3 having sum(orders)>0`,args:['2026-10-09']})).rows;
const tier=rows.map(x=>({word:String(x.word),mt:String(x.match_type),sp:x.sp||0,clk:x.clk||0,ord:x.ord||0,sa:x.sa||0}))
 .map(x=>({...x,roas:x.sa/x.sp,cpc:x.clk?x.sp/x.clk:0}))
 .filter(x=>x.roas>=1.5&&['BROAD','PHRASE','EXACT'].includes(x.mt));
const seen=new Map(); for(const k of tier.sort((a,b)=>b.roas-a.roas)){const key=k.word.toLowerCase()+'|'+k.mt; if(!seen.has(key)) seen.set(key,k);}
const PLAN=[...seen.values()].map(k=>({...k,bid:Math.min(0.85,Math.max(0.10,Math.round(k.cpc*100)/100))}));
console.log('shortlist target: '+PLAN.length+' keywords per campaign\n');

const kws=await L('/sp/keywords/list',K,'keywords');
const ags=await L('/sp/adGroups/list',G,'adGroups');
for(const s of SIDES){
  const myAg=new Set(ags.filter(a=>String(a.campaignId)===s.cid).map(a=>String(a.adGroupId)));
  const mine=kws.filter(k=>myAg.has(String(k.adGroupId)));
  const key=(k)=>String(k.keywordText).toLowerCase()+'|'+k.matchType;
  const enabled=new Set(mine.filter(k=>k.state==='ENABLED').map(key));
  const pausedBy=new Map(); for(const k of mine.filter(k=>k.state==='PAUSED')) if(!pausedBy.has(key(k))) pausedBy.set(key(k),k);
  const toEnable=[], toCreate=[];
  for(const p of PLAN){ const kk=p.word.toLowerCase()+'|'+p.mt;
    if(enabled.has(kk)) continue;
    if(pausedBy.has(kk)) toEnable.push({keywordId:String(pausedBy.get(kk).keywordId),bid:p.bid,word:p.word,mt:p.mt});
    else toCreate.push({campaignId:s.cid,adGroupId:s.host,keywordText:p.word,matchType:p.mt,state:'ENABLED',bid:p.bid}); }
  console.log(`${s.tag}: ${enabled.size>PLAN.length?PLAN.length:[...enabled].filter(e=>PLAN.some(p=>p.word.toLowerCase()+'|'+p.mt===e)).length} shortlist already enabled, ENABLE ${toEnable.length} paused, CREATE ${toCreate.length} new`);
  if(!APPLY) continue;
  for(let i=0;i<toEnable.length;i+=100){ const c=toEnable.slice(i,i+100);
    const r=await put('/sp/keywords',K,{keywords:c.map(x=>({keywordId:x.keywordId,state:'ENABLED',bid:x.bid}))});
    console.log(`  enable ${r.status} success ${(r.j?.keywords?.success||[]).length} error ${(r.j?.keywords?.error||[]).length}`);
    for(const e of (r.j?.keywords?.error||[]).slice(0,3)) console.log('    '+JSON.stringify(e).slice(0,200)); }
  for(let i=0;i<toCreate.length;i+=100){ const c=toCreate.slice(i,i+100);
    const r=await post('/sp/keywords',K,{keywords:c});
    console.log(`  create ${r.status} success ${(r.j?.keywords?.success||[]).length} error ${(r.j?.keywords?.error||[]).length}`);
    for(const e of (r.j?.keywords?.error||[]).slice(0,3)) console.log('    '+JSON.stringify(e).slice(0,220)); }
}
if(!APPLY){ console.log('\nDRY RUN. --apply to write.'); process.exit(0); }
console.log('\n--- read-back');
const k2=await L('/sp/keywords/list',K,'keywords');
for(const s of SIDES){
  const myAg=new Set(ags.filter(a=>String(a.campaignId)===s.cid).map(a=>String(a.adGroupId)));
  const en=k2.filter(k=>myAg.has(String(k.adGroupId))&&k.state==='ENABLED');
  const onList=en.filter(k=>PLAN.some(p=>p.word.toLowerCase()===String(k.keywordText).toLowerCase()&&p.mt===k.matchType));
  console.log(`  ${s.tag}: ${en.length} enabled, ${onList.length} of them on the shortlist, ${en.length-onList.length} off-list`);
}
