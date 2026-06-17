/** Open Seller Central (CA) headed; William logs in (we never touch credentials);
 *  then read Account Health + any verification notice to discover the Canada requirement.
 *  RUN: node scripts/seller-central-canada.mjs */
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = join(ROOT, '.pw-sc-profile');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: { width: 1440, height: 960 } });
const page = ctx.pages()[0] || await ctx.newPage();
console.log('>>> A browser window is opening. LOG IN there (your password/2FA stay in the window).');
console.log('>>> If you can, click to Account Health or the Canada verification banner. I will read it.');
await page.goto('https://sellercentral.amazon.ca/home', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

// Wait for login: poll until we're on a sellercentral page (not a signin/ap page). Up to ~12 min.
let loggedIn = false;
for (let i = 0; i < 140; i++) {
  await sleep(5000);
  const u = page.url();
  const onSignin = /\/ap\/|signin|\/login/i.test(u);
  if (!onSignin && /sellercentral\.amazon\.(ca|com)/i.test(u)) { loggedIn = true; console.log('login detected:', u.slice(0, 70)); break; }
  if (i % 6 === 0) console.log('  waiting for login...', u.slice(0, 60));
}
if (!loggedIn) { console.log('did not detect login in time — leaving the window open, rerun when logged in.'); await sleep(120000); }

// Select the CANADA marketplace in the account switcher (pages 404 until a marketplace is chosen).
async function selectCanada() {
  for (let tries = 0; tries < 3; tries++) {
    if (!/account-switcher/i.test(page.url())) {
      await page.goto('https://sellercentral.amazon.ca/account-switcher/default/merchantMarketplace?returnTo=%2Fhome', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await sleep(2500);
    }
    try {
      await page.getByText('Canada', { exact: true }).first().click({ timeout: 8000 });
      await sleep(1000);
      await page.getByRole('button', { name: /Select account/i }).click({ timeout: 8000 });
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await sleep(5000);
      console.log('selected Canada + confirmed ->', page.url().slice(0, 70));
      if (!/account-switcher/i.test(page.url())) return true;
    } catch (e) { console.log('Canada select attempt', tries, 'failed:', e.message.slice(0, 60)); }
  }
  return false;
}
await selectCanada();

const out = [];
async function grab(label, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(5000);
    if (/account-switcher/i.test(page.url())) { await selectCanada(); await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await sleep(4000); }
    const text = await page.evaluate(() => document.body.innerText.replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n'));
    out.push(`\n##### ${label} :: ${page.url()} #####\n` + text.slice(0, 5500));
    await page.screenshot({ path: `/tmp/sc-${label}.png`, fullPage: true }).catch(() => {});
  } catch (e) { out.push(`\n##### ${label} ERROR: ${e.message}`); }
}

await grab('CA-home', 'https://sellercentral.amazon.ca/home');
await grab('CA-account-health', 'https://sellercentral.amazon.ca/performance/dashboard');
await grab('CA-account-health2', 'https://sellercentral.amazon.ca/account-health/dashboard');
await grab('CA-account-info', 'https://sellercentral.amazon.ca/account/info');
await grab('CA-announcements', 'https://sellercentral.amazon.ca/notifications/announcements');

// READ-ONLY: drive into the Identity Information page to see the ADDRESS AMAZON HAS ON FILE. No submitting.
async function grabHere(label) {
  const t = await page.evaluate(() => document.body.innerText.replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n'));
  out.push(`\n##### ${label} :: ${page.url()} #####\n` + t.slice(0, 7000));
  await page.screenshot({ path: `/tmp/sc-${label}.png`, fullPage: true }).catch(() => {});
}
try {
  await page.goto('https://sellercentral.amazon.ca/performance/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(4000);
  try { await page.getByText(/Canada identity verification/i).first().click({ timeout: 6000 }); await sleep(2500); } catch {}
  let nav = false;
  for (const name of [/Visit the Identity Information page/i, /Submit your information/i, /Identity Information page/i, /Submit your identity/i, /Reactivate now/i]) {
    try { await page.getByText(name).first().click({ timeout: 5000 }); nav = true; await sleep(8000); break; } catch {}
  }
  console.log('identity nav click:', nav, '->', page.url().slice(0, 70));
  await grabHere('identity-info');
  const pages = ctx.pages();
  if (pages.length > 1) {
    const np = pages[pages.length - 1];
    await np.bringToFront().catch(() => {}); await sleep(3000);
    const t = await np.evaluate(() => document.body.innerText.replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n'));
    out.push(`\n##### IDENTITY NEW TAB :: ${np.url()} #####\n` + t.slice(0, 7000));
    await np.screenshot({ path: '/tmp/sc-identity-newtab.png', fullPage: true }).catch(() => {});
  }
} catch (e) { out.push('\n##### IDENTITY CAPTURE ERROR: ' + e.message); }
// also try the business-info settings (address on file)
for (const [lbl, url] of [['settings-biz', 'https://sellercentral.amazon.ca/account/setup/business-information'], ['legal-entity', 'https://sellercentral.amazon.ca/tax/legal-entity']]) {
  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }); await sleep(4000); if (!/Not found|Page not found/i.test(await page.evaluate(() => document.body.innerText.slice(0, 200)))) await grabHere(lbl); } catch {}
}

console.log('\n================ CAPTURED PAGE TEXT ================');
console.log(out.join('\n'));
console.log('\n(screenshots saved to /tmp/sc-*.png) — leaving window open 90s.');
await sleep(90000);
await ctx.close();
