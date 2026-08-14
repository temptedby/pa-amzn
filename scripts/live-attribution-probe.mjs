/**
 * CBC probe: can we actually READ per-tag Attribution performance?
 *
 * This is the gate on the affiliate programme. If we cannot see what a partner
 * sold, we cannot pay a partner. Read-only: lists advertisers/publishers and
 * requests a PERFORMANCE report. Writes nothing.
 *
 * RUN: node scripts/live-attribution-probe.mjs
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

const { ADS_CLIENT_ID: CID, ADS_CLIENT_SECRET: CS, ADS_REFRESH_TOKEN: RT, ADS_PROFILE_ID: PROFILE } = process.env;
if (!CID || !CS || !RT) { console.error('Missing ADS_* in .env.local'); process.exit(1); }
const HOST = 'https://advertising-api.amazon.com';

const tok = await fetch('https://api.amazon.com/auth/o2/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: RT, client_id: CID, client_secret: CS }).toString(),
}).then(r => r.json());
if (!tok.access_token) { console.error('token failed:', JSON.stringify(tok).slice(0, 300)); process.exit(1); }
console.log('LWA token: ok');

const H = {
  Authorization: `Bearer ${tok.access_token}`,
  'Amazon-Advertising-API-ClientId': CID,
  'Amazon-Advertising-API-Scope': PROFILE,
  'Content-Type': 'application/json',
};

async function probe(label, path, init) {
  const res = await fetch(HOST + path, { headers: H, ...init });
  const text = await res.text();
  const ok = res.ok ? 'OK ' : '!! ';
  console.log(`\n${ok}${label}  ${res.status}`);
  console.log('   ' + text.slice(0, 600).replace(/\n/g, '\n   '));
  return { status: res.status, ok: res.ok, text };
}

// Verified working metric set 2026-08-08. NOTE: attributedTotalSales14d and the
// other *Total* metrics are REJECTED for reportType PERFORMANCE (400 Invalid metric).
const METRICS = 'Click-throughs,attributedDetailPageViewsClicks14d,attributedAddToCartClicks14d,attributedPurchases14d,attributedSales14d,unitsSold14d';

const d = (n) => { const t = new Date(Date.now() - n * 864e5); return t.toISOString().slice(0, 10).replace(/-/g, ''); };

await probe('GET /attribution/advertisers', '/attribution/advertisers');
await probe('GET /attribution/publishers', '/attribution/publishers');

// PERFORMANCE report, campaign grouping, last 30 days.
await probe('POST /attribution/report (PERFORMANCE)', '/attribution/report', {
  method: 'POST',
  body: JSON.stringify({
    reportType: 'PERFORMANCE',
    groupBy: 'CAMPAIGN',
    startDate: d(30),
    endDate: d(1),
    metrics: METRICS,
  }),
});

// CREATIVE grouping is the one that matters for the affiliate programme: it is
// per-TAG, so one tag per partner means one row per partner to pay against.
await probe('POST /attribution/report (PERFORMANCE, per-tag)', '/attribution/report', {
  method: 'POST',
  body: JSON.stringify({ reportType: 'PERFORMANCE', groupBy: 'CREATIVE', startDate: d(60), endDate: d(1), metrics: METRICS }),
});
