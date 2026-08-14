/** Full recursive photo inventory of the Phone Assured Drive, with no hard-coded roots.
 *
 *  William 2026-08-14: "These are nice, but they're all the same photos... can we start saving
 *  these and then pull in more photos?" He is right: sixteen concepts came out of about six shoots
 *  because those are the only shoots sitting in assets/source.
 *
 *  WHY A NEW CRAWLER. `drive-images.mjs` reported 98 files and `drive-inventory.mjs` walks four
 *  HARD-CODED folder ids. Both miss most of the library for the same reason — the folders were
 *  named by hand, and the 08-13 consolidation moved 21 of them under one parent. This walks from
 *  that parent, follows every subfolder to any depth, resolves shortcuts, and takes every image
 *  mime type rather than jpeg and png only.
 *
 *  RUN: node scripts/pacr/drive-crawl-photos.mjs           # inventory only
 *       node scripts/pacr/drive-crawl-photos.mjs --pull    # download shoots we do not hold
 */
import fs from 'node:fs'; import path from 'node:path'; import { createSign } from 'node:crypto';

const CREDS = '/Users/williamholdeman/projects/wdh-personal/secrets/google-writer.json';
const PARENT = '1iZOj6hWCI6qfWjxCBy2guHJjbzUxObOo';   // 2026 Phone Assured All Materials
const DEST = 'assets/source/_drive-photos';
const PULL = process.argv.includes('--pull');

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const c = JSON.parse(fs.readFileSync(CREDS,'utf8')); const now = Math.floor(Date.now()/1000);
const head = `${b64u(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${b64u(JSON.stringify({
  iss:c.client_email, sub:'william@besocialscene.com', scope:'https://www.googleapis.com/auth/drive',
  aud:'https://oauth2.googleapis.com/token', exp:now+3600, iat:now}))}`;
const TOK = (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:`grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${b64u(createSign('RSA-SHA256').update(head).sign(c.private_key))}`
}).then(r=>r.json())).access_token;
const H = { Authorization:`Bearer ${TOK}` };

async function children(id) {
  const out = []; let page;
  do {
    const q = encodeURIComponent(`'${id}' in parents and trashed=false`);
    const u = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,shortcutDetails)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${page?`&pageToken=${page}`:''}`;
    const j = await fetch(u,{headers:H}).then(r=>r.json());
    out.push(...(j.files||[])); page = j.nextPageToken;
  } while (page);
  return out;
}

const photos = [];
const seenFolder = new Set();
async function walk(id, trail) {
  if (seenFolder.has(id)) return;            // the library has cycles via shortcuts
  seenFolder.add(id);
  for (const f of await children(id)) {
    let { id: fid, mimeType: mt, name } = f;
    if (mt === 'application/vnd.google-apps.shortcut') {
      fid = f.shortcutDetails?.targetId; mt = f.shortcutDetails?.targetMimeType;
      if (!fid) continue;
    }
    if (mt === 'application/vnd.google-apps.folder') await walk(fid, [...trail, name]);
    else if (/^image\//.test(mt || '')) photos.push({ id: fid, name, shoot: trail[trail.length-1] || '(root)', trail: trail.join('/'), size: Number(f.size||0) });
  }
}

await walk(PARENT, []);
const byShoot = new Map();
for (const p of photos) byShoot.set(p.shoot, [...(byShoot.get(p.shoot)||[]), p]);

// what we already hold locally, matched on the tail of the filename
const local = new Set();
for (const dir of ['_lifestyle','_faces','_drive-photos']) {
  const d = path.join('assets/source', dir);
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) local.add(f.replace(/^[_a-z]*/i,'').slice(-28).toLowerCase());
}
const isLocal = p => local.has(p.name.slice(-28).toLowerCase());

console.log(`${photos.length} images across ${byShoot.size} folders\n`);
const rows = [...byShoot.entries()].map(([s, list]) => ({ s, n: list.length, have: list.filter(isLocal).length }))
  .sort((a,b) => b.n - a.n);
console.log('  total  local  folder');
for (const r of rows) console.log(`  ${String(r.n).padStart(5)}  ${String(r.have).padStart(5)}  ${r.s.slice(0,60)}`);
const missing = photos.filter(p => !isLocal(p));
console.log(`\nNOT held locally: ${missing.length} of ${photos.length}`);
if (!PULL) { console.log('\nrun with --pull to download them'); process.exit(0); }

fs.mkdirSync(DEST, { recursive: true });
let got = 0, skipped = 0;
for (const p of missing) {
  const safe = (p.shoot + '__' + p.name).replace(/[^\w.\-]+/g,'_').slice(-120);
  const out = path.join(DEST, safe);
  if (fs.existsSync(out)) { skipped++; continue; }
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${p.id}?alt=media&supportsAllDrives=true`,{headers:H});
  if (!r.ok) { console.log(`  skip ${r.status} ${p.name.slice(0,50)}`); continue; }
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); got++;
  if (got % 50 === 0) console.log(`  ${got} pulled...`);
}
console.log(`\npulled ${got}, already had ${skipped} -> ${DEST}`);
