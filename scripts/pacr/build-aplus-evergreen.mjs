/** build-aplus-evergreen.mjs — the A+ sequence, evergreen, on the DISCREET + WARRANTY pillars.
 *
 *  Evergreen means: no price, no pack count, no date, no seasonal reference, no offer. Every claim
 *  here is either photographed or contractual, so the set does not expire.
 *
 *  Deliberately NOT claimed: strength, load rating, "weight of any phone". We have no measured
 *  number and three competitors publish one. William killed that graphic on 08-10.
 *
 *  RUN: node scripts/pacr/build-aplus-evergreen.mjs
 */
import { render, media, panel, CANVAS } from './render.mjs';
import { C, T, FONT, RESET, band } from './tokens.mjs';

const OUT = 'build/creative/aplus-evergreen';
const P = 'build/creative/panels';

/* Panels carry a white frame from the composite; inset it away. */
const inset = (p) => panel(p, { left: .022, top: .022, width: .956, height: .956 });

const car    = await inset(`${P}/black-car.jpg`);
const bag    = await inset(`${P}/black-bag.jpg`);
const hand   = await inset(`${P}/black-hand.jpg`);
const jacket = await inset(`${P}/black-jacket.jpg`);
const steps  = [];
for (let i = 1; i <= 4; i++) steps.push(await media(`${P}/step${i}.jpg`));

const shell = (inner, extra = '') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${RESET}${extra}</style></head><body>${inner}</body></html>`;

/* ─── 01 · header 970x600 · the discreet claim ────────────────────────────────────────────── */
{
  const b = band(car, { h: 600 });                     // 0.54 aspect -> a 324px band. No crop.
  const textW = 970 - b.w;
  const html = shell(`
    <div style="display:flex;width:970px;height:600px;background:${C.paper}">
      <div style="width:${textW}px;height:600px;padding:66px 58px 60px 62px;display:flex;flex-direction:column;justify-content:center">
        <div data-fit style="${T.eyebrow};margin-bottom:22px">Designed to go unnoticed</div>
        <div data-fit style="${T.display};max-width:520px">It doesn’t announce<br>itself.</div>
        <div style="width:52px;height:2px;background:${C.slate};margin:26px 0 24px"></div>
        <div data-fit style="${T.body};max-width:490px">Clipped inside a belt loop, a bag strap or a
          backpack, it sits flat against what you already carry. Nothing swings, nothing catches,
          nothing tells a room that your phone is worth taking.</div>
        <div data-ink style="display:flex;align-items:center;gap:12px;margin-top:40px;padding-top:26px;
                             border-top:1px solid ${C.line};max-width:490px">
          <div style="width:7px;height:7px;border-radius:50%;background:${C.seal};flex:none"></div>
          <div data-fit style="${T.small};color:${C.ink}">Backed by a one year warranty, in the box.</div>
        </div>
      </div>
      <div data-media style="${b.css};overflow:hidden;position:relative">
        <img src="${car.uri}" style="width:100%;height:100%;object-fit:cover">
      </div>
    </div>`);
  const r = await render({ html, canvas: CANVAS.APLUS_HEADER, out: `${OUT}/01-discreet.jpg`,
    manifest: { module: 'STANDARD_HEADER_IMAGE_TEXT', pillar: 'discreet', sources: [car.path] } });
  console.log(`  01-discreet     ${(r.bytes/1024).toFixed(0).padStart(4)} KB   band ${b.w}x${b.h} from a ${car.aspect.toFixed(2)} source`);
}

/* ─── 02 · four-up 970x600 · where it actually clips ──────────────────────────────────────── */
{
  const cells = [
    { m: bag,    label: 'A bag strap' },
    { m: hand,   label: 'A belt loop' },
    { m: jacket, label: 'A backpack' },
    { m: car,    label: 'A waistband' },
  ];
  /* tiles are 1.33, the sources are 1.37 — near-identical, so cover crops almost nothing */
  const tiles = cells.map(c => `
    <div style="display:flex;flex-direction:column;gap:12px;width:200px">
      <div data-media style="width:200px;height:150px;overflow:hidden;background:${C.white};border:1px solid ${C.line}">
        <img src="${c.m.uri}" style="width:100%;height:100%;object-fit:cover">
      </div>
      <div data-fit style="${T.label}">${c.label}</div>
    </div>`).join('');
  const html = shell(`
    <div style="width:970px;height:600px;background:${C.paper};padding:54px 61px 52px;
                display:flex;flex-direction:column;justify-content:space-between">
      <div>
        <div data-fit style="${T.eyebrow};margin-bottom:20px">Four places it disappears</div>
        <div data-fit style="${T.display};max-width:660px">Attach it once and forget<br>where you put it.</div>
      </div>
      <div style="display:flex;gap:15px">${tiles}</div>
      <div data-ink style="display:flex;align-items:flex-start;gap:16px;max-width:800px">
        <div style="width:38px;height:2px;background:${C.slate};margin-top:11px;flex:none"></div>
        <div data-fit style="${T.body};max-width:640px">The quick-release clip opens with a thumb, so the
          phone comes off without the tether coming off you.</div>
      </div>
    </div>`);
  const r = await render({ html, canvas: CANVAS.APLUS_HEADER, out: `${OUT}/02-where.jpg`,
    manifest: { module: 'STANDARD_HEADER_IMAGE_TEXT', pillar: 'discreet', sources: cells.map(c => c.m.path) } });
  console.log(`  02-where        ${(r.bytes/1024).toFixed(0).padStart(4)} KB`);
}

/* ─── 03 · banner 970x300 · the warranty, which is the honest answer to "will it last" ────── */
{
  const b = band(hand, { h: 300 });
  const html = shell(`
    <div style="display:flex;width:970px;height:300px;background:${C.white}">
      <div data-media style="${b.css};overflow:hidden">
        <img src="${hand.uri}" style="width:100%;height:100%;object-fit:cover">
      </div>
      <div style="flex:1;padding:0 54px;display:flex;flex-direction:column;justify-content:center;border-left:1px solid ${C.line}">
        <div data-fit style="${T.eyebrow};color:${C.seal};margin-bottom:14px">Covered for one year</div>
        <div data-fit style="${T.head};max-width:400px">If it stops working,<br>we replace it.</div>
        <div data-fit style="${T.small};max-width:430px;margin-top:14px">A one year warranty comes in the
          box, direct from Phone Assured, with two spare clips.</div>
      </div>
    </div>`);
  const r = await render({ html, canvas: CANVAS.APLUS_BANNER, out: `${OUT}/03-warranty.jpg`,
    manifest: { module: 'STANDARD_IMAGE_TEXT_OVERLAY', pillar: 'warranty', sources: [hand.path] } });
  console.log(`  03-warranty     ${(r.bytes/1024).toFixed(0).padStart(4)} KB   band ${b.w}x${b.h}`);
}

/* ─── 04 · header 970x600 · how it attaches, without a hole in your case ──────────────────── */
{
  const caps = [
    'Open the clip, feed the loop through the case’s charging port opening.',
    'Feed the clip end back through the loop to make a knot.',
    'Reattach the clip and put the phone back in the case.',
    'Clip it to a pocket, a belt loop, a backpack or a bag.',
  ];
  const tiles = steps.map((m, i) => `
    <div style="display:flex;flex-direction:column;gap:11px;width:200px">
      <div data-media style="width:200px;height:128px;overflow:hidden;background:${C.white};border:1px solid ${C.line}">
        <img src="${m.uri}" style="width:100%;height:100%;object-fit:cover">
      </div>
      <div data-fit style="${T.small};font-size:13px;line-height:1.42;color:${C.ink}">${caps[i]}</div>
    </div>`).join('');
  const html = shell(`
    <div style="width:970px;height:600px;background:${C.paper};padding:54px 61px 52px;
                display:flex;flex-direction:column;justify-content:space-between">
      <div>
        <div data-fit style="${T.eyebrow};margin-bottom:20px">About a minute, once</div>
        <div data-fit style="${T.display};max-width:720px">It loops through the opening<br>your case already has.</div>
      </div>
      <div style="display:flex;gap:15px">${tiles}</div>
      <div data-ink style="display:flex;align-items:flex-start;gap:16px;max-width:820px">
        <div style="width:38px;height:2px;background:${C.slate};margin-top:11px;flex:none"></div>
        <div data-fit style="${T.body};max-width:680px">Nothing is drilled and nothing is glued, and it
          will not block charging, texting, calling or the camera.</div>
      </div>
    </div>`);
  const r = await render({ html, canvas: CANVAS.APLUS_HEADER, out: `${OUT}/04-attach.jpg`,
    manifest: { module: 'STANDARD_HEADER_IMAGE_TEXT', pillar: 'discreet', sources: steps.map(s => s.path) } });
  console.log(`  04-attach       ${(r.bytes/1024).toFixed(0).padStart(4)} KB`);
}

/* ─── 05 · header 970x600 · the FAQ ───────────────────────────────────────────────────────────
   The questions are not invented. These are the five Amazon's own Alexa panel offers shoppers on
   our listing, so they are the doubts Amazon has measured and is already surfacing.
   NOTE: A+ may not quote customer reviews, so social proof here has to be warranty and fact,
   never a testimonial. ------------------------------------------------------------------------ */
{
  const qa = [
    ['Will it work with my case?',
     'Yes. The cord loops through the opening your case already has. Nothing is drilled or glued, and there is no adhesive pad to peel off.'],
    ['Is the cable strong enough?',
     'It is built to stop a fall, not to hold a phone in mid-air. The spring is deliberately soft, because one strong enough to haul a phone up can snap back on a finger.'],
    ['Does the phone retract on its own?',
     'No, and it is not meant to. The cord retracts; you guide the phone back. That is the safety trade we chose.'],
    ['Can I take the phone off quickly?',
     'Yes. The quick-release clip opens with a thumb, so the phone comes off without the tether coming off you.'],
  ];
  const cells = qa.map(([q, a]) => `
    <div style="width:380px">
      <div data-fit style="${T.sub};margin-bottom:8px">${q}</div>
      <div data-fit style="${T.small}">${a}</div>
    </div>`).join('');
  const html = shell(`
    <div style="width:970px;height:600px;background:${C.paper};padding:54px 61px 52px;
                display:flex;flex-direction:column;justify-content:space-between">
      <div>
        <div data-fit style="${T.eyebrow};margin-bottom:20px">The four things people ask</div>
        <div data-fit style="${T.head};max-width:700px">Straight answers, including the unflattering one.</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:26px 56px;align-content:flex-start">${cells}</div>
      <div data-ink style="display:flex;align-items:center;gap:12px;padding-top:22px;border-top:1px solid ${C.line}">
        <div style="width:7px;height:7px;border-radius:50%;background:${C.seal};flex:none"></div>
        <div data-fit style="${T.small};color:${C.ink}">Sold on Amazon since 2019, and covered for a year.</div>
      </div>
    </div>`);
  const r = await render({ html, canvas: CANVAS.APLUS_HEADER, out: `${OUT}/05-answers.jpg`,
    manifest: { module: 'STANDARD_HEADER_IMAGE_TEXT', pillar: 'objection', sources: [] } });
  console.log(`  05-answers      ${(r.bytes/1024).toFixed(0).padStart(4)} KB`);
}

console.log(`\n  -> ${OUT}`);
