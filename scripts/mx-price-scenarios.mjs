/** READ-ONLY. Mexican contribution at any price, from MEASURED settlement data, not estimates.
 *  Source: scripts/intl-actual-fees.mjs against real MXN orders, 2026-08-26.
 *    FBA MXN 136.84 per SHIPPED UNIT (flat, Remote Fulfilment cross-border rate)
 *    referral 10.0%          FX 136.84/8.07 = 16.96 MXN/USD
 *    COGS USD 2.00/clip (William 2026-08-21 "our real all in costs")
 *  RUN: node scripts/mx-price-scenarios.mjs */
const FBA=136.84, REF=0.10, FX=16.957, COGS_USD=2.00, COGS=COGS_USD*FX;
const row=(label,price,clips)=>{
  const ref=price*REF, cogs=COGS*clips;
  const c=price-ref-FBA-cogs;
  const be=c>0?price/c:Infinity;
  const perClip=price/clips;
  return {label,price,clips,perClip,c,usd:c/FX,be};
};
const S=[
  row('Single  today',256.25,1),
  row('Single  at 249',249,1),
  row('Single  at 209',209,1),
  row('Single  at 200 (your number)',200,1),
  row('Single  at 199',199,1),
  null,
  row('2-Pack  today',302.81,2),
  row('2-Pack  at 300 (your number)',300,2),
  row('2-Pack  at 249 (matches Lamicall 2-pack)',249,2),
  row('2-Pack  at 209',209,2),
  null,
  row('3-Pack  today',348.81,3),
  row('3-Pack  at 249',249,3),
  row('3-Pack  at 199 (matches the 3-piece steel-cable)',199,3),
];
console.log('\nMEXICO CONTRIBUTION PER SALE, after Amazon fees and product cost, BEFORE any advertising.\n');
console.log('                                             price  /clip   contribution        break-even');
console.log('                                                                                  ROAS');
for(const r of S){
  if(!r){console.log('');continue;}
  const c=r.c>=0?`MXN ${r.c.toFixed(2).padStart(7)} = USD ${r.usd.toFixed(2).padStart(5)}`
                : `MXN ${r.c.toFixed(2).padStart(7)} = USD ${r.usd.toFixed(2).padStart(5)}  LOSS`;
  const be=isFinite(r.be)?`${r.be.toFixed(2)}x`:'never';
  console.log(`  ${r.label.padEnd(42)} ${String(r.price).padStart(6)} ${r.perClip.toFixed(0).padStart(5)}  ${c.padEnd(34)} ${be.padStart(7)}`);
}
console.log(`\nUS for comparison: $9.49 - 15% referral - $2.52 FBA - $2.00 cost = $3.55, break-even 2.67x`);
console.log(`The Mexican FBA fee is MXN ${FBA} = USD ${(FBA/FX).toFixed(2)}. The US fee on the same clip is USD 2.52.`);
console.log(`That single line is the whole difference, and no price we choose changes it.`);
