/** "What it clips to" — a multi-panel set built from REAL product photography.
 *
 *  William 2026-08-14: "maybe a multiple design to feature the clip attached to each one", and
 *  "we can built the graphic with Ai to simulate?"
 *
 *  WE DO NOT NEED TO SIMULATE MOST OF IT. `Final Black 1 Clip Images/Image 2.jpg` is a 2500x2500
 *  four-panel product shot showing OUR hardware clipped to a handbag strap, a jeans belt loop, a
 *  duffel strap and a car seat. Those are four attachment points already photographed with the real
 *  clip, so generating them would replace real product pixels with invented ones for no gain.
 *
 *  That is also the standing rule in ai-animate.mjs, and it applies harder here: AI is IMAGE-driven
 *  only, never text-driven, because a generated tether is somebody else's hardware on our page. The
 *  08-12 ledger adds the reason it would fail anyway — "where the hardware is thin the model
 *  degrades it, and in one clip erased it off a waistband entirely". In an attachment graphic the
 *  thin cord IS the mechanism, so it is the worst possible thing to hand to a generator.
 *
 *  RUN: node scripts/pacr/build-attachpoints.mjs
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INK, SEA, esc } from './design-system.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = `${ROOT}/assets/source/Final Black 1 Clip Images/Image 2.jpg`;
const OUT = join(ROOT, 'build/creative/attach-points');

// Panel geometry, read off the 2500x2500 source rather than guessed.
// INSET INSIDE THE WHITE BORDER. The source is a finished collage with rounded white frames around
// each panel, so cropping to the panel bounds carried the border and a sliver of the neighbouring
// tile into every cell — white edges and a teal wedge, visible the moment the file was opened.
// These numbers cut inside the frame rather than around it.
// LABELS ARE WILLIAM'S, and two of mine were wrong. The car frame is not "a car seat" — the clip is
// on the man's BELT LOOP and he happens to be in a car. The jeans frame is not a belt loop either;
// it is the WAISTBAND. Our own listing image 4 uses BELTLOOP / POCKET / BACKPACK / PURSE, so these
// now agree with the words already on the detail page.
const PANELS = [
  { id: 'bag',    label: 'A BAG STRAP',   left: 1150, top:  120, width: 1240, height: 670 },
  { id: 'belt',   label: 'YOUR WAISTBAND', left: 1150, top:  930, width: 1240, height: 665 },
  { id: 'duffel', label: 'A DUFFEL STRAP',left: 1150, top: 1740, width: 1240, height: 655 },
  { id: 'car',    label: 'A BELT LOOP',   left:  140, top:  730, width:  835, height: 1040 },
];

const CANVAS = {
  vertical: { w: 1080, h: 1920 },
  feed:     { w: 1080, h: 1350 },
  square:   { w: 1080, h: 1080 },
  wide:     { w: 1920, h: 1080 },
};

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.jpg')) rmSync(join(OUT, f));

// One crop per attachment point, kept at native resolution so the hardware stays sharp.
const crops = {};
for (const p of PANELS) {
  crops[p.id] = await sharp(SRC).extract({ left: p.left, top: p.top, width: p.width, height: p.height }).toBuffer();
  writeFileSync(join(OUT, `_panel-${p.id}.jpg`), crops[p.id]);
}

/** A grid of attachment points. Rows on tall canvases, a 2x2 on square and wide. */
function layout(w, h) {
  const tall = h / w > 1.15;
  const headH = Math.round((tall ? 300 : 210) * (w / 1080));
  const gap = Math.round(14 * (w / 1080));
  if (tall) {
    const cellH = Math.floor((h - headH - gap * 3) / 4);
    return { headH, cells: PANELS.map((p, i) => ({ p, x: 0, y: headH + i * (cellH + gap), cw: w, ch: cellH })) };
  }
  const cw = Math.floor((w - gap) / 2), ch = Math.floor((h - headH - gap) / 2);
  return { headH, cells: PANELS.map((p, i) => ({ p, x: (i % 2) * (cw + gap), y: headH + Math.floor(i / 2) * (ch + gap), cw, ch })) };
}

const built = [];
for (const [name, cv] of Object.entries(CANVAS)) {
  const { headH, cells } = layout(cv.w, cv.h);
  const k = cv.w / 1080;
  const comps = [];
  for (const c of cells) {
    const img = await sharp(crops[c.p.id]).resize(c.cw, c.ch, { fit: 'cover', position: 'centre' }).toBuffer();
    comps.push({ input: img, top: c.y, left: c.x });
    const lp = Math.round(17 * k), lw = c.p.label.length * (lp * 0.74) + lp * 2.2, lh = lp * 2.2;
    comps.push({ input: Buffer.from(`<svg width="${c.cw}" height="${c.ch}" xmlns="http://www.w3.org/2000/svg">
      <g><rect x="${Math.round(18 * k)}" y="${c.ch - lh - Math.round(18 * k)}" rx="${lh / 2}" width="${lw}" height="${lh}" fill="${SEA}"/>
      <text x="${Math.round(18 * k) + lw / 2}" y="${c.ch - lh - Math.round(18 * k) + lh * 0.68}" text-anchor="middle"
        font-family="Helvetica,Arial" font-size="${lp}" font-weight="700" letter-spacing="${1.2 * k}" fill="#ffffff">${esc(c.p.label)}</text></g>
    </svg>`), top: c.y, left: c.x });
  }
  const hs = Math.round(62 * k), bs = Math.round(27 * k);
  comps.push({ input: Buffer.from(`<svg width="${cv.w}" height="${headH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${cv.w}" height="${headH}" fill="${INK}"/>
    <rect x="${Math.round(52 * k)}" y="${Math.round(38 * k)}" width="${Math.round(84 * k)}" height="${Math.max(4, Math.round(6 * k))}" fill="${SEA}"/>
    <text x="${Math.round(52 * k)}" y="${Math.round(38 * k) + hs}" font-family="Helvetica,Arial" font-size="${hs}"
      font-weight="800" letter-spacing="${-1.4 * k}" fill="#ffffff">Clips to what you already carry.</text>
    <text x="${Math.round(52 * k)}" y="${Math.round(38 * k) + hs + Math.round(20 * k) + bs}" font-family="Helvetica,Arial"
      font-size="${bs}" fill="#9FC4C6">No adhesive. Nothing to install.</text>
  </svg>`), top: 0, left: 0 });

  const buf = await sharp({ create: { width: cv.w, height: cv.h, channels: 3, background: INK } })
    .composite(comps).jpeg({ quality: 90 }).toBuffer();
  const file = join(OUT, `attach-points-${name}.jpg`);
  writeFileSync(file, buf);
  built.push({ canvas: name, w: cv.w, h: cv.h, bytes: buf.length });
}
console.log(`${built.length} attachment-point graphics + ${PANELS.length} source panels -> build/creative/attach-points`);
built.forEach(b => console.log(`  ${String(b.w + 'x' + b.h).padEnd(10)} ${(b.bytes / 1024).toFixed(0)} KB`));
