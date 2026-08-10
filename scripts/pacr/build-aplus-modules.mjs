/** A+ modules at the exact Standard canvas. William 2026-08-10: "yes do the A+ modules".
 *
 *  THE POINT OF THESE, beyond replacing the discontinued lanyard: the live A+ is seven
 *  STANDARD_HEADER_IMAGE_TEXT modules with NO headline and NO body text, every word baked into the
 *  JPEG. Amazon cannot index baked-in copy and a screen reader gets "Phone Tether" seven times.
 *  So these images carry NO text at all. The words go in the module's own headline/body fields,
 *  printed below for whoever pastes them into Seller Central.
 *
 *  RUN: node scripts/pacr/build-aplus-modules.mjs
 */
import sharp from 'sharp';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIntent, APLUS_CANVASES, APLUS_MAX_BYTES } from '../../src/lib/creative/pacr-rules.mjs';
import { tokenPath } from './pacr-gate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'build', 'creative', 'aplus');
mkdirSync(OUT, { recursive: true });
const L = `${ROOT}/assets/source/_lifestyle/`, FA = `${ROOT}/assets/source/_faces/`, S = `${ROOT}/assets/source/`;

// Crop to the module canvas from the 24MP original. 3:2 -> 970x600 keeps 93% of the frame, so
// these are near-native rather than rescues.
const fit = async (p, w, h) => sharp(p).rotate().resize(w, h, { fit: 'cover' }).toBuffer();

const jobs = [
  {
    intent: 'aplus-01-outcome.json', out: 'aplus-01-outcome.jpg',
    // 125, not the Oaxaca torso frame. That one showed sunglasses clipped to a waistband, no phone
    // in shot, the subject's head cropped off, and it did not match its own alt text. Here the cord
    // runs visibly from the phone in his hand to the clip on his waistband, which IS the claim.
    build: async (w, h) => fit(`${FA}os_Megan_William_Barcelona__Mabel_Llevat_125.jpg`, w, h),
  },
  {
    intent: 'aplus-05-where.json', out: 'aplus-05-where.jpg',
    // Three places across one canvas. Gaps are white so the module reads as a set, not a collage.
    build: async (w, h) => {
      const g = 8, cw = Math.floor((w - g * 2) / 3);
      const src = [
        `${FA}os_Megan_William_Barcelona__Mabel_Llevat_111.jpg`,
        `${L}_Phone_Assured_Photos_Jan_10th__IMG_3290.jpg`,
        `${FA}hotos_Megan_Lindsay_Oaxaca__A7_08356.jpg`,
      ];
      const parts = [];
      for (let i = 0; i < 3; i++) parts.push({ input: await fit(src[i], cw, h), left: i * (cw + g), top: 0 });
      return sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
        .composite(parts).jpeg({ quality: 90 }).toBuffer();
    },
  },
  {
    intent: 'aplus-03-weight.json', out: 'aplus-03-weight.jpg',
    // Replaces the module that is 100% discontinued lanyard. Product on white, no baked copy:
    // the 171 g line lives in the module's body text where Amazon can read it.
    build: async (w, h) => {
      const pad = 24, cw = Math.floor((w - pad * 3) / 2);
      // Crop off the left third of each pack shot. That is where the phone sits with "1-PACK" and
      // "EXTRA DURABLE" burned into its screen — the badge inconsistency flagged for removal on
      // 2026-08-10. Cropping keeps the hardware, which is what this module is actually comparing.
      const hardware = async (p) => {
        const m = await sharp(p).metadata();
        const left = Math.round(m.width * 0.34);
        return sharp(p).extract({ left, top: 0, width: m.width - left, height: m.height })
          .resize(cw, h - pad * 2, { fit: 'contain', background: '#ffffff' }).toBuffer();
      };
      const black = await hardware(`${S}Final Black 1 Clip Images/Packof1.jpg`);
      const pro = await hardware(`${S}Megan Updated Images/1 Pack Pro.jpg`);
      return sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
        .composite([{ input: black, left: pad, top: pad }, { input: pro, left: pad * 2 + cw, top: pad }])
        .jpeg({ quality: 92 }).toBuffer();
    },
  },
];

console.log('A+ MODULES  (Standard canvas, copy kept OUT of the image)\n');
for (const j of jobs) {
  const intent = JSON.parse(readFileSync(join(ROOT, 'confabulator', 'intents', j.intent), 'utf8'));
  if (!existsSync(tokenPath(intent))) { console.error(`  ${j.out}: no PACR token, skipped`); continue; }
  const [w, h] = APLUS_CANVASES[intent.module_type];
  const buf = await j.build(w, h);
  const file = join(OUT, j.out);
  await sharp(buf).jpeg({ quality: 90 }).toFile(file);

  // Re-check WITH the rendered size, which is the only point the 2 MB cap is knowable.
  const bytes = statSync(file).size;
  const v = checkIntent(intent, { renderedBytes: bytes });
  const meta = await sharp(file).metadata();
  const ok = v.ok && meta.width === w && meta.height === h && bytes <= APLUS_MAX_BYTES;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${j.out.padEnd(24)} ${meta.width}x${meta.height}  ${(bytes / 1024).toFixed(0)} KB  (cap ${(APLUS_MAX_BYTES / 1048576)} MB)`);
  if (!v.ok) v.failures.forEach((f) => console.log(`       ${f.rule}: ${f.message}`));
  console.log(`       headline: ${intent.headline}`);
  console.log(`       body:     ${intent.body[0]}`);
  console.log(`       alt:      ${intent.alt_text}\n`);
}
