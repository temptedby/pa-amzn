/** Read the ad-engine decision log — what the algorithm added / cut / re-bid, over time.
 *  RUN: node scripts/ad-log.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createClient } from '@libsql/client';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
try{
  const tot=await db.execute("SELECT action, COUNT(*) c FROM ad_engine_log GROUP BY action");
  console.log('=== ad_engine_log totals ==='); tot.rows.forEach(r=>console.log(`   ${r.action}: ${r.c}`));
  const runs=await db.execute("SELECT run_at, COUNT(*) c FROM ad_engine_log GROUP BY run_at ORDER BY run_at DESC LIMIT 10");
  console.log('\n=== recent runs ==='); runs.rows.forEach(r=>console.log(`   ${r.run_at}  (${r.c} actions)`));
  const recent=await db.execute("SELECT run_at, action, keyword, match_type, from_bid, to_bid, acos, spend FROM ad_engine_log ORDER BY run_at DESC, id DESC LIMIT 30");
  console.log('\n=== last 30 decisions ===');
  recent.rows.forEach(r=>{
    const d=(r.run_at||'').slice(0,16);
    if(r.action==='kill') console.log(`   ${d}  KILL  $${r.spend} 0-order  "${r.keyword}"`);
    else if(r.action==='add') console.log(`   ${d}  ADD   ${r.match_type}  "${r.keyword}"`);
    else console.log(`   ${d}  REBID ACOS ${r.acos!=null?(r.acos*100).toFixed(0)+'%':'-'}  $${r.from_bid}->$${r.to_bid}  "${r.keyword}"`);
  });
  if(!recent.rows.length) console.log('   (no rows yet — populates after the next live cron run post-deploy)');
}catch(e){ console.log('error:',e.message.slice(0,160)); }
