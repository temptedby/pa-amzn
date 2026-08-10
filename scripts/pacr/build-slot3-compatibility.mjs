/** Slot 3 — "Will it work with my phone?" Built from real pack shots + the 171 g rule. */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { checkIntent } from '../../src/lib/creative/pacr-rules.mjs';
import { tokenPath } from './pacr-gate.mjs';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const intent = JSON.parse(readFileSync(process.env.PACR_INTENT, 'utf8'));
if (!existsSync(tokenPath(intent))) { console.error('no PACR pass token for this exact intent'); process.exit(2); }
const v = checkIntent(intent); if (!v.ok) { console.error(v.failures); process.exit(2); }

const S = 2000;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BLUE = '#0B3D91', INK = '#141414', GREY = '#6b6b6b', LINE = '#e2e2e2';
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const BLACK_PHONES = ['iPhone 16','iPhone 15','iPhone 12','Galaxy S25','Galaxy S24','Galaxy S23'];
const PRO_PHONES   = ['iPhone 17 Pro','iPhone 16 Pro Max','Galaxy S25 Ultra','Pixel 10','Pixel 9 Pro','any Fold'];

// real product cut-outs, white background preserved
const cut = async (p, w) => sharp(`${ROOT}/assets/source/${p}`).resize(w, w, { fit: 'contain', background: '#ffffff' }).toBuffer();
const black = await cut('Final Black 1 Clip Images/Packof1.jpg', 760);
const pro   = await cut('Megan Updated Images/1 Pack Pro.jpg', 760);

const col = (x, title, sub, phones, accent) => `
  <text x="${x+380}" y="1080" text-anchor="middle" font-family="Helvetica,Arial" font-size="86" font-weight="800" fill="${accent}">${esc(title)}</text>
  <text x="${x+380}" y="1160" text-anchor="middle" font-family="Helvetica,Arial" font-size="46" font-weight="600" fill="${INK}">${esc(sub)}</text>
  ${phones.map((p,i)=>`<text x="${x+380}" y="${1268+i*74}" text-anchor="middle" font-family="Helvetica,Arial" font-size="44" fill="${GREY}">${esc(p)}</text>`).join('')}
`;

const svg = `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${S}" height="${S}" fill="#ffffff"/>
  <text x="${S/2}" y="130" text-anchor="middle" font-family="Helvetica,Arial" font-size="96" font-weight="800" fill="${INK}">${esc(intent.headline)}</text>
  <rect x="${S/2-3}" y="230" width="6" height="1500" fill="${LINE}"/>
  ${col(120,  'BLACK', '171 g (6.0 oz) and under', BLACK_PHONES, INK)}
  ${col(1120, 'PRO',   'Heavier than 171 g',        PRO_PHONES,  BLUE)}
  <text x="${S/2}" y="1810" text-anchor="middle" font-family="Helvetica,Arial" font-size="42" fill="${GREY}">About the weight of an iPhone 16. Your phone's weight is on the maker's spec page.</text>
  <text x="${S/2}" y="1900" text-anchor="middle" font-family="Helvetica,Arial" font-size="38" fill="${GREY}">Both work with cases, grips and ring holders.</text>
</svg>`;

await sharp({ create: { width: S, height: S, channels: 3, background: '#ffffff' } })
  .composite([
    { input: Buffer.from(svg), top: 0, left: 0 },
    { input: black, top: 230, left: 120 },
    { input: pro,   top: 230, left: 1120 },
  ])
  .jpeg({ quality: 92 })
  .toFile(`${ROOT}/build/creative/slot3-compatibility.jpg`);
console.log('built build/creative/slot3-compatibility.jpg');
