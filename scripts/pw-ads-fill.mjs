/**
 * Fill (and submit) the Amazon Ads API Direct Advertiser application as
 * Phone Assured. Reuses the persisted login in .pw-profile (you signed in
 * during the inspect pass). Fills every field, verifies each value read back
 * correctly, screenshots, and only clicks "Submit for review" if everything
 * validates. Leaves the browser open so you can see the result.
 *
 * RUN: node scripts/pw-ads-fill.mjs
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://advertising.amazon.com/partner-network/register-api?ref_=a20m_us_api_drctad';
const PROFILE = join(ROOT, '.pw-profile');
const SHOT_BEFORE = join(ROOT, 'scripts', 'pw-ads-filled.png');
const SHOT_AFTER = join(ROOT, 'scripts', 'pw-ads-submitted.png');

const VALUES = {
  legalName: 'Phone Assured',
  website: 'https://www.phoneassured.com',
  brand: 'Phone Assured',
  solution:
    'An internal tool to automate management of our own Sponsored Products campaigns for the Phone Assured product line we sell on Amazon. It programmatically adjusts keyword bids based on ACOS and conversion performance, harvests new keywords and negative keywords from search-term reports, paces budgets, and pulls daily performance reports. It is for our own advertising account only and is not resold or licensed to any third party.',
  processes:
    'Keyword bid optimization based on ACOS and conversions, keyword and negative-keyword harvesting from search-term reports, budget pacing, campaign and keyword state management, and automated performance reporting — all for our own advertising account.',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1340, height: 1000 },
});
const page = ctx.pages()[0] || (await ctx.newPage());

log('Opening the form (reusing saved login)...');
await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});

// Wait until the real registration form is present (not the login page).
const start = Date.now();
let ready = false;
while (Date.now() - start < 5 * 60 * 1000) {
  await sleep(3000);
  try {
    const onForm = await page.evaluate(() =>
      location.hostname === 'advertising.amazon.com' &&
      !!document.querySelector('input,textarea') &&
      !document.querySelector('#ap_email'));
    if (onForm) {
      // Make sure the labelled fields exist.
      const has = await page.getByLabel('Company legal name').count().catch(() => 0);
      if (has) { ready = true; break; }
    }
    log('waiting for form / login…');
  } catch {}
}
if (!ready) {
  log('Form did not appear (login needed?). Sign in, then rerun. Leaving open.');
  await sleep(20 * 60 * 1000);
  process.exit(0);
}

log('Form is up. Filling…');
const results = {};

async function fillLabel(key, label, value) {
  try {
    const el = page.getByLabel(label).first();
    await el.scrollIntoViewIfNeeded();
    await el.fill(value, { timeout: 8000 });
    results[key] = (await el.inputValue()).trim();
  } catch (e) { results[key] = `ERR:${e.message.slice(0, 60)}`; }
}

await fillLabel('legalName', 'Company legal name', VALUES.legalName);
await fillLabel('website', 'Company website', VALUES.website);
await fillLabel('brand', 'Brand name', VALUES.brand);
await fillLabel('solution', 'What specific solution(s) do you plan to build using the Amazon Ads API?', VALUES.solution);
await fillLabel('processes', 'Which advertising processes are you aiming to automate?', VALUES.processes);

// Radios/checkboxes are CUSTOM (real input hidden behind a styled element),
// so a normal click times out. Try clicking the label / ancestor, then force.
async function ensureChecked(key, id, labelText) {
  const input = page.locator(`[id="${id}"]`).first();
  const strategies = [
    async () => { await page.locator(`label[for="${id}"]`).first().click({ timeout: 2500 }); },
    async () => { await input.locator('xpath=ancestor::label[1]').click({ timeout: 2500 }); },
    async () => { await input.check({ force: true, timeout: 2500 }); },
    async () => { await input.click({ force: true, timeout: 2500 }); },
    async () => { if (labelText) await page.getByText(labelText, { exact: false }).first().click({ timeout: 2500 }); },
  ];
  try { await input.scrollIntoViewIfNeeded(); } catch {}
  for (const s of strategies) {
    try { await s(); if (await input.isChecked().catch(() => false)) { results[key] = true; return; } } catch {}
  }
  results[key] = await input.isChecked().catch(() => false);
}
await ensureChecked('sellerRadio', 'API_REGISTRATION:API_USAGE:CALL_AS-SELLER', 'Amazon seller and plan to use');
await ensureChecked('countryUS', 'North-America-US', null); // no text fallback (avoid wrong "United States")
await ensureChecked('dataAdvertising', 'API-REGISTRATION-DATA-ACCESS-API-TARGETS-ADVERTISING', 'Advertising - Manage advertising');

// Country of incorporation (custom dropdown) — best effort.
async function setIncorporation() {
  try {
    await page.getByText('Select a country', { exact: false }).first().click({ timeout: 4000 });
    await sleep(500);
    const opt = page.getByRole('option', { name: 'United States', exact: true }).first();
    if (await opt.count()) { await opt.click({ timeout: 4000 }); results.incorporation = 'United States'; return; }
    await page.getByText('United States', { exact: true }).last().click({ timeout: 4000 });
    results.incorporation = 'United States(?)';
  } catch (e) { results.incorporation = `MANUAL:${e.message.slice(0, 40)}`; }
}
await setIncorporation();

// Legal consent checkbox (William directed submit -> consent required).
async function checkConsent() {
  const tries = [
    () => page.getByRole('checkbox', { name: /consent to the Amazon API License/i }).first(),
    () => page.locator('[id="accept-checkbox-[object Object]"]').first(),
  ];
  for (const t of tries) {
    try { const el = t(); await el.check({ timeout: 4000 }); results.consent = await el.isChecked(); return; } catch {}
  }
  results.consent = 'ERR';
}
await checkConsent();

await sleep(800);
await page.screenshot({ path: SHOT_BEFORE, fullPage: true }).catch(() => {});
log('\n===== FILLED VALUES (verify) =====');
log(JSON.stringify(results, null, 2));
log('Pre-submit screenshot:', SHOT_BEFORE);

// Verify the must-haves before submitting.
const ok =
  results.legalName === VALUES.legalName &&
  results.website === VALUES.website &&
  results.brand === VALUES.brand &&
  typeof results.solution === 'string' && results.solution.length > 20 &&
  typeof results.processes === 'string' && results.processes.length > 20 &&
  results.sellerRadio === true &&
  results.countryUS === true &&
  results.consent === true;

if (!ok) {
  log('\nNOT submitting — one or more required fields did not verify (see above).');
  log('Browser left open so you can finish the failed field and click Submit yourself.');
} else {
  log('\nAll required fields verified. Clicking "Submit for review"…');
  try {
    await page.getByRole('button', { name: /Submit for review/i }).first().click({ timeout: 8000 });
    await sleep(6000);
    await page.screenshot({ path: SHOT_AFTER, fullPage: true }).catch(() => {});
    log('Submitted. Post-submit screenshot:', SHOT_AFTER, '| url:', page.url());
  } catch (e) {
    log('Submit click failed:', e.message);
  }
}

log('\nLeaving browser open for your review.');
await sleep(25 * 60 * 1000);
await ctx.close();
