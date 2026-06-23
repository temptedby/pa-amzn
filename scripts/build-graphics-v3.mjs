/** v3 graphic — applies the study's free wins: true luminance cutout (alpha) + synthesized
 *  contact shadow (kills the "floating on white" tell) + cleaner editorial layout (product left,
 *  stacked feature blocks right, no radiating-line cliche). Brand #0B3D91. Compliance linter.
 *  Honest limit: cannot relight a mediocre source — that needs a fal.ai key (see overnight note).
 *  RUN: node scripts/build-graphics-v3.mjs */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
const OUT = '/tmp/pa-graphics'; mkdirSync(OUT, { recursive: true });
const BLUE = '#0B3D91', INK = '#111';
const BANNED = /(\$|%|\bsale\b|\bdiscount\b|free shipping|best ?seller|amazon'?s choice|#1\b|\bguarantee\w*|\bprime\b|today only|limited time|\bFDA\b|\bdoctor\b|\bcure\b|100%|@|https?:|www\.|\.com\b)/i;
const fb64 = (f) => readFileSync(`/tmp/pa-fonts/${f}`).toString('base64');
const ANTON = fb64('Anton-Regular.ttf'), MONT = fb64('Montserrat.ttf');

// --- isolate clip + build a transparent cutout via luminance threshold, then bake a soft contact shadow ---
const region = { left: 820, top: 110, width: 520, height: 1720 };
const crop = await sharp('/tmp/pa-brand/cand-packof1.jpg').extract(region).png().toBuffer();
const { width: cw0, height: ch0 } = await sharp(crop).metadata();
// transparent cutout via luminance threshold (product dark = opaque, white bg = transparent)
const alpha = await sharp(crop).greyscale().threshold(238).negate().blur(0.6).toBuffer();
const cutout = await sharp(crop).ensureAlpha().joinChannel(alpha).png().toBuffer();
const prodB64 = cutout.toString('base64');
const pAspect = cw0 / ch0;

const H = 'BUILT TO KEEP YOUR PHONE CLOSE';
const feats = [
  ['Zinc-alloy carabiner', 'Clips to a bag, belt or pocket'],
  ['Retractable cord', 'Stretches up to 27 inches, then pulls back'],
  ['Quick-release buckle', 'Pops the phone on and off in a second'],
  ['Built for daily pull', 'Strong braided cord, not a flimsy string'],
];
if (BANNED.test([H, ...feats.flat()].join(' '))) throw new Error('COMPLIANCE BLOCK');

// editorial layout: product hero left (sized by height so it never crops), content right
const pH = 1640, pW = Math.round(pH * pAspect), pTop = Math.round((2000 - pH) / 2), pLeft = 200;
const shCx = pLeft + pW / 2, shW = Math.round(pW * 1.25), shH = 90, shY = pTop + pH - 40;
const html = `<!doctype html><html><head><meta charset="utf8"><style>
  @font-face{font-family:Anton;src:url(data:font/ttf;base64,${ANTON})}
  @font-face{font-family:Montserrat;src:url(data:font/ttf;base64,${MONT})}
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:2000px;height:2000px;position:relative;overflow:hidden;
    background:radial-gradient(1500px 1100px at 36% 32%, #ffffff 0%, #e9edf5 100%)}
  .shadow{position:absolute;left:${Math.round(shCx - shW / 2)}px;top:${shY}px;width:${shW}px;height:${shH}px;
    background:radial-gradient(ellipse at center, rgba(15,25,55,.28) 0%, rgba(15,25,55,0) 70%);filter:blur(6px)}
  .prod{position:absolute;left:${pLeft}px;top:${pTop}px;width:${pW}px;height:${pH}px}
  .right{position:absolute;left:920px;top:170px;width:1000px}
  .h{font-family:Anton;font-size:128px;line-height:.96;color:${BLUE};text-transform:uppercase;letter-spacing:1px;margin-bottom:70px}
  .blk{margin-bottom:62px;padding-left:34px;border-left:10px solid ${BLUE}}
  .k{font-family:Montserrat;font-weight:800;font-size:62px;color:${INK};line-height:1.04}
  .v{font-family:Montserrat;font-weight:500;font-size:40px;color:#374151;margin-top:12px;line-height:1.22}
</style></head><body>
  <div class="shadow"></div>
  <img class="prod" src="data:image/png;base64,${prodB64}"/>
  <div class="right">
    <div class="h">${H}</div>
    ${feats.map(([k, v]) => `<div class="blk"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}
  </div>
</body></html>`;

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 2000, height: 2000 } });
await pg.setContent(html, { waitUntil: 'networkidle' });
await pg.screenshot({ path: `${OUT}/v3-editorial.jpg`, type: 'jpeg', quality: 92 });
await b.close();
console.log(`built ${OUT}/v3-editorial.jpg (cutout+contact-shadow, editorial layout, studio-sweep bg)`);
