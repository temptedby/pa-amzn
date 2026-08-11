/** Contact sheet: look at the pixels BEFORE choosing anything.
 *  DES lesson 4 — sample densely, label every tile, LOOK, then cut once.
 *  RUN: node scripts/pacr/contact-sheet.mjs <srcDir> <outFile> [cols] [max]
 */
import sharp from 'sharp';
import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const [srcDir, outFile, colsArg, maxArg] = process.argv.slice(2);
if (!srcDir || !outFile) { console.error('usage: contact-sheet.mjs <srcDir> <outFile> [cols] [max]'); process.exit(64); }
if (outFile.startsWith('/tmp') || outFile.startsWith('/private/tmp'))
  { console.error('REFUSED: deliverables never go to a temp dir (DES SSC lesson)'); process.exit(65); }

const COLS = Number(colsArg || 4), MAX = Number(maxArg || 48);
const TILE = 380, LABEL = 34, PAD = 6;

const files = readdirSync(srcDir)
  .filter(f => /\.(jpe?g|png)$/i.test(f))
  .map(f => join(srcDir, f))
  .filter(p => statSync(p).isFile())
  .slice(0, MAX);

if (!files.length) { console.error('no images in ' + srcDir); process.exit(1); }

const rows = Math.ceil(files.length / COLS);
const CW = TILE + PAD * 2, CH = TILE + LABEL + PAD * 2;
const W = COLS * CW, H = rows * CH;

const comps = [];
for (let i = 0; i < files.length; i++) {
  const x = (i % COLS) * CW + PAD, y = Math.floor(i / COLS) * CH + PAD;
  // CONTAIN, never cover — we are inspecting the frame, not decorating it
  const meta = await sharp(files[i]).metadata();
  const buf = await sharp(files[i]).rotate()
    .resize(TILE, TILE, { fit: 'contain', background: { r: 22, g: 24, b: 26 } })
    .jpeg({ quality: 78 }).toBuffer();
  comps.push({ input: buf, left: x, top: y });
  const name = basename(files[i]).replace(/&/g, '&amp;').slice(0, 42);
  const label = `<svg width="${TILE}" height="${LABEL}"><rect width="100%" height="100%" fill="#101F24"/>`
    + `<text x="6" y="14" font-family="Helvetica" font-size="12" fill="#7FD4CE">${i + 1}. ${meta.width}x${meta.height}</text>`
    + `<text x="6" y="28" font-family="Helvetica" font-size="11" fill="#cfd8da">${name}</text></svg>`;
  comps.push({ input: Buffer.from(label), left: x, top: y + TILE });
}

await sharp({ create: { width: W, height: H, channels: 3, background: { r: 16, g: 18, b: 20 } } })
  .composite(comps).jpeg({ quality: 82 }).toFile(outFile);
console.log(`${files.length} tiles -> ${outFile}  (${W}x${H})`);
