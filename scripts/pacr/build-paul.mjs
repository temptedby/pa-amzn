/** build-paul.mjs — Paul Arnoldi, framed, paraphrased, cut on REAL sentence boundaries.
 *
 *  William twice: "you keep cutting off Paul's testimonial mid sentence" and "wrap it in a nice
 *  frame and paraphrase the testimonial."
 *
 *  The first two attempts were wrong because whisper processes in 30s chunks and a sentence sitting
 *  on the seam was silently dropped — which is how "I've not lost a phone since. I've not dropped a
 *  phone and damaged it since. I've not had one stolen since." went missing entirely, and how the
 *  ending "makes it a no-brainer. Cheers." was lost. Fixed by transcribing OVERLAPPING 24s windows
 *  and merging, so no sentence is ever on a seam.
 *
 *  Paul is a real named customer, 480x848. He is placed WHOLE in a card rather than upscaled to
 *  full bleed, so the design carries the frame instead of the pixels being stretched.
 *
 *  RUN: node scripts/pacr/build-paul.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { C, T, FONT } from './tokens.mjs';

const SRC = 'assets/source/_drive-video/Paul Arnoldi Testimonial Phone Assured.mp4';
const OUT = 'build/creative/testimonial-video';
const TMP = 'build/creative/_frames';
mkdirSync(OUT, { recursive: true }); mkdirSync(TMP, { recursive: true });

const W = 1080, H = 1920;
const CARD = { w: 840, h: 1484, x: 120, y: 250 };   // 840 / 0.566 = 1484, his native aspect

/** in/out are sentence ends from the merged overlapping-window transcript */
const CUTS = [
  { id:'paul-01-72-iphones', a:0.00,  b:28.20,
    para:'72 iPhones lost, stolen or broken.\nThen he tried a tether.',
    says:'Hi there, my name is Paul. Since I started using Apple devices when I was 18, so 20 odd years ago, I actually made my way through 72 iPhones through a combination of losing, theft and damage. So when I came across the Phone Assured solution, I jumped at the chance.' },
  { id:'paul-02-not-since', a:28.00, b:44.20,
    para:'Five months.\nNot one lost, dropped or stolen.',
    says:'That was in February this year, so we’re talking five months ago. I’ve not lost a phone since. I’ve not dropped a phone and damaged it since. I’ve not had one stolen since.' },
  { id:'paul-03-seven-saves', a:44.00, b:58.20,
    para:'Seven separate times\nit saved the phone.',
    says:'I can think of seven clear instances where the Phone Assured clip has actually stopped the phone being damaged, lost or indeed stolen.' },
  { id:'paul-04-no-brainer', a:57.90, b:72.00,
    para:'“The hassle and the expense\nit’s saved me makes it\na no-brainer.”',
    says:'And I couldn’t recommend it highly enough. For the small, reasonable, modest price, the hassle and the expense that it’s saved me makes it a no-brainer. Cheers.' },
];

/** The overlay: TRANSPARENT everywhere except the caption, the footer and a hairline rule around
 *  the card. Punching a hole with box-shadow produced a fully opaque PNG that hid the video, so the
 *  layer is now additive rather than subtractive: ground -> video -> this on top. */
async function frame(text, file) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{ width:W, height:H }, deviceScaleFactor:1 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${W}px;height:${H}px;background:transparent}
    .rule{position:absolute;left:${CARD.x-1}px;top:${CARD.y-1}px;width:${CARD.w+2}px;height:${CARD.h+2}px;
      border:1px solid rgba(255,255,255,.18);border-radius:15px}
    .cap{position:absolute;left:78px;right:78px;top:62px;font-family:${FONT};font-weight:600;
      font-size:54px;line-height:1.16;letter-spacing:-.02em;color:#fff;white-space:pre-line;
      text-shadow:0 2px 18px rgba(0,0,0,.55)}
    .foot{position:absolute;left:78px;right:78px;bottom:76px;display:flex;align-items:center;gap:15px}
    .dot{width:9px;height:9px;border-radius:50%;background:${C.seal};flex:none}
    .name{font-family:${FONT};font-weight:600;font-size:30px;color:#fff}
    .role{font-family:${FONT};font-weight:400;font-size:23px;color:#9AA6AA}
  </style>
  <div class="rule"></div>
  <div class="cap">${text}</div>
  <div class="foot"><div class="dot"></div><div class="name">Paul Arnoldi</div>
    <div class="role">· Phone Assured customer, filmed himself</div></div>`);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(file, await page.screenshot({ type:'png', omitBackground:true }));
  await browser.close();
}

const rows = [];
for (const c of CUTS) {
  const png = `${TMP}/${c.id}.png`;
  await frame(c.para, png);
  const out = `${OUT}/${c.id}-framed.mp4`;
  const f = `[0:v]trim=start=${c.a}:end=${c.b},setpts=PTS-STARTPTS,scale=${CARD.w}:${CARD.h}[vid];`
          + `color=c=0x16191B:s=${W}x${H}:r=30[bgc];`
          + `[bgc][vid]overlay=${CARD.x}:${CARD.y}:shortest=1[withvid];`
          + `[withvid][1:v]overlay=0:0:shortest=1,setsar=1[v];`
          + `[0:a]atrim=start=${c.a}:end=${c.b},asetpts=PTS-STARTPTS,volume=6dB[a]`;
  execFileSync('ffmpeg',['-v','error','-i',SRC,'-loop','1','-i',png,'-filter_complex',f,
    '-map','[v]','-map','[a]','-c:v','libx264','-profile:v','high','-pix_fmt','yuv420p',
    '-r','30','-b:v','10M','-c:a','aac','-b:a','160k','-movflags','+faststart', out,'-y'],
    { stdio:'inherit' });
  const probe = a => execFileSync('ffprobe',['-v','error',...a,out]).toString().trim();
  const dur = Number(probe(['-show_entries','format=duration','-of','csv=p=0']));
  const [w,h] = probe(['-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0']).split(',').map(Number);
  rows.push({ id:c.id, dur, w, h, mb:statSync(out).size/1048576 });
}
for (const r of rows) console.log(`  ${r.id.padEnd(24)} ${r.w}x${r.h}  ${r.dur.toFixed(1).padStart(5)}s  ${r.mb.toFixed(1)} MB`);
console.log('\nwhat he actually says in each, from the merged transcript:');
for (const c of CUTS) console.log(`\n  ${c.id}\n    ${c.says}`);
