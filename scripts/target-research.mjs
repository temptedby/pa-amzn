/** READ-ONLY. What else can we advertise against?
 *
 *  William 2026-10-07: "find more competitors for different uses like keychain that we can have
 *  advertise to" and "products the clip can atatch to - anything with a hole or loop to attach
 *  170 grams to we can compliment".
 *
 *  Two different targeting jobs, and they need different tools:
 *    SUBSTITUTES  -- rival tethers and adjacent uses (keychain reels, badge reels, tool lanyards).
 *                    Amazon's own product recommendations surface these, because they are built
 *                    from "frequently viewed together" and "top converting targets".
 *    COMPLEMENTS  -- the things a 170g phone gets clipped TO: keyrings, belt loops, backpack
 *                    straps, purse handles, water bottles, luggage, dog leads, tool belts.
 *                    Recommendations will NOT surface these, because nobody cross-shops a tether
 *                    with a backpack. They have to come from the CATEGORY tree instead.
 *
 *  Media types, all three verified live 2026-10-07 (every other spelling answers 415):
 *    POST /sp/targets/products/recommendations    application/vnd.spproductrecommendation.v3+json
 *    POST /sp/targets/categories/recommendations  application/vnd.spproducttargeting.v3+json
 *    GET  /sp/targets/categories                  application/json  (returns CategoryTree as a
 *                                                 JSON *string* that has to be parsed again)
 *  RUN: node scripts/target-research.mjs */
import { readFileSync } from 'node:fs';
for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const A='https://advertising-api.amazon.com', SPAPI='https://sellingpartnerapi-na.amazon.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ASINS=['B07Y5GZP1T','B097MGPCPC','B097MK5VZ4','B0BLLJLSDP'];

const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.ADS_REFRESH_TOKEN,client_id:process.env.ADS_CLIENT_ID,client_secret:process.env.ADS_CLIENT_SECRET})})).json()).access_token;
const base={Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':process.env.ADS_CLIENT_ID,'Amazon-Advertising-API-Scope':process.env.ADS_PROFILE_ID};
const PREC='application/vnd.spproductrecommendation.v3+json';
const CREC='application/vnd.spproducttargeting.v3+json';

// ---------- 1. SUBSTITUTES: recommended ASINs ------------------------------------------------
const recs=new Map();
for(let page=0;page<6;page++){
  const r=await fetch(`${A}/sp/targets/products/recommendations`,{method:'POST',
    headers:{...base,'Content-Type':PREC,'Accept':PREC},
    body:JSON.stringify({adAsins:ASINS,pageIndex:page,pageSize:50})});
  if(!r.ok){ if(page===0) console.log(`product recs HTTP ${r.status}: ${(await r.text()).slice(0,200)}`); break; }
  const list=(await r.json()).recommendations||[];
  if(!list.length) break;
  for(const x of list) if(x.recommendedAsin) recs.set(x.recommendedAsin,x.themes||[]);
  if(list.length<50) break;
  await sleep(400);
}
// what do we already target?
const TCT='application/vnd.spTargetingClause.v3+json';
let tgs=[],next;
do{ const r=await fetch(`${A}/sp/targets/list`,{method:'POST',headers:{...base,'Content-Type':TCT,'Accept':TCT},body:JSON.stringify({maxResults:500,...(next?{nextToken:next}:{})})});
  const j=await r.json(); tgs=tgs.concat(j.targetingClauses||[]); next=j.nextToken; }while(next);
const haveAsin=new Set(), haveCat=new Set();
for(const t of tgs) for(const e of (t.expression||[])){
  const v=String(e.value||'').toUpperCase();
  if(/^B0[A-Z0-9]{8}$/.test(v)) haveAsin.add(v);
  if(String(e.type||'').includes('CATEGORY')) haveCat.add(String(e.value));
}
console.log(`we already have ${haveAsin.size} ASIN targets and ${haveCat.size} category targets, across ${tgs.length} targeting clauses`);

// resolve titles so a list of ASINs is actually readable
const sptok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const titles=new Map();
const all=[...recs.keys()];
for(let i=0;i<all.length;i+=20){
  const chunk=all.slice(i,i+20);
  const u=`${SPAPI}/catalog/2022-04-01/items?identifiers=${chunk.join(',')}&identifiersType=ASIN&marketplaceIds=ATVPDKIKX0DER&includedData=summaries,salesRanks`;
  const r=await fetch(u,{headers:{'x-amz-access-token':sptok}});
  if(r.ok){ const j=await r.json();
    for(const it of (j.items||[])){ const s=(it.summaries||[])[0]||{};
      titles.set(it.asin,{t:s.itemName||'',b:s.brand||'',
        rank:((it.salesRanks||[])[0]?.classificationRanks||[])[0]?.rank ?? ((it.salesRanks||[])[0]?.displayGroupRanks||[])[0]?.rank}); } }
  else if(i===0) console.log(`catalog HTTP ${r.status}: ${(await r.text()).slice(0,160)}`);
  await sleep(1100);
}
console.log(`\n${'='.repeat(104)}`);
console.log(`SUBSTITUTES: ${recs.size} ASINs Amazon recommends we target  (${[...recs.keys()].filter(a=>!haveAsin.has(a)).length} we do NOT already have)`);
console.log(`${'='.repeat(104)}`);
console.log('  asin        have?  rank      brand                 title');
const sorted=[...recs.entries()].sort((a,b)=>(titles.get(a[0])?.rank??9e9)-(titles.get(b[0])?.rank??9e9));
for(const [asin,themes] of sorted){
  const m=titles.get(asin)||{};
  if(ASINS.includes(asin)) continue;                       // our own product
  console.log(`  ${asin}  ${(haveAsin.has(asin)?'have':'  -- ').padEnd(6)} ${String(m.rank??'?').padStart(8)}  ${(m.b||'?').slice(0,20).padEnd(20)}  ${(m.t||'(title unavailable)').slice(0,56)}`);
  if(themes.length) console.log(`                              themes: ${themes.join(' | ')}`);
}

// ---------- 2. what Amazon thinks our categories are -----------------------------------------
const cr=await fetch(`${A}/sp/targets/categories/recommendations`,{method:'POST',
  headers:{...base,'Content-Type':CREC,'Accept':CREC},body:JSON.stringify({asins:ASINS,includeAncestor:false})});
console.log(`\n${'='.repeat(104)}`);
console.log('CATEGORIES Amazon recommends for our own ASINs');
console.log(`${'='.repeat(104)}`);
if(cr.ok) for(const c of ((await cr.json()).categories||[]))
  console.log(`  ${String(c.id).padEnd(14)} ${(haveCat.has(String(c.id))?'have':'  --').padEnd(5)} ${c.name}   ${c.path||''}`);
else console.log(`  HTTP ${cr.status} -> UNREAD`);

// ---------- 3. COMPLEMENTS: mine the category tree for attach points -------------------------
const gr=await fetch(`${A}/sp/targets/categories`,{headers:{...base,'Accept':'application/json'}});
if(!gr.ok){ console.log(`\ncategory tree HTTP ${gr.status} -> COMPLEMENTS UNREAD`); process.exit(0); }
const raw=await gr.json();
const tree=JSON.parse(raw.CategoryTree);
// every node, with its full path, keeping only the ones Amazon will let us target
const flat=[];
(function walk(nodes,path){ for(const n of nodes){ const p=path+'/'+n.na;
  if(n.ta) flat.push({id:n.id,name:n.na,path:p});
  if(n.ch&&n.ch.length) walk(n.ch,p); } })(tree,'');
console.log(`\ntargetable categories in the tree: ${flat.length}`);

// William's attach-point list: a hole or a loop that will carry 170g.
const WANT=[
  ['keychain',       /key ?chain|key ?ring|keychains|key ?fob/i],
  ['badge + lanyard',/badge|lanyard|id card holder|retractable reel/i],
  ['backpack + bag', /backpack|daypack|messenger bag|tote|crossbody/i],
  ['purse + handbag',/handbag|purse|clutch|wristlet|shoulder bag/i],
  ['belt + waist',   /\bbelt\b|waist pack|fanny pack|money belt/i],
  ['water bottle',   /water bottle|hydration|bottle sling|bottle carrier/i],
  ['luggage',        /luggage|suitcase|carry-on|luggage tag/i],
  ['dog lead',       /dog lead|dog leash|pet leash|collar|harness/i],
  ['tool + work',    /tool belt|tool pouch|tool lanyard|carabiner|climbing/i],
  ['phone case',     /phone case|case with strap|wallet case|phone holster/i],
  ['stroller + pram',/stroller|pram|baby carrier|diaper bag/i],
  ['bike + scooter', /bike mount|handlebar|bicycle bag|scooter/i],
];
console.log(`\n${'='.repeat(104)}`);
console.log('COMPLEMENTS: targetable categories whose products have a hole or loop a 170g tether can clip to');
console.log(`${'='.repeat(104)}`);
for(const [label,re] of WANT){
  const hits=flat.filter(f=>re.test(f.name));
  console.log(`\n  ${label.toUpperCase()}  (${hits.length} targetable categor${hits.length===1?'y':'ies'})`);
  for(const h of hits.slice(0,8))
    console.log(`    ${String(h.id).padEnd(14)} ${(haveCat.has(String(h.id))?'have':'  --').padEnd(5)} ${h.name}`);
  if(hits.length>8) console.log(`    ... and ${hits.length-8} more`);
}
console.log('\nREAD-ONLY. Nothing was created.');
