import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
const r=readFileSync('/Users/williamholdeman/projects/PA-AMZN/.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const db=createClient({url:process.env.DATABASE_URL, authToken:process.env.DATABASE_AUTH_TOKEN});
const q=await db.execute("select run_at,action,ad_product,count(*) n from ad_engine_log where run_at >= '2026-08-14T17:00' group by run_at,action,ad_product order by run_at");
if(!q.rows.length){ console.log('no post-merge run yet'); }
for(const r of q.rows) console.log(`${String(r.run_at).slice(0,16)}  ${(r.ad_product||'SP').padEnd(3)} ${String(r.action).padEnd(6)} x${r.n}`);
for(const t of ['bid_epoch','kw_bid_history']){
  try{ const c=await db.execute(`select count(*) n from ${t}`); console.log(`${t}: ${c.rows[0].n} rows`); }
  catch(e){ console.log(`${t}: ${e.message.slice(0,60)}`); }
}
