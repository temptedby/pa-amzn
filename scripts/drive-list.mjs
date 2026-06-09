/**
 * List Google Drive content visible to hello@phoneassured.com (drive.readonly).
 * Shows folders + a count of photos/videos so we can find the Phone Assured
 * content library. Share any folder with hello@phoneassured.com and it appears here.
 *
 * RUN: node scripts/drive-list.mjs   (or:  node scripts/drive-list.mjs "phone assured")
 */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }
  } catch {}
}
loadEnv();
const { GMAIL_CLIENT_ID: CID, GMAIL_CLIENT_SECRET: CS, GMAIL_REFRESH_TOKEN: RT } = process.env;
if (!CID || !CS || !RT) { console.error('Missing GMAIL_* in .env.local'); process.exit(1); }
const filter = process.argv[2];

const token = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: CID, client_secret: CS, refresh_token: RT, grant_type: 'refresh_token' }).toString(),
}).then(r => r.json()).then(j => j.access_token);

async function drive(params) {
  const u = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
    fields: 'files(id,name,mimeType,owners(emailAddress),modifiedTime,shared)', pageSize: '100', ...params,
  });
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!r.ok) throw new Error(`Drive ${r.status}: ${JSON.stringify(j)}`);
  return j.files || [];
}

try {
  const folderQ = "mimeType='application/vnd.google-apps.folder' and trashed=false" + (filter ? ` and name contains '${filter}'` : '');
  const folders = await drive({ q: folderQ, orderBy: 'modifiedTime desc' });
  console.log(`\nFolders visible (${folders.length}):`);
  for (const f of folders) console.log(`  📁 ${f.name}   — owner ${f.owners?.[0]?.emailAddress || '?'}   id=${f.id}`);

  const media = await drive({ q: "(mimeType contains 'image/' or mimeType contains 'video/') and trashed=false", orderBy: 'modifiedTime desc' });
  console.log(`\nPhotos/videos visible (showing up to 100): ${media.length}`);
  for (const m of media.slice(0, 25)) console.log(`  ${m.mimeType.startsWith('video') ? '🎬' : '🖼 '} ${m.name}   — ${m.owners?.[0]?.emailAddress || '?'}`);
  if (!folders.length && !media.length) {
    console.log('\nNothing shared yet. In Drive, share the Phone Assured folder with hello@phoneassured.com (Viewer), then rerun.');
  }
} catch (e) {
  if (/SERVICE_DISABLED|has not been used/.test(e.message)) {
    console.error('\nGoogle Drive API is not enabled yet. Click Enable on the Drive tab, wait ~1 min, rerun.');
  } else console.error('\nError:', e.message);
  process.exit(1);
}
