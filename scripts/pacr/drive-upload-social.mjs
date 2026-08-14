/** Push the multi-platform social set into William's Drive.
 *
 *  William 2026-08-14: "lets continue to build add to social media graphics for the phone assured
 *  folder". It lands under `2026 Phone Assured All Materials`, the parent the 08-13 consolidation
 *  created, in a dated folder with one subfolder per surface so he can grab what he needs without
 *  reading filenames.
 *
 *  The service account IMPERSONATES William (domain-wide delegation). Acting as itself it can hold
 *  Editor and still 403 with "Service Accounts do not have storage quota", because the creator owns
 *  the file and a service account has no My Drive quota. Learned the expensive way on 2026-08-11.
 *
 *  Re-running REPLACES by name rather than duplicating.
 *  RUN: node scripts/pacr/drive-upload-social.mjs
 */
import fs from 'node:fs'; import path from 'node:path'; import { createSign } from 'node:crypto';

const CREDS = '/Users/williamholdeman/projects/wdh-personal/secrets/google-writer.json';
const PARENT = '1iZOj6hWCI6qfWjxCBy2guHJjbzUxObOo';       // 2026 Phone Assured All Materials
const SRC = 'build/creative/social-platforms';
const ROOT_NAME = '2026-08 Social Media Graphics';
const SURFACE = {
  vertical: '9x16 — Reels, Stories, TikTok, Shorts',
  feed:     '4x5 — Instagram + Facebook feed',
  square:   '1x1 — square',
  wide:     '16x9 — YouTube + Facebook link',
  thumb:    'YouTube thumbnails',
};

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
const MIME = { '.jpg':'image/jpeg', '.png':'image/png', '.html':'text/html', '.json':'application/json' };

async function findChild(name, parent) {
  const q = encodeURIComponent(`name='${name.replace(/'/g,"\\'")}' and '${parent}' in parents and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true`,{headers:H});
  return ((await r.json()).files || [])[0]?.id;
}
async function folder(name, parent) {
  const got = await findChild(name, parent); if (got) return got;
  const r = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',{method:'POST',
    headers:{...H,'Content-Type':'application/json'},
    body: JSON.stringify({ name, mimeType:'application/vnd.google-apps.folder', parents:[parent] })});
  const j = await r.json(); if (!j.id) throw new Error('mkdir failed: '+JSON.stringify(j).slice(0,200));
  return j.id;
}
async function upload(file, parent) {
  const name = path.basename(file);
  const prev = await findChild(name, parent);
  if (prev) await fetch(`https://www.googleapis.com/drive/v3/files/${prev}?supportsAllDrives=true`,{method:'DELETE',headers:H});
  const meta = JSON.stringify({ name, parents:[parent] });
  const body = Buffer.concat([
    Buffer.from(`--pa\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--pa\r\nContent-Type: ${MIME[path.extname(name)]||'application/octet-stream'}\r\n\r\n`),
    fs.readFileSync(file), Buffer.from('\r\n--pa--\r\n')]);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
    {method:'POST', headers:{...H,'Content-Type':'multipart/related; boundary=pa'}, body});
  const j = await r.json(); if (!j.id) throw new Error(`${name}: ${JSON.stringify(j).slice(0,180)}`);
  return j.id;
}

const root = await folder(ROOT_NAME, PARENT);
console.log(`${ROOT_NAME}  ->  https://drive.google.com/drive/folders/${root}`);
let n = 0;
for (const [key, label] of Object.entries(SURFACE)) {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith(`-${key}.jpg`)).sort();
  if (!files.length) continue;
  const dir = await folder(label, root);
  for (const f of files) { await upload(path.join(SRC, f), dir); n++; }
  console.log(`  ${String(files.length).padStart(2)}  ${label}`);
}
await upload(path.join(SRC, 'REVIEW.html'), root);
await upload(path.join(SRC, '_manifest.json'), root);
console.log(`\n${n} graphics + review page uploaded.`);
