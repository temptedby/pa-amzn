/** Build compliant Amazon MAIN-image (hero) options: isolate the black clip on pure white,
 *  2000x2000, product ~82% fill, NO text. Basis: Amazon 2026 main-image spec (RGB 255,255,255,
 *  >=85% fill, 2000px+, no text/logos -> non-white/lifestyle triggers SEARCH SUPPRESSION).
 *  RUN: node scripts/build-hero.mjs */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
const OUT = '/tmp/pa-graphics'; mkdirSync(OUT, { recursive: true });
const CANVAS = 2000, FILL = 0.82;

async function dims(f) { const m = await sharp(f).metadata(); return `${m.width}x${m.height}`; }
console.log('sources:',
  'products', await dims('/tmp/pa-brand/cand-products.jpg'),
  '| packof1', await dims('/tmp/pa-brand/cand-packof1.jpg'),
  '| product-clip', await dims('/tmp/pa-brand/product-clip.jpg'));

async function hero(src, region, out) {
  // extract the clip region -> trim the white border -> scale to FILL -> center on pure-white canvas
  let buf = await sharp(src).extract(region).png().toBuffer();
  buf = await sharp(buf).trim({ threshold: 25 }).toBuffer();
  const m = await sharp(buf).metadata();
  const s = Math.min(CANVAS * FILL / m.width, CANVAS * FILL / m.height);
  const resized = await sharp(buf).resize(Math.round(m.width * s), Math.round(m.height * s)).toBuffer();
  await sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: resized, gravity: 'center' }])
    .jpeg({ quality: 92 }).toFile(`${OUT}/${out}`);
  console.log(`built ${out}  (product ${m.width}x${m.height} -> centered on ${CANVAS}px white)`);
}

// Option A: SINGLE black clip isolated from Packof1 (clean white source, no text) — the front clip view
await hero('/tmp/pa-brand/cand-packof1.jpg', { left: 820, top: 110, width: 520, height: 1720 }, 'hero-A-clip.jpg');
// Option B: the clip set from Packof1 (crop the right 2/3 -> clips only, away from the '1-PACK' phone on the left)
const pk = await sharp('/tmp/pa-brand/cand-packof1.jpg').metadata();
await hero('/tmp/pa-brand/cand-packof1.jpg', { left: Math.round(pk.width * 0.33), top: Math.round(pk.height * 0.04), width: Math.round(pk.width * 0.6), height: Math.round(pk.height * 0.78) }, 'hero-B-clips.jpg');
