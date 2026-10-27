/**
 * Clamp every live bid above the $0.85 confirm ceiling, EXCEPT where the entity actually
 * converted at the higher bid.
 * William 2026-10-27: "yes bids at .85 unless they were converting higher prior".
 *
 * "Converting higher prior" is read as: the entity has orders in our archive, a lifetime ROAS at
 * or above the 1.5x bar, and kw_bid_history records sales against it while its bid was over $0.85.
 * Anything that has never had an order at that bid is clamped.
 *
 * Half of these bids are over the ceiling because my 2026-10-23 mirror script copied bid values
 * verbatim into the new campaigns. See [[copying-a-campaign-copies-bad-bids]].
 *
 * Dry run by default. --apply writes. Read-back verifies every change.
 */
import fs from 'node:fs';
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const APPLY=process.argv.includes('--apply');
const CEILING=0.85;
const {createClient}=await import('@libsql/client');
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const KT='application/vnd.spKeyword.v3+json', TT='application/vnd.spTargetingClause.v3+json';
const H=t=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
async function L(p,t,k){let o=[],tok=null;do{const b={maxResults:500,includeExtendedDataFields:true};if(tok)b.nextToken=tok;
 const r=await fetch('https://advertising-api.amazon.com'+p,{method:'POST',headers:H(t),body:JSON.stringify(b)});
 if(!r.ok)throw new Error('UNREAD '+p+' '+r.status+' '+(await r.text()).slice(0,200)); const j=await r.json();o.push(...(j[k]||[]));tok=j.nextToken||null;}while(tok);return o;}
const camps=await L('/sp/campaigns/list','application/vnd.spCampaign.v3+json','campaigns');
const ags=await L('/sp/adGroups/list','application/vnd.spAdGroup.v3+json','adGroups');
const kws=await L('/sp/keywords/list',KT,'keywords');
const tgs=await L('/sp/targets/list',TT,'targetingClauses');
const C=new Map(camps.map(c=>[String(c.campaignId),c])), AG=new Map(ags.map(a=>[String(a.adGroupId),a]));
const live=x=>{const g=AG.get(String(x.adGroupId)); if(!g||g.state!=='ENABLED')return false; const c=C.get(String(g.campaignId)); return x.state==='ENABLED'&&!!c&&c.state==='ENABLED';};
const byId=new Map((await db.execute(`select keyword_id, round(sum(spend),2) sp, sum(orders) o, round(sum(sales),2) sa from kw_day group by 1`)).rows.map(r=>[String(r.keyword_id),r]));
const hiSales=new Map();
for(const r of (await db.execute(`select keyword_id, max(sales_before) s from kw_bid_history where (from_bid>0.85 or to_bid>0.85) and sales_before>0 group by 1`)).rows) hiSales.set(String(r.keyword_id),r.s);
const K=[],T=[],keep=[];
for(const x of [...kws.map(k=>({x:k,kind:'kw'})),...tgs.map(t=>({x:t,kind:'tgt'}))]){
  const e=x.x; if(!live(e)||(e.bid||0)<=CEILING) continue;
  const id=String(e.keywordId||e.targetId);
  const h=byId.get(id)||{sp:0,o:0,sa:0};
  const earned = h.o>0 && h.sp>0 && (h.sa/h.sp)>=1.5 && (hiSales.get(id)||0)>0;
  const label=e.keywordText||JSON.stringify(e.expression?.[0]?.value||'').replace(/"/g,'').slice(0,30);
  if(earned){keep.push({id,bid:e.bid,label,o:h.o,roas:h.sa/h.sp});continue;}
  (x.kind==='kw'?K:T).push({id,was:e.bid,label,o:h.o,sp:h.sp});
}
console.log((APPLY?'APPLYING':'DRY RUN')+'\n');
console.log('BID STANDS, converted at the higher bid ('+keep.length+'):');
for(const k of keep) console.log('  $'+k.bid.toFixed(2)+'  '+String(k.o)+' orders at '+k.roas.toFixed(2)+'x   '+k.label);
console.log('\nCLAMP to $0.85: '+K.length+' keywords + '+T.length+' targets = '+(K.length+T.length));
console.log('  removes $'+[...K,...T].reduce((t,r)=>t+r.was-CEILING,0).toFixed(2)+' of authorised bid per click round');
console.log('  '+[...K,...T].filter(r=>r.o===0).length+' have never had an order, on $'+[...K,...T].filter(r=>r.o===0).reduce((t,r)=>t+r.sp,0).toFixed(2)+' of spend');
if(!APPLY){console.log('\nnothing written. add --apply');process.exit(0);}
const chunk=(a,n)=>a.length?[a.slice(0,n),...chunk(a.slice(n),n)]:[];
async function put(path,ct,key,items,idField){
  for(const g of chunk(items,100)){
    const r=await fetch('https://advertising-api.amazon.com'+path,{method:'PUT',headers:H(ct),
      body:JSON.stringify({[key]:g.map(x=>({[idField]:x.id,bid:CEILING}))})});
    const t=await r.text(); let j=null; try{j=JSON.parse(t)}catch{}
    const ok=(j?.[key]?.success||[]).length;
    console.log('  PUT '+path+'  '+g.length+' items, http '+r.status+', success '+ok);
    for(const e of (j?.[key]?.error||[]).slice(0,4)) console.log('    '+JSON.stringify(e).slice(0,220));
  }
}
if(K.length) await put('/sp/keywords',KT,'keywords',K,'keywordId');
if(T.length) await put('/sp/targets',TT,'targetingClauses',T,'targetId');
const k2=await L('/sp/keywords/list',KT,'keywords'), t2=await L('/sp/targets/list',TT,'targetingClauses');
const A=new Map([...k2.map(x=>[String(x.keywordId),x]),...t2.map(x=>[String(x.targetId),x])]);
let bad=0;
for(const x of [...K,...T]){const n=A.get(x.id); if(!n||Math.abs(Number(n.bid)-CEILING)>0.005){bad++;console.log('  NOT CLAMPED: '+x.id+' '+x.label+' is $'+(n?n.bid:'missing'));}}
const stillOver=[...k2,...t2].filter(x=>live(x)&&(x.bid||0)>CEILING);
console.log('\nVERIFIED '+((K.length+T.length)-bad)+'/'+(K.length+T.length)+' clamped to $'+CEILING.toFixed(2));
console.log('live entities still over the ceiling: '+stillOver.length+'   authorised per click round $'+stillOver.reduce((t,x)=>t+x.bid,0).toFixed(2));
