import { readFileSync, writeFileSync, statSync } from 'node:fs';
const b64 = p => `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`;
const kb  = p => (statSync(p).size/1024).toFixed(0);
const mb  = p => (statSync(p).size/1048576).toFixed(1);
const A = 'build/creative/aplus-evergreen';

const mods = [
  { f:`${A}/01-discreet.jpg`, t:'01 · Discreet', c:'STANDARD_HEADER_IMAGE_TEXT · 970×600',
    n:'Photo band is 324px wide because the source is 0.54 aspect. Sized from the source, so nothing is cropped.' },
  { f:`${A}/02-where.jpg`, t:'02 · Where it disappears', c:'STANDARD_HEADER_IMAGE_TEXT · 970×600',
    n:'Four real attachment points, all photographed. Tiles are 1.33 against 1.37 sources, so the crop is negligible.' },
  { f:`${A}/03-warranty.jpg`, t:'03 · Warranty', c:'STANDARD_IMAGE_TEXT_OVERLAY · 970×300',
    n:'The honest answer to a durability doubt is a term, not an adjective. Bronze is reserved for this one mark.' },
  { f:`${A}/04-attach.jpg`, t:'04 · How it attaches', c:'STANDARD_HEADER_IMAGE_TEXT · 970×600',
    n:'Captions are taken from our own published instructions. My first draft invented a method and had to be corrected.' },
  { f:`${A}/05-answers.jpg`, t:'05 · The four questions', c:'STANDARD_HEADER_IMAGE_TEXT · 970×600',
    n:'These are the questions Amazon\'s own Alexa panel puts to shoppers on our listing, so they are the doubts Amazon has already measured. A+ may not quote customer reviews, so the proof line is warranty and longevity.' },
];
const SOC = [
  { f:'build/creative/video/_social-01-discreet_t0.jpg', t:'social-01-discreet', d:'9.2s' },
  { f:'build/creative/video/_social-02-attach_t0.jpg',   t:'social-02-attach',   d:'9.6s' },
  { f:'build/creative/video/_social-03-worn_t0.jpg',     t:'social-03-worn',     d:'8.5s' },
];

const html = `<title>Phone Assured · A+ and video for review</title>
<style>
:root{--ink:#16191B;--slate:#2E4756;--paper:#F6F5F2;--muted:#5E686C;--line:#DFDDD8;--seal:#8C6A34;--card:#FFFFFF}
:root:not([data-theme="light"]){}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ink:#ECEEEF;--slate:#8FB4C2;--paper:#141719;--muted:#98A2A6;--line:#2A2F33;--seal:#C79A54;--card:#1B1F22}}
:root[data-theme="dark"]{--ink:#ECEEEF;--slate:#8FB4C2;--paper:#141719;--muted:#98A2A6;--line:#2A2F33;--seal:#C79A54;--card:#1B1F22}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:'Avenir Next',Avenir,Helvetica,system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;line-height:1.55}
.wrap{max-width:1090px;margin:0 auto;padding:64px 24px 96px}
.eyebrow{font-size:12.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--slate)}
h1{font-size:clamp(30px,4.6vw,46px);font-weight:600;letter-spacing:-.022em;line-height:1.1;margin:18px 0 0;text-wrap:balance}
.lede{font-size:18px;color:var(--muted);max-width:64ch;margin-top:18px}
.rule{height:1px;background:var(--line);margin:44px 0}
h2{font-size:24px;font-weight:600;letter-spacing:-.012em;margin:0 0 6px}
.meta{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
figure{margin:0 0 44px;background:var(--card);border:1px solid var(--line);border-radius:6px;overflow:hidden}
figure img{width:100%;height:auto;display:block}
figcaption{padding:16px 20px;border-top:1px solid var(--line);font-size:14px;color:var(--muted)}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin:22px 0 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:16px 18px}
.stat b{display:block;font-size:23px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.stat span{font-size:12.5px;color:var(--muted)}
ul{margin:14px 0 0 20px;color:var(--muted);font-size:15.5px}li{margin:7px 0}
.kill{border-left:3px solid var(--seal);padding-left:16px;margin:20px 0;font-size:15.5px;color:var(--muted)}
code{font-family:ui-monospace,Menlo,monospace;font-size:13px;background:var(--card);border:1px solid var(--line);
  border-radius:3px;padding:1px 5px}
.scroll{overflow-x:auto}
</style>
<div class="wrap">
<div class="eyebrow">Phone Assured · 11 August 2026</div>
<h1>A+ modules and a detail-page video, built from footage we already own.</h1>
<p class="lede">Evergreen: no price, no pack count, no date, no offer. Two pillars, discreet and
backed for a year. Nothing here was shot, licensed or generated. Every asset is a cut or a
composition of the 2023 library.</p>

<div class="grid">
  <div class="stat"><b>5</b><span>A+ modules, exact canvas</span></div>
  <div class="stat"><b>4</b><span>videos: one 16:9, three 9:16</span></div>
  <div class="stat"><b>0</b><span>new photography needed</span></div>
  <div class="stat"><b>6</b><span>defects caught before shipping</span></div>
</div>

<div class="rule"></div>
${mods.map(m => `<figure>
  <img src="${b64(m.f)}" alt="${m.t}">
  <figcaption><b style="color:var(--ink)">${m.t}</b> &nbsp;·&nbsp; ${m.c} &nbsp;·&nbsp; ${kb(m.f)} KB<br>${m.n}</figcaption>
</figure>`).join('\n')}

<div class="rule"></div>
<h2>The video</h2>
<p class="meta">1920×1080 · 16:9 · 29.5s · ${mb('build/creative/video/amazon-detail-discreet.mp4')} MB · H.264 · AAC 200 kbps ·
<code>build/creative/video/amazon-detail-discreet.mp4</code></p>
<figure style="margin-top:20px">
  <img src="${b64('build/creative/video/_poster.jpg')}" alt="Opening frame">
  <figcaption><b style="color:var(--ink)">Frame 0, which is the carousel thumbnail.</b> It opens on the product
  worn, in colour, cord visible on both subjects, inside the first second.</figcaption>
</figure>

<h2 style="margin-top:36px">What was cut out of it, and why</h2>
<p class="lede" style="font-size:15.5px">None of this is visible in any metadata field. It was found by
contact-sheeting the source frame by frame, which is the lesson that came over from Social Scene.</p>
<div class="kill"><b style="color:var(--ink)">00.0–07.5</b> · the product lineup card lists NECK LANYARD and
WRIST LANYARD. Both discontinued.</div>
<div class="kill"><b style="color:var(--ink)">27.0–32.0</b> · “STRETCHES UP TO 27 INCHES”. That is the Pro
spec; the Black listing publishes 31 inches.</div>
<div class="kill"><b style="color:var(--ink)">40.5–54.5</b> · “CHOOSE OPTION WITH LANYARD”, and at 44.8 a
model is wearing a neck lanyard.</div>
<div class="kill"><b style="color:var(--ink)">07.5–12.5</b> · the black-and-white pickpocketing scene. Cut on
positioning rather than compliance: the pillar is discreet, not fear.</div>

<div class="rule"></div>
<h2>Social cuts, 9:16</h2>
<p class="lede" style="font-size:15.5px">One master serves Reels, TikTok and Shorts: 1080×1920, 30fps.
The 16:9 source is reframed with a blurred fill rather than cropped, so nobody at the edge of frame
gets sliced. Opening frames below.</p>
<div style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-top:24px">
${SOC.map(x => `<figure style="margin:0">
  <img src="${b64(x.f)}" alt="${x.t}">
  <figcaption style="font-size:13px"><b style="color:var(--ink)">${x.t}</b><br>${x.d} · 1080×1920</figcaption>
</figure>`).join('')}
</div>

<div class="rule"></div>
<h2>What the build gate refused</h2>
<ul>
  <li><b style="color:var(--ink)">Text overflow.</b> A 46px headline at 1.06 leading overran its box. Leading
  is now 1.12, which is both safer and better typography.</li>
  <li><b style="color:var(--ink)">A deliverable path under <code>/tmp</code>.</b> Hard refusal. Our content
  registry already lost nine approved assets that way.</li>
  <li><b style="color:var(--ink)">Dead space.</b> Module 02 carried an empty middle third and said so.</li>
  <li><b style="color:var(--ink)">Content off the canvas.</b> Module 05's two columns missed fitting by
  2px, stacked, and dropped a whole answer off the bottom — while every single element still fitted its
  own box. The gate gained that assert as a result.</li>
  <li><b style="color:var(--ink)">An invented fact.</b> Module 04 first claimed the cord threads through a
  separate tab rather than the case. Our own instructions say it goes through the case's charging port
  opening. Caught by reading the source captions, not by any check.</li>
</ul>
<p class="lede" style="font-size:15.5px;margin-top:18px">It also passed something it should not have. The
first render came out in 16px Times because Chromium rejects a <code>font:</code> shorthand containing
<code>-apple-system</code>, dropping the size and the family together. No assert catches a wrong typeface.
That is the whole argument for looking at the pixels.</p>

<div class="rule"></div>
<h2>Still open</h2>
<ul>
  <li>A FAL key for cut-outs. Everything above avoids needing one, but the layered hero recipe does not.</li>
  <li>The 9:16 social cuts, which are a different master to this one.</li>
  <li>Compatible Phone Models on the listing still stops at the Galaxy S22.</li>
</ul>
</div>`;
writeFileSync('build/creative/review.html', html);
console.log(`review.html  ${(Buffer.byteLength(html)/1024).toFixed(0)} KB`);
