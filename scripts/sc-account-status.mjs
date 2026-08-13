/** READ-ONLY. Opens Seller Central (US) headed so William logs in himself — we never see or store
 *  credentials — then reads the four pages behind the 2026-08-08 email backlog and prints what
 *  Amazon currently has on file.
 *
 *  It answers the question blocking everything else: WHICH LEGAL ENTITY and WHICH ADDRESS does
 *  Seller Central hold? The PNC statement William supplied is for DOUGLAS DEAN HOLDINGS LLC at
 *  STE 162, 730 W LAKE ST, CHICAGO IL 60661-1010, while Amazon addresses the business as
 *  "Securisee". If those disagree, no amount of re-uploading that statement can ever verify the
 *  bank account.
 *
 *  NOTHING IS SUBMITTED, CHANGED OR UPLOADED. It reads text and screenshots. Every fix is left
 *  for William to make by hand.
 *
 *  RUN: node scripts/sc-account-status.mjs
 */
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = join(ROOT, '.pw-sc-profile');
const OUT = process.env.SC_OUT_DIR || join(ROOT, '.sc-status');
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGES = [
  ['account-info',   'https://sellercentral.amazon.com/account-information',            'legal entity, business address, primary contact'],
  ['account-health', 'https://sellercentral.amazon.com/performance/dashboard?ref=ah_em','INFORM certification + any deactivation notice'],
  ['deposit',        'https://sellercentral.amazon.com/payments/deposit-methods',       'deposit method + bank verification state'],
  ['identity',       'https://sellercentral.amazon.com/hz/sitv/seller-identity',        'identity verification status + what is flagged red'],
];

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: { width: 1440, height: 1000 } });
const page = ctx.pages()[0] || await ctx.newPage();
console.log('>>> A browser window is opening. LOG IN there. Your password and 2FA stay in that window.');
console.log('>>> This script only READS. It submits nothing and changes nothing.\n');
await page.goto('https://sellercentral.amazon.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

let loggedIn = false;
for (let i = 0; i < 160; i++) {
  await sleep(5000);
  const u = page.url();
  if (!/\/ap\/|signin|\/login/i.test(u) && /sellercentral\.amazon\.com/i.test(u)) {
    loggedIn = true; console.log('login detected:', u.slice(0, 80)); break;
  }
  if (i % 6 === 0) console.log('  waiting for login...', u.slice(0, 60));
}
if (!loggedIn) { console.log('never reached a logged-in Seller Central page; stopping.'); await ctx.close(); process.exit(0); }

const clean = t => t.replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const report = [];
// THE ACCOUNT SWITCHER, added 2026-08-13 after a run returned "Not Found" on all four pages.
// Amazon parks a multi-marketplace seller on /account-switcher after login, and every Seller
// Central deep link 404s until a marketplace is chosen. The script used to navigate straight past
// it and report four Not Founds, which reads like a broken URL and is really an unchosen account.
async function chooseUS() {
  for (let i = 0; i < 3; i++) {
    const u = page.url();
    if (!/account-switcher|merchantMarketplace/i.test(u)) return true;
    // The marketplace list is a set of clickable rows; "United States" is the one we want.
    const target = page.getByText('United States', { exact: true }).first();
    if (await target.count().catch(() => 0)) {
      await target.click({ timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      const btn = page.getByRole('button', { name: /select account|continue|confirm/i }).first();
      if (await btn.count().catch(() => 0)) {
        await btn.click({ timeout: 10000 }).catch(() => {});
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      }
    }
    await page.waitForTimeout(2500);
  }
  return !/account-switcher/i.test(page.url());
}
const onUS = await chooseUS();
console.log(onUS ? 'marketplace: United States selected' : 'WARNING: still on the account switcher — pages will 404');

for (const [slug, url, what] of PAGES) {
  console.log(`\n=== ${slug} — ${what} ===`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);                                   // let the SPA settle
    const text = clean(await page.evaluate(() => document.body?.innerText || ''));
    await page.screenshot({ path: join(OUT, `${slug}.png`), fullPage: true }).catch(() => {});
    writeFileSync(join(OUT, `${slug}.txt`), `URL: ${page.url()}\n\n${text}`);
    console.log(text.slice(0, 1800) || '(no text read)');
    report.push({ slug, url: page.url(), chars: text.length });
  } catch (e) {
    console.log('  could not read:', e.message.slice(0, 120));
    report.push({ slug, url, error: e.message.slice(0, 120) });
  }
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(report, null, 2));
console.log(`\nSaved text + full-page screenshots to ${OUT}`);
console.log('Browser left OPEN so you can fix anything in place. Close it when done.');
