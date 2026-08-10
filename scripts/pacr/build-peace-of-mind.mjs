/** "Peace of mind" gallery — smiling people, product visible, PACR 7 register.
 *  William 2026-08-10: "should create a gallery people smiling", "build peace of mind".
 *  The straight-faced Barcelona frames were rejected: they read as catalogue, not reassurance.
 *  RUN: PACR_INTENT=confabulator/intents/peace-of-mind-gallery.json node scripts/pacr/build-peace-of-mind.mjs */
import sharp from 'sharp';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIntent } from '../../src/lib/creative/pacr-rules.mjs';
import { tokenPath } from './pacr-gate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const intent = JSON.parse(readFileSync(process.env.PACR_INTENT, 'utf8'));
if (!existsSync(tokenPath(intent))) { console.error('no PACR pass token'); process.exit(2); }
const v = checkIntent(intent); if (!v.ok) { console.error(v.failures); process.exit(2); }

const S = 2000, F = `${ROOT}/assets/source/_faces/os_Megan_William_Barcelona__Mabel_Llevat_`;
const INK = '#12242B', SOFT = '#5A6E75', SEA = '#0C7C82';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// HERO is the warmest genuine smile we own. It carries no product on its own, which is why it
// never ships alone: the three frames beside it all show the tether in use.
const hero  = await sharp(`${F}132.jpg`).rotate().resize(1180, 1000, { fit: 'cover', position: 'top' }).toBuffer();
const a     = await sharp(`${F}126.jpg`).rotate().resize(560, 480, { fit: 'cover' }).toBuffer();
const b     = await sharp(`${F}111.jpg`).rotate().resize(560, 480, { fit: 'cover' }).toBuffer();
const c     = await sharp(`${F}125.jpg`).rotate().resize(1180, 480, { fit: 'cover' }).toBuffer();

const svg = `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${S}" height="${S}" fill="#ffffff"/>
  <text x="120" y="150" font-family="Helvetica,Arial" font-size="104" font-weight="800"
        letter-spacing="-3" fill="${INK}">${esc(intent.headline)}</text>
  <text x="120" y="222" font-family="Helvetica,Arial" font-size="44" fill="${SOFT}">${esc(intent.body[0])}</text>
  <rect x="120" y="1880" width="86" height="7" fill="${SEA}"/>
  <text x="120" y="1854" font-family="Helvetica,Arial" font-size="40" font-weight="600" fill="${INK}">${esc(intent.body[1])}</text>
</svg>`;

await sharp({ create: { width: S, height: S, channels: 3, background: '#ffffff' } })
  .composite([
    { input: Buffer.from(svg), top: 0, left: 0 },
    { input: hero, top: 270, left: 120 },
    { input: a,    top: 270, left: 1320 },
    { input: b,    top: 790, left: 1320 },
    { input: c,    top: 1310, left: 120 },
    // 137, not 134. This panel is landscape and 134 is a face portrait, so every automatic crop
    // cut her head: 'top' took the forehead off, and sharp's 'attention' strategy locked onto the
    // red dress and removed the eyes. 137 is framed landscape at source and needs no rescue crop.
    { input: await sharp(`${F}137.jpg`).rotate().resize(560, 480, { fit: 'cover' }).toBuffer(), top: 1310, left: 1320 },
  ])
  .jpeg({ quality: 92 })
  .toFile(`${ROOT}/build/creative/peace-of-mind.jpg`);
console.log('built build/creative/peace-of-mind.jpg');
