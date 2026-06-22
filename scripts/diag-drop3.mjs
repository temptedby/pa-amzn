import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const c = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
for (const t of ['ad_engine_log','review_requests','alerts','search_terms','keywords','campaigns']) {
  try {
    const cols=(await c.execute(`PRAGMA table_info(${t})`)).rows.map(r=>r.name);
    const tcol=cols.find(x=>/_at$|time|date|created|ran|fetched/i.test(x));
    const n=(await c.execute(`SELECT COUNT(*) n FROM ${t}`)).rows[0].n;
    let last='';
    if(tcol){const r=await c.execute(`SELECT MAX(${tcol}) mx FROM ${t}`);last=` | latest ${tcol}=${r.rows[0].mx}`;}
    console.log(`${t}: ${n} rows${last}`);
  } catch(e){ console.log(`${t}: ERR ${e.message.slice(0,50)}`); }
}
// active vs paused campaigns
try{const r=await c.execute(`SELECT state, COUNT(*) n FROM campaigns GROUP BY state`);console.log('\ncampaigns by state:'); for(const x of r.rows) console.log(`  ${x.state}: ${x.n}`);}catch(e){}
