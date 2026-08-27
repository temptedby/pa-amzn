/** THE COMPLIANCE CHECK. Every entity that spent this month, in every ad product and every
 *  marketplace, judged against the kill rule, with its LIVE state read back from Amazon.
 *
 *  William 2026-08-25: "we need to make sure the engine is being followed on all items spending".
 *
 *  WHY THIS EXISTS. ad_engine_log records what the engine INTENDED. A state read-back cannot tell a
 *  landed write from one that was reverted. Neither answers the only question that matters: is
 *  anything still ENABLED right now that the rule says should be off? This asks that directly, for
 *  every spending entity, against live Amazon, and names the ones that fail.
 *
 *  It judges against TWO bars and prints both, because they are different things:
 *    DEPLOYED  = what origin/main is actually running today
 *    STATED    = what William asked for on 2026-08-23 (off below 1.5x)
 *  A gap between the two columns is unshipped work, not a broken engine.
 *
 *  READ ONLY. It writes nothing to Amazon and nothing to the database.
 *  RUN: node scripts/rule-compliance.mjs [--deployed-roas=1.0] [--stated-roas=1.5]
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const DEPLOYED_ROAS=+arg('deployed-roas','1.0');
const STATED_ROAS=+arg('stated-roas','1.5');
const A='https://advertising-api.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rq(u,o){for(let i=0;i<8;i++){try{const r=await fetch(u,o);if(r.status===429){await sleep(9000);continue;}return r;}catch{await sleep(4000);}}throw new Error('net');}
// Amazon's access token lasts an hour and a full sweep of this account takes longer than that,
// so it is refreshed before each section rather than minted once. A run that dies on the last
// marketplace has audited nothing useful, because the missing one is the one you needed.
let tok;
async function refreshToken(){
  tok=(await (await rq('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
  if(!tok) throw new Error('could not mint an access token');
}
await refreshToken();
const hdr=(p,ct)=>({Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':p,'Content-Type':ct,'Accept':ct});
const V3='application/vnd.createasyncreportrequest.v3+json';

// The kill bars, copied from src/lib/amazon/ad-rules.ts. Frozen policy, deliberately not a live FX
// lookup: a bar that drifts with the exchange rate cannot be reasoned about or tested.
const KILL_SPEND={USD:4,CAD:5.5,MXN:68,BRL:21};

const now=new Date(); const MONTH=now.toISOString().slice(0,7)+'-01'; const TODAY=now.toISOString().slice(0,10);

async function report(profile,cfg){
  const cr=await (await rq(`${A}/reporting/reports`,{method:'POST',headers:hdr(profile,V3),body:JSON.stringify(cfg)})).json();
  let rid=cr.reportId; if(!rid){const m=String(cr.detail||'').match(/([0-9a-f-]{36})/); if(m)rid=m[1];}
  if(!rid) return {err:`create failed: ${JSON.stringify(cr).slice(0,200)}`};
  // Amazon's queue has taken over 20 minutes on this account. A report that is still building is
  // NOT an empty report, and must never be reported as "nothing spent".
  for(let i=0;i<420;i++){await sleep(7000);
    const s=await (await rq(`${A}/reporting/reports/${rid}`,{headers:hdr(profile,V3)})).json();
    if(s.status==='COMPLETED') return {rows:JSON.parse(gunzipSync(Buffer.from(await (await rq(s.url)).arrayBuffer())).toString())};
    if(s.status==='FAILURE') return {err:'report FAILURE'};}
  return {err:'still building after 49 minutes'};
}
/** Every page of a v3 list endpoint, with extendedData so a landed write can be proved by timestamp. */
async function listAll(profile,path,ct,states){
  const out=[];let next;
  do{const r=await rq(`${A}${path}`,{method:'POST',headers:hdr(profile,ct),body:JSON.stringify({maxResults:1000,includeExtendedDataFields:true,stateFilter:{include:states},...(next?{nextToken:next}:{})})});
    const j=await r.json(); if(!r.ok) return {err:`${r.status} ${JSON.stringify(j).slice(0,150)}`};
    out.push(...(j.keywords||j.targetingClauses||j.targets||[])); next=j.nextToken;
  }while(next);
  return {rows:out};
}

/** THE RULE, exactly as src/lib/amazon/ad-rules.ts shouldKill() applies it. */
const violates=(spend,orders,sales,bar,roasBar)=>
  spend>=bar && (orders<=0 || sales<=0 || (sales/spend)<roasBar);

const findings=[];
function judge(label,ccy,rows,stateOf,nameOf){
  const bar=KILL_SPEND[ccy]??4;
  console.log(`\n=========== ${label} ===========`);
  const R=rows.filter(r=>r.spend>0);
  const tot=R.reduce((a,r)=>a+r.spend,0), sal=R.reduce((a,r)=>a+r.sales,0);
  console.log(`  ${R.length} entities spent   ${ccy} ${tot.toFixed(2)}   sales ${ccy} ${sal.toFixed(2)}   ROAS ${tot?(sal/tot).toFixed(2):'-'}   kill bar ${ccy} ${bar}`);
  const under=R.filter(r=>r.spend<bar);
  console.log(`  below the bar and therefore untouchable: ${under.length} entities, ${ccy} ${under.reduce((a,r)=>a+r.spend,0).toFixed(2)} (${tot?(100*under.reduce((a,r)=>a+r.spend,0)/tot).toFixed(1):0}%)`);
  for(const [tag,roasBar] of [['DEPLOYED',DEPLOYED_ROAS],['STATED  ',STATED_ROAS]]){
    const q=R.filter(r=>violates(r.spend,r.orders,r.sales,bar,roasBar));
    const on=q.filter(r=>String(stateOf(r)||'').toUpperCase()==='ENABLED');
    const missing=q.filter(r=>stateOf(r)==null);
    console.log(`  ${tag} bar ${roasBar.toFixed(1)}x : ${String(q.length).padStart(3)} qualify, ${String(q.length-on.length-missing.length).padStart(3)} already off, ${String(missing.length).padStart(3)} not found live, ${on.length?`\x1b[1m${on.length} STILL ENABLED\x1b[0m`:'0 still enabled'}`);
    if(on.length){
      for(const r of on.sort((a,b)=>b.spend-a.spend)){
        console.log(`      ${tag==='DEPLOYED'?'VIOLATION':'unshipped'}  ${ccy}${r.spend.toFixed(2).padStart(8)} spent  ${ccy}${r.sales.toFixed(2).padStart(8)} sales  ${(r.spend?r.sales/r.spend:0).toFixed(2)}x  ${String(r.orders).padStart(2)}ord   ${String(nameOf(r)).slice(0,44)}`);
        if(tag==='DEPLOYED') findings.push({label,name:nameOf(r),spend:r.spend,ccy});
      }
    }
  }
}

// ---------------------------------------------------------------------------
// SPONSORED PRODUCTS, per marketplace
// ---------------------------------------------------------------------------
const SP_COLS=['keywordId','keyword','matchType','cost','sales14d','purchases14d','clicks','impressions','campaignName'];
async function sponsoredProducts(label,profile,ccy){
  await refreshToken();
  if(!profile){console.log(`\n=========== ${label} ===========\n  no profile id configured, skipped`);return;}
  const [rep,kws]=await Promise.all([
    report(profile,{name:`compliance-sp-${ccy}-${TODAY}`,startDate:MONTH,endDate:TODAY,configuration:{adProduct:'SPONSORED_PRODUCTS',groupBy:['targeting'],columns:SP_COLS,reportTypeId:'spTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}}),
    listAll(profile,'/sp/keywords/list','application/vnd.spKeyword.v3+json',['ENABLED','PAUSED','ARCHIVED']),
  ]);
  if(rep.err){console.log(`\n=========== ${label} ===========\n  COULD NOT READ the month report: ${rep.err}\n  NOTHING is judged here. An unread report is not an empty one.`);return;}
  if(kws.err){console.log(`\n=========== ${label} ===========\n  COULD NOT READ live keyword states: ${kws.err}\n  NOTHING is judged here.`);return;}
  const st=new Map(kws.rows.map(k=>[String(k.keywordId),k]));
  const rows=rep.rows.map(r=>({id:String(r.keywordId??''),spend:r.cost??0,sales:r.sales14d??0,orders:r.purchases14d??0,
    name:`${r.keyword} ${r.matchType} | ${r.campaignName??''}`}));
  judge(label,ccy,rows,r=>st.get(r.id)?.state,r=>r.name);
}

// ---------------------------------------------------------------------------
// SPONSORED DISPLAY (US only — no other marketplace has a Display campaign)
// ---------------------------------------------------------------------------
async function sponsoredDisplay(){
  await refreshToken();
  const p=process.env.ADS_PROFILE_ID;
  const label='SPONSORED DISPLAY — US';
  const rep=await report(p,{name:`compliance-sd-${TODAY}`,startDate:MONTH,endDate:TODAY,configuration:{adProduct:'SPONSORED_DISPLAY',groupBy:['targeting'],columns:['targetingId','targetingText','targetingExpression','cost','sales','purchases','clicks','impressions','campaignName'],reportTypeId:'sdTargeting',timeUnit:'SUMMARY',format:'GZIP_JSON'}});
  if(rep.err){console.log(`\n=========== ${label} ===========\n  COULD NOT READ the month report: ${rep.err}\n  NOTHING is judged here.`);return;}
  // GET /sd/targets is a plain paged GET, not the v3 POST /list shape.
  const st=new Map(); let start=0;
  for(;;){
    const r=await rq(`${A}/sd/targets?startIndex=${start}&count=500`,{headers:{Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':p}});
    if(!r.ok){console.log(`\n=========== ${label} ===========\n  COULD NOT READ live target states: ${r.status}\n  NOTHING is judged here.`);return;}
    // targetId is a big integer; JSON.parse would round it and every lookup would miss.
    const txt=await r.text();
    const page=JSON.parse(txt.replace(/"(targetId|adGroupId|campaignId)":\s*(\d{10,})/g,'"$1":"$2"'));
    for(const t of page) st.set(String(t.targetId),t);
    if(page.length<500) break; start+=500;
  }
  const rows=rep.rows.map(r=>({id:String(r.targetingId??''),spend:r.cost??0,sales:r.sales??0,orders:r.purchases??0,
    name:`${r.targetingText||r.targetingExpression} | ${r.campaignName??''}`}));
  judge(label,'USD',rows,r=>st.get(r.id)?.state,r=>r.name);
}

// ---------------------------------------------------------------------------
// SPONSORED BRANDS (US only). v3 reporting EXCLUDES single-ad-group legacy campaigns, which is
// both of the ones that spend here, so this is the v2 HSA report: one call PER DAY, retried.
// A day that never answers is recorded as MISSING, never as zero.
// ---------------------------------------------------------------------------
async function sponsoredBrands(){
  await refreshToken();
  const p=process.env.ADS_PROFILE_ID, label='SPONSORED BRANDS — US';
  const HH={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':p,'Content-Type':'application/json'};
  async function day(d){
    for(let t=0;t<4;t++){try{
      const cr=await rq(`${A}/v2/hsa/keywords/report`,{method:'POST',headers:HH,body:JSON.stringify({reportDate:d.replace(/-/g,''),metrics:'keywordId,keywordText,matchType,campaignName,impressions,clicks,cost,attributedSales14d,attributedConversions14d'})});
      if(!cr.ok){await sleep(5000);continue;}
      const {reportId}=await cr.json(); if(!reportId){await sleep(5000);continue;}
      for(let i=0;i<60;i++){await sleep(6000);
        const s=await (await rq(`${A}/v2/reports/${reportId}`,{headers:HH})).json().catch(()=>({}));
        if(s.status==='FAILURE') break;
        if(s.status!=='SUCCESS') continue;
        const b=Buffer.from(await (await rq(`${A}/v2/reports/${reportId}/download`,{headers:HH,redirect:'follow'})).arrayBuffer());
        let txt; try{txt=gunzipSync(b).toString();}catch{txt=b.toString();}
        // keywordId is an 18-digit integer. A bare JSON.parse ROUNDS it, and then every lookup
        // against the live keyword list misses and the entity reads as "not found".
        return JSON.parse(txt.replace(/"(keywordId|adGroupId|campaignId)":\s*(\d{10,})/g,'"$1":"$2"'));
      }}catch{} await sleep(5000);}
    return null;
  }
  const days=[];for(let d=new Date(MONTH+'T12:00:00Z');d<=new Date(TODAY+'T12:00:00Z');d=new Date(d.getTime()+864e5))days.push(d.toISOString().slice(0,10));
  const res=await Promise.all(days.map(d=>day(d).then(r=>({d,r}))));
  const missing=res.filter(x=>!x.r).map(x=>x.d);
  const agg=new Map();
  for(const {r} of res){ if(!r) continue;
    for(const x of r){const id=String(x.keywordId);
      const o=agg.get(id)??{id,spend:0,sales:0,orders:0,name:''};
      o.spend+=x.cost||0;o.sales+=x.attributedSales14d||0;o.orders+=x.attributedConversions14d||0;
      o.name=`${x.keywordText} ${x.matchType} | ${x.campaignName??''}`; agg.set(id,o);}}
  // GET /sb/keywords is a bare GET; ids are big integers so they are quoted before parsing.
  const r=await rq(`${A}/sb/keywords`,{headers:{Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':p,Accept:'application/vnd.sbkeyword.v3.2+json'}});
  if(!r.ok){console.log(`\n=========== ${label} ===========\n  COULD NOT READ live keyword states: ${r.status}\n  NOTHING is judged here.`);return;}
  const txt=await r.text();
  const live=JSON.parse(txt.replace(/"(keywordId|adGroupId|campaignId)":\s*(\d{10,})/g,'"$1":"$2"'));
  const st=new Map(live.map(k=>[String(k.keywordId),k]));
  if(missing.length) console.log(`\n  Sponsored Brands days that would not answer: ${missing.join(', ')} — their spend is NOT counted below`);
  judge(label,'USD',[...agg.values()],r=>st.get(r.id)?.state,r=>r.name);
}

console.log(`RULE COMPLIANCE — every entity that spent ${MONTH} to ${TODAY}, judged against live Amazon state.`);
console.log(`DEPLOYED bar = $4 + below ${DEPLOYED_ROAS.toFixed(1)}x  (what origin/main runs today)`);
console.log(`STATED   bar = $4 + below ${STATED_ROAS.toFixed(1)}x  (William 2026-08-23; on PR #15, unmerged)`);
console.log(`Sponsored Brands is one call per day and is retried, so this is slow.`);

await sponsoredProducts('SPONSORED PRODUCTS — US',process.env.ADS_PROFILE_ID,'USD');
await sponsoredDisplay();
await sponsoredBrands();
await sponsoredProducts('SPONSORED PRODUCTS — CANADA',process.env.ADS_PROFILE_ID_CA,'CAD');
await sponsoredProducts('SPONSORED PRODUCTS — MEXICO',process.env.ADS_PROFILE_ID_MX,'MXN');

console.log(`\n=========== VERDICT ===========`);
if(!findings.length){
  console.log(`  No entity that the DEPLOYED rule says should be off is still enabled.`);
}else{
  console.log(`  ${findings.length} entities are ENABLED that the deployed rule says should be off:`);
  for(const f of findings.sort((a,b)=>b.spend-a.spend)) console.log(`    ${f.ccy}${f.spend.toFixed(2).padStart(9)}  ${f.label}  ${f.name}`);
}
