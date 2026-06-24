/** Open Seller Central Date Range Reports in William's logged-in session, capture state.
 *  Read-only: navigates, screenshots, and lists any existing generated reports so we can
 *  pull lifetime sales+units directly (this source reaches account inception).
 *  RUN: node scripts/pw-date-range.mjs */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROFILE = join(ROOT, '.pw-sc-profile');
const SHOT = join(ROOT, 'confabulator', 'date-range-reports.png');

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: { width: 1500, height: 1000 } });
const page = ctx.pages()[0] || await ctx.newPage();
console.log('navigating to Date Range Reports...');
await page.goto('https://sellercentral.amazon.com/reportcentral/DateRangeReports/0', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('nav warn:', e.message));
await page.waitForTimeout(6000);
const url = page.url();
const title = await page.title().catch(() => '');
const bodyText = (await page.evaluate(() => document.body?.innerText?.slice(0, 1500) || '').catch(() => '')) || '';
const signedIn = !/ap\/signin|sign[- ]?in/i.test(url) && !/password/i.test(bodyText);
await page.screenshot({ path: SHOT, fullPage: false }).catch(() => {});
console.log('URL:', url);
console.log('TITLE:', title);
console.log('SIGNED IN:', signedIn);
console.log('--- visible text (first 1500) ---');
console.log(bodyText);
console.log('--- screenshot:', SHOT, '---');
console.log('\n(leaving browser OPEN for inspection; close it manually when done)');
// keep open
await new Promise(() => {});
