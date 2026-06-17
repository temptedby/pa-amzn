/** Open the Canada identity-verification form and LEAVE IT OPEN for William to submit inline.
 *  Reads the form so we can guide each field. Does NOT submit. RUN: node scripts/canada-verify-open.mjs */
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = join(ROOT, '.pw-sc-profile');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: { width: 1500, height: 1000 } });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://sellercentral.amazon.ca/performance/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await sleep(5000);

async function dump(label) {
  try {
    const t = await page.evaluate(() => document.body.innerText.replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n'));
    console.log(`\n##### ${label} :: ${page.url()} #####\n` + t.slice(0, 8000));
    await page.screenshot({ path: `/tmp/sc-${label}.png`, fullPage: true }).catch(() => {});
  } catch (e) { console.log(label, 'dump err', e.message); }
}

// open the Canada identity verification panel
try { await page.getByText(/Canada identity verification/i).first().click({ timeout: 8000 }); await sleep(2500); } catch (e) { console.log('panel open:', e.message.slice(0, 50)); }
// click Proceed to enter the form (try button, then the link)
let entered = false;
for (const sel of [() => page.getByRole('button', { name: /Proceed/i }).first(), () => page.getByText(/Identity information page/i).first(), () => page.getByText(/Submit your information/i).first()]) {
  try { await sel().click({ timeout: 6000 }); entered = true; await sleep(8000); break; } catch {}
}
console.log('entered form:', entered, '->', page.url());
// the form may open in a new tab
const all = ctx.pages();
const formPage = all[all.length - 1];
if (formPage !== page) { await formPage.bringToFront().catch(() => {}); await sleep(4000); const t = await formPage.evaluate(() => document.body.innerText.replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n')); console.log(`\n##### FORM (new tab) :: ${formPage.url()} #####\n` + t.slice(0, 8000)); await formPage.screenshot({ path: '/tmp/sc-verify-form.png', fullPage: true }).catch(() => {}); }
else await dump('verify-form');

console.log('\n>>> Browser left OPEN. Fill + submit in the window. I will guide each field. Closing in 30 min or when you close it.');
await sleep(1800000).catch(() => {});
await ctx.close().catch(() => {});
