/** One social set, rendered for every surface we actually post to.
 *
 *  William 2026-08-14: "we need to build more like brc from the videos and images please with
 *  design for the A+ content and social media yt ig fb and tt", and he confirmed Buffer can post
 *  free to TikTok and YouTube while Instagram and Facebook already exist for Phone Assured.
 *
 *  WHY THIS EXISTS when three A+ sets already do. The gap was never A+, it was reach: `social/`
 *  held three files on ONE canvas. A 1080x1920 asset covers Reels, Stories, TikTok and Shorts, but
 *  an Instagram or Facebook feed post is 4:5 and a YouTube video is 16:9, and posting a vertical
 *  into either pillarboxes it. So each concept renders across five canvases.
 *
 *  RULES THIS OBEYS (CREATIVE-BUILD-PROCESS.md, PACR):
 *    - evergreen: no price, no pack count, no date, no season, no offer
 *    - never a strength or load claim — we have no measured number
 *    - never imply the phone retracts on its own; the cord retracts and you guide the phone back
 *    - pillars are DISCREET and BACKED FOR A YEAR, not durability and not strength
 *    - the lanyard and wristband are discontinued and appear in none of these frames
 *    - band the media from the SOURCE aspect; never crop into a subject
 *
 *  RUN: node scripts/pacr/build-social-platforms.mjs
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEA, TYPE, esc } from './design-system.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'build/creative/social-platforms');
const L = `${ROOT}/assets/source/_lifestyle/`;
const FA = `${ROOT}/assets/source/_faces/`;

// The five canvases, and the surfaces each one actually serves. Deduplicated on purpose: one
// vertical file serves four platforms, so building "one per platform" would be four copies of the
// same pixels and four times the review burden.
const CANVAS = {
  vertical: { w: 1080, h: 1920, serves: 'IG Reels + Stories · TikTok · YouTube Shorts · FB Reels' },
  feed:     { w: 1080, h: 1350, serves: 'Instagram feed · Facebook feed' },
  square:   { w: 1080, h: 1080, serves: 'IG + FB square' },
  wide:     { w: 1920, h: 1080, serves: 'YouTube video · Facebook link' },
  thumb:    { w: 1280, h:  720, serves: 'YouTube thumbnail' },
};

// Six concepts. Each one is a real photograph with the product visible and a person using it.
// THE VOICE, from William 2026-08-03 and it is the brief: "I really like comedy. I really like
// positive energy. I don't want to give people fear... I want to give people encouragement that
// this can help save them have worry-free days. You go to a festival, you're out boating, you're
// running, you now have additional support and protection through all these activities without
// losing the most important thing... Phone assured leaves you feeling assured."
//
// So: never lead on the loss. Lead on the freedom the clip buys you and let the reassurance be the
// punchline. "Back seats keep phones" was fear dressed as a fact, and he was right to reject it.
// Headlines stay short because the same line has to read on a 1280x720 thumbnail.
const CONCEPTS = [
  { id: '01-water',  src: `${L}_Phone_Assured_Photos_Cozumel_April_9th__IMG_20210409_131504.jpg`,
    head: 'Go on. Hold it out.', sub: 'Your phone is not going anywhere.', focus: 'centre' },

  // FORCED TO COVER ON THE TALL CANVASES, and the override earns its place. This is the only
  // landscape source in the set, so the orientation rule sends it to the blurred fill and the
  // subject ends up in the middle 40% of a 9:16 frame with grey blur above and below. But the
  // waistband and the clip sit dead centre, so cropping here removes pink brick and nothing else.
  // A rule cannot see that; it was decided by opening the file.
  { id: '02-waist',  src: `${L}hone_Assured_Photos_Megan_Lindsay_Oaxaca__A7_08247.jpg`,
    head: 'Goes with everything.', sub: 'Clipped on, out of the way, off your mind.', focus: 'centre',
    force: { vertical: 'cover', feed: 'cover', square: 'cover' } },

  { id: '03-call',   src: `${L}hone_Assured_Photos_Megan_Lindsay_Oaxaca__A7_08215.jpg`,
    head: 'Talk with your hands.', sub: 'Both of them. It is staying right where you put it.', focus: 'north' },

  { id: '04-denim',  src: `${L}_Phone_Assured_Photos_Dec_10__IMG_20201210_151525.jpg`,
    head: 'Pocket. Belt loop. Bag strap.', sub: 'Wherever your phone already lives, this lives too.', focus: 'centre' },

  { id: '05-car',    src: `${L}_Phone_Assured_Photos_Jan_10th__IMG_3290.jpg`,
    head: 'Leave with everything.', sub: 'Especially the phone.', focus: 'centre' },

  { id: '06-reel',   src: `${L}_Phone_Assured_Photos_Cozumel_April_9th__IMG_20210409_131548.jpg`,
    head: 'One little reel. Zero worry.', sub: 'Backed for a year, and we mean it.', focus: 'centre' },

  // ---- WAVE TWO, William 2026-08-14: "lets continue to build" ----------------------------------
  // The four Barcelona frames were already vouched for in build-set-v2.mjs on the test that matters
  // here: every one has a hand, a phone and the cord doing something, rather than a person posing
  // beside a product.
  // 142 was dropped after the contact sheet: a tight crop of two hands and a phone against a black
  // and yellow field, unreadable at thumbnail size. Replaced with a full-body frame where the clip
  // is on the person and the setting does some work.
  { id: '07-lean',   src: `${L}hone_Assured_Photos_Megan_Lindsay_Oaxaca__A7_08260.jpg`,
    head: 'Long calls. Zero babysitting.', sub: 'It waits on your hip until you need it.', focus: 'centre' },

  // 125 dropped at the sheet stage. It is a landscape frame the man fills edge to edge, so every
  // vertical crop that keeps the phone loses his head, and the blurred-fill alternative leaves the
  // photo as a thin strip. Neither is worth a slot when eleven others are clean.

  // 126 was dropped on a PRODUCT-TRUTH read, not a composition one. It shows the phone in one hand
  // and the reel in the other with the cord taut between them, which at a glance reads as the phone
  // hanging from the cord. That is the exact misreading Stevo's one-star review is about — "they
  // show a phone hanging from this lanyard... but actually he must be holding the line" — and PACR
  // forbids it. Replaced with a frame that carries the same freedom idea and no ambiguity.
  { id: '09-wander', src: `${L}hone_Assured_Photos_Megan_Lindsay_Oaxaca__A7_08389.jpg`,
    head: 'Wander further.', sub: 'Everything that matters is coming with you.', focus: 'centre' },

  { id: '10-street', src: `${FA}os_Megan_William_Barcelona__Mabel_Llevat_111.jpg`,
    head: 'Busy street, easy mind.', sub: 'It goes where you go, quietly.', focus: 'north' },

  { id: '11-dog',    src: `${L}_Phone_Assured_Photos_March_6__DSC_0544_00137.jpg`,
    head: 'Some of us guard it better.', sub: 'Good thing it is clipped on.', focus: 'centre' },

  { id: '12-denim2', src: `${L}_Phone_Assured_Photos_Dec_10__IMG_20201210_151810.jpg`,
    head: 'Out all day. Still on you.', sub: 'Worry-free is the whole point.', focus: 'north' },
];

/** Fit a photograph to a canvas WITHOUT cropping into the subject.
 *
 *  When the source and target aspects are close, cover is honest. When they are far apart — a
 *  6000x4000 landscape asked for a 9:16 canvas is a 2.7x aspect change — cover would slice most of
 *  the frame away, and a letterbox leaves dead bars. So the frame is contained over a BLURRED,
 *  darkened copy of itself. That is the rule in CREATIVE-BUILD-PROCESS.md step 9, applied here
 *  wherever the mismatch is real rather than only on video. */
async function place(src, w, h, focus, force) {
  if (force === 'cover') return sharp(src).rotate().resize(w, h, { fit: 'cover', position: focus }).toBuffer();
  const meta = await sharp(src).rotate().metadata();
  const sa = meta.width / meta.height, ta = w / h;

  // THE TEST IS ORIENTATION, NOT DRIFT. My first version compared aspect ratios and blurred
  // anything past 18%, which sent a 3456x4608 portrait into a 1080x1920 vertical down the blurred
  // path — a crop that would only ever have removed background at the left and right edges. The
  // result was a subject occupying the middle 40% of the frame with grey blur above and below.
  // Looking at it is what caught it; every automated check passed.
  //
  // Cover is safe when the source and the canvas AGREE about orientation, because the crop then
  // eats the long edge, which is where the background lives. It is unsafe when they disagree — a
  // portrait forced into 16:9 slices head and feet off a standing person — and that is the only
  // case that earns the blurred fill.
  const sourceIsWide = sa > 1.05, canvasIsWide = ta > 1.05;
  const agree = sourceIsWide === canvasIsWide || Math.abs(ta - 1) < 0.05;   // square agrees with both
  if (agree) {
    return sharp(src).rotate().resize(w, h, { fit: 'cover', position: focus }).toBuffer();
  }
  const bg = await sharp(src).rotate().resize(w, h, { fit: 'cover', position: 'centre' })
    .blur(38).modulate({ brightness: 0.55 }).toBuffer();
  const fg = await sharp(src).rotate().resize(w, h, { fit: 'inside' }).toBuffer();
  return sharp(bg).composite([{ input: fg, gravity: 'centre' }]).toBuffer();
}

/** The caption. Scaled to the canvas rather than fixed, because a 40px headline that reads well on
 *  970x600 is invisible on 1920x1080 and overwhelming on a 1280x720 thumbnail. */
/** Measure, wrap, and shrink until the headline FITS.
 *
 *  SVG <text> does not wrap and does not care that it has run off the canvas, so the first build
 *  rendered "Leave with everything you arrived with." straight off the right edge of a 1280x720
 *  thumbnail, cut mid-word. Nothing caught it but opening the file. This is the PACR refuse-level
 *  assert "text overflows its box", enforced here at draw time so it cannot recur with new copy.
 *
 *  0.55 em per character is the measured average for Helvetica Bold in mixed case. Caps-heavy
 *  strings run wider, which is why the loop shrinks rather than trusting one multiplier. */
function fitLines(text, maxW, size, em = 0.55) {
  const width = (str, px) => str.length * px * em;
  let px = size;
  for (let i = 0; i < 40; i++) {
    const words = String(text).split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (width(next, px) <= maxW || !cur) cur = next;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    // Two lines is the most a caption block may carry; beyond that it eats the picture.
    if (lines.length <= 2 && lines.every((l) => width(l, px) <= maxW)) return { lines, px };
    px = Math.round(px * 0.94);
  }
  return { lines: [String(text)], px };
}

/** The caption. Scaled to the canvas rather than fixed, because a 40px headline that reads well on
 *  970x600 is invisible on 1920x1080 and overwhelming on a 1280x720 thumbnail. */
function caption(w, h, head, sub, big) {
  const k = w / 1080;
  const pad = Math.round(52 * k);
  const maxW = w - pad * 2;
  const H = fitLines(head, maxW, Math.round((big ? 68 : TYPE.head + 12) * k));
  const S = fitLines(sub, maxW, Math.round(28 * k), 0.5);
  const lh = Math.round(H.px * 1.06);
  const headH = lh * H.lines.length;
  const subH = Math.round(S.px * 1.25) * S.lines.length;
  const blockH = headH + subH + pad * 2 + Math.round(14 * k);
  const top = h - blockH;
  const headY = (i) => top + pad + H.px * 0.74 + lh * i;
  const subY = (i) => top + pad + headH + Math.round(14 * k) + S.px * 0.78 + Math.round(S.px * 1.25) * i;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(9,20,24,0)"/><stop offset="1" stop-color="rgba(9,20,24,.93)"/>
    </linearGradient></defs>
    <rect x="0" y="${top - Math.round(150 * k)}" width="${w}" height="${blockH + Math.round(150 * k)}" fill="url(#g)"/>
    <rect x="${pad}" y="${top + Math.round(6 * k)}" width="${Math.round(96 * k)}" height="${Math.max(4, Math.round(6 * k))}" fill="${SEA}"/>
    ${H.lines.map((l, i) => `<text x="${pad}" y="${headY(i)}" font-family="Helvetica,Arial" font-size="${H.px}"
      font-weight="800" letter-spacing="${-1.2 * k}" fill="#ffffff">${esc(l)}</text>`).join('')}
    ${S.lines.map((l, i) => `<text x="${pad}" y="${subY(i)}" font-family="Helvetica,Arial"
      font-size="${S.px}" fill="#CFE6E7">${esc(l)}</text>`).join('')}
  </svg>`;
}

mkdirSync(OUT, { recursive: true });

// CLEAN FIRST. Renaming a concept leaves its old files behind, and they are indistinguishable from
// current work in a folder listing, a contact sheet, or a Drive upload. Two dropped concepts made
// it into the review sheet this way before this line existed.
for (const f of readdirSync(OUT)) if (f.endsWith('.jpg')) rmSync(join(OUT, f));

const built = [];
for (const c of CONCEPTS) {
  for (const [name, cv] of Object.entries(CANVAS)) {
    const base = await place(c.src, cv.w, cv.h, c.focus, c.force?.[name]);
    const buf = await sharp(base)
      .composite([{ input: Buffer.from(caption(cv.w, cv.h, c.head, c.sub, name === 'thumb' || name === 'wide')), top: 0, left: 0 }])
      .jpeg({ quality: 90 }).toBuffer();
    const file = join(OUT, `${c.id}-${name}.jpg`);
    writeFileSync(file, buf);
    built.push({ concept: c.id, canvas: name, w: cv.w, h: cv.h, serves: cv.serves,
      file: file.replace(ROOT + '/', ''), bytes: buf.length, head: c.head, sub: c.sub, source: c.src.replace(ROOT + '/', '') });
  }
}
writeFileSync(join(OUT, '_manifest.json'), JSON.stringify({ builtAt: null, assets: built }, null, 1));
console.log(`${built.length} assets -> build/creative/social-platforms`);
for (const [name, cv] of Object.entries(CANVAS)) console.log(`  ${String(cv.w + 'x' + cv.h).padEnd(10)} ${name.padEnd(9)} ${cv.serves}`);
const over = built.filter(b => b.bytes > 4e6);
console.log(over.length ? `WARN ${over.length} over 4MB` : 'all under 4MB');
