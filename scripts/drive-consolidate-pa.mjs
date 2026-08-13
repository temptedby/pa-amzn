/** Gather every Phone Assured folder under one parent.
 *
 *  William 2026-08-13: "One under folder 2026 Phone Assured All Materials ... put everything in
 *  1 folder". He could not find this week's creative because SEVEN folders answer to some form of
 *  the name — four of them literally called "Phone Assured" — and half the business files under
 *  "Securisee" instead, so it never appears in that search at all.
 *
 *  MOVES folders, never merges their contents. Every file keeps its id, so every share link and
 *  every reference in our docs keeps working. Reversible: the dry run prints the old parent of each
 *  folder, so putting one back is a single edit.
 *
 *  Uses the domain-wide-delegation service account impersonating William, so HE owns the new folder
 *  and it lands in his Drive, not a service account's.
 *
 *  RUN: node scripts/drive-consolidate-pa.mjs           # dry run
 *       node scripts/drive-consolidate-pa.mjs --apply
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
const APPLY = process.argv.includes('--apply');
const KEY_PATH = '/Users/williamholdeman/projects/wdh-personal/secrets/google-writer.json';
const SUBJECT  = 'william@besocialscene.com';
const PARENT_NAME = '2026 Phone Assured All Materials';

const FOLDERS = [
  ['1zVGhhLCDD4nyqrDbFYrNhmZGU-T4NN9X', 'Phone Assured (2022) — this week\'s Graphics + Video'],
  ['1Gnfwqgq0xlWXwUTjdj1IVx7SOWb9DCaz', 'PA CREATIVE MASTER 2026-08 — Megan brief pack'],
  ['1ZOYruu3FpRHfdrb2xfSy-SzG-m6c_b-3', 'Sell Phone Assured — Flippa'],
  ['1XKJr4gsKV7pJerrwYe-UnrdM_ih8-EcI', '2025 Douglas Dean + Phone Assured FInances'],
  ['141RyuSf9h1Xu32BSrrwjknQ3hFt1ZhD4', 'Securisee Amazon/Financial Reporting'],
  ['1jEUM1ALt4hoN8TSC2NrxwgUONDW-Ouzs', 'Phone Assured (2021)'],
  ['15cztIqynf-35swMbAnItqwtbEW7t-Kwt', 'Phone Assured (5)'],
  ['1EXez9bGwoph_d0wdoDpvZY7tJFqMQySL', 'Phone Assured'],
  ['153huXqPg7P7bHwAerxhQoOWgDJQ9Phng', 'Securisee Expansion Plan'],
  // Round two, 2026-08-13. William: "we have phone assured folders with number sont hem too ...
  // very confusing". A full sweep found 34 folders answering to the name. Most of the numbered
  // ones — Phone Assured (1) through (5) — are NOT loose: they were created in the same second on
  // 2025-06-22, a bulk download re-uploaded, and they sit nested inside their own parents, so they
  // travelled with the folders already moved. These are the ones still loose at the top level.
  ['1etMm02wDysWZipGSBMmfzBdBdqHez7Tm', 'Phone Assured (2025 set: Ads, Ads 2, Print (4))'],
  ['15-IclLCuW73i0b7Zy30tcEckW_fvk9jL', '2021 Phone Assured'],
  ['1ocs69NEvDn9mUhMu7pWwrNiikjOnMR3M', 'Phone Assured Copy'],
  ['1-clANi-CYart3uas9xrYoB7lknRuZIM_', 'Phone Assured Loop Knot'],
  ['1fj7mid_8ppHHDDn7r7JQt9zcLLVaY073', 'phoneassured_770144791054176'],
  // Owned by other accounts (connect@, hello@, creatives@amzonestep.com). Drive will not move a
  // folder you do not own, so these become shortcuts and keep their real home.
  ['1TZbtpnGoJ7B8uLa9cspPuJe3zAy2-mEN', 'Phone Assured Weekly Materials (connect@)'],
  ['1aB944E1pdpf4Zd6qAA522p4JhiOeOXxn', 'Phone Assured Materials (connect@)'],
  ['1AMbHGkhZed0oCyvYQcX_SUxRuX9YuPA6', 'Phone Assured Installation Video (hello@)'],
  ['1tMr4xRd2ol2dyaanS-In0Hvbszg_NVo5', 'Phone Assured (2 pack) (amzonestep)'],
  ['1xaUyJPw1M48W-oW2cMRrGXnIkhx8wqaK', '2022_PHONE ASSURED_SOCIAL MEDIA GRAPHICS (connect@)'],
  ['1NaOH7qcRK7_x7s04NhnHnHLutVhbIxXq', '2022_PHONE ASSURED_VIDEOS (connect@)'],
  ['1LhUviOgBTs1yZVegb_EWC7RsmtgujAnT', '2022_PHONE ASSURED TAG_FINAL (connect@)'],
];

const b64 = b => Buffer.from(b).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const c = JSON.parse(readFileSync(KEY_PATH,'utf8'));
const now = Math.floor(Date.now()/1000);
const header = b64(JSON.stringify({alg:'RS256',typ:'JWT'}));
const claim  = b64(JSON.stringify({iss:c.client_email, sub:SUBJECT, scope:'https://www.googleapis.com/auth/drive',
  aud:'https://oauth2.googleapis.com/token', iat:now, exp:now+3600}));
const sig = createSign('RSA-SHA256').update(`${header}.${claim}`).end().sign(c.private_key);
const jwt = `${header}.${claim}.${b64(sig)}`;
const tok = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}).toString()}).then(r=>r.json());
if(!tok.access_token){ console.log('AUTH FAILED:', JSON.stringify(tok).slice(0,300)); process.exit(1); }
const H = {Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json'};
const api = async (path, method='GET', body) => {
  const r = await fetch(`https://www.googleapis.com/drive/v3/${path}`,{method,headers:H,body:body?JSON.stringify(body):undefined});
  const t = await r.text(); let j; try{ j=JSON.parse(t);}catch{}
  return {ok:r.ok, status:r.status, json:j, text:t};
};

console.log(`Impersonating ${SUBJECT}\n`);
console.log('CURRENT LOCATION OF EACH FOLDER:\n');
const plan = [];
for (const [id, label] of FOLDERS) {
  const r = await api(`files/${id}?fields=id,name,parents,owners(emailAddress)&supportsAllDrives=true`);
  if (!r.ok) { console.log(`  MISSING/NO ACCESS  ${label}  (HTTP ${r.status})`); continue; }
  const parents = r.json.parents || [];
  let parentName = '(My Drive root)';
  if (parents.length) {
    const p = await api(`files/${parents[0]}?fields=name&supportsAllDrives=true`);
    if (p.ok) parentName = p.json.name;
  }
  console.log(`  "${r.json.name}"`);
  console.log(`     currently in: ${parentName}    owner: ${r.json.owners?.[0]?.emailAddress ?? '?'}`);
  plan.push({id, name:r.json.name, parents});
}
if (!APPLY) { console.log(`\n${plan.length} folders would move into "${PARENT_NAME}".`);
  console.log('(dry run — nothing changed. add --apply)'); process.exit(0); }

// find or create the destination
const q = encodeURIComponent(`name = '${PARENT_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
const found = await api(`files?q=${q}&fields=files(id,name)&supportsAllDrives=true`);
let destId = found.json?.files?.[0]?.id;
if (destId) console.log(`\nUsing existing folder ${destId}`);
else {
  const mk = await api('files?supportsAllDrives=true','POST',{name:PARENT_NAME, mimeType:'application/vnd.google-apps.folder'});
  if(!mk.ok){ console.log('CREATE FAILED', mk.status, mk.text.slice(0,200)); process.exit(1); }
  destId = mk.json.id;
  console.log(`\nCreated "${PARENT_NAME}"  ${destId}`);
}
// Two of these folders are owned by hello@phoneassured.com and merely shared with William. Drive
// refuses to MOVE a file you do not own into your own tree — "Increasing the number of parents is
// not allowed" — because it is not in his My Drive to begin with. A shortcut is the supported way
// to make it appear in one place, and it leaves ownership and every existing link untouched.
const shortcutFor = async (f, destId) => {
  const ex = await api(`files?q=${encodeURIComponent(`'${destId}' in parents and name = '${f.name.replace(/'/g,"\\'")}' and trashed = false`)}&fields=files(id)&supportsAllDrives=true`);
  if (ex.json?.files?.length) return { ok: true, existed: true };
  return api('files?supportsAllDrives=true','POST',{
    name: f.name, mimeType: 'application/vnd.google-apps.shortcut',
    parents: [destId], shortcutDetails: { targetId: f.id },
  });
};
let moved=0;
for (const f of plan) {
  if (f.parents.includes(destId)) { console.log(`  already there: ${f.name}`); moved++; continue; }
  const r = await api(`files/${f.id}?addParents=${destId}&removeParents=${f.parents.join(',')}&fields=id,parents&supportsAllDrives=true`,'PATCH',{});
  if (r.ok) { console.log(`  moved: ${f.name}`); moved++; continue; }
  // not ours to move -> put a shortcut in the folder instead
  const sc = await shortcutFor(f, destId);
  if (sc.ok) { console.log(`  shortcut: ${f.name}${sc.existed ? ' (already there)' : ''}  [owned by someone else, not moved]`); moved++; }
  else console.log(`  FAILED: ${f.name}  HTTP ${r.status} ${r.text.slice(0,140)}`);
}
console.log(`\n${moved}/${plan.length} in place.`);
console.log(`https://drive.google.com/drive/folders/${destId}`);
