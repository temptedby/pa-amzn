/**
 * Inbox cleaner for hello@phoneassured.com.
 *
 * Goal: keep the inbox to messages that need a human (real people, action-required
 * notifications) and archive the repeated automated noise (shipment/FBA/payment
 * notifications, marketing). Archiving removes the INBOX label only — messages stay
 * in All Mail and are fully recoverable. It NEVER deletes.
 *
 * Modes (env MODE):
 *   survey (default) — read the whole inbox, group by sender, print composition.
 *   dry              — list exactly what WOULD be archived (no changes).
 *   live             — archive the matches (removes INBOX label).
 *
 * RUN:
 *   node scripts/inbox-clean.mjs                 # survey
 *   MODE=dry  node scripts/inbox-clean.mjs       # preview archive
 *   MODE=live node scripts/inbox-clean.mjs       # do it
 *
 * Needs GMAIL_* in .env.local with gmail.modify scope (rerun gmail-auth-setup.mjs).
 */

import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();
const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
  console.error('Missing GMAIL_* in .env.local'); process.exit(1);
}
const MODE = process.env.MODE || 'survey';
const MAX = Number(process.env.MAX) || 1500;

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString(),
  });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j.access_token;
}
const api = (token, path, init) => fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
  ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
}).then(async r => {
  const text = await r.text();                 // batchModify returns empty body on success
  if (!r.ok) throw new Error(`${path} ${r.status}: ${text}`);
  return text ? JSON.parse(text) : {};
});

async function listInbox(token) {
  const ids = []; let pageToken; let est = 0;
  do {
    const q = new URLSearchParams({ q: 'in:inbox', maxResults: '500' });
    if (pageToken) q.set('pageToken', pageToken);
    const page = await api(token, `/messages?${q}`);
    est = page.resultSizeEstimate || est;
    (page.messages || []).forEach(m => ids.push(m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < MAX);
  return { ids: ids.slice(0, MAX), est };
}

const header = (m, n) => m.payload?.headers?.find(h => h.name.toLowerCase() === n)?.value || '';
const emailOf = (from) => (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();

async function pMap(items, fn, conc = 20) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx).catch(() => null); }
  }));
  return out;
}

// ── Classification (Gmail-category based) ───────────────────────────────────
// Keep Primary/personal + anything actionable; archive Promotions/Social/Updates
// (newsletters + automated notifications). KEEP always wins over ARCHIVE.
const KEEP_SUBJECT = /(action required|verif|suspend|deactivat|appeal|reinstat|rejected|approv|pending|invoice|tax\b|chargeback|a-to-z|\bclaim\b|dispute|account health|policy warning|password|security alert|sign-?in|unusual activity|confirm your|verify your)/i;
const KEEP_SENDER = /(amzn-clicks\.atlassian\.net|advertising-api-support|seller-?performance|payments-messages|@phoneassured\.com|dev-reg-vetting@amazon\.com|@fbareviews\.com|@xwf\.google\.com|comments-noreply@docs\.google\.com|nfe-auto@|@marketplace\.amazon\.com|@sellercentral\.amazon\.com)/i;
// Buyer-seller (customer) messages must stay in the inbox.
const KEEP_CUSTOMER = /(a message from|buyer message|order .*inquiry|return request|customer (message|inquiry))/i;
// Real humans at services we care about (named reps), even if Gmail bucketed them.
const HUMAN_SENDER = (from) => /@flippa\.com/.test(from) && !/(marketing|dealdesk|support|no-?reply|notifications?)@/.test(from);

function classify(from, subject, labels = []) {
  // Actionable or human → always keep.
  if (KEEP_SENDER.test(from) || HUMAN_SENDER(from) || KEEP_SUBJECT.test(subject) || KEEP_CUSTOMER.test(subject)) return 'keep';
  const L = new Set(labels);
  // Gmail's own buckets for bulk/marketing/social/automated-update mail.
  if (L.has('CATEGORY_PROMOTIONS') || L.has('CATEGORY_SOCIAL') || L.has('CATEGORY_FORUMS') || L.has('CATEGORY_UPDATES')) return 'archive';
  return 'keep'; // Primary / personal
}

// ── Run ───────────────────────────────────────────────────────────────────
const token = await accessToken();
console.log(`Mode: ${MODE}. Scanning inbox…`);
const { ids, est } = await listInbox(token);
console.log(`Inbox: ~${est} messages, scanning ${ids.length}.`);

const metas = (await pMap(ids, async (id) => {
  const m = await api(token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
  return { id, from: header(m, 'from'), subject: header(m, 'subject'), labels: m.labelIds || [] };
})).filter(Boolean);

if (MODE === 'survey') {
  const bySender = new Map();
  for (const m of metas) {
    const e = emailOf(m.from);
    const r = bySender.get(e) || { count: 0, subjects: new Set(), verdict: classify(m.from, m.subject, m.labels) };
    r.count++; if (r.subjects.size < 3) r.subjects.add(m.subject.slice(0, 60));
    bySender.set(e, r);
  }
  const rows = [...bySender.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(`\n${rows.length} distinct senders. Top senders:\n`);
  for (const [email, r] of rows.slice(0, 40)) {
    console.log(`${String(r.count).padStart(4)}  [${r.verdict === 'archive' ? 'ARCHIVE' : 'keep  '}]  ${email}`);
    for (const s of r.subjects) console.log(`        · ${s}`);
  }
  const arch = metas.filter(m => classify(m.from, m.subject, m.labels) === 'archive').length;
  console.log(`\nWould archive ${arch} of ${metas.length} scanned (keep ${metas.length - arch}). Run MODE=dry for the full list.`);
} else {
  const toArchive = metas.filter(m => classify(m.from, m.subject, m.labels) === 'archive');
  console.log(`\n${toArchive.length} message(s) match archive rules:`);
  const grouped = new Map();
  for (const m of toArchive) { const e = emailOf(m.from); grouped.set(e, (grouped.get(e) || 0) + 1); }
  for (const [e, c] of [...grouped.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(4)}  ${e}`);

  if (MODE === 'live') {
    const ids2 = toArchive.map(m => m.id);
    for (let i = 0; i < ids2.length; i += 1000) {
      await api(token, '/messages/batchModify', { method: 'POST', body: JSON.stringify({ ids: ids2.slice(i, i + 1000), removeLabelIds: ['INBOX'] }) });
    }
    console.log(`\n✅ Archived ${ids2.length} messages (removed from inbox; still in All Mail).`);
  } else {
    console.log(`\nDRY RUN — nothing changed. Run MODE=live node scripts/inbox-clean.mjs to archive these.`);
  }
}
