/** READ-ONLY. Does cutting ad spend cut ORGANIC sales too?
 *  William 2026-08-21: "less ad spend could mean less organic sales too".
 *  August ran a natural experiment: ~$20/day of ads to the 13th, then ~$71/day from the 14th.
 *  Organic = total sales minus ad-attributed sales, per day. */
import { readFileSync } from 'node:fs';
const T=`2026-08-01 9.60 0.00 22.98
2026-08-02 11.53 26.98 40.47
2026-08-03 18.08 0.00 36.47
2026-08-04 18.89 18.98 28.47
2026-08-05 20.01 18.98 37.96
2026-08-06 14.71 18.98 74.43
2026-08-07 19.56 16.49 39.47
2026-08-08 8.52 13.49 81.92
2026-08-09 32.72 28.47 60.94
2026-08-10 32.69 59.45 99.92
2026-08-11 14.13 0.00 42.96
2026-08-12 27.68 28.47 54.45
2026-08-13 33.14 32.47 51.45
2026-08-14 25.94 13.49 26.98
2026-08-15 69.35 61.94 117.90
2026-08-16 109.25 45.96 29.47
2026-08-17 89.15 51.45 107.41
2026-08-18 64.35 22.98 68.94
2026-08-19 67.61 0.00 28.47`.trim().split('\n').map(l=>{const[d,s,a,t]=l.split(' ');return{d,spend:+s,adSales:+a,total:+t,organic:+t-+a};});
const A=T.slice(0,13), B=T.slice(13);
const avg=(a,k)=>a.reduce((x,y)=>x+y[k],0)/a.length;
console.log('AUGUST RAN THE EXPERIMENT ALREADY\n');
console.log('               days   ad spend/day   ad sales/day   ORGANIC/day   total/day');
for(const [lbl,g] of [['Aug 1-13 ',A],['Aug 14-19',B]])
  console.log(`  ${lbl}     ${String(g.length).padStart(2)}      ${avg(g,'spend').toFixed(2).padStart(8)}       ${avg(g,'adSales').toFixed(2).padStart(8)}      ${avg(g,'organic').toFixed(2).padStart(8)}    ${avg(g,'total').toFixed(2).padStart(8)}`);
const dS=avg(B,'spend')/avg(A,'spend'), dO=avg(B,'organic')/avg(A,'organic'), dT=avg(B,'total')/avg(A,'total');
console.log(`\n  ad spend went UP  ${dS.toFixed(2)}x`);
console.log(`  organic went      ${dO.toFixed(2)}x   <- essentially FLAT`);
console.log(`  total went        ${dT.toFixed(2)}x`);
console.log(`\nTripling the ads moved organic by ${((dO-1)*100).toFixed(0)}%. Whatever the extra $51/day bought,`);
console.log('it was not organic rank. So the fear that cutting spend kills organic is not supported');
console.log('by the only test we have run: RAISING it did not lift organic either.\n');
const CON=4.52;  // blended contribution per unit at the $2 all-in cost
for(const [lbl,g] of [['at the Aug 1-13 spend level',A],['at the Aug 14-19 spend level',B]]){
  const units=avg(g,'total')/11.05, con=units*CON, net=con-avg(g,'spend');
  console.log(`  ${lbl}: ~${units.toFixed(1)} units/day, $${con.toFixed(2)} contribution, $${avg(g,'spend').toFixed(2)} ads  ->  ${net>=0?'+':''}$${net.toFixed(2)}/day`);
}
console.log('\nCaveat worth keeping: 6 days against 13, one month, and ad sales are credited to the');
console.log('CLICK date while organic follows the order date, so single days swing. The direction is');
console.log('clear, the precise size is not.');
