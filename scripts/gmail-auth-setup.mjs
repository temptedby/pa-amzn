/**
 * One-time Gmail OAuth setup — mints a long-lived refresh token for the
 * hello@phoneassured.com inbox so PA-AMZN can read Amazon's emails (rejection
 * notices, approvals, verification requests) on its own.
 *
 * Mirrors the DES/Social Scene pattern (raw OAuth + Gmail REST, no SDK), but
 * scoped to a SINGLE mailbox with READ-ONLY access (least privilege — we only
 * read Amazon mail, never send). The refresh token is printed once for you to
 * paste into .env.local as GMAIL_REFRESH_TOKEN, exactly like SP_API_REFRESH_TOKEN.
 *
 * PREREQUISITE (Google Cloud console, ~10 min, dedicated to PA-AMZN):
 *   1. console.cloud.google.com → create project "phone-assured" (sign in as hello@phoneassured.com).
 *   2. APIs & Services → Library → enable "Gmail API".
 *   3. APIs & Services → OAuth consent screen → User type "Internal" (you own the
 *      phoneassured.com Workspace, so Internal needs no Google verification).
 *   4. Credentials → Create credentials → OAuth client ID → Application type
 *      "Desktop app". Name it "PA-AMZN inbox reader".
 *   5. Copy the Client ID + Client secret into .env.local:
 *        GMAIL_CLIENT_ID=...
 *        GMAIL_CLIENT_SECRET=...
 *
 * RUN:
 *   node scripts/gmail-auth-setup.mjs
 *   → opens a Google consent URL; sign in as hello@phoneassured.com, approve.
 *   → the script prints GMAIL_REFRESH_TOKEN=... for you to add to .env.local.
 */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

// Desktop OAuth clients register the bare loopback `http://localhost`; Google
// ignores the port but matches the rest, so use a path-less redirect (no
// `/oauth2callback`) to avoid an "Access blocked / redirect_uri_mismatch".
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}`;
// Broadened from gmail.readonly to cover the new workstreams (one re-consent):
//   gmail.modify  — read + archive/trash for inbox cleanup (can't permanently delete; safe)
//   drive.readonly — read Phone Assured photos/videos for content
//   spreadsheets   — the Flippa company-sale financials sheet
//   calendar       — scheduling
const SCOPE = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar',
].join(' ');
const LOGIN_HINT = 'hello@phoneassured.com';

// Minimal .env.local loader (this repo has no dotenv; matches its zero-dep style).
function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env.local — rely on real env */
  }
}

loadEnvLocal();
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in .env.local.');
  console.error('Complete the Google Cloud console steps in this file\'s header first.');
  process.exit(1);
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // needed to receive a refresh_token
    prompt: 'consent',      // force a refresh_token even on re-auth
    login_hint: LOGIN_HINT,
  }).toString();

console.log('\n1. Open this URL in your browser and sign in as hello@phoneassured.com:\n');
console.log(authUrl + '\n');
console.log('2. After you approve, this script will catch the redirect and print the token.\n');

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, REDIRECT_URI);
  const code = reqUrl.searchParams.get('code');
  const err = reqUrl.searchParams.get('error');
  // Ignore stray requests (e.g. favicon) that carry neither code nor error.
  if (!code && !err) {
    res.writeHead(404).end();
    return;
  }
  if (err || !code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(`OAuth error: ${err || 'no code returned'}`);
    console.error(`\nOAuth failed: ${err || 'no code'}`);
    server.close();
    process.exit(1);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const body = await tokenRes.json();
    if (!tokenRes.ok || !body.refresh_token) {
      throw new Error(JSON.stringify(body));
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Done. Refresh token captured — return to the terminal and close this tab.');

    console.log('\nSuccess. Add this line to .env.local (and to Vercel env for prod):\n');
    console.log(`GMAIL_REFRESH_TOKEN=${body.refresh_token}\n`);
    console.log('Then run: node scripts/find-amazon-email.mjs\n');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Token exchange failed — see terminal.');
    console.error('\nToken exchange failed:', e.message);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORT, () => {
  console.log(`Waiting for Google redirect on ${REDIRECT_URI} ...`);
});
