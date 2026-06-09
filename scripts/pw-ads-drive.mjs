/** Reuse the logged-in onboarding session and inspect the LWA console so I can
 *  see the form / read the Client ID + Secret. RUN: node scripts/pw-ads-drive.mjs */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = await chromium.launchPersistentContext(join(ROOT, '.pw-ads-onboard'), { headless: false, viewport: { width: 1340, height: 1000 } });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://developer.amazon.com/loginwithamazon/console/site/lwa/overview.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await sleep(4000);
const dump = await page.evaluate(() => {
  const t = document.body.innerText;
  const inputs = [...document.querySelectorAll('input,textarea')].filter(e=>e.offsetParent).map(e=>({type:e.type,name:e.name||e.id||'',ph:e.placeholder||'',label:(e.getAttribute('aria-label')||'')}));
  const buttons = [...document.querySelectorAll('button,a[role=button],input[type=submit]')].map(b=>(b.innerText||b.value||'').trim()).filter(Boolean);
  const cid = t.match(/amzn1\.application-oa2-client\.[a-z0-9]+/i);
  const sec = t.match(/amzn1\.oa2-cs\.v1\.[a-z0-9]+/i);
  return { url: location.href, title: document.title, head: t.slice(0,1200), inputs, buttons:[...new Set(buttons)].slice(0,25), cid:cid?cid[0]:null, sec:sec?sec[0]:null };
});
console.log(JSON.stringify(dump,null,2));
await sleep(20*60*1000); await ctx.close();
