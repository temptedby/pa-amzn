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
