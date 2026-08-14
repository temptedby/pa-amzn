/** READ-ONLY. The story of every bid level a word has held, and whether the move helped.
 *
 *  William 2026-08-13: "go back and see were bids raised or lowered? Did that help with conversion
 *  of words that weren't converting before?"
 *
 *  RUN: node scripts/bid-history.mjs                 # every word that has more than one bid level
 *       node scripts/bid-history.mjs --all           # include words still on their first bid
 *       node scripts/bid-history.mjs --word=tether   # filter by text
 *       node scripts/bid-history.mjs --verdicts      # just the did-it-help summary
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const arg=n=>process.argv.find(a=>a.startsWith('--'+n));
const ALL=!!arg('all'), VERDICTS=!!arg('verdicts');
const WORD=(arg('word')||'').split('=')[1]?.toLowerCase();
const usd=n=>'$'+Number(n||0).toFixed(2);

let rows;
try{ rows=(await db.execute('SELECT * FROM bid_epoch ORDER BY entity_id, opened_at ASC')).rows; }
catch{ console.log('bid_epoch does not exist yet — it is created on the first engine run.'); process.exit(0); }
if(!rows.length){ console.log('bid_epoch is empty. It fills from the first engine run after this deploy.'); process.exit(0); }

const N=v=>Number(v??0);
const prod=r=>{
  const spend=+(N(r.last_spend)-N(r.open_spend)).toFixed(4), sales=+(N(r.last_sales)-N(r.open_sales)).toFixed(4);
  const end=r.closed_at||r.last_seen_at||r.opened_at;
  return {...r, spend, sales,
    orders:Math.round(N(r.last_orders)-N(r.open_orders)),
    clicks:Math.round(N(r.last_clicks)-N(r.open_clicks)),
    imps:Math.round(N(r.last_impressions)-N(r.open_impressions)),
    hours:Math.max(0,(Date.parse(end)-Date.parse(r.opened_at))/3.6e6),
    roas: spend>0 ? +(sales/spend).toFixed(2) : null };
};
const byEntity=new Map();
for(const r of rows){ const p=prod(r); const k=`${r.entity_id}|${r.ad_product}`;
  if(!byEntity.has(k)) byEntity.set(k,[]); byEntity.get(k).push(p); }

const judge=(b,a)=>{
  if(b.clicks===0||a.clicks===0) return {v:'too early', note:`${b.clicks} clicks at ${usd(b.bid)} vs ${a.clicks} at ${usd(a.bid)}`};
  if(b.roas===null||a.roas===null) return {v:'too early', note:'no spend at one level'};
  const pct=b.roas>0?(a.roas/b.roas-1)*100:0;
  const dir=a.bid>b.bid?'raising':'lowering';
  if(Math.abs(pct)<5) return {v:'no change', note:`${dir} moved ROAS ${b.roas}x -> ${a.roas}x`};
  return {v: pct>0?'HELPED':'hurt',
    note:`${dir} ${usd(b.bid)} -> ${usd(a.bid)}: ROAS ${b.roas}x -> ${a.roas}x (${pct>0?'+':''}${pct.toFixed(0)}%), clicks ${b.clicks} -> ${a.clicks}`};
};

const tally={HELPED:0,hurt:0,'no change':0,'too early':0};
const lines=[];
for(const [key,eps] of byEntity){
  if(!ALL && eps.length<2) continue;
  if(WORD && !String(eps[0].label||'').toLowerCase().includes(WORD)) continue;
  const head=`\n${eps[0].label}  [${eps[0].ad_product.replace('SPONSORED_','SP-')}]  ${eps.length} bid level${eps.length===1?'':'s'}`;
  const body=[];
  body.push('   bid      hours   imps  clicks     spend      sales    roas   why');
  for(const e of eps){
    body.push(`  ${usd(e.bid).padStart(6)}  ${String(Math.round(e.hours)).padStart(6)} ${String(e.imps).padStart(6)} ${String(e.clicks).padStart(7)} ${usd(e.spend).padStart(9)} ${usd(e.sales).padStart(10)} ${(e.roas===null?'   -':e.roas.toFixed(2)+'x').padStart(7)}   ${String(e.reason||'').slice(0,44)}`);
  }
  const verdicts=[];
  for(let i=1;i<eps.length;i++){ const j=judge(eps[i-1],eps[i]); tally[j.v]++; verdicts.push(`     ${j.v.padEnd(10)} ${j.note}`); }
  lines.push(VERDICTS ? head+'\n'+verdicts.join('\n') : head+'\n'+body.join('\n')+(verdicts.length?'\n'+verdicts.join('\n'):''));
}
console.log(`BID HISTORY — ${rows.length} epochs across ${byEntity.size} entities`);
console.log(lines.length?lines.join('\n'):'\n(no entity has held more than one bid level yet — run with --all)');
console.log(`\n=== DID THE MOVES HELP? ===`);
for(const [k,v] of Object.entries(tally)) console.log(`  ${k.padEnd(10)} ${v}`);
const judged=tally.HELPED+tally.hurt+tally['no change'];
if(judged) console.log(`\n  ${tally.HELPED} of ${judged} judgeable moves improved ROAS (${(100*tally.HELPED/judged).toFixed(0)}%)`);
