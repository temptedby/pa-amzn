/**
 * Parse an Amex CSV and summarize Feb-May 2026 charges into Ad Spend vs Other
 * Expenses (for the Flippa P&L columns F + G). Read-only; prints for review.
 * RUN: node scripts/parse-amex.mjs "/path/to/amex.csv"
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('pass the CSV path'); process.exit(1); }
const text = readFileSync(file, 'utf8');

// Quote-aware CSV parser (handles commas + newlines inside quoted fields).
function parseCSV(t) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(text);
const head = rows[0].map((h) => h.trim());
const ix = (n) => head.findIndex((h) => h.toLowerCase() === n.toLowerCase());
const di = ix('Date'), ai = ix('Amount'), ci = ix('Category'), de = ix('Description'), ext = ix('Extended Details');

const MONTHS = { '02': 'February 2026', '03': 'March 2026', '04': 'April 2026', '05': 'May 2026' };
const isAd = (s) => /advertis|amzn adv|amazon adv|sponsored/i.test(s);

const sum = {}; // month -> {ad, other, items:[]}
for (const r of rows.slice(1)) {
  if (!r[di]) continue;
  const m = r[di].match(/^(\d{2})\/(\d{2})\/(2026)$/);
  if (!m || !MONTHS[m[1]]) continue;
  const amt = parseFloat((r[ai] || '0').replace(/[$,]/g, ''));
  if (!(amt > 0)) continue; // skip payments/credits (negative) — not expenses
  const month = MONTHS[m[1]];
  const ad = isAd(`${r[de]} ${r[ext]} ${r[ci]}`);
  sum[month] = sum[month] || { ad: 0, other: 0, items: [] };
  sum[month][ad ? 'ad' : 'other'] += amt;
  sum[month].items.push({ date: r[di], amt, bucket: ad ? 'AD' : 'OTHER', desc: (r[de] || '').slice(0, 34), cat: (r[ci] || '').slice(0, 28) });
}

const f = (n) => `$${n.toFixed(2)}`;
for (const month of Object.values(MONTHS)) {
  const s = sum[month]; if (!s) { console.log(`\n${month}: (no charges)`); continue; }
  console.log(`\n===== ${month} =====  Ad Spend(F): ${f(s.ad)}   Other Expenses(G): ${f(s.other)}   [${s.items.length} charges]`);
  for (const it of s.items.sort((a, b) => a.date.localeCompare(b.date)))
    console.log(`  ${it.date}  ${it.bucket.padEnd(5)} ${f(it.amt).padStart(10)}  ${it.desc.padEnd(34)} | ${it.cat}`);
}
console.log('\n(Amex only. PNC + Amazon fees/revenue come separately. Review the AD vs OTHER split.)');
