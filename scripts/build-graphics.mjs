/** Build compliant, on-brand Amazon secondary images (HTML -> Playwright PNG).
 *  Enforces amazon-image-compliance.md via a banned-text linter before export.
 *  RUN: node scripts/build-graphics.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/pa-graphics'; mkdirSync(OUT, { recursive: true });
const BLUE = '#0B3D91', INK = '#111';
// Compliance linter — reject any banned promotional/claim/contact text before render.
const BANNED = /(\$|%|\bsale\b|\bdiscount\b|free shipping|best ?seller|amazon'?s choice|#1\b|\bguarantee\w*|\bprime\b|today only|limited time|\bFDA\b|\bdoctor\b|\bcure\b|100%|@|https?:|www\.|\.com\b|call us|phone:)/i;
function lint(strings) {
  for (const s of strings) if (BANNED.test(s)) throw new Error(`COMPLIANCE BLOCK: "${s}"`);
}
const img = (p) => 'data:image/jpeg;base64,' + readFileSync(p).toString('base64');

// ---- Graphic 1: benefits / use-case (compliant: no price, badges, contact, claims) ----
const g1 = {
  file: 'secondary-benefits.png',
  title: 'ONE CLIP. PHONE SECURED.',
  sub: 'Retractable tether that keeps your phone on you',
  hero: '/tmp/pa-brand/on-case.jpg',
  bullets: [
    ['ANTI-THEFT', 'Clips to your belt, bag or pocket so it can’t be grabbed'],
    ['ANTI-DROP', 'Catches your phone before it hits the ground'],
    ['ANTI-LOSS', 'Never leave it behind at a table or counter'],
    ['1-YEAR WARRANTY', 'Backed by Phone Assured for a full year'],
  ],
};
lint([g1.title, g1.sub, ...g1.bullets.flat()]);

const html = (g) => `<!doctype html><html><head><meta charset="utf8"><style>
  *{margin:0;box-sizing:border-box;font-family:'Arial Black','Arial',sans-serif}
  body{width:1600px;height:1600px;background:#fff;display:flex;flex-direction:column}
  .top{height:300px;background:${BLUE};color:#fff;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 60px}
  .top h1{font-size:96px;letter-spacing:1px;line-height:1}
  .top p{font-size:40px;font-family:Arial,sans-serif;font-weight:bold;margin-top:18px;opacity:.95}
  .body{flex:1;display:flex;padding:50px 60px;gap:50px}
  .hero{width:620px;height:auto;border-radius:24px;object-fit:cover;align-self:center;border:6px solid ${BLUE}}
  .list{flex:1;display:flex;flex-direction:column;justify-content:center;gap:38px}
  .row{display:flex;gap:24px;align-items:flex-start}
  .dot{min-width:26px;height:26px;border-radius:50%;background:${BLUE};margin-top:10px}
  .k{font-size:50px;color:${INK};letter-spacing:.5px}
  .v{font-size:34px;color:#333;font-family:Arial,sans-serif;font-weight:600;margin-top:6px;line-height:1.15}
</style></head><body>
  <div class="top"><h1>${g.title}</h1><p>${g.sub}</p></div>
  <div class="body">
    <img class="hero" src="${img(g.hero)}"/>
    <div class="list">${g.bullets.map(([k, v]) => `<div class="row"><div class="dot"></div><div><div class="k">${k}</div><div class="v">${v}</div></div></div>`).join('')}</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1600 }, deviceScaleFactor: 1 });
await page.setContent(html(g1), { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/${g1.file}` });
console.log(`built ${OUT}/${g1.file} (compliant, on-brand)`);
await browser.close();
