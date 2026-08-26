/** READ-ONLY. Canadian contribution and break-even ROAS at any price, from MEASURED settlement data.
 *  Source: scripts/canada-actual-fees.mjs over 47 real CAD shipment items, 2026-08-26.
 *    FBA CAD 8.21/unit flat (8.38 on the 3-Pack), referral 15.0%, FX 8.21/5.96 = 1.3775 CAD/USD
 *    COGS USD 2.00/clip (William 2026-08-21)
 *  RUN: node scripts/ca-price-breakeven.mjs */
const FX=1.3775, COGS=2.00*FX, REF=0.15;
const row=(label,price,clips,fba=8.21)=>{
  const c=price-price*REF-fba-COGS*clips;
  return {label,price,clips,c,be:c>0?price/c:Infinity};
};
const S=[
  row('Single  TODAY (repriced 08-21)',18.72,1),
  row('Single  at 24.00',24.00,1),
  row('Single  BEFORE 08-21',29.28,1),
  null,
  row('Pro     TODAY',20.72,1),
  row('Pro     BEFORE 08-21',27.04,1),
  null,
  row('2-Pack  TODAY',22.75,2),
  row('2-Pack  BEFORE 08-21',52.31,2),
  null,
  row('3-Pack  TODAY',26.94,3,8.38),
  row('3-Pack  BEFORE 08-21',67.39,3,8.38),
];
console.log('\nCANADA: what each price leaves us, and the ROAS the ads must beat.\n');
console.log('                                     price   contribution   break-even ROAS');
for(const r of S){
  if(!r){console.log('');continue;}
  const be=isFinite(r.be)?r.be.toFixed(2)+'x':'never';
  console.log(`  ${r.label.padEnd(34)} ${r.price.toFixed(2).padStart(6)}   CAD ${r.c.toFixed(2).padStart(6)}      ${be.padStart(7)}`);
}
console.log('\nOur best-ever proven keywords do 2.90x. US break-even is 2.67x.');
console.log('The CAD 8.21 is Amazon cross-border FBA: we hold stock in the US and ship it north.');
console.log('It is not a tariff and it is not new. It applied to the 2024-25 Canadian orders too.');
