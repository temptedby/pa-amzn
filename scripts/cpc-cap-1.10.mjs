/**
 * CPC CAP $1.10 — DRY RUN BY DEFAULT.  William 2026-10-20: set the ceiling at the median CPC of
 * the best-ROI words ($1.097, the 30 settled keywords at or above break-even 2.67x) and switch off
 * any word paying more than that.
 *
 * Two halves, because CPC is realised and only the bid is settable:
 *   RETROSPECTIVE  pause every ENABLED keyword whose settled CPC exceeds the cap.
 *   FORWARD        a bid ceiling per campaign = cap / (that campaign's measured CPC-to-bid ratio).
 *
 * Scope is KEYWORDS only, as stated. ASIN/category and auto targeting clauses are listed but NOT
 * touched. Settled window only: kw_day through 2026-10-06, so no sale is still landing.
 *
 * RUN:  node scripts/cpc-cap-1.10.mjs            (dry run)
 *       node scripts/cpc-cap-1.10.mjs --live     (applies)
 */
import fs from 'node:fs';
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].trim();}
const LIVE=process.argv.includes('--live');
const CAP=1.10, SETTLED_END='2026-10-06';
const {createClient}=await import('@libsql/client');
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID;
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const TK='application/vnd.spKeyword.v3+json', TC='application/vnd.spCampaign.v3+json', TT='application/vnd.spTargetingClause.v3+json';
const H=t=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
async function list(path,type,key){let o=[],tok=null;do{const b={maxResults:500,includeExtendedDataFields:true};if(tok)b.nextToken=tok;
  const r=await fetch('https://advertising-api.amazon.com'+path,{method:'POST',headers:H(type),body:JSON.stringify(b)});
  if(!r.ok){console.log('READ FAIL '+path+' '+r.status+' '+(await r.text()).slice(0,200));process.exit(1);}
  const j=await r.json();o.push(...(j[key]||[]));tok=j.nextToken||null;}while(tok);return o;}

const camps=await list('/sp/campaigns/list',TC,'campaigns');
const kws  =await list('/sp/keywords/list',TK,'keywords');
const tgts =await list('/sp/targets/list',TT,'targetingClauses');
const CN=new Map(camps.map(c=>[String(c.campaignId),c]));
const enabledKw=new Map(kws.filter(k=>k.state==='ENABLED').map(k=>[String(k.keywordId),k]));
const enabledTg=new Map(tgts.filter(t=>t.state==='ENABLED').map(t=>[String(t.targetId),t]));

const r=await db.execute(`select keyword_id, word, match_type, campaign_id, sum(spend) spend, sum(clicks) clicks,
  sum(orders) orders, sum(sales) sales from kw_day where day<='${SETTLED_END}' group by keyword_id having sum(clicks)>0`);
const perf=r.rows.map(x=>({id:String(x.keyword_id),word:x.word,mt:x.match_type,cid:String(x.campaign_id),
  spend:x.spend,clicks:x.clicks,orders:x.orders,sales:x.sales,cpc:x.spend/x.clicks,roas:x.spend?x.sales/x.spend:0}));

const isTarget=p=>p.mt==='TARGETING_EXPRESSION'||p.mt==='TARGETING_EXPRESSION_PREDEFINED';
const liveKw=perf.filter(p=>!isTarget(p)&&enabledKw.has(p.id));
const liveTg=perf.filter(p=>isTarget(p)&&enabledTg.has(p.id));
const over=liveKw.filter(p=>p.cpc>CAP).sort((a,b)=>b.cpc-a.cpc);
const tgOver=liveTg.filter(p=>p.cpc>CAP);

console.log(LIVE?'=== LIVE\n':'=== DRY RUN  (add --live to apply)\n');
console.log(`cap $${CAP.toFixed(2)} = median CPC of the 30 settled keywords at or above break-even 2.67x`);
console.log(`settled window: kw_day through ${SETTLED_END}`);
console.log(`enabled SP keywords live: ${enabledKw.size}   with settled clicks: ${liveKw.length}   over the cap: ${over.length}\n`);

const sum=a=>({n:a.length,cl:a.reduce((s,k)=>s+k.clicks,0),sp:a.reduce((s,k)=>s+k.spend,0),sa:a.reduce((s,k)=>s+k.sales,0),o:a.reduce((s,k)=>s+k.orders,0)});
const b=sum(liveKw), o=sum(over), keep=sum(liveKw.filter(p=>p.cpc<=CAP));
console.log('                        kws  clicks     spend     sales  ord    ROAS');
for(const [lab,s] of [['enabled w/ settled clicks',b],['PAUSE (CPC over cap)',o],['KEEP (CPC at or under)',keep]])
  console.log(lab.padEnd(26)+String(s.n).padStart(4)+String(s.cl).padStart(8)+s.sp.toFixed(2).padStart(10)+s.sa.toFixed(2).padStart(10)+String(s.o).padStart(5)+(s.sp?(s.sa/s.sp).toFixed(2)+'x':'   -').padStart(8));
console.log(`\nthis removes ${(100*o.sp/b.sp).toFixed(0)}% of settled spend and ${(100*o.sa/b.sa).toFixed(0)}% of settled sales.`);

// sample-size view: how many of the paused words are judged on a single click
const by=(f)=>sum(over.filter(f));
console.log('\nthe pause list by how much evidence it rests on');
console.log('  clicks      kws   spend    sales   ord');
for(const [lab,f] of [['1 click only',k=>k.clicks===1],['2-4 clicks',k=>k.clicks>=2&&k.clicks<=4],['5+ clicks',k=>k.clicks>=5]]){
  const s=by(f); console.log('  '+lab.padEnd(12)+String(s.n).padStart(4)+s.sp.toFixed(2).padStart(8)+s.sa.toFixed(2).padStart(9)+String(s.o).padStart(6));
}
const earners=over.filter(k=>k.orders>=1);
console.log(`\nearners caught by the cap: ${earners.length} words, $${earners.reduce((s,k)=>s+k.sales,0).toFixed(2)} of settled sales`);
for(const k of earners.sort((a,b)=>b.sales-a.sales)) console.log('  '+(k.roas.toFixed(2)+'x').padStart(7)+(' $'+k.cpc.toFixed(2)).padStart(8)+String(k.clicks).padStart(5)+'clk'+String(k.orders).padStart(3)+'ord  '+k.sales.toFixed(2).padStart(7)+'  '+String(k.mt).padEnd(7)+String(k.word).slice(0,40));

// FORWARD half: per-campaign CPC-to-bid ratio -> implied bid ceiling
console.log('\n=== FORWARD half: bid ceiling implied by a $1.10 CPC cap');
console.log('campaign          clicks  blended CPC   median bid   CPC/bid   implied bid ceiling   today  action');
const byC={};for(const p of liveKw){if(!enabledKw.get(p.id)?.bid)continue;(byC[p.cid]=byC[p.cid]||[]).push(p);}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?(s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2):null};
for(const cid of Object.keys(byC)){
  const g=byC[cid], cl=g.reduce((s,k)=>s+k.clicks,0); if(cl<5) continue;
  const cpc=g.reduce((s,k)=>s+k.spend,0)/cl, mb=med(g.map(p=>enabledKw.get(p.id).bid)), ratio=cpc/mb, ceil=CAP/ratio;
  console.log(cid.padEnd(17)+String(cl).padStart(6)+('$'+cpc.toFixed(3)).padStart(13)+('$'+mb.toFixed(2)).padStart(13)+(ratio.toFixed(2)+'x').padStart(10)
    +('$'+ceil.toFixed(2)).padStart(22)+('$'+mb.toFixed(2)).padStart(8)+'  '+(ceil<mb?'LOWER to $'+ceil.toFixed(2):'already compliant'));
}
console.log(`\nNOT TOUCHED, as stated (keywords only): ${liveTg.length} enabled targeting clauses with settled clicks, ${tgOver.length} of them over $${CAP.toFixed(2)}.`);
console.log(`\nfull pause list (${over.length}) written to scripts/_cpc-cap-pause-list.txt`);
fs.writeFileSync('scripts/_cpc-cap-pause-list.txt',
 'cpc      roas   clicks ord   spend    sales   bid   campaign          match    word\n'+
 over.map(k=>('$'+k.cpc.toFixed(2)).padStart(7)+(k.roas.toFixed(2)+'x').padStart(8)+String(k.clicks).padStart(7)+String(k.orders).padStart(4)
  +k.spend.toFixed(2).padStart(9)+k.sales.toFixed(2).padStart(9)+('$'+(enabledKw.get(k.id)?.bid??0).toFixed(2)).padStart(7)+'  '+k.cid.padEnd(17)+String(k.mt).padEnd(8)+k.word).join('\n')+'\n');

if(!LIVE){console.log('\nnothing was changed.');process.exit(0);}
console.log('\n--- pausing '+over.length+' keywords');
for(let i=0;i<over.length;i+=100){
  const chunk=over.slice(i,i+100);
  const res=await fetch('https://advertising-api.amazon.com/sp/keywords',{method:'PUT',headers:H(TK),
    body:JSON.stringify({keywords:chunk.map(k=>({keywordId:k.id,state:'PAUSED'}))})});
  const t=await res.text();
  console.log('  PUT '+res.status+'  success '+(t.match(/"keywordId"/g)||[]).length+'/'+chunk.length);
  if(!res.ok) console.log('    '+t.slice(0,400));
  await new Promise(s=>setTimeout(s,1500));
}
console.log('\n--- READ-BACK from Amazon');
await new Promise(s=>setTimeout(s,8000));
const after=await list('/sp/keywords/list',TK,'keywords');
const st=new Map(after.map(k=>[String(k.keywordId),k.state]));
const stillOn=over.filter(k=>st.get(k.id)==='ENABLED');
console.log('  verified PAUSED '+(over.length-stillOn.length)+'/'+over.length+'   ENABLED total now '+after.filter(k=>k.state==='ENABLED').length);
if(stillOn.length) for(const k of stillOn) console.log('    STILL ENABLED: '+k.word+' '+k.mt);
