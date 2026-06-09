/**
 * Real-data scan of our listings + competitors on Amazon (no assumptions).
 * Loads each product page in the persistent (logged-in) browser and pulls
 * price, rating, review count, Buy Box/Add-to-Cart status, seller, bullets.
 * Public pages only. Detects Amazon's robot-check so you can solve it in-window.
 *
 * RUN: node scripts/amazon-scan.mjs   (or pass ASINs: node scripts/amazon-scan.mjs B07Y5GZP1T ...)
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = join(ROOT, '.pw-profile');

const OURS = { B07Y5GZP1T: 'Ours: Single', B097MGPCPC: 'Ours: 2-Pack', B0CFYVNBJX: 'Ours: Pro', B097MHPL12: 'Ours: 3-Pack' };
const COMP = { B0B8NTRM38: 'Comp: TOLUON', B0BNSPVHKC: 'Comp: Pulpo', B0CHFL81WR: 'Comp: 4-Pack Lanyard' };
const TARGETS = process.argv.length > 2 ? Object.fromEntries(process.argv.slice(2).map(a => [a, a])) : { ...OURS, ...COMP };

const EXTRACT = `() => {
  const t = (s) => (document.querySelector(s)?.innerText || '').trim();
  const robot = /robot check|enter the characters you see|automated access/i.test(document.body.innerText.slice(0,800));
  const price = t('#corePriceDisplay_desktop_feature_div .a-price .a-offscreen') || t('#corePrice_feature_div .a-offscreen') || t('.a-price .a-offscreen');
  const buyable = !!(document.querySelector('#add-to-cart-button') || document.querySelector('#buy-now-button'));
  const buyingOptions = !!document.querySelector('#buybox-see-all-buying-choices, #buybox a[title*="Buying"]');
  const bullets = [...document.querySelectorAll('#feature-bullets li span.a-list-item')].map(e => e.innerText.trim()).filter(Boolean).slice(0,6);
  return {
    robot,
    title: t('#productTitle'),
    price,
    rating: t('#acrPopover')?.replace(/\\n.*/s,'') || t('span[data-hook=rating-out-of-text]'),
    reviews: t('#acrCustomerReviewText'),
    availability: t('#availability'),
    buyable, buyingOptions,
    merchant: t('#merchant-info') || t('#tabular-buybox') || t('#fulfillerInfoFeature_feature_div') ,
    bullets,
  };
}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: { width: 1340, height: 1000 } });
const page = ctx.pages()[0] || await ctx.newPage();
const results = [];

for (const [asin, label] of Object.entries(TARGETS)) {
  try {
    await page.goto(`https://www.amazon.com/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2500);
    const d = await page.evaluate(eval('(' + EXTRACT + ')'));
    if (d.robot) { console.log(`⚠️  ${label} (${asin}): ROBOT CHECK — solve it in the window, then I'll rerun.`); results.push({ asin, label, robot: true }); break; }
    results.push({ asin, label, ...d });
    console.log(`\n■ ${label}  (${asin})`);
    console.log(`  ${d.title.slice(0,80)}`);
    console.log(`  price=${d.price || '—'}   rating=${(d.rating||'—').replace(/\\s+/g,' ').slice(0,24)}   reviews=${d.reviews || '—'}`);
    console.log(`  BuyBox/AddToCart=${d.buyable ? 'YES' : 'NO'}${d.buyingOptions ? '  (only "See All Buying Options" — Buy Box SUPPRESSED)' : ''}   avail=${(d.availability||'—').slice(0,40)}`);
    console.log(`  seller: ${(d.merchant||'—').replace(/\\s+/g,' ').slice(0,80)}`);
  } catch (e) { console.log(`  ${label} (${asin}) error: ${e.message.slice(0,60)}`); results.push({ asin, label, error: e.message.slice(0,80) }); }
  await sleep(1500);
}

console.log('\n===== JSON =====');
console.log(JSON.stringify(results, null, 2));
await ctx.close();
