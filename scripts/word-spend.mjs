/** READ-ONLY. What every WORD is spending. No budgets, no campaigns — keywords.
 *
 *  Reads our own database, so it is instant and never waits on Amazon's report queue.
 *  kw_daily holds 95 days of per-keyword daily performance; kw_lifetime holds totals back to 2019
 *  from console exports, including Sponsored Brands, which the reporting API will not return.
 *
 *  RUN: node scripts/word-spend.mjs                 # this month, every word that spent
 *       node scripts/word-spend.mjs --days=7
 *       node scripts/word-spend.mjs --all           # include words with zero spend in the period
 *       node scripts/word-spend.mjs --lifetime      # lifetime totals instead, SP and SB
 *       node scripts/word-spend.mjs --over          # only words past the $4 line with no sale
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { URL } from 'node:url';

function loadEnv(){const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}}
loadEnv();
const KILL=4.00, BREAKEVEN=1.92;
const arg=(n,d)=>{const a=process.argv.find(x=>x.startsWith(`--${n}=`));return a?a.split('=')[1]:d;};
const DAYS=arg('days',null), ALL=process.argv.includes('--all'), LIFE=process.argv.includes('--lifetime'), OVER=process.argv.includes('--over');
const usd=n=>'$'+Number(n||0).toFixed(2);
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN||process.env.TURSO_AUTH_TOKEN});

// current bid + state per word, from the last snapshot we took of the live account
const bidByWord=new Map();
for(const r of (await db.execute(`SELECT word, match_type, bid, state FROM kw_state_snapshot
    WHERE as_of = (SELECT MAX(as_of) FROM kw_state_snapshot)`)).rows){
  const k=`${String(r.word).trim().toLowerCase()}|${String(r.match_type).toUpperCase()}`;
  const cur=bidByWord.get(k);
  // a word can exist several times; show the highest bid and prefer an ENABLED state
  if(!cur || Number(r.bid||0)>cur.bid) bidByWord.set(k,{bid:Number(r.bid||0),state:r.state,copies:(cur?.copies||0)+1});
  else bidByWord.set(k,{...cur,copies:(cur?.copies||0)+1});
}

let rows, title;
if (LIFE) {
  title='LIFETIME (console exports, 2019 onward)';
  rows=(await db.execute(`SELECT word, match_type, ad_product,
        ROUND(SUM(spend),2) spend, ROUND(SUM(sales),2) sales, SUM(orders) orders, SUM(clicks) clicks
      FROM kw_lifetime WHERE COALESCE(marketplace,'US')='US'
      GROUP BY word, match_type, ad_product HAVING SUM(spend) > 0
      ORDER BY spend DESC`)).rows;
} else {
  const since = DAYS ? new Date(Date.now()-Number(DAYS)*864e5).toISOString().slice(0,10)
                     : new Date().toISOString().slice(0,8)+'01';
  title=`SINCE ${since}`;
  rows=(await db.execute({sql:`SELECT word, match_type, ad_product,
        ROUND(SUM(spend),2) spend, ROUND(SUM(sales),2) sales, SUM(orders) orders, SUM(clicks) clicks
      FROM kw_daily WHERE day >= ?
      GROUP BY word, match_type, ad_product ${ALL?'':'HAVING SUM(spend) > 0'}
      ORDER BY spend DESC`, args:[since]})).rows;
}

const out=[];
let tSpend=0,tSales=0,tOrd=0,waste=0;
for(const r of rows){
  const spend=Number(r.spend||0), sales=Number(r.sales||0), ord=Number(r.orders||0);
  const roas = spend>0 ? sales/spend : null;
  const over = spend>=KILL && (ord===0 || (roas!==null && roas<BREAKEVEN));
  if(OVER && !over) continue;
  const st=bidByWord.get(`${String(r.word).trim().toLowerCase()}|${String(r.match_type).toUpperCase()}`);
  tSpend+=spend; tSales+=sales; tOrd+=ord;
  if(over) waste += ord===0 ? spend : spend - sales/BREAKEVEN;
  out.push({...r, spend, sales, ord, roas, over, bid:st?.bid, state:st?.state, copies:st?.copies});
}

console.log(`WORD SPEND — ${title}\n`);
console.log('    spend     sales  ord   roas   bid    state     cp  word');
for(const r of out){
  console.log(
    `${usd(r.spend).padStart(9)} ${usd(r.sales).padStart(9)} ${String(r.ord).padStart(4)} ` +
    `${(r.roas===null?'   -':r.roas.toFixed(2)).padStart(6)} ` +
    `${(r.bid!=null?'$'+r.bid.toFixed(2):'   -').padStart(6)} ` +
    `${String(r.state||'-').slice(0,8).padEnd(8)} ${String(r.copies??'-').padStart(3)}  ` +
    `${r.over?'OVER ':''}${r.word} (${r.match_type}${r.ad_product==='SPONSORED_BRANDS'?', SB':''})`);
}
console.log(`\n${out.length} words.  spend ${usd(tSpend)}  sales ${usd(tSales)}  orders ${tOrd}  ` +
            `blended ${tSpend>0?(tSales/tSpend).toFixed(2)+'x':'-'} against ${BREAKEVEN}x break-even`);
const overs=out.filter(r=>r.over);
if(overs.length) console.log(`${overs.length} words past the ${usd(KILL)} line without earning it back — about ${usd(waste)} wasted`);
else console.log(`no word is past the ${usd(KILL)} line unprofitably`);
console.log(`\ncp = how many copies of that word exist in the account. Anything above 1 splits its own spend.`);
