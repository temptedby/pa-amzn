/** Pro Amazon secondary image — "annotated product callouts" (research-backed spec):
 *  2000px, condensed display headline (Anton) + Montserrat body, real clip photo,
 *  SVG leader-line callouts (one color/weight, no crossing), brand #0B3D91/white/#111.
 *  Compliance + product-presence linter. RUN: node scripts/build-graphics-v2.mjs */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const OUT = '/tmp/pa-graphics'; mkdirSync(OUT, { recursive: true });
const BLUE = '#0B3D91', INK = '#111';
const BANNED = /(\$|%|\bsale\b|\bdiscount\b|free shipping|best ?seller|amazon'?s choice|#1\b|\bguarantee\w*|\bprime\b|today only|limited time|\bFDA\b|\bdoctor\b|\bcure\b|100%|@|https?:|www\.|\.com\b)/i;
const fontB64 = (f) => readFileSync(`/tmp/pa-fonts/${f}`).toString('base64');
const ANTON = fontB64('Anton-Regular.ttf'), MONT = fontB64('Montserrat.ttf');

// tight clip cut-out (front view) from the 2500px white source -> blends on white canvas
let clip = await sharp('/tmp/pa-brand/cand-packof1.jpg').extract({ left: 820, top: 110, width: 520, height: 1720 }).trim({ threshold: 25 }).png().toBuffer();
const cm = await sharp(clip).metadata();
const clipB64 = clip.toString('base64');

// LAYOUT (2000x2000): centered product, headline top, callouts alternate L/R aligned to each feature (near-horizontal leaders, no crossing).
const H = 'KEEPS YOUR PHONE SECURE';
const cw = 380, ch = Math.round(cw * cm.height / cm.width), cx = Math.round((2000 - cw) / 2), cy = 470;
const feats = [
  { dy: 0.09, side: 'L', label: 'Zinc-alloy carabiner', sub: 'clips to bag, belt or pocket' },
  { dy: 0.30, side: 'R', label: 'Retractable cord', sub: 'stretches up to 27 inches' },
  { dy: 0.56, side: 'L', label: 'Strong braided cord', sub: 'built for daily pull' },
  { dy: 0.85, side: 'R', label: 'Quick-release buckle', sub: 'phone on and off fast' },
];
if (BANNED.test([H, ...feats.flatMap(c => [c.label, c.sub])].join(' '))) throw new Error('COMPLIANCE BLOCK');

const LABW = 600;
const svgCallouts = feats.map((c) => {
  const dotY = Math.round(cy + ch * c.dy);
  const dotX = Math.round(c.side === 'L' ? cx + cw * 0.34 : cx + cw * 0.66);
  const labX = c.side === 'L' ? 110 : 2000 - 110 - LABW;
  const lineStart = c.side === 'L' ? labX + LABW : labX;     // inner edge of the label -> dot (near-horizontal)
  const align = c.side === 'L' ? 'right' : 'left';
  return `
    <circle cx="${dotX}" cy="${dotY}" r="14" fill="${BLUE}"/>
    <polyline points="${lineStart},${dotY} ${dotX},${dotY}" fill="none" stroke="${BLUE}" stroke-width="4"/>
    <foreignObject x="${labX}" y="${dotY - 92}" width="${LABW}" height="200">
      <div xmlns="http://www.w3.org/1999/xhtml" style="text-align:${align}">
        <div style="font-family:Montserrat;font-weight:700;font-size:52px;color:${INK};line-height:1.05">${c.label}</div>
        <div style="font-family:Montserrat;font-weight:500;font-size:34px;color:#444;margin-top:8px;line-height:1.15">${c.sub}</div>
      </div>
    </foreignObject>`;
}).join('');

const html = `<!doctype html><html><head><meta charset="utf8"><style>
  @font-face{font-family:Anton;src:url(data:font/ttf;base64,${ANTON}) format('truetype')}
  @font-face{font-family:Montserrat;src:url(data:font/ttf;base64,${MONT}) format('truetype')}
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:2000px;height:2000px;background:#fff;position:relative;overflow:hidden}
  .h{position:absolute;left:0;top:120px;width:2000px;text-align:center;font-family:Anton;font-size:140px;line-height:.95;color:${BLUE};text-transform:uppercase;letter-spacing:1px}
  .clip{position:absolute;left:${cx}px;top:${cy}px;width:${cw}px;height:${ch}px}
  svg{position:absolute;left:0;top:0;width:2000px;height:2000px}
</style></head><body>
  <div class="h">${H}</div>
  <img class="clip" src="data:image/png;base64,${clipB64}"/>
  <svg viewBox="0 0 2000 2000">${svgCallouts}</svg>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2000, height: 2000 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/v2-callouts.jpg`, type: 'jpeg', quality: 92 });
await browser.close();
console.log(`built ${OUT}/v2-callouts.jpg  (clip ${cm.width}x${cm.height}, Anton headline + Montserrat callouts, SVG leader lines)`);
