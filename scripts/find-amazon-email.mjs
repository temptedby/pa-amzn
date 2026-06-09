/**
 * Read Amazon's emails from the hello@phoneassured.com inbox via the Gmail API.
 * Use this to pull the Ads API rejection notice, approvals, and verification
 * requests Amazon sends to the seller account.
 *
 * PREREQUISITE: run scripts/gmail-auth-setup.mjs first and put the printed
 * GMAIL_REFRESH_TOKEN into .env.local (alongside GMAIL_CLIENT_ID / _SECRET).
 *
 * RUN:
 *   node scripts/find-amazon-email.mjs                 # default: Amazon advertising/API mail, last 200 days
 *   node scripts/find-amazon-email.mjs "from:amazon.com newer_than:30d"   # custom Gmail search
 */

import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {
    /* rely on real env */
  }
}

loadEnvLocal();
const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;

if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
  console.error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN in .env.local.');
  console.error('Run scripts/gmail-auth-setup.mjs first.');
  process.exit(1);
}

// Default query: anything from Amazon touching advertising / API / registration.
const DEFAULT_QUERY =
  '(from:amazon.com OR from:advertising-api-support@amazon.com OR from:no-reply@amazon.com) ' +
  '(advertising OR API OR registration OR application OR address OR verification) newer_than:200d';
const query = process.argv[2] || DEFAULT_QUERY;
const MAX = Number(process.env.MAX_MESSAGES) || 15;

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

function gmail(token, path) {
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(`Gmail ${path} -> ${r.status}: ${JSON.stringify(j)}`);
    return j;
  });
}

const b64urlDecode = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

// Walk the MIME tree, prefer text/plain, fall back to a crude HTML strip.
function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return b64urlDecode(payload.body.data);
  if (payload.parts) {
    for (const p of payload.parts) {
      const t = extractBody(p);
      if (t) return t;
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return b64urlDecode(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  }
  return '';
}

const header = (msg, name) =>
  msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

(async () => {
  const token = await accessToken();
  console.log(`\nSearching hello@phoneassured.com for:\n  ${query}\n`);

  const list = await gmail(token, `/messages?q=${encodeURIComponent(query)}&maxResults=${MAX}`);
  const ids = list.messages || [];
  if (ids.length === 0) {
    console.log('No matching Amazon emails found. Try a broader query, e.g.:');
    console.log('  node scripts/find-amazon-email.mjs "from:amazon.com newer_than:365d"');
    return;
  }

  console.log(`Found ${ids.length} message(s). Newest first:\n${'='.repeat(72)}`);
  for (const { id } of ids) {
    const msg = await gmail(token, `/messages/${id}?format=full`);
    const from = header(msg, 'From');
    const subject = header(msg, 'Subject');
    const date = header(msg, 'Date');
    const body = extractBody(msg.payload).trim().slice(0, 4000);
    console.log(`\nFrom:    ${from}`);
    console.log(`Date:    ${date}`);
    console.log(`Subject: ${subject}`);
    console.log(`\n${body}\n${'='.repeat(72)}`);
  }
})().catch((e) => {
  console.error('\nError:', e.message);
  process.exit(1);
});
