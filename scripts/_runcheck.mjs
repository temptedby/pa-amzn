import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
const r=readFileSync('/Users/williamholdeman/projects/PA-AMZN/.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const db=createClient({url:process.env.DATABASE_URL, authToken:process.env.DATABASE_AUTH_TOKEN});
const q=await db.execute("select keyword,from_bid,to_bid,applied from ad_engine_log where run_at>='2026-08-14T18:00' and action='rebid'");
const rows=q.rows.map(r=>({k:r.keyword,f:Number(r.from_bid),t:Number(r.to_bid),a:r.applied}));
const up=rows.filter(r=>r.t>r.f), down=rows.filter(r=>r.t<r.f);
console.log(`rebids ${rows.length}  up ${up.length}  down ${down.length}  applied=1 ${rows.filter(r=>String(r.a)==='1').length}`);
const over=rows.filter(r=>r.t>0.85 && r.t>r.f);
console.log(`RAISES landing above the $0.85 ceiling (must be 0): ${over.length}`);
over.slice(0,5).forEach(r=>console.log('   ',r.k,r.f,'->',r.t));
const e=await db.execute("select count(*) n, min(bid) lo, max(bid) hi from bid_epoch");
console.log('bid_epoch:', JSON.stringify(e.rows[0]));
const h=await db.execute("select * from kw_bid_history order by rowid desc limit 2");
console.log('kw_bid_history sample:', JSON.stringify(h.rows[0]).slice(0,220));
