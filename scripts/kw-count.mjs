import { readFileSync } from 'node:fs'; import { URL } from 'node:url';
import { createClient } from '@libsql/client';
function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}
loadEnv();
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const meta=await db.execute("SELECT COUNT(*) n, MIN(run_at) mn, MAX(run_at) mx FROM ad_engine_log");
console.log('ad_engine_log: rows='+meta.rows[0].n+'  range '+meta.rows[0].mn+' .. '+meta.rows[0].mx);
const byAction=await db.execute("SELECT action, COUNT(*) c FROM ad_engine_log GROUP BY action ORDER BY c DESC");
console.log('\nALL-TIME by action:'); for(const r of byAction.rows) console.log('  '+r.action+': '+r.c);
const adds14=await db.execute("SELECT COALESCE(match_type,'(none)') mt, COUNT(*) c FROM ad_engine_log WHERE (LOWER(action) LIKE '%add%' OR LOWER(action) LIKE '%harvest%' OR LOWER(action) LIKE '%creat%') AND datetime(run_at) >= datetime('now','-14 days') GROUP BY mt");
console.log('\nKEYWORDS ADDED last 14 days by match_type:');
if(!adds14.rows.length) console.log('  (none)');
for(const r of adds14.rows) console.log('  '+r.mt+': '+r.c);
const act14=await db.execute("SELECT action, COUNT(*) c FROM ad_engine_log WHERE datetime(run_at) >= datetime('now','-14 days') GROUP BY action ORDER BY c DESC");
console.log('\nALL actions last 14 days:'); if(!act14.rows.length)console.log('  (none)'); for(const r of act14.rows) console.log('  '+r.action+': '+r.c);
