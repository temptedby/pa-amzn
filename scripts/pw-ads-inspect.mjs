/**
 * Playwright inspector for the Amazon Ads API Direct Advertiser application.
 *
 * Opens a REAL visible browser with a persistent profile (.pw-profile) so the
 * login survives between runs. You sign in as hello@phoneassured.com ONCE in
 * the window (your hands, your 2FA — credentials never touch this script).
 * It then waits for the registration form, dumps every field + button so we
 * know exactly what to fill, screenshots it, and closes (cookies persist for
 * the fill pass). It does NOT type or submit anything.
 *
 * RUN: node scripts/pw-ads-inspect.mjs
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://advertising.amazon.com/partner-network/register-api?ref_=a20m_us_api_drctad';
const PROFILE = join(ROOT, '.pw-profile');
const SHOT = join(ROOT, 'scripts', 'pw-ads-form.png');
const DEADLINE_MS = 6 * 60 * 1000; // up to 6 min to log in

const DUMP = `() => {
  const labelFor = (el) => {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return l.innerText.trim(); }
    const wl = el.closest('label'); if (wl) return wl.innerText.trim();
    return el.placeholder || el.name || '';
  };
  const fields = [];
  document.querySelectorAll('input, select, textarea').forEach(el => {
    const s = getComputedStyle(el);
    if (el.type === 'hidden' || s.display === 'none' || s.visibility === 'hidden') return;
    fields.push({
      tag: el.tagName.toLowerCase(), type: el.type || '', name: el.name || '', id: el.id || '',
      label: (labelFor(el) || '').slice(0, 140), placeholder: el.placeholder || '',
      value: (el.type === 'password' ? '***' : (el.value || '')).slice(0, 140),
    });
  });
  const buttons = [];
  document.querySelectorAll('button, [role=button], input[type=submit]').forEach(b => {
    const t = (b.innerText || b.value || '').trim(); if (t) buttons.push(t.slice(0, 60));
  });
  return { url: location.href, hostname: location.hostname, title: document.title, fields, buttons: [...new Set(buttons)] };
}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1340, height: 1000 },
});
const page = ctx.pages()[0] || await ctx.newPage();

console.log('Opening the registration page. Sign in as hello@phoneassured.com if prompted...');
await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});

const start = Date.now();
let dump = null;
while (Date.now() - start < DEADLINE_MS) {
  await sleep(4000);
  try {
    const d = await page.evaluate(eval('(' + DUMP + ')'));
    // Must be ON the advertising host (not Amazon's /ap/signin, which embeds the
    // return_to advertising URL in a query param).
    const onAds = d.hostname === 'advertising.amazon.com';
    const isLogin = d.fields.some(f => f.id === 'ap_email' || f.id === 'ap_password' || f.type === 'password');
    const textish = d.fields.filter(f => ['text', 'email', 'url', 'tel'].includes(f.type));
    if (onAds && !isLogin && textish.length >= 2) { dump = d; break; }
    console.log(`waiting… host=${d.hostname} login=${isLogin} textFields=${textish.length}`);
  } catch { /* mid-navigation; retry */ }
}

if (!dump) {
  console.log('Timed out waiting for the form. Leaving session saved; rerun after you reach the form.');
} else {
  await page.screenshot({ path: SHOT, fullPage: true }).catch(() => {});
  console.log('\n===== FORM CAPTURED =====');
  console.log(JSON.stringify(dump, null, 2));
  console.log('\nScreenshot:', SHOT);
}
await ctx.close();
console.log('Closed (login saved to .pw-profile for the fill pass).');
