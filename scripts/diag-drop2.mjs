import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const c = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
// freshness + range
const rng = await c.execute(`SELECT MIN(hour_utc) mn, MAX(hour_utc) mx, COUNT(*) n FROM hourly_snapshots`);
console.log('hourly_snapshots:', JSON.stringify(rng.rows[0]));
// daily roll-up
const r = await c.execute(`SELECT substr(hour_utc,1,10) d,
  SUM(impressions) imp, SUM(clicks) clk, SUM(orders) ord,
  ROUND(SUM(spend_cents)/100.0,2) spend, ROUND(SUM(sales_cents)/100.0,2) sales
  FROM hourly_snapshots GROUP BY d ORDER BY d DESC LIMIT 21`);
console.log('\ndate        imp     clk  ord   spend   sales   ACOS%  CVR%');
for (const x of r.rows) {
  const acos = x.sales>0 ? (100*x.spend/x.sales).toFixed(0) : '∞';
  const cvr = x.clk>0 ? (100*x.ord/x.clk).toFixed(1) : '0';
  console.log(`${x.d}  ${String(x.imp).padStart(6)} ${String(x.clk).padStart(5)} ${String(x.ord).padStart(4)} ${String(x.spend).padStart(7)} ${String(x.sales).padStart(7)} ${String(acos).padStart(5)} ${String(cvr).padStart(5)}`);
}
// bid_changes recent
const bc = await c.execute(`SELECT MAX(rowid) mx, COUNT(*) n FROM bid_changes`).catch(()=>({rows:[{}]}));
const bcols=(await c.execute(`PRAGMA table_info(bid_changes)`)).rows.map(r=>r.name);
console.log('\nbid_changes cols:', bcols.join(', '), '| count:', JSON.stringify(bc.rows[0]));
