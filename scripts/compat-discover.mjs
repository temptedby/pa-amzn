/** Probe a wide candidate set against Amazon's approved vocabulary. VALIDATION only.
 *  RUN: node scripts/compat-discover.mjs */
import { readFileSync } from 'node:fs';
const r=readFileSync('.env.local','utf8');
for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=(await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET})})).json()).access_token;
const H={'x-amz-access-token':tok,'content-type':'application/json'};
const sku='57-P4AJ-J4AC';
const g=await (await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${sku}?marketplaceIds=${MKT}&includedData=summaries`,{headers:H})).json();
const pt=((g.summaries||[])[0]||{}).productType;
// candidates NOT already on Megan's lists, with published weights (grams)
const C=[
 ['apple_iphone_se_1st_gen',113],['apple_iphone_8',148],['apple_iphone_7',138],['apple_iphone_x',174],
 ['apple_iphone_xr',194],['apple_iphone_xs',177],['apple_iphone_xs_max',208],['apple_iphone_8_plus',202],
 ['samsung_galaxy_s21',169],['samsung_galaxy_s20',163],['samsung_galaxy_s10',157],['samsung_galaxy_s10e',150],
 ['samsung_galaxy_s20_plus',186],['samsung_galaxy_s22_plus_5g',195],
 ['samsung_galaxy_a54',202],['samsung_galaxy_a15',200],['samsung_galaxy_a35',209],['samsung_galaxy_a16',200],
 ['google_pixel_6a',178],['google_pixel_7a',193],['google_pixel_8a',188],['google_pixel_4',162],
 ['google_pixel_3a',147],['google_pixel_5a',183],
 ['motorola_moto_g_power',200],['oneplus_12',220],['oneplus_nord',184],
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function probe(v){
  const body={productType:pt,patches:[{op:'replace',path:'/attributes/compatible_cellular_phone_models',value:[{value:v,marketplace_id:MKT}]}]};
  const res=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${sku}?marketplaceIds=${MKT}&mode=VALIDATION_PREVIEW`,{method:'PATCH',headers:H,body:JSON.stringify(body)});
  const j=await res.json().catch(()=>({}));
  return (j.issues||[]).filter(i=>i.severity==='ERROR').length===0;
}
const black=[],pro=[],miss=[];
console.log('token                         weight  accepted  belongs on');
for(const [t,w] of C){
  const ok=await probe(t);
  const dest = !ok ? '-' : (w<=171?'BLACK (<=171g)':'PRO (>171g)');
  if(ok){ (w<=171?black:pro).push([t,w]); } else miss.push(t);
  console.log(`  ${t.padEnd(28)} ${String(w).padStart(4)}g  ${ok?'YES     ':'no      '} ${dest}`);
  await sleep(700);
}
console.log(`\n=== CANDIDATES FOR BLACK / 2-PACK / 3-PACK (<=171 g), ${black.length} ===`);
black.forEach(([t,w])=>console.log(`  ${t.padEnd(28)} ${w}g`));
console.log(`\n=== CANDIDATES FOR PRO (>171 g), ${pro.length} ===`);
pro.forEach(([t,w])=>console.log(`  ${t.padEnd(28)} ${w}g`));
console.log(`\nnot in Amazon's vocabulary: ${miss.join(', ')||'none'}`);
