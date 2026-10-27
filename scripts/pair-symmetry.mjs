/**
 * Make the two sides of the A/B carry the same words, William 2026-10-27.
 * For every proven word (orders, lifetime ROAS >= 1.5 through 10-13) that is LIVE on one side
 * and absent from the other, create it on the missing side at the same bid, clamped $0.10-$0.85.
 * Words the kill rule switched off, or that spent $4+ in October, are left alone on BOTH sides.
 * Dry run by default. --apply writes. Read-back verifies.
 */
import fs from 'node:fs';
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const APPLY=process.argv.includes('--apply');
const FLOOR=0.10, CEILING=0.85, AGCAP=1000;
const {createClient}=await import('@libsql/client');
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const KT='application/vnd.spKeyword.v3+json';
const H=t=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
async function L(p,t,k){let o=[],tok=null;do{const b={maxResults:500,includeExtendedDataFields:true};if(tok)b.nextToken=tok;
 const r=await fetch('https://advertising-api.amazon.com'+p,{method:'POST',headers:H(t),body:JSON.stringify(b)});
 if(!r.ok)throw new Error('UNREAD '+p+' '+r.status+' '+(await r.text()).slice(0,200)); const j=await r.json();o.push(...(j[k]||[]));tok=j.nextToken||null;}while(tok);return o;}
const camps=await L('/sp/campaigns/list','application/vnd.spCampaign.v3+json','campaigns');
const ags=await L('/sp/adGroups/list','application/vnd.spAdGroup.v3+json','adGroups');
const kws=await L('/sp/keywords/list',KT,'keywords');
const C=new Map(camps.map(c=>[String(c.campaignId),c])), AG=new Map(ags.map(a=>[String(a.adGroupId),a]));
// the shortlist pair carries the words; that is where a missing word belongs
const SINGLE='212260116772958', TWO='212881454178968';
const SIDEOF={}; for(const [s,ids] of [['Single',['28008323784512','163087560588074','174896784333516','254328185654624',SINGLE,'305834701368758']],
 ['2-Pack',['260772188956325','160456263050588','84702108361350','21447045572583',TWO,'65188766700280']]]) for(const i of ids) SIDEOF[i]=s;
const live=k=>{const g=AG.get(String(k.adGroupId)); if(!g||g.state!=='ENABLED')return false; const c=C.get(String(g.campaignId));
  return k.state==='ENABLED'&&!!c&&c.state==='ENABLED';};
const hist=(await db.execute(`select lower(word) w, match_type mt, round(sum(spend),2) sp, sum(orders) o, round(sum(sales),2) sa
 from kw_day where day<='2026-10-13' and match_type in ('BROAD','PHRASE','EXACT') group by 1,2 having sum(orders)>0`)).rows;
const WORKS=new Map(hist.filter(h=>h.sp>0&&h.sa/h.sp>=1.5).map(h=>[h.w+'|'+h.mt,h]));
// WILLIAM 2026-10-27, and it is literal: a word that has spent $4 THIS MONTH stays off.
// The gate is applied to creates too, or symmetry would quietly reinstate what the kill rule cut.
const octR=(await db.execute(`select lower(word) w, match_type mt, round(sum(spend),2) sp from kw_day where day>='2026-10-01' group by 1,2`)).rows;
const OCT=new Map(octR.map(r=>[r.w+'|'+r.mt,r.sp]));
// where each proven word is live, and at what bid
const on={}; for(const q of WORKS.keys()) on[q]={Single:[],'2-Pack':[]};
for(const k of kws){ const q=String(k.keywordText).toLowerCase()+'|'+k.matchType; if(!on[q])continue;
  const g=AG.get(String(k.adGroupId)); if(!g)continue; const s=SIDEOF[String(g.campaignId)]; if(!s)continue;
  if(live(k)) on[q][s].push(Number(k.bid||0)); }
// ad group capacity, by match type, in the destination campaign
const load=new Map(); for(const g of ags) load.set(String(g.adGroupId), kws.filter(k=>String(k.adGroupId)===String(g.adGroupId)).length);
const dest=(side,mt)=>{
  const cid=side==='Single'?SINGLE:TWO;
  const mine=ags.filter(a=>String(a.campaignId)===cid&&a.state==='ENABLED');
  const named=mine.find(a=>new RegExp(mt,'i').test(String(a.name))&&load.get(String(a.adGroupId))<AGCAP);
  return named||mine.filter(a=>load.get(String(a.adGroupId))<AGCAP).sort((a,b)=>load.get(String(a.adGroupId))-load.get(String(b.adGroupId)))[0]||null;
};
const plan=[], skip=[];
for(const [q,h] of WORKS){
  const [w,mt]=q.split('|');
  const S=on[q].Single, T=on[q]['2-Pack'];
  if((S.length>0)===(T.length>0)) continue;                    // symmetric already, or off on both
  const missing=S.length?'2-Pack':'Single';
  const oct=OCT.get(q)||0;
  if(oct>=4){skip.push({q,missing,why:'spent $'+oct.toFixed(2)+' in October, over the $4 bar, left off rather than created'});continue;}
  const bid=Math.min(CEILING,Math.max(FLOOR,(S.length?S:T).reduce((a,b)=>Math.max(a,b),0)||FLOOR));
  const g=dest(missing,mt);
  if(!g){skip.push({q,missing,why:'every ad group in the destination campaign is at the 1000 cap'});continue;}
  plan.push({q,w,mt,missing,bid,adGroupId:String(g.adGroupId),agName:String(g.name),h,have:(S.length?S:T).length});
}
console.log((APPLY?'APPLYING':'DRY RUN')+'\n=== words live on one side and absent from the other ===');
console.log('missing  word                            mt      lifetime  ROAS    bid   destination ad group');
for(const p of plan.sort((a,b)=>b.h.sa/b.h.sp-a.h.sa/a.h.sp))
 console.log('  '+p.missing.padEnd(8)+p.w.padEnd(32)+p.mt.padEnd(8)+('$'+p.h.sp.toFixed(2)).padStart(8)+'  '+(p.h.sa/p.h.sp).toFixed(2)+'x  $'+p.bid.toFixed(2)+'   '+p.adGroupId+' "'+p.agName.slice(0,28)+'"');
console.log('  -> '+plan.length+' keywords to create');
for(const s of skip) console.log('  SKIP '+s.q+' ('+s.missing+'): '+s.why);
if(!APPLY){console.log('\nnothing written. add --apply');process.exit(0);}
const chunk=(a,n)=>a.length?[a.slice(0,n),...chunk(a.slice(n),n)]:[];
let made=0;
for(const g of chunk(plan,100)){
  const r=await fetch('https://advertising-api.amazon.com/sp/keywords',{method:'POST',headers:H(KT),body:JSON.stringify({keywords:g.map(p=>({
    campaignId:p.missing==='Single'?SINGLE:TWO, adGroupId:p.adGroupId, keywordText:p.w, matchType:p.mt, state:'ENABLED', bid:p.bid}))})});
  const t=await r.text(); console.log('\nCREATE batch '+g.length+'  http '+r.status);
  try{const j=JSON.parse(t); const ok=(j.keywords?.success||[]).length; const err=(j.keywords?.error||[]);
    made+=ok; console.log('  created '+ok+', refused '+err.length);
    for(const e of err.slice(0,8)) console.log('    '+JSON.stringify(e).slice(0,220));
  }catch{console.log('  '+t.slice(0,400));}
}
const after=await L('/sp/keywords/list',KT,'keywords');
let ok=0;
for(const p of plan){ const hit=after.some(k=>String(k.keywordText).toLowerCase()===p.w&&k.matchType===p.mt&&String(k.adGroupId)===p.adGroupId&&k.state==='ENABLED'); if(hit)ok++; else console.log('  NOT LIVE: '+p.q+' on the '+p.missing+' side');}
console.log('\nVERIFIED '+ok+'/'+plan.length+' now live on the side that was missing them');
