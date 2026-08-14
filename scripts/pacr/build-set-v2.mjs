/** v2 of the A+ and social set. Cleaner, action-led, and clearer about the product.
 *  William 2026-08-10: "more clean about the product", "clean up the design", "more action shots".
 *  RUN: node scripts/pacr/build-set-v2.mjs
 */
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INK, SEA, PAPER, MUTED, TYPE, esc, captionBlock, calloutPill } from './design-system.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = join(ROOT, 'build/creative/aplus-v2'), SOC = join(ROOT, 'build/creative/social-v2');
mkdirSync(A, { recursive: true }); mkdirSync(SOC, { recursive: true });
const FA = `${ROOT}/assets/source/_faces/`, L = `${ROOT}/assets/source/_lifestyle/`, S = `${ROOT}/assets/source/`;
const cover = (p, w, h, pos = 'centre') => sharp(p).rotate().resize(w, h, { fit: 'cover', position: pos }).toBuffer();
const AW = 970, AH = 600;

// ACTION FRAMES. Every one of these has a hand, a phone and the cord doing something. The posed
// portraits are demoted to a single trust module, because competitors lead with use, not with faces.
const ACTION = {
  water:  `${L}_Phone_Assured_Photos_Cozumel_April_9th__IMG_20210409_131504.jpg`,
  clip:   `${FA}os_Megan_William_Barcelona__Mabel_Llevat_142.jpg`,
  hold:   `${FA}os_Megan_William_Barcelona__Mabel_Llevat_125.jpg`,
  reach:  `${FA}os_Megan_William_Barcelona__Mabel_Llevat_126.jpg`,
  car:    `${L}_Phone_Assured_Photos_Jan_10th__IMG_3290.jpg`,
  street: `${FA}os_Megan_William_Barcelona__Mabel_Llevat_111.jpg`,
  wrist:  `${L}_Phone_Assured_Photos_Cozumel_April_9th__IMG_20210409_131548.jpg`,
};

const mods = [
  // 01. LEAD WITH THE STRONGEST FRAME. It was fifth in v1; a shopper has decided by then.
  { out: '01-water', head: 'Held out over the sea. Still attached.',
    sub: 'The moments where a drop is not recoverable are the ones this was made for.',
    make: async () => sharp(await cover(ACTION.water, AW, AH))
      .composite([{ input: Buffer.from(captionBlock(AW, AH, 'Held out over the sea. Still attached.',
        'The moments where a drop is not recoverable are the ones this was made for.')), top: 0, left: 0 }])
      .jpeg({ quality: 91 }).toBuffer() },

  // 02. THE PRODUCT, BIG AND NAMED. This is the "more clean about the product" note. Competitors
  // show the hardware close and label the part; we only ever showed it small on a white field.
  { out: '02-product', head: 'What you actually get',
    make: async () => {
      const m = await sharp(`${S}Final Black 1 Clip Images/Packof1.jpg`).metadata();
      const left = Math.round(m.width * 0.36);          // crop past the phone with its baked badge
      const hw = await sharp(`${S}Final Black 1 Clip Images/Packof1.jpg`)
        .extract({ left, top: 0, width: m.width - left, height: m.height })
        .resize(AW - 300, AH - 120, { fit: 'contain', background: PAPER }).toBuffer();
      // The overlay is TRANSPARENT and composited LAST. Drawing it first meant the hardware image,
      // whose 'contain' fit carries its own white box, painted straight over the callout pills and
      // sliced their text at x=300. Order matters more than geometry here.
      const svg = `<svg width="${AW}" height="${AH}" xmlns="http://www.w3.org/2000/svg">
        <text x="40" y="70" font-family="Helvetica,Arial" font-size="${TYPE.head}" font-weight="800"
          letter-spacing="-1" fill="${INK}">What you actually get</text>
        ${calloutPill(40, 190, 'RETRACTING REEL')}
        ${calloutPill(40, 270, 'LOCKING CARABINER')}
        ${calloutPill(40, 350, 'QUICK RELEASE CLIP')}
        ${calloutPill(40, 430, 'TETHER TAB')}
      </svg>`;
      return sharp({ create: { width: AW, height: AH, channels: 3, background: PAPER } })
        .composite([{ input: hw, left: 330, top: 90 }, { input: Buffer.from(svg), top: 0, left: 0 }])
        .jpeg({ quality: 93 }).toBuffer(); } },

  // 03. THE MECHANISM, IN USE. Two action frames, no posing.
  { out: '03-how', head: 'Clip it on. Then forget it.',
    make: async () => {
      const g = 6, cw = Math.floor((AW - g) / 2);
      const base = sharp({ create: { width: AW, height: AH, channels: 3, background: PAPER } })
        .composite([
          { input: await cover(ACTION.clip, cw, AH), left: 0, top: 0 },
          { input: await cover(ACTION.reach, cw, AH, 'attention'), left: cw + g, top: 0 },
        ]).jpeg({ quality: 91 });
      return sharp(await base.toBuffer()).composite([{ input: Buffer.from(
        captionBlock(AW, AH, 'Clip it on. Then forget it.',
          'The cord pays out when you reach, and draws itself back when you let go.')), top: 0, left: 0 }])
        .jpeg({ quality: 91 }).toBuffer(); } },

  // 04. FIT, stated as a number. Competitors give an objective figure; ours is the weight class.
  { out: '04-fit', head: 'Two sizes, split by phone weight',
    make: async () => {
      // ih leaves room for BOTH label lines. At -130 the cord loop in the source art ran down over
      // "BLACK" and "PRO"; 'contain' fits the whole source box, cord included, so the art needs
      // more clearance than the text height alone suggests.
      const pad = 30, cw = Math.floor((AW - pad * 3) / 2), ih = AH - pad * 2 - 190;
      const hardware = async (p) => { const m = await sharp(p).metadata(); const left = Math.round(m.width * 0.36);
        return sharp(p).extract({ left, top: 0, width: m.width - left, height: m.height })
          .resize(cw, ih, { fit: 'contain', background: PAPER }).toBuffer(); };
      const svg = `<svg width="${AW}" height="${AH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${AW}" height="${AH}" fill="${PAPER}"/>
        <text x="${AW / 2}" y="62" text-anchor="middle" font-family="Helvetica,Arial" font-size="${TYPE.head}"
          font-weight="800" letter-spacing="-1" fill="${INK}">Two sizes, split by phone weight</text>
        <text x="${pad + cw / 2}" y="${AH - 74}" text-anchor="middle" font-family="Helvetica,Arial" font-size="34" font-weight="800" fill="${INK}">BLACK</text>
        <text x="${pad + cw / 2}" y="${AH - 36}" text-anchor="middle" font-family="Helvetica,Arial" font-size="24" fill="${MUTED}">171 g (6.0 oz) and under</text>
        <text x="${pad * 2 + cw + cw / 2}" y="${AH - 74}" text-anchor="middle" font-family="Helvetica,Arial" font-size="34" font-weight="800" fill="${SEA}">PRO</text>
        <text x="${pad * 2 + cw + cw / 2}" y="${AH - 36}" text-anchor="middle" font-family="Helvetica,Arial" font-size="24" fill="${MUTED}">heavier than 171 g</text>
        <rect x="${AW / 2 - 1}" y="110" width="2" height="${AH - 240}" fill="#E3EAEB"/>
      </svg>`;
      return sharp({ create: { width: AW, height: AH, channels: 3, background: PAPER } }).composite([
        { input: Buffer.from(svg), top: 0, left: 0 },
        { input: await hardware(`${S}Final Black 1 Clip Images/Packof1.jpg`), left: pad, top: 100 },
        { input: await hardware(`${S}Megan Updated Images/1 Pack Pro.jpg`), left: pad * 2 + cw, top: 100 },
      ]).jpeg({ quality: 93 }).toBuffer(); } },

  // 05. FOUR ACTIONS, not three scenes with one dud. Every panel has the cord visible.
  { out: '05-action', head: 'Wherever your hands are full',
    make: async () => {
      const g = 5, cw = Math.floor((AW - g * 3) / 4);
      const src = [ACTION.street, ACTION.car, ACTION.hold, ACTION.wrist];
      const parts = []; for (let i = 0; i < 4; i++) parts.push({ input: await cover(src[i], cw, AH), left: i * (cw + g), top: 0 });
      const base = await sharp({ create: { width: AW, height: AH, channels: 3, background: PAPER } })
        .composite(parts).jpeg({ quality: 90 }).toBuffer();
      return sharp(base).composite([{ input: Buffer.from(captionBlock(AW, AH, 'Wherever your hands are full',
        'Belt loop, bag strap, backpack or pocket. The same clip, everywhere you go.')), top: 0, left: 0 }])
        .jpeg({ quality: 90 }).toBuffer(); } },
];

const socials = [
  { out: 's1-water',  src: ACTION.water,  head: 'Over the sea.',        sub: 'Still attached.' },
  { out: 's2-reach',  src: ACTION.reach,  head: 'Hands full.',          sub: 'It stays with you.' },
  { out: 's3-clip',   src: ACTION.clip,   head: 'Clips on in seconds.', sub: 'Then you forget it is there.' },
];

const rows = [];
for (const m of mods) {
  const f = join(A, `${m.out}.jpg`);
  await sharp(await m.make()).jpeg({ quality: 91 }).toFile(f);
  const md = await sharp(f).metadata();
  rows.push(['A+ ' + m.out, `${md.width}x${md.height}`, `${(statSync(f).size / 1024).toFixed(0)} KB`]);
}
const SW = 1080, SH = 1920, SAFE_BOTTOM = 420;   // Reels safe zone is the stricter of the two
for (const s of socials) {
  const img = await cover(s.src, SW, SH, 'attention');
  const cap = captionBlock(SW, SH - SAFE_BOTTOM + 210, s.head, s.sub, { pad: 60, headSize: 78, bodySize: 46 });
  const f = join(SOC, `${s.out}.jpg`);
  await sharp(img).composite([{ input: Buffer.from(cap), top: 0, left: 0 }]).jpeg({ quality: 89 }).toFile(f);
  const md = await sharp(f).metadata();
  rows.push(['social ' + s.out, `${md.width}x${md.height}`, `${(statSync(f).size / 1024).toFixed(0)} KB`]);
}
console.log('BUILT v2');
rows.forEach(r => console.log('  ' + r[0].padEnd(18) + r[1].padEnd(12) + r[2]));
