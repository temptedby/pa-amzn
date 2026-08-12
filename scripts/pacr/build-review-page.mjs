/** build-review-page.mjs — one local page showing everything built, for William to mark up.
 *
 *  Lives IN build/creative/ so every src is relative to that folder. Writing it anywhere else and
 *  then prefixing paths is how the 08-11 gallery ended up with build/creative/build/creative/...
 *  and rendered an empty grid. No query strings either: unreliable on file://.
 *
 *  RUN: node scripts/pacr/build-review-page.mjs
 */
import { readdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { CARDABLE, REVIEWS } from './reviews.mjs';

const ROOT = 'build/creative';
const ls = (d, re) => existsSync(`${ROOT}/${d}`) ? readdirSync(`${ROOT}/${d}`).filter(f => re.test(f)).sort() : [];

const cost = existsSync('confabulator/ai-spend-ledger.json')
  ? JSON.parse(readFileSync('confabulator/ai-spend-ledger.json', 'utf8')) : [];
const spent = cost.reduce((s, r) => s + (r.costUSD || 0), 0);

const why = f => (CARDABLE.find(r => `${r.id}.jpg` === f) || {});
const allRev = REVIEWS;
const rev = id => REVIEWS.find(r => r.id === id) || {};

const card = (src, title, sub, note) => `
  <figure>
    <img src="${src}" loading="lazy">
    <figcaption><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}${note ? `<em>${note}</em>` : ''}</figcaption>
  </figure>`;

const vid = (src, title, sub, note) => `
  <figure>
    <video src="${src}" controls preload="metadata" playsinline></video>
    <figcaption><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}${note ? `<em>${note}</em>` : ''}</figcaption>
  </figure>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phone Assured creative, 12 Aug 2026</title>
<style>
  :root{--ink:#16191B;--paper:#F6F5F2;--muted:#5E686C;--line:#DFDDD8;--slate:#2E4756;--seal:#8C6A34}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--paper);color:var(--ink);
    font:400 16px/1.6 'Avenir Next','Avenir',Helvetica,sans-serif;padding:56px 40px 120px}
  header{max-width:900px;margin:0 auto 56px}
  h1{font-size:38px;font-weight:600;letter-spacing:-.02em;margin-bottom:14px}
  .lede{color:var(--muted);font-size:18px;max-width:64ch}
  .meta{margin-top:22px;padding:16px 20px;background:#fff;border:1px solid var(--line);border-radius:4px;
    font-size:15px;color:var(--muted)}
  .meta b{color:var(--ink)}
  h2{font-size:15px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--slate);
    max-width:1400px;margin:64px auto 8px;padding-top:26px;border-top:1px solid var(--line)}
  .sect{max-width:1400px;margin:0 auto 10px;color:var(--muted);font-size:15px;max-width:70ch}
  .grid{max-width:1400px;margin:26px auto;display:grid;gap:30px;
    grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
  .grid.wide{grid-template-columns:repeat(auto-fill,minmax(420px,1fr))}
  figure{background:#fff;border:1px solid var(--line);border-radius:4px;overflow:hidden}
  img,video{display:block;width:100%;background:var(--ink)}
  figcaption{padding:13px 15px 15px;font-size:13.5px;line-height:1.45}
  figcaption b{display:block;font-weight:600}
  figcaption span{display:block;color:var(--muted);margin-top:3px}
  figcaption em{display:block;color:var(--slate);margin-top:7px;font-style:normal;font-size:12.5px}
</style></head><body>
<header>
  <h1>Phone Assured creative</h1>
  <p class="lede">Everything built on 11 and 12 August. Testimonial cards are photo-matched to the
  words: the reason each photo was chosen sits under it, so you can tell me where the match is wrong.
  Mark up anything.</p>
  <div class="meta">
    <b>AI spend to date: $${spent.toFixed(2)}</b> across ${cost.length} clips, $0.28 each, measured
    off the real fal.ai balance rather than a rate card. Billed to the Social Scene account, to be
    rebilled to PA. Roughly 25 clips left in the current balance.
  </div>
</header>

<h2>AI reenactments</h2>
<p class="sect">Real verbatim review over a dramatization. Animated from OUR photograph, so the
tether on screen is our hardware, not something a model invented. Each one is labelled on the face
of it: the person shown is not the reviewer.</p>
<div class="grid">
${ls('ai-reels', /\.mp4$/).map(f => {
  const r = rev(f.replace('-reenact.mp4', ''));
  return vid(`ai-reels/${f}`, r.name || f, `${r.stars || ''}★ · ${r.date || ''}`, r.quote ? `“${r.quote.slice(0,110)}${r.quote.length>110?'…':''}”` : '');
}).join('')}
</div>

<h2>Testimonial cards, photo matched to the words</h2>
<div class="grid">
${ls('testimonials-v2', /\.jpg$/).map(f => {
  const r = why(f);
  return card(`testimonials-v2/${f}`, r.name || f, `${r.stars || ''}★ · ${r.date || ''}`, r.why ? `Photo: ${r.why}` : '');
}).join('')}
</div>

<h2>Testimonial cards with nobody in them</h2>
<p class="sect">The one-face-one-name rule caps photographed cards at six, because we own two
distinguishable men and three women. These show the PRODUCT instead of a person, so there is no
identity to reuse and every remaining review can have a card today. Real verbatim words either way.</p>
<div class="grid">
${ls('testimonials-product', /\.jpg$/).map(f => {
  const r = rev(f.replace('.jpg',''));
  return card(`testimonials-product/${f}`, r.name || f, `${r.stars || ''}★ · ${r.date || ''}`, 'No person depicted');
}).join('')}
</div>

<h2>A+ modules</h2>
<div class="grid wide">
${ls('aplus-evergreen', /\.jpg$/).map(f => card(`aplus-evergreen/${f}`, f.replace(/^\d+-|\.jpg$/g,''), '970 wide, Amazon Standard A+')).join('')}
</div>

<h2>Customer video, cut on real sentence ends</h2>
<div class="grid">
${ls('testimonial-video', /framed\.mp4$/).map(f => vid(`testimonial-video/${f}`, 'Paul Arnoldi', f.replace(/^paul-\d+-|-framed\.mp4$/g,'').replace(/-/g,' '), 'Real customer, filmed himself')).join('')}
${ls('testimonial-video', /^0\d.*-reel\.mp4$/).map(f => vid(`testimonial-video/${f}`, 'UGC ad cut', f.replace(/^\d+-|-reel\.mp4$/g,'').replace(/-/g,' '), '')).join('')}
</div>

<h2>Social and detail-page video</h2>
<div class="grid">
${ls('video', /\.mp4$/).map(f => vid(`video/${f}`, f.replace('.mp4',''), '')).join('')}
</div>
</body></html>`;

writeFileSync(`${ROOT}/REVIEW.html`, html);
console.log(`${ROOT}/REVIEW.html written`);
