/** drive-upload.mjs — push finished creative into William's Drive folders.
 *
 *  Reads straight off disk, so file size is irrelevant — it carries 75 MB as easily as 75 KB.
 *
 *  THE KEY DETAIL, learned the expensive way on 2026-08-11: the service account must IMPERSONATE
 *  William via the `sub` claim (domain-wide delegation). Acting as ITSELF it can hold Editor on a
 *  folder and still 403 with "Service Accounts do not have storage quota", because whoever creates
 *  a file owns it and a service account has no quota in My Drive. Impersonating means WILLIAM owns
 *  the file, on his quota, and it just works. Granting more permissions never fixes this; only
 *  impersonation or a Shared Drive does.
 *
 *  RUN: node scripts/pacr/drive-upload.mjs
 */
import fs from 'node:fs'; import path from 'node:path'; import { createSign } from 'node:crypto';

const CREDS = '/Users/williamholdeman/projects/wdh-personal/secrets/google-writer.json';
const TARGETS = [
  { id: '1k_E69J8gN_urwVUa19BlxL1wczf6RJic', label: 'Graphics',
    files: [...fs.readdirSync('build/creative/aplus-evergreen').filter(f => f.endsWith('.jpg'))
              .map(f => `build/creative/aplus-evergreen/${f}`),
            ...fs.readdirSync('build/creative/testimonials').filter(f => f.endsWith('.jpg'))
              .map(f => `build/creative/testimonials/${f}`),
            'build/creative/DELIVER-2026-08-11/REVIEW - open me in a browser.html',
            'build/creative/DELIVER-2026-08-11/READ ME.txt'] },
  { id: '1sFvK2imyu69RU6oBoLLY2vRKSZ3isXSR', label: 'Video',
    files: [...fs.readdirSync('build/creative/video').filter(f=>/\.(mp4|jpg)$/.test(f))
              .map(f=>`build/creative/video/${f}`),
            ...fs.readdirSync('build/creative/testimonial-video').filter(f=>/\.mp4$/.test(f))
              .map(f=>`build/creative/testimonial-video/${f}`)] },
];

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const c = JSON.parse(fs.readFileSync(CREDS,'utf8')); const now = Math.floor(Date.now()/1000);
const IMPERSONATE = 'william@besocialscene.com';
const head = `${b64u(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${b64u(JSON.stringify({
  iss:c.client_email, sub:IMPERSONATE, scope:'https://www.googleapis.com/auth/drive',
  aud:'https://oauth2.googleapis.com/token', exp:now+3600, iat:now}))}`;
const TOK = (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:`grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${b64u(createSign('RSA-SHA256').update(head).sign(c.private_key))}`
}).then(r=>r.json())).access_token;
const H = { Authorization:`Bearer ${TOK}` };
const MIME = { '.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4','.html':'text/html','.md':'text/markdown','.txt':'text/plain' };

/** replace rather than duplicate, so re-running never litters the folder */
async function existing(name, parent) {
  const q = encodeURIComponent(`name='${name.replace(/'/g,"\\'")}' and '${parent}' in parents and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true`,{headers:H});
  return ((await r.json()).files || [])[0]?.id;
}

for (const t of TARGETS) {
  const chk = await fetch(`https://www.googleapis.com/drive/v3/files/${t.id}?fields=capabilities(canAddChildren)&supportsAllDrives=true`,{headers:H});
  const can = chk.status === 200 && (await chk.json()).capabilities?.canAddChildren;
  console.log(`\n${t.label}  ${can ? '' : '— NOT WRITABLE (shared as Viewer, needs Editor). Skipping.'}`);
  if (!can) continue;
  for (const f of t.files) {
    if (!fs.existsSync(f)) { console.log(`    MISSING ${f}`); continue; }
    const name = path.basename(f).replace(/^_/, '');
    const old = await existing(name, t.id);
    if (old) await fetch(`https://www.googleapis.com/drive/v3/files/${old}?supportsAllDrives=true`,{method:'DELETE',headers:H});
    const data = fs.readFileSync(f), B = '----paB';
    const body = Buffer.concat([
      Buffer.from(`--${B}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,parents:[t.id]})}\r\n--${B}\r\nContent-Type: ${MIME[path.extname(f).toLowerCase()]||'application/octet-stream'}\r\n\r\n`),
      data, Buffer.from(`\r\n--${B}--`)]);
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
      {method:'POST', headers:{...H,'Content-Type':`multipart/related; boundary=${B}`}, body});
    console.log(`    ${r.status===200?'ok  ':'FAIL'} ${name.padEnd(44)} ${(data.length/1048576).toFixed(2)} MB${r.status===200?'':'  '+JSON.stringify(await r.json()).slice(0,150)}`);
  }
}
