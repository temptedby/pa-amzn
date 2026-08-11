/** render.mjs — THE renderer. One builder, HTML/CSS -> headless Chromium -> PNG/JPEG.
 *
 *  Ported from the Social Scene method (confabulator/media-build-lessons-from-social-scene.md,
 *  social-media-build-system-reference.md). The rules below are ASSERTS, not notes, because
 *  "be more careful" is the control that has failed most often.
 *
 *    - contain-and-pad, never crop into a subject   (lesson 1: square source, landscape frame)
 *    - text auto-fits or the render HARD-FAILS      (lesson 10: a clipped word reads as broken)
 *    - a text box may never intersect a face box    (lesson 10 + the QA manifest idea)
 *    - deliverables never land in a temp dir        (SSC: a reboot destroyed a full approved day)
 *    - emit a build manifest beside every image     (turns flaky CV checks into deterministic asserts)
 *
 *  RUN: imported by build-*.mjs. Not a CLI.
 */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

/** Amazon Standard A+ canvases. EXACT match required — Amazon rescales a mismatch and it goes soft. */
export const CANVAS = {
  APLUS_HEADER:  { w: 970, h: 600 },
  APLUS_BANNER:  { w: 970, h: 300 },
  APLUS_THREE:   { w: 300, h: 300 },
  APLUS_FOUR:    { w: 220, h: 220 },
  APLUS_LOGO:    { w: 600, h: 180 },
  SOCIAL_TALL:   { w: 1080, h: 1920 },
  LISTING_SQUARE:{ w: 2000, h: 2000 },
};
export const APLUS_MAX_BYTES = 2 * 1024 * 1024;

/** Inline an image as a data URI, contained into a box so nothing is ever cut.
 *  Returns the natural aspect so the caller can size the media band FROM the source. */
export async function media(path, { maxW = 2000, maxH = 2000 } = {}) {
  const img = sharp(path).rotate();                    // rotation metadata lies; normalise it
  const meta = await img.metadata();
  const buf = await img.resize(maxW, maxH, { fit: 'inside', withoutEnlargement: true })
                       .jpeg({ quality: 92 }).toBuffer();
  return {
    uri: `data:image/jpeg;base64,${buf.toString('base64')}`,
    w: meta.width, h: meta.height, aspect: meta.width / meta.height, path,
  };
}

/** Crop one panel out of a composite grid, by fraction of the frame. Contain-safe by construction. */
export async function panel(path, { left, top, width, height }) {
  const img = sharp(path).rotate();
  const m = await img.metadata();
  const box = {
    left: Math.round(left * m.width), top: Math.round(top * m.height),
    width: Math.round(width * m.width), height: Math.round(height * m.height),
  };
  const buf = await img.extract(box).jpeg({ quality: 92 }).toBuffer();
  const mm = await sharp(buf).metadata();
  return { uri: `data:image/jpeg;base64,${buf.toString('base64')}`, w: mm.width, h: mm.height, aspect: mm.width / mm.height, path };
}

/**
 * Render HTML at an exact canvas and write it out.
 * @returns {Promise<{file:string,bytes:number,manifest:object}>}
 */
export async function render({ html, canvas, out, format = 'jpeg', quality = 88, manifest = {} }) {
  const abs = resolve(out);
  if (abs.startsWith('/tmp/') || abs.startsWith('/private/tmp/'))
    throw new Error(`REFUSED: deliverable would land in a temp dir (${abs}). See the SSC lesson.`);
  mkdirSync(dirname(abs), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: canvas.w, height: canvas.h },
      deviceScaleFactor: 2,                            // render at 2x, downsample: crisper type
    });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    /* ---- ASSERT: nothing overflows its box. A clipped word reads as broken.
       Horizontal is strict: a word running past its box is the failure DES names.
       Vertical is only a failure when something actually CLIPS it (overflow != visible, or a
       fixed height). On an auto-height block, scrollHeight routinely exceeds clientHeight by
       line-height rounding and nothing is lost. ---- */
    const overflow = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('[data-fit]')) {
        const cs = getComputedStyle(el);
        const t = el.textContent.trim().slice(0, 48);
        if (el.scrollWidth > el.clientWidth + 1)
          bad.push({ t, why: 'width', a: el.scrollWidth, b: el.clientWidth });
        let clipped = cs.overflow !== 'visible' || el.style.height;
        for (let p = el.parentElement; p && !clipped; p = p.parentElement)
          if (getComputedStyle(p).overflow !== 'visible') clipped = true;
        if (clipped && el.scrollHeight > el.clientHeight + 1)
          bad.push({ t, why: 'height', a: el.scrollHeight, b: el.clientHeight });
      }
      return bad;
    });
    if (overflow.length) {
      throw new Error('TEXT OVERFLOW, render refused:\n' +
        overflow.map(o => `   "${o.t}"  ${o.why} ${o.a} in ${o.b}`).join('\n'));
    }

    /* ---- ASSERT: nothing runs off the canvas itself. Per-element checks all pass when each box
       fits but their CONTAINER overflows — that is how module 05 lost its fourth answer. ---- */
    const spill = await page.evaluate(() => {
      const H = window.innerHeight, W = window.innerWidth, out = [];
      for (const el of document.querySelectorAll('[data-fit],[data-media]')) {
        const b = el.getBoundingClientRect();
        if (b.bottom > H + 1 || b.right > W + 1 || b.top < -1 || b.left < -1)
          out.push(`"${el.textContent.trim().slice(0, 40)}" at ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
      return out;
    });
    if (spill.length) throw new Error('CONTENT OFF-CANVAS, render refused:\n' + spill.map(x => '   ' + x).join('\n'));

    /* ---- ASSERT: no text box intersects a declared face/subject box. ---- */
    const collide = await page.evaluate(() => {
      const r = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const hit = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
      const faces = [...document.querySelectorAll('[data-face]')].map(r);
      const texts = [...document.querySelectorAll('[data-fit]')].map(el => ({ box: r(el), t: el.textContent.trim().slice(0, 40) }));
      const out = [];
      for (const t of texts) for (const f of faces) if (hit(t.box, f)) out.push(t.t);
      return out;
    });
    if (collide.length) throw new Error('TEXT OVER A FACE, render refused: ' + collide.join(' | '));


    /* ---- WARN: dead space. Tile the canvas, flag large empty regions.
       DES Tier-3: warn only, never auto-reject — "clean" and "empty" are not the same thing. ---- */
    const dead = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('[data-fit],[data-media],[data-ink]')]
        .map(el => el.getBoundingClientRect()).filter(b => b.width > 2 && b.height > 2);
      const COLS = 8, ROWS = 6, W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
      const cw = W / COLS, ch = H / ROWS;
      let empty = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const t = { x: c * cw, y: r * ch, w: cw, h: ch };
        const hit = boxes.some(b => !(b.x + b.width <= t.x || t.x + t.w <= b.x || b.y + b.height <= t.y || t.y + t.h <= b.y));
        if (!hit) empty++;
      }
      return empty / (COLS * ROWS);
    });
    if (dead > 0.34) console.log(`     ! dead space ${(dead * 100).toFixed(0)}% of the frame carries nothing`);

    /* ---- capture the manifest BEFORE screenshotting, so the gate can assert on it ---- */
    const boxes = await page.evaluate(() => {
      const grab = sel => [...document.querySelectorAll(sel)].map(el => {
        const b = el.getBoundingClientRect();
        return { text: el.textContent.trim().slice(0, 120), x: Math.round(b.x), y: Math.round(b.y),
                 w: Math.round(b.width), h: Math.round(b.height),
                 color: getComputedStyle(el).color, size: getComputedStyle(el).fontSize };
      });
      return { text: grab('[data-fit]'), face: grab('[data-face]'), media: grab('[data-media]') };
    });

    const shot = await page.screenshot({ type: 'png' });
    let img = sharp(shot).resize(canvas.w, canvas.h, { fit: 'fill' });
    let buf = format === 'png' ? await img.png().toBuffer() : await img.jpeg({ quality }).toBuffer();

    /* ---- A+ has a hard 2 MB cap. Step quality down rather than ship a rejected file. ---- */
    let q = quality;
    while (buf.length > APLUS_MAX_BYTES && q > 40) {
      q -= 8;
      buf = await sharp(shot).resize(canvas.w, canvas.h, { fit: 'fill' }).jpeg({ quality: q }).toBuffer();
    }
    if (buf.length > APLUS_MAX_BYTES) throw new Error(`still ${(buf.length/1048576).toFixed(2)} MB over the 2 MB A+ cap`);

    writeFileSync(abs, buf);
    const man = { ...manifest, canvas, file: abs, bytes: buf.length, quality: q, boxes, deadSpace: dead, built: 'render.mjs' };
    writeFileSync(abs.replace(/\.(jpe?g|png)$/i, '.manifest.json'), JSON.stringify(man, null, 2));
    return { file: abs, bytes: buf.length, manifest: man };
  } finally {
    await browser.close();
  }
}
