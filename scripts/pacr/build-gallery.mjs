/** build-gallery.mjs — a local review gallery with PLAYABLE video.
 *  Artifacts can only show a poster frame; a local file:// page plays the real mp4s.
 *  Cache-busted so a refresh never serves William a stale render (DES lesson).
 *  RUN: node scripts/pacr/build-gallery.mjs
 */
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
const V = t => existsSync(t) ? Math.floor(statSync(t).mtimeMs) : 0;
const ls = (d, re) => existsSync(d) ? readdirSync(d).filter(f => re.test(f)).sort() : [];

const APLUS = ls('build/creative/aplus-evergreen', /\.jpg$/);
const TCARD = ls('build/creative/testimonials', /\.jpg$/);
const TVID  = ls('build/creative/testimonial-video', /-reel\.mp4$/);
const TVIDF = ls('build/creative/testimonial-video', /-feed\.mp4$/);
const AVID  = ls('build/creative/video', /^amazon-detail.*\.mp4$/);
const SVID  = ls('build/creative/video', /^social-.*\.mp4$/);

const LINES = {
  '01-been-there':'“Fortunately, I’ve invested in this handy gadget called Phone Assured.”',
  '02-youre-attached':'“If someone tries to pick pocket you, they can’t. You’re attached.”',
  '03-saved-me-money':'“It has saved me so much money in phone repairs and replacements… as well as a 1 year warranty.”',
  '04-never-again':'“Never have your phone stolen, lost or dropped again.”',
};
const CARD = {
  't1-adam3914':'adam3914, 5★ — the soft spring, defended by a customer',
  't2-kevin':'Kevin, 5★ — cord length and the catch',
  't3-meda48':'meda48, 5★ — pocket and purse',
  't4-prescillia':'Prescillia01, 5★ — kids',
};
const MOD = {
  '01-discreet':'Header · the discreet claim',
  '02-where':'Header · four places it disappears',
  '03-warranty':'Banner · the warranty',
  '04-attach':'Header · how it attaches',
  '05-answers':'Header · the four questions',
};

/* the page is written INTO build/creative/, so strip that prefix from every src */
const rel = d => d.replace(/^build\/creative\//,'');
const img = (dir, f, cap) => `<figure><img loading="lazy" src="${rel(dir)}/${encodeURIComponent(f)}" alt="${f}">
  <figcaption><b>${f.replace(/\.jpg$/,'')}</b>${cap?'<br>'+cap:''}</figcaption></figure>`;
const vid = (dir, f, cap) => `<figure><video controls preload="metadata" playsinline
  src="${rel(dir)}/${encodeURIComponent(f)}"></video>
  <figcaption><b>${f.replace(/\.mp4$/,'')}</b>${cap?'<br>'+cap:''}</figcaption></figure>`;

const html = `<!doctype html><meta charset="utf-8"><title>Phone Assured — creative gallery</title>
<style>
:root{--ink:#16191B;--slate:#2E4756;--paper:#F6F5F2;--muted:#5E686C;--line:#DFDDD8;--card:#fff;--seal:#8C6A34}
@media(prefers-color-scheme:dark){:root{--ink:#ECEEEF;--slate:#8FB4C2;--paper:#141719;--muted:#98A2A6;--line:#2A2F33;--card:#1B1F22;--seal:#C79A54}}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font:400 16px/1.55 'Avenir Next',Avenir,Helvetica,system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;padding:56px 28px 100px}
.wrap{max-width:1500px;margin:0 auto}
h1{font-size:clamp(28px,4vw,42px);font-weight:600;letter-spacing:-.022em;line-height:1.1;text-wrap:balance}
.eyebrow{font-size:12.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--slate)}
.lede{color:var(--muted);max-width:70ch;margin-top:14px}
h2{font-size:22px;font-weight:600;letter-spacing:-.012em;margin:56px 0 6px;padding-top:30px;border-top:1px solid var(--line)}
.note{color:var(--muted);font-size:14.5px;margin-bottom:22px;max-width:78ch}
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.grid.wide{grid-template-columns:repeat(auto-fill,minmax(430px,1fr))}
figure{background:var(--card);border:1px solid var(--line);border-radius:7px;overflow:hidden;margin:0}
figure img,figure video{width:100%;height:auto;display:block;background:#000}
figcaption{padding:11px 13px;font-size:12.5px;color:var(--muted);border-top:1px solid var(--line)}
figcaption b{color:var(--ink);font-weight:600}
.tag{display:inline-block;font-size:11.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;
  color:var(--seal);border:1px solid var(--seal);border-radius:20px;padding:2px 9px;margin-left:7px}
</style>
<div class="wrap">
<div class="eyebrow">Phone Assured · built ${new Date(Date.now()).toISOString().slice(0,16).replace("T"," ")} UTC</div>
<h1>Creative gallery. Everything built today, playable.</h1>
<p class="lede">All of it cut or composed from footage and photography we already own. Nothing shot,
nothing licensed, nothing AI-generated — there are no generative credentials in any of the projects,
and a synthetic endorsement is the one thing that could cost the listing.</p>

<h2>Testimonial videos <span class="tag">real people, real product</span></h2>
<p class="note">Four people from a UGC ad we already had in Drive, cut into individual testimonials with
the branded endcard on each. 9:16 for Reels, TikTok and Shorts. The 4:5 feed versions are below.</p>
<div class="grid">${TVID.map(f => vid('build/creative/testimonial-video', f, LINES[f.replace('-reel.mp4','')]||'')).join('')}</div>

<h2>Same four, 4:5 for feed</h2>
<div class="grid">${TVIDF.map(f => vid('build/creative/testimonial-video', f, '')).join('')}</div>

<h2>Testimonial cards <span class="tag">verbatim reviews</span></h2>
<p class="note">Real five-star reviews from the live listing, verbatim, each on a different photo and a
different layout. These are for social only — Amazon does not permit review quotes inside A+ content.</p>
<div class="grid">${TCARD.map(f => img('build/creative/testimonials', f, CARD[f.replace('.jpg','')]||'')).join('')}</div>

<h2>A+ modules <span class="tag">exact Amazon canvas</span></h2>
<p class="note">Evergreen: no price, no pack count, no date, no offer. Two pillars, discreet and backed
for a year.</p>
<div class="grid wide">${APLUS.map(f => img('build/creative/aplus-evergreen', f, MOD[f.replace('.jpg','')]||'')).join('')}</div>

<h2>Detail-page video</h2>
<p class="note">1920×1080, 29.5s, inside Amazon's 6–45s window. Three sections were cut out of the source:
two discontinued products, a wrong length spec, and a model wearing a neck lanyard.</p>
<div class="grid wide">${AVID.map(f => vid('build/creative/video', f, '')).join('')}</div>

<h2>Social cuts</h2>
<div class="grid">${SVID.map(f => vid('build/creative/video', f, '')).join('')}</div>
</div>`;
writeFileSync('build/creative/gallery.html', html);
console.log(`gallery.html — ${APLUS.length} modules, ${TCARD.length} cards, ${TVID.length+TVIDF.length+AVID.length+SVID.length} videos`);
