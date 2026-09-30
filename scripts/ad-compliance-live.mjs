/** READ-ONLY. Does every LIVE ad obey the model?
 *
 *  Live bids and states come from Amazon; month-to-date spend comes from our kw_day archive.
 *  Checks the three rules that govern spend: BID_CAP, the $4 kill bar, and the 1.5x ROAS floor.
 *  Also counts the entities the engine CANNOT see, which is the real October exposure: a keyword
 *  with no kw_day row is invisible to every rule until after it has spent.
 *
 *  RUN: node scripts/ad-compliance-live.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const A='https://advertising-api.amazon.com';
const t=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json();
const h=(ct)=>({Authorization:`Bearer ${t.access_token}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':ct,Accept:ct});
async function list(p,ct,k){let n=null,o=[];do{const r=await fetch(`${A}${p}`,{method:'POST',headers:h(ct),body:JSON.stringify({maxResults:1000,...(n?{nextToken:n}:{})})});const j=await r.json();if(!r.ok){console.log('ERR',p,r.status);return o;}o.push(...(j[k]||[]));n=j.nextToken;}while(n);return o;}
const kws=await list('/sp/keywords/list','application/vnd.spKeyword.v3+json','keywords');
const tgs=await list('/sp/targets/list','application/vnd.spTargetingClause.v3+json','targetingClauses');
const live=[...kws.filter(k=>k.state==='ENABLED').map(k=>({id:String(k.keywordId),bid:+k.bid,txt:k.keywordText,mt:k.matchType})),
            ...tgs.filter(g=>g.state==='ENABLED').map(g=>({id:String(g.targetId),bid:+g.bid,txt:g.expression?.[0]?.value??'target',mt:'TARGET'}))];
const perf=new Map();
const r=await db.execute("SELECT keyword_id, SUM(spend) sp, SUM(sales) sl, SUM(orders) o, SUM(clicks) c FROM kw_day WHERE day LIKE '2026-09%' AND ad_product='SPONSORED_PRODUCTS' GROUP BY keyword_id");
for(const x of r.rows) perf.set(String(x.keyword_id),{sp:+x.sp,sl:+x.sl,o:+x.o,c:+x.c});
const KILL=4, MINROAS=1.5, CAP=2.50, CEIL=0.85, FLOOR=0.10;
const v={overCap:[],killable:[],belowRoas:[],overCeil:0,atFloor:0,noData:0};
let liveSpend=0;
for(const k of live){ const p=perf.get(k.id);
  if(k.bid>CAP) v.overCap.push(k);
  if(k.bid>CEIL) v.overCeil++;
  if(k.bid<=FLOOR) v.atFloor++;
  if(!p){v.noData++;continue;}
  liveSpend+=p.sp;
  if(p.sp>=KILL && (p.o<=0||p.sl<=0)) v.killable.push({...k,...p});
  else if(p.sp>=KILL && p.sl/p.sp<MINROAS) v.belowRoas.push({...k,...p,roas:+(p.sl/p.sp).toFixed(2)});
}
console.log(`LIVE entities: ${live.length} (${kws.filter(k=>k.state==='ENABLED').length} keywords, ${tgs.filter(g=>g.state==='ENABLED').length} targets)`);
console.log(`  carrying $${liveSpend.toFixed(2)} of September spend; ${v.noData} have NO kw_day row (engine cannot see them)\n`);
console.log(`RULE 1  bid above BID_CAP $2.50 ........... ${v.overCap.length} ${v.overCap.length?'VIOLATION':'ok'}`);
for(const k of v.overCap) console.log(`          $${k.bid} ${k.mt} "${k.txt}" id=${k.id}`);
console.log(`RULE 2  spent $4+, never converted, still ON . ${v.killable.length} ${v.killable.length?'VIOLATION':'ok'}`);
for(const k of v.killable.sort((a,b)=>b.sp-a.sp).slice(0,15)) console.log(`          $${k.sp.toFixed(2)} spent, 0 sales, bid $${k.bid}  ${k.mt} "${k.txt}"`);
if(v.killable.length>15) console.log(`          ...and ${v.killable.length-15} more`);
console.log(`RULE 3  spent $4+, converted below 1.5x, ON .. ${v.belowRoas.length} ${v.belowRoas.length?'VIOLATION':'ok'}`);
for(const k of v.belowRoas.sort((a,b)=>b.sp-a.sp).slice(0,10)) console.log(`          $${k.sp.toFixed(2)} -> $${k.sl.toFixed(2)} = ${k.roas}x  bid $${k.bid}  "${k.txt}"`);
console.log(`\nbids above the $0.85 confirm-ceiling: ${v.overCeil}`);
console.log(`bids at the $0.10 floor: ${v.atFloor}`);
const tot=v.killable.reduce((a,b)=>a+b.sp,0)+v.belowRoas.reduce((a,b)=>a+b.sp,0);
console.log(`\nSeptember spend sitting on words that SHOULD be off: $${tot.toFixed(2)}`);
process.exit(0);
