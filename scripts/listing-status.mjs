/** Read-only: is the listing actually suppressed? Pull SP-API listing status + issues (validated).
 *  DISCOVERABLE = searchable (not suppressed). Issues array = any real problems. No claims w/o this.
 *  RUN: node scripts/listing-status.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const SP='https://sellingpartnerapi-na.amazon.com', MKT='ATVPDKIKX0DER', SELLER='ACXMWZZUZKFVD';
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.SP_API_REFRESH_TOKEN,client_id:process.env.SP_API_CLIENT_ID,client_secret:process.env.SP_API_CLIENT_SECRET}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const SKUS={'57-P4AJ-J4AC':'Single B07Y5GZP1T','CPH-BLCK-2':'2-Pack','CPH-BLCK-3':'3-Pack(blk)','UG-SVG8-LB0P':'Pro'};
for(const [sku,label] of Object.entries(SKUS)){
  const r=await fetch(`${SP}/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}?marketplaceIds=${MKT}&includedData=summaries,issues`,{headers:{'x-amz-access-token':tok,'content-type':'application/json'}});
  const j=await r.json();
  if(!r.ok){console.log(`${label}: ${r.status} ${JSON.stringify(j).slice(0,120)}`);continue;}
  const sum=(j.summaries||[])[0]||{}, issues=j.issues||[];
  const status=(sum.status||[]).join('/');
  const discoverable=(sum.status||[]).includes('DISCOVERABLE');
  console.log(`\n${label} (${sku})`);
  console.log(`  status: ${status}   -> ${discoverable?'DISCOVERABLE (searchable, NOT suppressed)':'NOT discoverable (suppressed/inactive)'}`);
  console.log(`  issues: ${issues.length}`);
  issues.forEach(i=>console.log(`    [${i.severity}] ${i.code}: ${(i.message||'').slice(0,90)}${(i.enforcements?.actions||[]).length?'  ACTIONS:'+i.enforcements.actions.map(a=>a.action).join(','):''}`));
}
