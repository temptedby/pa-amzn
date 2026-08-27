/** READ-ONLY. How much of the month's ad spend produced nothing, and how much produced a loss.
 *  Break-even is 2.45x ROAS (40.8% contribution on $1,341 revenue, from scripts/business-pnl.mjs).
 *  RUN: node scripts/waste.mjs --cache=<mtd-targeting.json>   (cache written by kill-below-roas.mjs) */
import { readFileSync } from 'node:fs';
const arg=(n,d)=>(process.argv.find(a=>a.startsWith('--'+n+'='))||`--${n}=${d}`).split('=')[1];
const rows=JSON.parse(readFileSync(arg('cache',''),'utf8'));
const BE=2.45, KILL=1.5;
const B={zero:[0,0],under1:[0,0],under15:[0,0],underBE:[0,0],profitable:[0,0]};
for(const r of rows){
  const c=+r.cost||0, s=+r.sales14d||0; if(!c) continue;
  const k = s===0 ? 'zero' : (s/c<1 ? 'under1' : (s/c<KILL ? 'under15' : (s/c<BE ? 'underBE' : 'profitable')));
  B[k][0]+=c; B[k][1]+=s;
}
const tot=Object.values(B).reduce((t,v)=>t+v[0],0);
const L=(name,v,note)=>console.log(`${name.padEnd(34)} $${v[0].toFixed(2).padStart(8)}  ${(100*v[0]/tot).toFixed(1).padStart(5)}%   sales $${v[1].toFixed(2).padStart(8)}   ${note}`);
console.log(`\nUS Sponsored Products, August to date. Break-even is ${BE}x ROAS.\n`);
L('ZERO sales',B.zero,'nothing at all');
L('under 1.0x',B.under1,'cost more than it sold');
L('1.0x to 1.5x',B.under15,'the new kill band');
L('1.5x to 2.45x',B.underBE,'returns cash, still loses money');
L('2.45x and above',B.profitable,'ACTUALLY PROFITABLE');
const waste=B.zero[0]+B.under1[0]+B.under15[0];
const loss=waste+B.underBE[0];
console.log(`\nSP total spend                      $${tot.toFixed(2)}`);
console.log(`spend that should be OFF today      $${waste.toFixed(2)}   ${(100*waste/tot).toFixed(1)}%   (zero sales, or under the 1.5x line)`);
console.log(`spend that LOST money               $${loss.toFixed(2)}   ${(100*loss/tot).toFixed(1)}%   (everything under break-even)`);
console.log(`spend that made money               $${B.profitable[0].toFixed(2)}   ${(100*B.profitable[0]/tot).toFixed(1)}%`);

// ---------------------------------------------------------------------------
// WHAT IS ACTUALLY RECOVERABLE, which is not the same as what was wasted.
//
// William 2026-08-23 sketched it as "$500 of ad spend off, so our ROAS would be 1.4x". The
// direction is right and the amount is not, for one reason: you cannot cut zero-sale spend in
// ADVANCE. A word is only known to be a loser after it has spent. What can be cut is the OVERSHOOT
// past the bar, the words that convert badly, and the repeat of the same lesson next month.
//
// Cutting a losing word also removes the sales it did make, so the honest unit is CONTRIBUTION, not
// spend. At the blended 40.84% contribution rate: cutting a word that spent $10 and sold $9.49
// saves $10 and costs $3.88, a net gain of $6.12, not $10.
// ---------------------------------------------------------------------------
const CONTRIB = 0.4084;
const net = (spend, sales) => spend - sales * CONTRIB;
console.log('\n\nWHAT IS RECOVERABLE, in net contribution rather than gross spend\n');
const bar = 4;
const zeroRows = rows.filter(r => (+r.cost||0) > 0 && (+r.sales14d||0) === 0);
const overBar  = zeroRows.filter(r => +r.cost >= bar);
const overshoot = overBar.reduce((t,r)=>t+(+r.cost - bar), 0);
const underBar  = zeroRows.filter(r => +r.cost < bar).reduce((t,r)=>t+ +r.cost, 0);
const R=(what,amount,how)=>console.log(`  ${what.padEnd(46)} $${amount.toFixed(2).padStart(7)}   ${how}`);
R('overshoot past the $4 bar, zero-sale words', overshoot, 'run the engine hourly, not 6-hourly');
R('words under 1.0x', net(B.under1[0], B.under1[1]), 'already the live rule, enforced faster');
R('words 1.0x to 1.5x', net(B.under15[0], B.under15[1]), 'the new 1.5x kill line');
const addressable = overshoot + net(B.under1[0],B.under1[1]) + net(B.under15[0],B.under15[1]);
console.log(`  ${'ADDRESSABLE THIS MONTH'.padEnd(46)} $${addressable.toFixed(2).padStart(7)}`);
console.log('');
R('zero-sale words that never reached $4', underBar, 'ONLY by promoting fewer words. Not a rule fix.');
R('the same words re-tried in ~95 days', overBar.reduce((t,r)=>t+ +r.cost,0), 'the tombstone, which had no writer');
console.log(`\n  Cutting everything under 1.5x leaves SP at $${(B.underBE[0]+B.profitable[0]).toFixed(2)} spend and`);
console.log(`  $${(B.underBE[1]+B.profitable[1]).toFixed(2)} sales, a ${((B.underBE[1]+B.profitable[1])/(B.underBE[0]+B.profitable[0])).toFixed(2)}x ROAS. That is the ceiling of this exercise,`);
console.log(`  and it is above the 2.45x break-even. The catch is that it is ${(100*(B.underBE[0]+B.profitable[0])/tot).toFixed(0)}% of current volume.`);
