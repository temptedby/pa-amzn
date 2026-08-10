/** The full A+ sequence and a social set, built to the six shopper questions.
 *  William 2026-08-10: "Just want to see what you can create in line with what's suggested".
 *
 *  A+ modules carry NO baked copy except product identification, because the live A+ hides every
 *  word inside its JPEGs. Product names on the comparison module are the one exception: without
 *  them a two-product picture is ambiguous, and a name is identification, not marketing.
 *
 *  Social frames are composed inside the 900x1280 safe box, the intersection of the Instagram Reels
 *  and TikTok safe zones, so one render serves both without their UI covering anything.
 *
 *  RUN: node scripts/pacr/build-set.mjs
 */
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = join(ROOT, 'build/creative/aplus'), SOC = join(ROOT, 'build/creative/social');
mkdirSync(A, { recursive: true }); mkdirSync(SOC, { recursive: true });
const FA = `${ROOT}/assets/source/_faces/`, L = `${ROOT}/assets/source/_lifestyle/`, S = `${ROOT}/assets/source/`;
const INK = '#12242B', SEA = '#0C7C82';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cover = (p, w, h, pos = 'centre') => sharp(p).rotate().resize(w, h, { fit: 'cover', position: pos }).toBuffer();

// ---------- A+ : 970 x 600, the six questions in swipe order -------------------------------
const AW = 970, AH = 600;
const aplus = [
  { out: '01-outcome',  q: 'Why do I need this?',
    head: 'Your phone stays with you',
    body: 'Clip it on once. Use your phone exactly as you normally would, and it stays attached to you, your bag or your belt loop.',
    alt: 'A man holding his phone on a city street, with a Phone Assured retractable tether running from the phone down to a clip on his waistband.',
    make: () => cover(`${FA}os_Megan_William_Barcelona__Mabel_Llevat_125.jpg`, AW, AH) },

  { out: '02-how',      q: 'How does it work?',
    head: 'Clip on, and forget it is there',
    body: 'The cord retracts on its own. Reach for your phone as usual and the cord pays out, then draws itself back in when you let go.',
    alt: 'Close view of a hand clipping the Phone Assured tether to a phone, and the retractable cord extended.',
    make: async () => {
      const g = 8, cw = Math.floor((AW - g) / 2);
      return sharp({ create: { width: AW, height: AH, channels: 3, background: '#ffffff' } }).composite([
        { input: await cover(`${FA}os_Megan_William_Barcelona__Mabel_Llevat_142.jpg`, cw, AH), left: 0, top: 0 },
        { input: await cover(`${L}_Phone_Assured_Photos_Cozumel_April_9th__IMG_20210409_131548.jpg`, cw, AH), left: cw + g, top: 0 },
      ]).jpeg({ quality: 90 }).toBuffer(); } },

  { out: '03-weight',   q: 'Will it work with my phone?',
    head: 'Two sizes, split by phone weight',
    body: 'Black is best used with phones 171 g (6.0 oz) and under, about the weight of an iPhone 16. Pro is for everything heavier.',
    alt: 'Side by side comparison of Phone Assured Black for phones 171 grams and under and Phone Assured Pro for heavier phones.',
    make: async () => {
      const pad = 24, cw = Math.floor((AW - pad * 3) / 2), ih = AH - pad * 2 - 54;
      const hardware = async (p) => { const m = await sharp(p).metadata(); const left = Math.round(m.width * 0.34);
        return sharp(p).extract({ left, top: 0, width: m.width - left, height: m.height })
          .resize(cw, ih, { fit: 'contain', background: '#ffffff' }).toBuffer(); };
      // Product NAMES only. Without them the comparison is unreadable; the 171 g claim itself stays
      // in the module body text where Amazon can index it.
      const label = `<svg width="${AW}" height="${AH}"><rect width="${AW}" height="${AH}" fill="#ffffff"/>
        <text x="${pad + cw / 2}" y="${AH - 30}" text-anchor="middle" font-family="Helvetica,Arial" font-size="34" font-weight="800" fill="${INK}">BLACK</text>
        <text x="${pad * 2 + cw + cw / 2}" y="${AH - 30}" text-anchor="middle" font-family="Helvetica,Arial" font-size="34" font-weight="800" fill="${SEA}">PRO</text></svg>`;
      return sharp({ create: { width: AW, height: AH, channels: 3, background: '#ffffff' } }).composite([
        { input: Buffer.from(label), left: 0, top: 0 },
        { input: await hardware(`${S}Final Black 1 Clip Images/Packof1.jpg`), left: pad, top: pad },
        { input: await hardware(`${S}Megan Updated Images/1 Pack Pro.jpg`), left: pad * 2 + cw, top: pad },
      ]).jpeg({ quality: 92 }).toBuffer(); } },

  { out: '04-where',    q: 'Where can I use it?',
    head: 'Travel, commuting, everyday',
    body: 'The same clip works on a belt loop, a bag strap, a backpack or a pocket, so it goes wherever you do.',
    alt: 'Three photographs showing a Phone Assured tether in use while travelling in a city, getting out of a car, and walking through a town.',
    make: async () => {
      const g = 8, cw = Math.floor((AW - g * 2) / 3);
      const src = [`${FA}os_Megan_William_Barcelona__Mabel_Llevat_111.jpg`,
                   `${L}_Phone_Assured_Photos_Jan_10th__IMG_3290.jpg`,
                   `${FA}hotos_Megan_Lindsay_Oaxaca__A7_08356.jpg`];
      const parts = []; for (let i = 0; i < 3; i++) parts.push({ input: await cover(src[i], cw, AH), left: i * (cw + g), top: 0 });
      return sharp({ create: { width: AW, height: AH, channels: 3, background: '#ffffff' } }).composite(parts).jpeg({ quality: 90 }).toBuffer(); } },

  { out: '05-water',    q: 'Why do I need this? (the sharp version)',
    head: 'Over water, over a balcony, over a drain',
    body: 'The moments where dropping your phone is not recoverable are the moments this was made for.',
    alt: 'A hand holding a phone out over clear turquoise sea, with the Phone Assured tether attached to the wrist.',
    make: () => cover(`${L}_Phone_Assured_Photos_Cozumel_April_9th__IMG_20210409_131504.jpg`, AW, AH) },

  { out: '06-people',   q: 'Why should I trust you?',
    head: 'Made for everyday people, not for extremes',
    body: 'One year warranty, and a real person answers at hello@phoneassured.com.',
    alt: 'Photographs of customers smiling while using their phones with a Phone Assured tether attached.',
    make: async () => {
      const g = 8, cw = Math.floor((AW - g) / 2);
      return sharp({ create: { width: AW, height: AH, channels: 3, background: '#ffffff' } }).composite([
        { input: await cover(`${FA}os_Megan_William_Barcelona__Mabel_Llevat_132.jpg`, cw, AH, 'top'), left: 0, top: 0 },
        { input: await cover(`${FA}os_Megan_William_Barcelona__Mabel_Llevat_137.jpg`, cw, AH), left: cw + g, top: 0 },
      ]).jpeg({ quality: 90 }).toBuffer(); } },
];

// ---------- SOCIAL : 1080 x 1920, composed inside the 900 x 1280 safe box -------------------
const SW = 1080, SH = 1920, SAFE_TOP = 320, SAFE_H = 1280;
const social = [
  { out: 's1-water', head: 'Held out over the sea.',      sub: 'Still attached.',
    src: `${L}_Phone_Assured_Photos_Cozumel_April_9th__IMG_20210409_131504.jpg` },
  { out: 's2-city',  head: 'Phone out. Hands full.',      sub: 'It stays with you.',
    src: `${FA}os_Megan_William_Barcelona__Mabel_Llevat_126.jpg` },
  { out: 's3-travel',head: 'Wherever you are going.',     sub: 'Clip it on and go.',
    src: `${FA}hotos_Megan_Lindsay_Oaxaca__A7_08356.jpg` },
];

const rows = [];
for (const m of aplus) {
  const f = join(A, `${m.out}.jpg`);
  await sharp(await m.make()).jpeg({ quality: 90 }).toFile(f);
  const meta = await sharp(f).metadata();
  rows.push([`A+ ${m.out}`, `${meta.width}x${meta.height}`, `${(statSync(f).size / 1024).toFixed(0)} KB`]);
}
for (const s of social) {
  const img = await cover(s.src, SW, SH, 'attention');
  const svg = `<svg width="${SW}" height="${SH}">
    <rect x="0" y="${SAFE_TOP + SAFE_H - 300}" width="${SW}" height="300" fill="rgba(10,20,24,.55)"/>
    <text x="90" y="${SAFE_TOP + SAFE_H - 190}" font-family="Helvetica,Arial" font-size="74" font-weight="800" fill="#ffffff">${esc(s.head)}</text>
    <text x="90" y="${SAFE_TOP + SAFE_H - 105}" font-family="Helvetica,Arial" font-size="52" fill="#CFE9E9">${esc(s.sub)}</text>
  </svg>`;
  const f = join(SOC, `${s.out}.jpg`);
  await sharp(img).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 88 }).toFile(f);
  const meta = await sharp(f).metadata();
  rows.push([`social ${s.out}`, `${meta.width}x${meta.height}`, `${(statSync(f).size / 1024).toFixed(0)} KB`]);
}
console.log('BUILT');
rows.forEach(r => console.log('  ' + r[0].padEnd(20) + r[1].padEnd(12) + r[2]));
