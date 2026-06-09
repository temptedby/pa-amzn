/** Clean-session browser for the Ads API onboarding link (no other Amazon
 *  accounts → can't invalidate the link). William logs in as hello@ + completes
 *  the LWA setup; the script watches the page and prints the Client ID/Secret
 *  when they appear. RUN: node scripts/pw-ads-onboard.mjs */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LINK = 'https://advertising-api.amazon.com/apim/logIn?state=ACXMWZZUZKFVD&locale=en_US&ref_=pe_24209330_373159774';
const ctx = await chromium.launchPersistentContext(join(ROOT, '.pw-ads-onboard'), { headless: false, viewport: { width: 1340, height: 1000 } });
const page = ctx.pages()[0] || await ctx.newPage();
console.log('Opening onboarding link in a CLEAN browser. Log in as hello@phoneassured.com ONLY, then complete the LWA app setup.');
await page.goto(LINK, { waitUntil: 'domcontentloaded' }).catch(() => {});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let found = false;
for (let i = 0; i < 150 && !found; i++) {     // watch up to ~10 min
  await sleep(4000);
  try {
    const txt = await page.evaluate(() => document.body.innerText);
    const cid = txt.match(/amzn1\.application-oa2-client\.[a-z0-9]+/i);
    const sec = txt.match(/amzn1\.oa2-cs\.v1\.[a-z0-9]+/i);
    if (cid) { console.log('\nCLIENT ID:', cid[0]); if (sec) console.log('CLIENT SECRET:', sec[0]); console.log('\n(If the secret is hidden, click "Show secret" and it will print on the next check.)'); if (sec) found = true; }
  } catch {}
}
console.log('\nLeaving the browser open. Paste the Client ID + Secret here when you have them.');
await sleep(20 * 60 * 1000);
await ctx.close();
