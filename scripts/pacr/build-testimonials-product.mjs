/** build-testimonials-product.mjs — testimonial cards with NO PERSON IN THEM.
 *
 *  The one-face-one-name rule (William, 2026-08-12) capped the photographed cards at six, because
 *  we own two distinguishable men and three women. This is the way round it that does not involve
 *  lying about who a customer is: show the PRODUCT instead of a person. Nobody is depicted, so
 *  nobody can be reused, and every remaining review can have a card today.
 *
 *  Source is the studio pack shots, cropped past the burned "1-PACK" style badges, which belong to
 *  a listing image and not to a testimonial.
 *
 *  THE GROUND IS ALWAYS PAPER. The pack shots are photographed on white, and the first build put
 *  them on the ink ground where the white box read as a hard pasted rectangle. There is no alpha to
 *  knock out, so the fix is `mix-blend-mode: multiply` over a light ground: white multiplies away to
 *  nothing and only the hardware survives. Vary the LAYOUT for range, never the ground colour.
 *
 *  RUN: node scripts/pacr/build-testimonials-product.mjs
 */
import { render, panel, CANVAS } from './render.mjs';
import { C, FONT, RESET } from './tokens.mjs';
import { HELD } from './reviews.mjs';

const OUT = 'build/creative/testimonials-product';
const P = 'assets/source/Megan Updated Images';
const W = 1080, H = 1920;
const S = n => '★'.repeat(n) + '☆'.repeat(5 - n);

/* Crop past the badge in the upper-left and keep the phone-and-tether on the right. */
const SHOTS = [
  { file: `${P}/1 Pack Black.jpg`, box: { left: .34, top: .10, width: .62, height: .82 } },
  { file: `${P}/1 Pack Pro.jpg`,   box: { left: .34, top: .10, width: .62, height: .82 } },
  { file: `${P}/2 Pack Black.jpg`, box: { left: .32, top: .10, width: .64, height: .82 } },
  { file: `${P}/3 Pack Black.jpg`, box: { left: .32, top: .10, width: .64, height: .82 } },
];

const shell = inner => `<!doctype html><html><head><meta charset="utf-8"><style>${RESET}
  .stars{font-family:${FONT};font-weight:400;font-size:27px;letter-spacing:.16em;color:${C.seal}}
  .who{font-family:${FONT};font-weight:600;font-size:23px;letter-spacing:-.005em}
  .when{font-family:${FONT};font-weight:400;font-size:19px}
  .eyebrow{font-family:${FONT};font-weight:600;font-size:15px;letter-spacing:.15em;text-transform:uppercase}
  .quote{font-family:${FONT};font-weight:500;letter-spacing:-.015em}
</style></head><body>${inner}</body></html>`;

const qsize = q => q.length > 240 ? 40 : q.length > 175 ? 45 : q.length > 110 ? 52 : 60;

/** White studio ground multiplied away. Only works over a LIGHT surface, which is why every
 *  template below is on paper. */
const PROD = 'mix-blend-mode:multiply;max-width:100%;max-height:100%;object-fit:contain';

/* ── P1 · quote owns the card, product sits quietly beneath on paper ───────────────────── */
const p1 = (r, m) => shell(`
  <div style="width:${W}px;height:${H}px;background:${C.paper};display:flex;flex-direction:column;
    padding:104px 84px 76px">
    <div data-fit class="eyebrow" style="color:${C.slate};margin-bottom:34px">Verified Amazon review</div>
    <div data-fit class="quote" style="font-size:${qsize(r.quote)}px;line-height:1.22;color:${C.ink}">“${r.quote}”</div>
    <div style="display:flex;align-items:baseline;gap:16px;margin-top:38px">
      <div data-fit class="stars">${S(r.stars)}</div>
      <div data-fit class="who" style="color:${C.ink}">${r.name}</div>
      <div data-fit class="when" style="color:${C.muted}">· ${r.date}</div>
    </div>
    <div data-media style="margin-top:auto;width:100%;height:940px;display:flex;align-items:center;justify-content:center">
      <img src="${m.uri}" style="${PROD}">
    </div>
  </div>`);

/* ── P2 · product on the ink ground, quote under it ────────────────────────────────────── */
const p2 = (r, m) => shell(`
  <div style="width:${W}px;height:${H}px;background:${C.paper};display:flex;flex-direction:column;
    padding:84px 84px 96px">
    <div data-media style="width:100%;height:1010px;display:flex;align-items:center;justify-content:center">
      <img src="${m.uri}" style="${PROD}">
    </div>
    <div style="margin-top:auto">
      <div style="height:2px;background:${C.ink};width:96px;margin-bottom:36px"></div>
      <div data-fit class="quote" style="font-size:${qsize(r.quote)}px;line-height:1.24;color:${C.ink}">“${r.quote}”</div>
      <div style="display:flex;align-items:baseline;gap:16px;margin-top:34px">
        <div data-fit class="stars">${S(r.stars)}</div>
        <div data-fit class="who" style="color:${C.ink}">${r.name}</div>
        <div data-fit class="when" style="color:${C.muted}">· ${r.date}</div>
      </div>
    </div>
  </div>`);

/* ── P3 · a paper card floating on the ink, product small and top-right ────────────────── */
const p3 = (r, m) => shell(`
  <div style="width:${W}px;height:${H}px;background:${C.paper};display:flex;flex-direction:column">
    <div style="background:${C.slate};padding:104px 84px 84px">
      <div data-fit class="eyebrow" style="color:#BBD3DD;margin-bottom:30px">Verified Amazon review</div>
      <div data-fit class="quote" style="font-size:${qsize(r.quote)}px;line-height:1.24;color:#fff">“${r.quote}”</div>
      <div style="display:flex;align-items:baseline;gap:16px;margin-top:34px">
        <div data-fit class="stars" style="color:#E2C48E">${S(r.stars)}</div>
        <div data-fit class="who" style="color:#fff">${r.name}</div>
        <div data-fit class="when" style="color:#C3D2D9">· ${r.date}</div>
      </div>
    </div>
    <div data-media style="height:1010px;display:flex;align-items:center;justify-content:center;padding:56px 84px 76px">
      <img src="${m.uri}" style="${PROD}">
    </div>
  </div>`);

const TPL = [['P1', p1], ['P2', p2], ['P3', p3]];
const shots = [];
for (const s of SHOTS) { try { shots.push(await panel(s.file, s.box)); } catch (e) { console.log(`  (skip ${s.file}: ${e.message})`); } }
if (!shots.length) { console.error('no product shots resolved'); process.exit(1); }

let ok = 0;
for (let i = 0; i < HELD.length; i++) {
  const r = HELD[i];
  const [name, tpl] = TPL[i % TPL.length];
  const m = shots[i % shots.length];
  try {
    const res = await render({ html: tpl(r, m), canvas: { w: W, h: H }, out: `${OUT}/${r.id}.jpg`, quality: 88,
      manifest: { template: name, review: r.id, stars: r.stars, personDepicted: false,
                  why: 'no person in frame, so no identity can be reused', product: m.path } });
    ok++;
    console.log(`  ${name}  ${r.id.padEnd(17)} ${(res.bytes / 1048576).toFixed(2)} MB`);
  } catch (e) { console.log(`  !! ${r.id}: ${String(e.message).split('\n').slice(0, 2).join(' ')}`); }
}
console.log(`\n${ok} product-led cards -> ${OUT}   (nobody depicted, nothing reusable)`);
