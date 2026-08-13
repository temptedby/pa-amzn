/** Undo the broad enable, then relaunch Display on proven entities only.
 *
 *  William 2026-08-13: "yes reverse the display you made live and lets launch with a more
 *  disciplined approach".
 *
 *  WHY THE BROAD ENABLE WAS WRONG. It was a STOCK decision, not a performance one: pause ads on
 *  out-of-stock ASINs, then put all four sellable ASINs into every enabled ad group. Removing the
 *  dead ads was right and stays. Spraying four products across every audience was not, because
 *  lifetime Display is 0.79x ($5,251 -> $4,128 over 196 orders) and the losses are concentrated in
 *  audiences that have never worked.
 *
 *  WHAT THE LIFETIME DATA ACTUALLY SAYS:
 *     views  14d   1.38x     <- the only audience family above break-even
 *     views  30d   0.71x
 *     views  60d   0.57x
 *     purchases 90/180/365   0.00x / 0.34x / 0.57x   every one loses money
 *  Recent viewers convert. Old viewers and past purchasers do not.
 *
 *  REVERSAL IS PRECISE, not a guess: the create step only ever added an ad where that (adGroup,
 *  ASIN) pair had no ENABLED ad. So any enabled ad matching a pair on the created list is one of
 *  mine, and pausing exactly those restores the prior state without touching anything older.
 *
 *  RUN: node scripts/sd-reverse-and-focus.mjs            # dry run
 *       node scripts/sd-reverse-and-focus.mjs --apply
 */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const APPLY=process.argv.includes('--apply');
const A='https://advertising-api.amazon.com';
const LIVE=['B07Y5GZP1T','B097MK5VZ4','B097MGPCPC','B0BLLJLSDP'];
// Proven at 1.5x or better across the whole life of the account.
const PROVEN_ASINS={ B07ZSDFY85:'2.18x $210->$457 18ord', B00JTKOPY4:'2.36x $95->$225 9ord',
                     B07PNZTWW4:'2.88x $62->$180 6ord',  B07VVNYDHX:'1.78x $34->$60 2ord' };
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const H={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID,'Content-Type':'application/json','Accept':'application/json'};
const call=async(p,m='GET',b)=>{const r=await fetch(A+p,{method:m,headers:H,body:b?JSON.stringify(b):undefined});const t=await r.text();let j;try{j=JSON.parse(t);}catch{}return{ok:r.ok,status:r.status,json:j,text:t};};

const camps=(await call('/sd/campaigns')).json||[];
const groups=(await call('/sd/adGroups')).json||[];
const ads=(await call('/sd/productAds')).json||[];
const targets=(await call('/sd/targets')).json||[];
const gById=new Map(groups.map(g=>[String(g.adGroupId),g]));
const cById=new Map(camps.map(c=>[String(c.campaignId),c]));

// (1) EXACTLY the ads created today, by creationDate. An earlier version of this script
// recomputed the create list from current state and would have paused 52 ads, ~18 of which
// pre-dated today's change. /sd/productAds/extended carries creationDate and lastUpdatedDate, so
// the reversal can name precisely what was added rather than infer it.
const extended=(await call('/sd/productAds/extended')).json||[];
const TODAY=Date.parse('2026-08-13T00:00:00Z');
const created=extended
  .filter(a=>Number(a.creationDate)>TODAY && String(a.state).toLowerCase()==='enabled')
  .map(a=>({adId:a.adId,asin:a.asin,group:a.adGroupId,camp:(cById.get(String(a.campaignId))||{}).name||'?'}));
console.log(`Ads created TODAY by the broad enable: ${created.length}`);

// (2) which ad groups hold a PROVEN target, matched on the ASIN inside the expression
const provenGroups=new Map();
for(const t of targets){
  const expr=JSON.stringify(t.expression||t.resolvedExpression||{});
  for(const asin of Object.keys(PROVEN_ASINS)){
    if(expr.includes(asin)){
      const g=gById.get(String(t.adGroupId)); const c=g?cById.get(String(g.campaignId)):null;
      provenGroups.set(String(t.adGroupId),{asin,targetId:t.targetId,state:t.state,bid:t.bid,
        group:g?g.state:'?',camp:c?c.name:'?',campState:c?c.state:'?'});
    }
  }
}
console.log(`\nAd groups containing a PROVEN competitor target: ${provenGroups.size}`);
for(const [gid,v] of provenGroups) console.log(`   group ${gid}  target ${v.targetId} ${v.state}  bid ${v.bid}  ${PROVEN_ASINS[v.asin]}  [${v.asin}]  campaign ${String(v.camp).slice(0,38)} ${v.campState}`);

// (3) plan: keep our ads only where a proven target lives; pause the rest of what I added
const keep=created.filter(x=>provenGroups.has(String(x.group)));
const revert=created.filter(x=>!provenGroups.has(String(x.group)));
console.log(`\nKEEP  ${keep.length} ads (in ad groups with a proven target)`);
console.log(`PAUSE ${revert.length} ads (everywhere else — the spray)`);
const pausedProven=[...provenGroups.entries()].filter(([,v])=>String(v.state).toLowerCase()!=='enabled');
console.log(`\nPROVEN TARGETS CURRENTLY SWITCHED OFF: ${pausedProven.length}`);
for(const [gid,v] of pausedProven) console.log(`   target ${v.targetId} ${v.state}  ${PROVEN_ASINS[v.asin]}  [${v.asin}]`);

if(!APPLY){ console.log('\n(dry run — nothing changed. add --apply)'); process.exit(0); }
if(revert.length){
  const r=await call('/sd/productAds','PUT',revert.map(x=>({adId:Number(x.adId),state:'paused'})));
  const items=Array.isArray(r.json)?r.json:[];
  console.log(`\npause: HTTP ${r.status}, ${items.filter(i=>String(i.code).toUpperCase()==='SUCCESS').length}/${revert.length} SUCCESS`);
}
if(pausedProven.length){
  const r=await call('/sd/targets','PUT',pausedProven.map(([,v])=>({targetId:Number(v.targetId),state:'enabled'})));
  const items=Array.isArray(r.json)?r.json:[];
  console.log(`enable proven targets: HTTP ${r.status}, ${items.filter(i=>String(i.code).toUpperCase()==='SUCCESS').length}/${pausedProven.length} SUCCESS`);
}
const after=(await call('/sd/productAds')).json||[];
console.log(`\nREAD BACK: ${after.filter(a=>String(a.state).toLowerCase()==='enabled').length} enabled SD product ads on the account.`);
