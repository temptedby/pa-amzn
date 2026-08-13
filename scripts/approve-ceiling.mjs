/** Answer a gate. William says yes, this records it, and the engine climbs on the next run.
 *
 *  RUN: node scripts/approve-ceiling.mjs --product=SP --ceiling=1.85 --all
 *       node scripts/approve-ceiling.mjs --product=SP --ceiling=1.85 --id=232082872464476
 *       node scripts/approve-ceiling.mjs --list
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});
const val=n=>{const a=process.argv.find(x=>x.startsWith('--'+n+'='));return a?a.split('=').slice(1).join('='):null;};
const has=n=>process.argv.includes('--'+n);
const GATES=[0.85,1.85,2.85];
const PRODUCTS={SP:'SPONSORED_PRODUCTS',SB:'SPONSORED_BRANDS',SD:'SPONSORED_DISPLAY'};

await db.execute(`CREATE TABLE IF NOT EXISTS bid_ceiling_approval (entity_id TEXT NOT NULL, ad_product TEXT NOT NULL, ceiling REAL NOT NULL, approved_by TEXT, approved_at TEXT NOT NULL, note TEXT, PRIMARY KEY (entity_id, ad_product))`);
await db.execute(`CREATE TABLE IF NOT EXISTS bid_gate_notice (entity_id TEXT NOT NULL, ad_product TEXT NOT NULL, gate REAL NOT NULL, asked_at TEXT NOT NULL, answered_at TEXT, PRIMARY KEY (entity_id, ad_product, gate))`);

if(has('list')){
  const a=await db.execute('SELECT * FROM bid_ceiling_approval ORDER BY ad_product, ceiling DESC');
  console.log(`APPROVED CEILINGS (${a.rows.length})`);
  for(const r of a.rows) console.log(`  $${Number(r.ceiling).toFixed(2)}  ${r.ad_product.replace('SPONSORED_','')}  ${r.entity_id}  ${r.approved_at.slice(0,16)}`);
  const p=await db.execute('SELECT * FROM bid_gate_notice WHERE answered_at IS NULL ORDER BY asked_at');
  console.log(`\nASKED, NOT YET ANSWERED (${p.rows.length})`);
  for(const r of p.rows) console.log(`  $${Number(r.gate).toFixed(2)}  ${r.ad_product.replace('SPONSORED_','')}  ${r.entity_id}  asked ${r.asked_at.slice(0,16)}`);
  process.exit(0);
}
const product=PRODUCTS[(val('product')||'').toUpperCase()]||val('product');
const ceiling=Number(val('ceiling'));
if(!product||!GATES.some(g=>Math.round(g*100)===Math.round(ceiling*100))){
  console.log(`usage: --product=SP|SB|SD --ceiling=${GATES.map(g=>g.toFixed(2)).join('|')} (--all | --id=<entityId>)`);
  console.log('       --list');
  process.exit(1);
}
let ids=[];
if(val('id')) ids=[val('id')];
else if(has('all')){
  const r=await db.execute({sql:'SELECT entity_id FROM bid_gate_notice WHERE ad_product=? AND answered_at IS NULL AND gate=?',args:[product,GATES[GATES.findIndex(g=>Math.round(g*100)===Math.round(ceiling*100))-1]??0.85]});
  ids=r.rows.map(x=>String(x.entity_id));
  if(!ids.length){ console.log('nothing is waiting at the gate below $'+ceiling.toFixed(2)); process.exit(0); }
} else { console.log('need --all or --id='); process.exit(1); }

const at=new Date().toISOString();
let n=0;
for(const id of ids){
  const cur=await db.execute({sql:'SELECT ceiling FROM bid_ceiling_approval WHERE entity_id=? AND ad_product=?',args:[id,product]});
  if(cur.rows[0] && Number(cur.rows[0].ceiling)>=ceiling) continue;   // never lower a granted ceiling
  await db.execute({sql:`INSERT INTO bid_ceiling_approval (entity_id,ad_product,ceiling,approved_by,approved_at,note) VALUES (?,?,?,?,?,?)
    ON CONFLICT(entity_id,ad_product) DO UPDATE SET ceiling=excluded.ceiling, approved_at=excluded.approved_at`,
    args:[id,product,ceiling,'William',at,`approved via CLI`]});
  await db.execute({sql:'UPDATE bid_gate_notice SET answered_at=? WHERE entity_id=? AND ad_product=? AND answered_at IS NULL',args:[at,id,product]});
  n++;
}
console.log(`approved $${ceiling.toFixed(2)} for ${n} ${product} entit${n===1?'y':'ies'}. The engine climbs a dime a run from the next run.`);
