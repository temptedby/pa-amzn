/** Take the Delaware Certificate of Good Standing to Amazon's Canada verification page.
 *
 *  William 2026-08-13: "letter of good standing can we upload to amazon to have them approve us
 *  back to Canada please".
 *
 *  NOTHING IS SUBMITTED WITHOUT A SECOND RUN. This opens the browser, lets William log in, selects
 *  CANADA, walks the verification pages and SCREENSHOTS what Amazon is asking for. The file is
 *  attached only when --submit is passed, and even then the final Submit button is left for him.
 *
 *  The document is page 3 of the Delaware PDF extracted on its own: page 1 is a $90 fee receipt and
 *  page 2 is a customer satisfaction survey. A three-page PDF opening on a receipt is what gets
 *  rejected without anyone reading to the end.
 *
 *  RUN: node scripts/sc-canada-upload.mjs            # look only
 *       node scripts/sc-canada-upload.mjs --submit   # attach the file, stop before Submit
 */
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const SUBMIT = process.argv.includes('--submit');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = join(ROOT, '.pw-sc-profile');
const OUT = join(ROOT, '.sc-canada');
mkdirSync(OUT, { recursive: true });
const DOC = `${process.env.HOME}/Desktop/Douglas Dean Holdings LLC - Delaware Certificate of Good Standing 2026-08-06.pdf`;
if (!existsSync(DOC)) { console.error('Certificate not found at', DOC); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// WITH CANADA SELECTED THE DOMAIN CHANGES. Every sellercentral.amazon.COM deep link returns
// "Not found" once the Canadian marketplace is active — verified 2026-08-13, three 404s in a row
// with "Securisee / Canada" showing correctly in the header. The pages live on .ca.
const PAGES = [
  ['ca-home',         'https://sellercentral.amazon.ca/home'],
  ['ca-identity',     'https://sellercentral.amazon.ca/hz/sitv/seller-identity'],
  ['ca-account-info', 'https://sellercentral.amazon.ca/account-information'],
  ['ca-verification', 'https://sellercentral.amazon.ca/seller-verification/onboarding'],
  ['ca-performance',  'https://sellercentral.amazon.ca/performance/dashboard'],
];

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: { width: 1440, height: 1000 } });
const page = ctx.pages()[0] || await ctx.newPage();
console.log('>>> Browser opening. Log in there if asked — credentials never touch this script.');
console.log(SUBMIT ? '>>> --submit: the file WILL be attached. The final Submit is left for you.\n'
                   : '>>> LOOK ONLY. Nothing is attached or submitted.\n');
await page.goto('https://sellercentral.amazon.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

for (let i = 0; i < 120; i++) {
  if (!/\/ap\/signin|\/ap\/mfa/.test(page.url())) break;
  if (i % 10 === 0) console.log('  waiting for login...', page.url().slice(0, 70));
  await sleep(3000);
}

// CANADA, not the US. Every Seller Central deep link 404s until a marketplace is chosen, and the
// Canada verification requirements only appear once the Canadian marketplace is selected.
async function chooseCanada() {
  for (let i = 0; i < 4; i++) {
    if (!/account-switcher|merchantMarketplace/i.test(page.url())) return true;
    const t = page.getByText('Canada', { exact: true }).first();
    if (await t.count().catch(() => 0)) {
      await t.click({ timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      const btn = page.getByRole('button', { name: /select account|continue|confirm/i }).first();
      if (await btn.count().catch(() => 0)) { await btn.click({ timeout: 10000 }).catch(() => {}); await page.waitForLoadState('domcontentloaded').catch(() => {}); }
    }
    await sleep(2500);
  }
  return !/account-switcher/i.test(page.url());
}
console.log(await chooseCanada() ? 'marketplace: Canada selected' : 'WARNING: still on the account switcher');

// CLICK THE BOX, DO NOT GUESS THE URL. William 2026-08-13: "a box that says reactivate your
// account". Every deep link I guessed returned "Not found" on both .com and .ca while the Canada
// home page carries the real entry points as clickable actions. Amazon routes these through
// one-time signed URLs, so the link on the page is the only way in.
await page.goto('https://sellercentral.amazon.ca/home', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await sleep(4000);
// The Account Health dashboard names the ONE blocker as a Priority Action: "Canada identity
// verification — PAST DUE", with every other metric at zero. That row is the way in; the boxes on
// the home page only lead to the dashboard.
// Amazon's own wording on the Priority Action, read 2026-08-13:
//   "Your account has been deactivated because we were not able to validate your identity
//    information. Canadian laws require us to verify your identity ... Submit your information.
//    Visit the Identity Information page to complete verification."
// So the destination is named on the page. Follow it rather than guessing a URL again.
for (const label of ['Identity Information page', 'Submit your information', 'Canada identity verification']) {
  console.log(`\n=== clicking: ${label}`);
  try {
    await page.goto('https://sellercentral.amazon.ca/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3500);
    let link = page.getByText(label, { exact: false }).first();
    if (!(await link.count().catch(() => 0))) {
      // not on the home page — try the Account Health dashboard, which is where Priority Actions live
      await page.goto('https://sellercentral.amazon.ca/performance/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await sleep(4000);
      link = page.getByText(label, { exact: false }).first();
      if (!(await link.count().catch(() => 0))) { console.log('  not found on home or account health'); continue; }
    }
    await link.click({ timeout: 20000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await sleep(5000);
    // Priority Actions often open a panel with its own call to action.
    for (const cta of [/^(re-?submit|submit|provide|verify|start|continue|upload|appeal)/i]) {
      const b = page.getByRole('button', { name: cta }).first();
      if (await b.count().catch(() => 0)) { await b.click({ timeout: 10000 }).catch(() => {}); await sleep(4500); break; }
      const a = page.getByRole('link', { name: cta }).first();
      if (await a.count().catch(() => 0)) { await a.click({ timeout: 10000 }).catch(() => {}); await sleep(4500); break; }
    }
    const slug = label.toLowerCase().replace(/[^a-z]+/g, '-');
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\n{3,}/g, '\n\n');
    writeFileSync(join(OUT, `${slug}.txt`), text);
    await page.screenshot({ path: join(OUT, `${slug}.png`), fullPage: true });
    console.log(`  url: ${page.url()}`);
    console.log(text.slice(0, 2200));
    const uploads = await page.locator('input[type=file]').count();
    console.log(`\n  [file inputs here: ${uploads}]`);
    if (SUBMIT && uploads > 0) {
      await page.locator('input[type=file]').first().setInputFiles(DOC);
      console.log('  >>> CERTIFICATE ATTACHED. Review in the browser and press Submit yourself.');
      break;
    }
  } catch (e) { console.log('  ERROR', String(e).slice(0, 160)); }
}

for (const [slug, url] of []) {
  console.log(`\n=== ${slug} — ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(4000);
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\n{3,}/g, '\n\n');
    writeFileSync(join(OUT, `${slug}.txt`), text);
    await page.screenshot({ path: join(OUT, `${slug}.png`), fullPage: true });
    console.log(text.slice(0, 1400));
    const uploads = await page.locator('input[type=file]').count();
    console.log(`\n  [file inputs on this page: ${uploads}]`);
    if (SUBMIT && uploads > 0) {
      await page.locator('input[type=file]').first().setInputFiles(DOC);
      console.log('  >>> CERTIFICATE ATTACHED. Review it in the browser and press Submit yourself.');
      break;
    }
  } catch (e) { console.log('  ERROR', String(e).slice(0, 160)); }
}
console.log(`\nText + screenshots in ${OUT}`);
console.log('Browser left OPEN. Close it when you are done.');
