import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ctx = await chromium.launchPersistentContext(join(ROOT,'.pw-sc-profile'), { headless: false, viewport: { width: 1500, height: 1000 } });
const p = ctx.pages()[0] || await ctx.newPage();
// Official DE Division of Corporations entity search (look up by file number 7603115 / name)
await p.goto('https://icis.corp.delaware.gov/ecorp/entitysearch/NameSearch.aspx', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e=>console.log('nav:', e.message));
console.log('DE entity search:', p.url(), '| title:', await p.title().catch(()=>'?'));
// second tab: DE doc-ordering info page
const p2 = await ctx.newPage();
await p2.goto('https://corp.delaware.gov/contact-information/', { waitUntil:'domcontentloaded', timeout:60000 }).catch(e=>console.log('nav2:', e.message));
console.log('DE corp site:', p2.url());
await p.bringToFront().catch(()=>{});
await new Promise(()=>{});
