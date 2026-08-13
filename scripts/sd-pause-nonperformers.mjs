/** Switch off the Display audiences that have never worked at any bid.
 *
 *  William 2026-08-13: "yes pause the non performing please save the money".
 *
 *  WHAT STAYS AND WHY. The decision is per AUDIENCE FAMILY, on lifetime data, after separating bid
 *  from targeting — because the same audience at different bids swings wildly and the blended
 *  averages hid it:
 *
 *    KEEP  views 14d   2.41x at a $0.10 bid   (0.67x at $0.48 — a bid problem, not a bad audience)
 *    KEEP  views 30d   1.16x at a $0.10 bid on 1,664 clicks, the biggest sample in the account
 *    PAUSE views 60d   0.61x and 0.00x — never cleared 1x at any bid we have tried
 *    PAUSE purchases   0.00x / 0.34x / 0.57x at 90 / 180 / 365 days, and 0.48x-0.69x across bids
 *
 *  Purchases remarketing is structural rather than tunable: a phone tether is one per phone and it
 *  lasts, so a recent buyer has no reason to buy another. The 90-day buyers audience returning ZERO
 *  orders is the cleanest signal in the table.
 *
 *  RUN: node scripts/sd-pause-nonperformers.mjs            # dry run
 *       node scripts/sd-pause-nonperformers.mjs --apply
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const APPLY=process.argv.includes('--apply');
const A='https://advertising-api.amazon.com';
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json','Accept':'application/json'};
const call=async(p,m='GET',b)=>{const r=await fetch(A+p,{method:m,headers:H,body:b?JSON.stringify(b):undefined});const t=await r.text();let j;try{j=JSON.parse(t);}catch{}return{ok:r.ok,status:r.status,json:j,text:t};};

const targets=(await call('/sd/targets')).json||[];
const camps=(await call('/sd/campaigns')).json||[];
const groups=(await call('/sd/adGroups')).json||[];
const gById=new Map(groups.map(g=>[String(g.adGroupId),g]));
const cById=new Map(camps.map(c=>[String(c.campaignId),c]));

const classify=t=>{
  const e=JSON.stringify(t.expression||t.resolvedExpression||{});
  const kind=/"type":"views"/.test(e)?'views':/"type":"purchases"/.test(e)?'purchases':null;
  const lb=Number((e.match(/"type":"lookback","value":"(\d+)"/)||[])[1]||0);
  return {kind,lb,e};
};
// William 2026-08-13: "pause all purchases except for 365d keep that at .10 and 270 days .10 to
// test purchases if we can". The 270-day window CANNOT be built — probed live the same day and
// Amazon rejected it with "Targeting expression does not conform to language specific rules".
// Purchases offers 7/14/30/60/90/180/365 and nothing between 180 and 365. So the buyers test is
// 365d alone, held at ten cents where its best recorded result was 0.69x.
const KEEP=t=>{
  const {kind,lb}=classify(t);
  if(kind==='views')     return lb>0 && lb<=30;    // 7, 14, 30 stay; 60+ goes
  if(kind==='purchases') return lb===365;          // only the longest buyers window survives
  return false;
};
const CHEAP_BID=0.10;
const plan=[];
for(const t of targets){
  if(String(t.state).toLowerCase()!=='enabled') continue;
  const {kind,lb}=classify(t);
  if(!kind) continue;                 // ASIN / category targets are not audiences, leave alone
  if(KEEP(t)) continue;
  const g=gById.get(String(t.adGroupId)); const c=g?cById.get(String(g.campaignId)):null;
  plan.push({targetId:t.targetId,kind,lb,bid:t.bid,camp:c?c.name:'?'});
}
const kept=targets.filter(t=>String(t.state).toLowerCase()==='enabled'&&KEEP(t));
console.log(`KEEPING ${kept.length} audience target(s):`);
for(const t of kept){const {kind,lb}=classify(t); console.log(`   ${kind} ${lb}d   bid $${Number(t.bid||0).toFixed(2)}   target ${t.targetId}`);}
console.log(`\nPAUSING ${plan.length} audience target(s):`);
for(const p of plan) console.log(`   ${p.kind} ${p.lb}d   bid $${Number(p.bid||0).toFixed(2)}   target ${p.targetId}   ${String(p.camp).slice(0,40)}`);

// Everything kept must sit at ten cents. Several survivors are at $0.91-$1.67, which is exactly
// the bid level that turned a 2.41x audience into 0.67x.
const rebid=targets.filter(t=>String(t.state).toLowerCase()==='enabled'&&classify(t).kind&&KEEP(t))
  .filter(t=>Math.round(Number(t.bid||0)*100)!==Math.round(CHEAP_BID*100))
  .map(t=>({targetId:t.targetId,from:Number(t.bid||0),...classify(t)}));
console.log(`\nRE-BIDDING ${rebid.length} kept target(s) down to $${CHEAP_BID.toFixed(2)}:`);
for(const r of rebid) console.log(`   ${r.kind} ${r.lb}d   $${r.from.toFixed(2)} -> $${CHEAP_BID.toFixed(2)}   target ${r.targetId}`);

if(!APPLY){ console.log('\n(dry run — nothing changed. add --apply)'); process.exit(0); }
if(rebid.length){
  const rb=await call('/sd/targets','PUT',rebid.map(r=>({targetId:Number(r.targetId),bid:CHEAP_BID})));
  const it=Array.isArray(rb.json)?rb.json:[];
  console.log(`\nre-bid: HTTP ${rb.status}, ${it.filter(i=>String(i.code||'').toUpperCase()==='SUCCESS').length}/${rebid.length} SUCCESS`);
}
if(!plan.length){ console.log('\nnothing to pause'); process.exit(0); }
const r=await call('/sd/targets','PUT',plan.map(p=>({targetId:Number(p.targetId),state:'paused'})));
const items=Array.isArray(r.json)?r.json:[];
const ok=items.filter(i=>String(i.code||'').toUpperCase()==='SUCCESS').length;
console.log(`\npause: HTTP ${r.status}, ${ok}/${plan.length} SUCCESS`);
for(const i of items) if(String(i.code||'').toUpperCase()!=='SUCCESS') console.log('   refused:', JSON.stringify(i).slice(0,140));
// READ BACK. The response is not the truth; the account is.
const after=(await call('/sd/targets')).json||[];
const stillOn=after.filter(t=>String(t.state).toLowerCase()==='enabled'&&classify(t).kind&&!KEEP(t));
console.log(`\nREAD BACK: ${stillOn.length} non-performing audience target(s) still enabled.`);
const onNow=after.filter(t=>String(t.state).toLowerCase()==='enabled'&&classify(t).kind);
console.log(`Audience targets enabled on the account now: ${onNow.length}`);
for(const t of onNow){const {kind,lb}=classify(t); console.log(`   ${kind} ${lb}d  bid $${Number(t.bid||0).toFixed(2)}`);}
