// READ-ONLY diagnostic for the ~90% sales drop. No writes.
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const c = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
const tables = (await c.execute(`SELECT name FROM sqlite_master WHERE type='table'`)).rows.map(r=>r.name);
console.log('tables:', tables.join(', '));
// daily ad spend / sales / orders / impressions / clicks trend from hourly_snapshots
if (tables.includes('hourly_snapshots')) {
  const cols = (await c.execute(`PRAGMA table_info(hourly_snapshots)`)).rows.map(r=>r.name);
  console.log('\nhourly_snapshots cols:', cols.join(', '));
  const num = ['spend','sales','orders','impressions','clicks','units'].filter(x=>cols.includes(x));
  const tcol = cols.find(x=>/time|date|hour|snapshot|ts|created/i.test(x));
  if (tcol && num.length) {
    const sel = num.map(n=>`SUM(CAST(${n} AS REAL)) ${n}`).join(', ');
    const r = await c.execute(`SELECT substr(${tcol},1,10) d, ${sel}, COUNT(*) rows FROM hourly_snapshots GROUP BY d ORDER BY d DESC LIMIT 20`);
    console.log('\n=== daily trend (newest first) ===');
    console.log(['date',...num,'rows'].join('\t'));
    for (const row of r.rows) console.log([row.d, ...num.map(n=>Math.round(Number(row[n])||0)), row.rows].join('\t'));
  }
}
// did the ad engine over-pause? recent bid_changes
if (tables.includes('bid_changes')) {
  const cols=(await c.execute(`PRAGMA table_info(bid_changes)`)).rows.map(r=>r.name);
  const tcol=cols.find(x=>/time|date|created|ts/i.test(x));
  const r=await c.execute(`SELECT substr(${tcol},1,10) d, COUNT(*) n FROM bid_changes GROUP BY d ORDER BY d DESC LIMIT 10`);
  console.log('\n=== bid_changes per day ==='); for(const row of r.rows) console.log(`  ${row.d}: ${row.n}`);
}
// inventory snapshot (stockout?)
if (tables.includes('inventory')) {
  const cols=(await c.execute(`PRAGMA table_info(inventory)`)).rows.map(r=>r.name);
  const skuc=cols.find(x=>/sku|asin/i.test(x)); const qc=cols.find(x=>/avail|qty|quantity|fba|fulfillable/i.test(x));
  if(skuc&&qc){const r=await c.execute(`SELECT ${skuc} sku, ${qc} qty FROM inventory ORDER BY qty DESC LIMIT 12`);
    console.log('\n=== inventory ==='); for(const row of r.rows) console.log(`  ${row.sku}: ${row.qty}`);}
}
