/** OVER-TIME TEST of the kill bar. READ-ONLY, database only, no Amazon calls.
 *
 *  A single compliance snapshot answers "is anything out of policy right now". It cannot answer
 *  "how long does a word keep spending after it crosses the bar", which is the question that
 *  decides whether the rule is worth anything. This replays kw_day day by day.
 *
 *  For each day D, each keyword's month-to-date spend and sales are recomputed as they stood at the
 *  END of D. The first day a keyword satisfies the rule (MTD spend >= bar AND (no orders OR
 *  ROAS < minRoas)) is its QUALIFYING day. Everything it spends after that day is money the rule
 *  should have stopped and did not.
 *
 *  RUN: node scripts/bar-latency.mjs [--month=2026-08] [--bar=4] [--roas=1.5]
 */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const MONTH=arg('month','2026-08'), BAR=+arg('bar',4), MINROAS=+arg('roas',1.5);
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});

const rows=(await db.execute({
  sql:"select keyword_id, word, match_type, ad_product, day, spend, sales, orders from kw_day where day like ? order by day",
  args:[MONTH+'%'],
})).rows;
if(!rows.length){ console.log(`no kw_day rows for ${MONTH}. NOTHING is judged.`); process.exit(1); }

// A missing day is not a zero. If the archive skipped a day, MTD is understated and every verdict
// after it is wrong, so the gap is reported and the run refuses to print a total.
const days=[...new Set(rows.map(r=>String(r.day)))].sort();
const expected=[]; {
  const [y,m]=MONTH.split('-').map(Number);
  const last=new Date(Date.UTC(y,m,0)).getUTCDate(), today=new Date().toISOString().slice(0,10);
  for(let d=1;d<=last;d++){const s=`${MONTH}-${String(d).padStart(2,'0')}`; if(s<=today) expected.push(s);}
}
const missing=expected.filter(d=>!days.includes(d));

const kw=new Map();
for(const r of rows){
  const id=String(r.keyword_id);
  if(!kw.has(id)) kw.set(id,{word:r.word,match:r.match_type,product:r.ad_product,byDay:new Map()});
  const k=kw.get(id), d=String(r.day);
  const prev=k.byDay.get(d)||{spend:0,sales:0,orders:0};
  k.byDay.set(d,{spend:prev.spend+Number(r.spend||0),sales:prev.sales+Number(r.sales||0),orders:prev.orders+Number(r.orders||0)});
}

const late=[];
let totalAfter=0, totalOver=0, totalQualified=0, everSpent=0;
for(const [id,k] of kw){
  let mtdS=0,mtdSa=0,mtdO=0, qualDay=null, qualSpend=0, afterSpend=0, afterDays=0;
  for(const d of days){
    const t=k.byDay.get(d);
    if(t){ if(qualDay){ afterSpend+=t.spend; if(t.spend>0) afterDays++; } mtdS+=t.spend; mtdSa+=t.sales; mtdO+=t.orders; }
    if(!qualDay && mtdS>=BAR && (mtdO<=0 || mtdSa<=0 || mtdSa/mtdS<MINROAS)) { qualDay=d; qualSpend=mtdS; }
  }
  if(mtdS>0) everSpent++;
  if(!qualDay) continue;
  // The engine reads ONE report snapshot a day, so a word crossing the bar at 09:00 keeps buying
  // clicks until the next run. That overshoot lands INSIDE the qualifying day and is invisible to
  // an after-the-day count, which is why both are measured.
  const overshoot=Math.max(0,qualSpend-BAR);
  totalQualified++; totalAfter+=afterSpend; totalOver+=overshoot;
  if(afterSpend>0||overshoot>0) late.push({word:k.word,match:k.match,product:k.product,qualDay,overshoot,afterSpend,afterDays,mtdS,mtdSa});
}

console.log(`\nKILL-BAR LATENCY, ${MONTH}.  bar $${BAR}, ROAS floor ${MINROAS}x.  Sponsored Products history only (kw_day holds no Brands or Display rows).`);
console.log(`${days.length} days of history, ${everSpent} keywords spent, ${totalQualified} crossed the bar.\n`);
if(missing.length){
  console.log(`kw_day is MISSING ${missing.length} day(s): ${missing.join(', ')}.`);
  console.log(`Month-to-date is understated on every day after the first gap, so NO total is printed.`);
  process.exit(2);
}
late.sort((a,b)=>(b.overshoot+b.afterSpend)-(a.overshoot+a.afterSpend));
console.log(' past bar   same day  later  qualified   month   ROAS   keyword');
for(const l of late.slice(0,20))
  console.log(`  $${(l.overshoot+l.afterSpend).toFixed(2).padStart(7)}  $${l.overshoot.toFixed(2).padStart(7)}  $${l.afterSpend.toFixed(2).padStart(5)}  ${l.qualDay}  $${l.mtdS.toFixed(2).padStart(6)} ${(l.mtdSa/l.mtdS).toFixed(2).padStart(6)}x  ${String(l.word).slice(0,34)} ${String(l.match).toLowerCase()}`);
if(late.length>20) console.log(`  ... and ${late.length-20} more`);
const withAfter=late.filter(l=>l.afterSpend>0).length;
console.log(`\n${totalQualified} keywords crossed the bar this month.`);
console.log(`  $${totalOver.toFixed(2)}  overshot INSIDE the day they qualified (the once-a-day snapshot; PR #11 is the fix)`);
console.log(`  $${totalAfter.toFixed(2)}  spent on LATER days, by ${withAfter} keywords (the engine failing to act at all)`);
console.log(`  $${(totalOver+totalAfter).toFixed(2)}  total spent past a bar that had already been crossed`);
console.log(`Median overshoot on the qualifying day: $${late.length?late.map(l=>l.overshoot).sort((a,b)=>a-b)[Math.floor(late.length/2)].toFixed(2):'0.00'}.`);
