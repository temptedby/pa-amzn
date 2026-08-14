/** build-testimonials-v2.mjs — every cardable review, one card each, photo matched to the words.
 *
 *  What changed from v1 (William, 2026-08-11): "if someone reviewed jeans, don't show a picture of
 *  someone in khaki slacks." Photos are now chosen IN reviews.mjs, next to the quote, with a stated
 *  reason. The builder cannot pick a photo; it can only lay one out.
 *
 *  Template is chosen by the SOURCE ASPECT, not by taste, so nothing is ever cropped into a subject.
 *  Tall sources get a full-bleed treatment. Wide sources get a band sized from their own aspect and
 *  the design carries the rest. A landscape photo forced into a 9:16 full bleed is exactly how a
 *  head gets cut off.
 *
 *  RUN: node scripts/pacr/build-testimonials-v2.mjs [id ...]
 */
import { render, media, CANVAS } from './render.mjs';
import { C, FONT, RESET } from './tokens.mjs';
import { CARDABLE } from './reviews.mjs';

const OUT = 'build/creative/testimonials-v2';
const W = 1080, H = 1920;
const S = n => '★'.repeat(n) + '☆'.repeat(5 - n);

const shell = inner => `<!doctype html><html><head><meta charset="utf-8"><style>${RESET}
  .stars{font-family:${FONT};font-weight:400;font-size:27px;letter-spacing:.16em;color:${C.seal}}
  .who{font-family:${FONT};font-weight:600;font-size:23px;letter-spacing:-.005em}
  .when{font-family:${FONT};font-weight:400;font-size:19px}
  .eyebrow{font-family:${FONT};font-weight:600;font-size:15px;letter-spacing:.15em;
    text-transform:uppercase}
  .quote{font-family:${FONT};font-weight:500;letter-spacing:-.014em}
  .mark{font-family:Georgia,serif;font-size:150px;line-height:.62;color:${C.slate};opacity:.2}
</style></head><body>${inner}</body></html>`;

/** Quote type scales with length, so a long review never has to be clipped to fit. */
const qsize = q => q.length > 240 ? 35 : q.length > 175 ? 39 : q.length > 120 ? 44 : 50;

/* ── A · tall source, full bleed, quote on a scrim in the lower third ──────────────────── */
const tplA = (r, m) => shell(`
  <div style="width:${W}px;height:${H}px;position:relative;overflow:hidden;background:${C.ink}">
    <img data-media src="${m.uri}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 30%">
    <div style="position:absolute;inset:0;background:linear-gradient(to bottom,
      rgba(12,16,18,0) 30%, rgba(12,16,18,.70) 52%, rgba(12,16,18,.95) 76%)"></div>
    <div style="position:absolute;left:78px;right:78px;bottom:172px">
      <div data-fit class="eyebrow" style="color:#93B6C4;margin-bottom:22px">Verified Amazon review</div>
      <div data-fit class="stars" style="margin-bottom:24px">${S(r.stars)}</div>
      <div data-fit class="quote" style="font-size:${qsize(r.quote)}px;line-height:1.31;color:#fff">“${r.quote}”</div>
      <div data-fit class="who" style="color:#fff;margin-top:36px">${r.name}</div>
      <div data-fit class="when" style="color:#B7C2C6">${r.date}</div>
    </div>
  </div>`);

/* ── B · wide source, band sized from its own aspect, quote on paper below ─────────────── */
const tplB = (r, m) => {
  const bh = Math.min(Math.round(W / m.aspect), 1120);
  return shell(`
  <div style="width:${W}px;height:${H}px;display:flex;flex-direction:column;background:${C.paper}">
    <div data-media style="width:${W}px;height:${bh}px;overflow:hidden">
      <img src="${m.uri}" style="width:100%;height:100%;object-fit:cover">
    </div>
    <div style="flex:1;padding:70px 80px 84px;display:flex;flex-direction:column;justify-content:center">
      <div data-fit class="mark">“</div>
      <div data-fit class="quote" style="font-size:${qsize(r.quote)}px;line-height:1.3;color:${C.ink};margin-top:-10px">${r.quote}</div>
      <div style="display:flex;align-items:baseline;gap:16px;margin-top:auto;padding-top:40px">
        <div data-fit class="stars">${S(r.stars)}</div>
        <div data-fit class="who" style="color:${C.ink}">${r.name}</div>
        <div data-fit class="when" style="color:${C.muted}">· ${r.date}</div>
      </div>
    </div>
  </div>`);
};

/* ── C · quote first on paper, photo beneath, for the shortest quotes ──────────────────── */
const tplC = (r, m) => {
  const bh = Math.min(Math.round(W / m.aspect), 1040);
  return shell(`
  <div style="width:${W}px;height:${H}px;display:flex;flex-direction:column;background:${C.paper}">
    <div style="padding:118px 80px 60px">
      <div data-fit class="eyebrow" style="color:${C.slate};margin-bottom:30px">Verified Amazon review</div>
      <div data-fit class="quote" style="font-size:${qsize(r.quote) + 4}px;line-height:1.24;color:${C.ink}">“${r.quote}”</div>
      <div style="display:flex;align-items:baseline;gap:16px;margin-top:34px">
        <div data-fit class="stars">${S(r.stars)}</div>
        <div data-fit class="who" style="color:${C.ink}">${r.name}</div>
        <div data-fit class="when" style="color:${C.muted}">· ${r.date}</div>
      </div>
    </div>
    <div data-media style="width:${W}px;height:${bh}px;margin-top:auto;overflow:hidden">
      <img src="${m.uri}" style="width:100%;height:100%;object-fit:cover;object-position:50% 42%">
    </div>
  </div>`);
};

/* ── D · tall source, photo inset in a card on the ink ground, quote below ─────────────── */
const tplD = (r, m) => {
  const cw = 880, ch = Math.min(Math.round(cw / m.aspect), 1080);
  return shell(`
  <div style="width:${W}px;height:${H}px;background:${C.ink};display:flex;flex-direction:column;
    align-items:center;padding:96px 100px 104px">
    <div data-media style="width:${cw}px;height:${ch}px;overflow:hidden;border-radius:3px;
      box-shadow:0 26px 70px rgba(0,0,0,.5)">
      <img src="${m.uri}" style="width:100%;height:100%;object-fit:cover">
    </div>
    <div style="width:${cw}px;margin-top:54px">
      <div data-fit class="stars" style="margin-bottom:22px">${S(r.stars)}</div>
      <div data-fit class="quote" style="font-size:${qsize(r.quote)}px;line-height:1.3;color:#fff">${r.quote}</div>
      <div style="display:flex;align-items:baseline;gap:16px;margin-top:32px">
        <div data-fit class="who" style="color:#fff">${r.name}</div>
        <div data-fit class="when" style="color:#9FADB3">· ${r.date}</div>
      </div>
    </div>
  </div>`);
};

/* ── E · full bleed with the quote at the TOP, so a lower-frame subject stays clear ────── */
const tplE = (r, m) => shell(`
  <div style="width:${W}px;height:${H}px;position:relative;overflow:hidden;background:${C.ink}">
    <img data-media src="${m.uri}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 62%">
    <div style="position:absolute;inset:0;background:linear-gradient(to top,
      rgba(12,16,18,0) 44%, rgba(12,16,18,.66) 68%, rgba(12,16,18,.94) 88%)"></div>
    <div style="position:absolute;left:78px;right:78px;top:150px">
      <div data-fit class="stars" style="margin-bottom:24px">${S(r.stars)}</div>
      <div data-fit class="quote" style="font-size:${qsize(r.quote)}px;line-height:1.29;color:#fff">“${r.quote}”</div>
      <div style="display:flex;align-items:baseline;gap:16px;margin-top:32px">
        <div data-fit class="who" style="color:#fff">${r.name}</div>
        <div data-fit class="when" style="color:#B7C2C6">· ${r.date}</div>
      </div>
    </div>
  </div>`);

const TALL = [['A', tplA], ['D', tplD], ['E', tplE]];
const WIDE = [['B', tplB], ['C', tplC]];

const only = process.argv.slice(2);
const list = only.length ? CARDABLE.filter(r => only.includes(r.id)) : CARDABLE;

let tallN = 0, wideN = 0, ok = 0, failed = [];
for (const r of list) {
  const m = await media(r.photo, { maxW: 1600, maxH: 2200 });
  const tall = m.aspect < 1.0;
  const [name, tpl] = tall ? TALL[tallN++ % TALL.length] : WIDE[wideN++ % WIDE.length];
  try {
    const res = await render({
      html: tpl(r, m), canvas: { w: W, h: H }, out: `${OUT}/${r.id}.jpg`, quality: 88,
      manifest: { template: name, review: r.id, stars: r.stars, asin: r.asin,
                  sourceAspect: +m.aspect.toFixed(3), photo: r.photo, photoReason: r.why },
    });
    ok++;
    console.log(`  ${name}  ${r.id.padEnd(16)} ${(res.bytes / 1048576).toFixed(2)} MB  aspect ${m.aspect.toFixed(2)}`);
  } catch (e) {
    failed.push(r.id);
    console.log(`  !! ${r.id}: ${String(e.message).split('\n').slice(0, 3).join(' ')}`);
  }
}
console.log(`\n${ok} built into ${OUT}${failed.length ? `, ${failed.length} refused: ${failed.join(', ')}` : ''}`);
