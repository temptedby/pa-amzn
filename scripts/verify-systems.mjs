/** Verify the two autonomous systems: (1) past-buyer review requests, (2) keyword ad engine.
 *  RUN: node scripts/verify-systems.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createClient } from '@libsql/client';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const SECRET=process.env.CRON_SECRET;
const BASE='https://amzn.phoneassured.com';

console.log('========== (1) REVIEW REQUESTS TO PAST BUYERS ==========');
try{
  const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
  const tot=await db.execute("SELECT status, COUNT(*) c FROM review_requests GROUP BY status");
  console.log('review_requests by status:'); tot.rows.forEach(r=>console.log(`   ${r.status}: ${r.c}`));
  const recent=await db.execute("SELECT amazon_order_id, status, requested_at FROM review_requests WHERE status='sent' ORDER BY requested_at DESC LIMIT 8");
  console.log('most recent sent:'); recent.rows.forEach(r=>console.log(`   ${r.requested_at}  ${r.amazon_order_id}`));
  const last7=await db.execute("SELECT COUNT(*) c FROM review_requests WHERE status='sent' AND requested_at >= datetime('now','-7 days')");
  console.log(`sent in last 7 days: ${last7.rows[0].c}`);
}catch(e){console.log('  DB error:',e.message.slice(0,120));}

console.log('\n  live dry-run of the review engine (eligible past buyers right now):');
try{ const r=await fetch(`${BASE}/api/cron/review-requests?dryRun=1`,{headers:{Authorization:`Bearer ${SECRET}`}}); console.log('   ->',(await r.text()).slice(0,260)); }catch(e){console.log('   endpoint err',e.message);}

console.log('\n========== (2) KEYWORD AD ENGINE (add / cut $4 / re-bid ACOS) ==========');
console.log('  live dry-run of the autonomous ad engine:');
try{ const r=await fetch(`${BASE}/api/cron/ad-engine?dryRun=1`,{headers:{Authorization:`Bearer ${SECRET}`}}); const j=await r.json();
  console.log(`   killed(>=$4/0 ord): ${j.killed?.length??'?'}  added(harvest exact+phrase): ${j.added?.length??'?'}  re-bid(ACOS target): ${j.bids?.length??'?'}  errors: ${j.errors?.length??'?'}`);
  (j.killed||[]).slice(0,5).forEach(k=>console.log(`     KILL  $${k.spend} ${k.text}`));
  (j.added||[]).slice(0,6).forEach(a=>console.log(`     ADD   ${a.matchType} ${a.text}`));
  (j.bids||[]).slice(0,6).forEach(b=>console.log(`     BID   ACOS ${(b.acos*100).toFixed(0)}% $${b.from}->$${b.to} ${b.text}`));
}catch(e){console.log('   endpoint err',e.message);}
console.log('\nDONE.');
