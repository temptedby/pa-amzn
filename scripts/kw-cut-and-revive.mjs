/**
 * Two keyword operations, William 2026-10-27.
 *   CUT    the three words over $4 lifetime that are still serving, for this month.
 *   REVIVE every proven word (orders, lifetime ROAS >= 1.5 through 10-13) that sits paused
 *          in a live paired campaign AND has spent under $4 in October.
 * Bids on revived words are clamped into the $0.10 - $0.85 band; a revive never raises
 * a bid past the ceiling, and never leaves one under the floor.
 * Dry run by default. --apply writes. Read-back verifies every change.
 */
import fs from 'node:fs';
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const APPLY=process.argv.includes('--apply');
const FLOOR=0.10, CEILING=0.85, MONTH='2026-10-01', SETTLED='2026-10-13';
const CUT=[['retractable phone tether','PHRASE'],['retractable phone tether','EXACT'],['bungee cord phone','PHRASE']];
const SIDE={'28008323784512':'Single','163087560588074':'Single','174896784333516':'Single','254328185654624':'Single','212260116772958':'Single','305834701368758':'Single',
 '260772188956325':'2-Pack','160456263050588':'2-Pack','84702108361350':'2-Pack','21447045572583':'2-Pack','212881454178968':'2-Pack','65188766700280':'2-Pack'};
const {createClient}=await import('@libsql/client');
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const KT='application/vnd.spKeyword.v3+json';
const H=t=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
async function L(p,t,k){let o=[],tok=null;do{const b={maxResults:500,includeExtendedDataFields:true};if(tok)b.nextToken=tok;
 const r=await fetch('https://advertising-api.amazon.com'+p,{method:'POST',headers:H(t),body:JSON.stringify(b)});
 if(!r.ok) throw new Error('UNREAD '+p+' '+r.status+' '+(await r.text()).slice(0,200));
 const j=await r.json();o.push(...(j[k]||[]));tok=j.nextToken||null;}while(tok);return o;}
const camps=await L('/sp/campaigns/list','application/vnd.spCampaign.v3+json','campaigns');
const ags=await L('/sp/adGroups/list','application/vnd.spAdGroup.v3+json','adGroups');
const kws=await L('/sp/keywords/list',KT,'keywords');
const C=new Map(camps.map(c=>[String(c.campaignId),c])), AG=new Map(ags.map(a=>[String(a.adGroupId),a]));
const cidOf=k=>{const g=AG.get(String(k.adGroupId));return g?String(g.campaignId):null;};
const servable=k=>{const g=AG.get(String(k.adGroupId)); if(!g||g.state!=='ENABLED')return false; const c=C.get(String(g.campaignId)); return !!c&&c.state==='ENABLED';};
const qOf=k=>String(k.keywordText).toLowerCase()+'|'+k.matchType;

const hist=(await db.execute({sql:`select lower(word) w, match_type mt, round(sum(spend),2) sp, sum(orders) o, round(sum(sales),2) sa
 from kw_day where day<=? and match_type in ('BROAD','PHRASE','EXACT') group by 1,2 having sum(orders)>0`,args:[SETTLED]})).rows;
const WORKS=new Map(hist.filter(h=>h.sp>0&&h.sa/h.sp>=1.5).map(h=>[h.w+'|'+h.mt,h]));
const octR=(await db.execute({sql:`select lower(word) w, match_type mt, round(sum(spend),2) sp from kw_day where day>=? group by 1,2`,args:[MONTH]})).rows;
const OCT=new Map(octR.map(r=>[r.w+'|'+r.mt,r.sp]));

const cutSet=new Set(CUT.map(([w,m])=>w+'|'+m));
const toCut=kws.filter(k=>cutSet.has(qOf(k))&&k.state==='ENABLED');
const toRevive=[];
for(const k of kws){
  const q=qOf(k); const h=WORKS.get(q); if(!h) continue;
  if(k.state==='ENABLED'||!servable(k)) continue;
  const cid=cidOf(k); if(!SIDE[cid]) continue;
  if((OCT.get(q)||0)>=4) continue;
  const was=Number(k.bid||0);
  const bid=Math.min(CEILING,Math.max(FLOOR,was||FLOOR));
  toRevive.push({k,cid,q,h,was,bid,oct:OCT.get(q)||0});
}
console.log((APPLY?'APPLYING':'DRY RUN')+'\n');
console.log('=== CUT (pause) '+toCut.length+' keyword rows across the three words ===');
for(const k of toCut) console.log('  '+qOf(k).split('|')[0].padEnd(28)+String(k.matchType).padEnd(8)+'$'+Number(k.bid||0).toFixed(2).padStart(5)+'  kw '+String(k.keywordId).padEnd(17)+'camp '+cidOf(k)+' ('+(SIDE[cidOf(k)]||'unpaired')+')');
console.log('\n=== REVIVE (enable) '+toRevive.length+' keyword rows, '+new Set(toRevive.map(r=>r.q)).size+' distinct words ===');
for(const r of toRevive.sort((a,b)=>b.h.sa/b.h.sp-a.h.sa/a.h.sp))
 console.log('  '+String(SIDE[r.cid]).padEnd(7)+r.q.split('|')[0].padEnd(32)+r.q.split('|')[1].padEnd(7)+(r.h.sa/r.h.sp).toFixed(2)+'x lifetime, Oct $'+r.oct.toFixed(2)
  +'   bid $'+r.was.toFixed(2)+(Math.abs(r.was-r.bid)>0.001?' -> $'+r.bid.toFixed(2)+' (clamped)':'')+'   kw '+r.k.keywordId);
if(!APPLY){ console.log('\nnothing written. add --apply'); process.exit(0); }

async function put(body){
  const r=await fetch('https://advertising-api.amazon.com/sp/keywords',{method:'PUT',headers:H(KT),body:JSON.stringify(body)});
  const t=await r.text(); return {ok:r.ok,status:r.status,body:t};
}
const chunk=(a,n)=>a.length?[a.slice(0,n),...chunk(a.slice(n),n)]:[];
let okCut=0, okRev=0;
for(const g of chunk(toCut,100)){
  const res=await put({keywords:g.map(k=>({keywordId:String(k.keywordId),state:'PAUSED'}))});
  console.log('\nCUT batch '+g.length+'  http '+res.status);
  if(!res.ok) console.log('  '+res.body.slice(0,400)); else okCut+=g.length;
}
for(const g of chunk(toRevive,100)){
  const res=await put({keywords:g.map(r=>({keywordId:String(r.k.keywordId),state:'ENABLED',bid:r.bid}))});
  console.log('REVIVE batch '+g.length+'  http '+res.status);
  if(!res.ok) console.log('  '+res.body.slice(0,400)); else okRev+=g.length;
}
// READ BACK. A write is not done until Amazon says the state changed.
const after=await L('/sp/keywords/list',KT,'keywords');
const A=new Map(after.map(k=>[String(k.keywordId),k]));
let badCut=0,badRev=0;
for(const k of toCut){const n=A.get(String(k.keywordId)); if(!n||n.state!=='PAUSED'){badCut++;console.log('  NOT PAUSED: '+k.keywordId+' '+qOf(k)+' is '+(n?n.state:'missing'));}}
for(const r of toRevive){const n=A.get(String(r.k.keywordId));
  if(!n||n.state!=='ENABLED'){badRev++;console.log('  NOT ENABLED: '+r.k.keywordId+' '+r.q+' is '+(n?n.state:'missing'));}
  else if(Math.abs(Number(n.bid)-r.bid)>0.005) console.log('  bid mismatch: '+r.q+' wanted $'+r.bid.toFixed(2)+' got $'+Number(n.bid).toFixed(2));}
console.log('\nVERIFIED  cut '+(toCut.length-badCut)+'/'+toCut.length+'   revived '+(toRevive.length-badRev)+'/'+toRevive.length);
