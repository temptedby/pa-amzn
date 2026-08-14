/** build-testimonials.mjs — batch 1 of 5. Four testimonial cards, four different layouts.
 *
 *  DES rule carried over: never the same template twice in a batch, and never the same source
 *  photo twice. Real words, real photos, real people. No synthetic testimonials — Amazon and the
 *  FTC both treat a fabricated endorsement as the serious offence, and our two largest negative
 *  review topics are exactly the ones a fake would be accused of papering over.
 *
 *  RUN: node scripts/pacr/build-testimonials.mjs
 */
import { render, panel, CANVAS } from './render.mjs';
import { C, T, FONT, RESET } from './tokens.mjs';
import { REVIEWS } from './reviews.mjs';

const OUT = 'build/creative/testimonials';
const P   = 'build/creative/panels';
const inset = p => panel(p, { left:.05, top:.05, width:.90, height:.90 });

const bag    = await inset(`${P}/black-bag.jpg`);
const hand   = await inset(`${P}/black-hand.jpg`);
const jacket = await inset(`${P}/black-jacket.jpg`);
const car    = await inset(`${P}/black-car.jpg`);

const shell = inner => `<!doctype html><html><head><meta charset="utf-8"><style>${RESET}
  .stars{font-family:${FONT};font-size:26px;letter-spacing:.14em;color:${C.seal}}
  .who{font-family:${FONT};font-weight:600;font-size:22px;color:${C.ink}}
  .when{font-family:${FONT};font-weight:400;font-size:18px;color:${C.muted}}
  .mark{font-family:Georgia,serif;font-size:150px;line-height:.6;color:${C.slate};opacity:.22}
  .verified{font-family:${FONT};font-weight:600;font-size:15px;letter-spacing:.13em;
    text-transform:uppercase;color:${C.slate}}
</style></head><body>${inner}</body></html>`;

const S = n => '★'.repeat(n) + '☆'.repeat(5-n);
const W = 1080, H = 1920;

/* ── A · full bleed photo, quote on a gradient scrim in the lower third ────────────────── */
async function tplA(r, m) {
  const html = shell(`
    <div style="width:${W}px;height:${H}px;position:relative;overflow:hidden;background:${C.ink}">
      <img data-media src="${m.uri}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,
        rgba(10,14,16,0) 34%, rgba(10,14,16,.72) 56%, rgba(10,14,16,.94) 78%)"></div>
      <div style="position:absolute;left:76px;right:76px;bottom:190px">
        <div data-fit class="verified" style="color:#8FB4C2;margin-bottom:20px">Verified Amazon review</div>
        <div data-fit class="stars" style="margin-bottom:26px">${S(r.stars)}</div>
        <div data-fit style="font-family:${FONT};font-weight:500;font-size:46px;line-height:1.32;
          letter-spacing:-.012em;color:#fff">“${r.quote}”</div>
        <div data-fit class="who" style="color:#fff;margin-top:34px">${r.name}</div>
        <div data-fit class="when" style="color:#B9C3C7">${r.date}</div>
      </div>
    </div>`);
  return render({ html, canvas:{w:W,h:H}, out:`${OUT}/t1-${r.id}.jpg`, quality:86,
    manifest:{ template:'A full-bleed scrim', review:r.id, sources:[m.path] } });
}

/* ── B · photo on top, quote on paper below ───────────────────────────────────────────── */
async function tplB(r, m) {
  const html = shell(`
    <div style="width:${W}px;height:${H}px;display:flex;flex-direction:column;background:${C.paper}">
      <div data-media style="width:${W}px;height:1010px;overflow:hidden">
        <img src="${m.uri}" style="width:100%;height:100%;object-fit:cover">
      </div>
      <div style="flex:1;padding:76px 78px;display:flex;flex-direction:column;justify-content:center">
        <div data-fit class="mark">“</div>
        <div data-fit style="font-family:${FONT};font-weight:500;font-size:48px;line-height:1.3;
          letter-spacing:-.014em;color:${C.ink};margin-top:-14px">${r.quote}</div>
        <div style="display:flex;align-items:center;gap:18px;margin-top:46px">
          <div data-fit class="stars">${S(r.stars)}</div>
          <div data-fit class="who">${r.name}</div>
          <div data-fit class="when">· ${r.date}</div>
        </div>
      </div>
    </div>`);
  return render({ html, canvas:{w:W,h:H}, out:`${OUT}/t2-${r.id}.jpg`, quality:86,
    manifest:{ template:'B photo over paper', review:r.id, sources:[m.path] } });
}

/* ── C · quote leads, photo sits underneath as a band ─────────────────────────────────── */
async function tplC(r, m) {
  const html = shell(`
    <div style="width:${W}px;height:${H}px;display:flex;flex-direction:column;background:${C.paper}">
      <div style="padding:150px 78px 60px;flex:1;display:flex;flex-direction:column;justify-content:center">
        <div data-fit class="verified" style="margin-bottom:26px">Verified Amazon review</div>
        <div data-fit style="font-family:${FONT};font-weight:600;font-size:62px;line-height:1.22;
          letter-spacing:-.022em;color:${C.ink}">“${r.quote}”</div>
        <div style="width:70px;height:3px;background:${C.slate};margin:44px 0 30px"></div>
        <div data-fit class="stars" style="margin-bottom:14px">${S(r.stars)}</div>
        <div data-fit class="who">${r.name}, ${r.date}</div>
      </div>
      <div data-media style="width:${W}px;height:660px;overflow:hidden">
        <img src="${m.uri}" style="width:100%;height:100%;object-fit:cover">
      </div>
    </div>`);
  return render({ html, canvas:{w:W,h:H}, out:`${OUT}/t3-${r.id}.jpg`, quality:86,
    manifest:{ template:'C quote-led', review:r.id, sources:[m.path] } });
}

/* ── D · photo card floated on paper, quote beneath ───────────────────────────────────── */
async function tplD(r, m) {
  const html = shell(`
    <div style="width:${W}px;height:${H}px;background:${C.paper};padding:84px 72px 72px;
                display:flex;flex-direction:column;justify-content:space-between">
      <div data-media style="width:936px;height:940px;overflow:hidden;border-radius:8px;
        box-shadow:0 26px 60px rgba(16,25,27,.26)">
        <img src="${m.uri}" style="width:100%;height:100%;object-fit:cover">
      </div>
      <div>
        <div data-fit class="stars" style="margin-bottom:28px">${S(r.stars)}</div>
        <div data-fit style="font-family:${FONT};font-weight:500;font-size:50px;line-height:1.3;
          letter-spacing:-.016em;color:${C.ink}">“${r.quote}”</div>
        <div style="display:flex;align-items:center;gap:14px;margin-top:40px;padding-top:28px;
                    border-top:1px solid ${C.line}">
          <div style="width:8px;height:8px;border-radius:50%;background:${C.seal}"></div>
          <div data-fit class="who">${r.name}</div>
          <div data-fit class="when">· verified purchase, ${r.date}</div>
        </div>
      </div>
    </div>`);
  return render({ html, canvas:{w:W,h:H}, out:`${OUT}/t4-${r.id}.jpg`, quality:86,
    manifest:{ template:'D floated card', review:r.id, sources:[m.path] } });
}

const R = Object.fromEntries(REVIEWS.map(r => [r.id, r]));
const batch = [
  [tplA, R.adam3914,   hand,   'A full-bleed scrim'],
  [tplB, R.kevin,      car,    'B photo over paper'],
  [tplC, R.meda48,     bag,    'C quote-led'],
  [tplD, R.prescillia, jacket, 'D floated card'],
];
for (const [fn, r, m, label] of batch) {
  const out = await fn(r, m);
  console.log(`  ${label.padEnd(22)} ${r.name.padEnd(13)} ${(out.bytes/1024).toFixed(0).padStart(4)} KB`);
}
console.log(`\n  -> ${OUT}`);
