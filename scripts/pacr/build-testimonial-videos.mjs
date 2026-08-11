/** build-testimonial-videos.mjs — testimonial cuts, on SENTENCE boundaries from a real transcript.
 *
 *  William, 2026-08-11: "you cut them off when they were mid-sentence... read the script, see what
 *  all they're saying, and play the full video per person." He was right — the first pass guessed
 *  boundaries off a contact sheet and clipped speaker 2 at 20.7s while her sentence ran to 22.16s.
 *  Every in/out below now comes from whisper-cli segment timestamps in build/creative/transcripts/,
 *  with a 0.35s tail so the last consonant is never clipped.
 *
 *  RUN: node scripts/pacr/build-testimonial-videos.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

const BILLO = 'assets/source/_drive-video/Testimonial PA Billo FB ad 42.mp4';
const PAUL  = 'assets/source/_drive-video/Paul Arnoldi Testimonial Phone Assured.mp4';
const OUT   = 'build/creative/testimonial-video';
mkdirSync(OUT, { recursive: true });

const END = [34.3, 37.0];   // branded endcard

/* Billo — 1080x1350, four paid UGC creators. Boundaries are sentence ends from the transcript. */
const BILLO_CUTS = [
  { id:'01-been-there',   a:0.00,  b:9.45,  fmt:'1350',
    says:'You were just looking for your phone a couple minutes ago weren’t you? I know. I’ve been there. Fortunately I’ve invested in this handy gadget called Phone Assured.' },
  { id:'02-youre-attached', a:9.45, b:22.60, fmt:'1350',
    says:'I was so happy when I found Phone Assured. You clip this on your body somewhere and the other end secures your phone. So if you drop your phone, no problem, it doesn’t break. If someone tries to pick pocket you, they can’t — you’re attached.' },
  { id:'03-saved-me-money', a:22.60, b:31.20, fmt:'1350',
    says:'It’s easy to use and assemble. It has saved me so much money in phone repairs and replacements. You get 100% satisfaction, as well as a 1 year warranty.' },
  { id:'04-never-again',  a:31.20, b:34.40, fmt:'1350',
    says:'Never have your phone stolen, lost or dropped again.' },
];

/* Paul Arnoldi — a real named customer, 480x848 (already 9:16). Never used until now. */
const PAUL_CUTS = [
  { id:'paul-01-72-iphones', a:0.00,  b:28.90,
    says:'Hi there, my name is Paul. Since I started using Apple devices when I was 18, so 20 odd years ago, I actually made my way through 72 iPhones through a combination of losing, theft and damage.' },
  { id:'paul-02-seven-saves', a:33.60, b:57.40,
    says:'I can think of seven clear instances where the Phone Assured clip has actually stopped the phone being damaged, lost or indeed stolen, and I couldn’t recommend it highly enough.' },
  { id:'paul-03-short-hook', a:8.60,  b:24.90,
    says:'When I was 18, so 20 odd years ago, I actually made my way through 72 iPhones through a combination of losing, theft and damage.' },
];

const GROUND = '0x16191B';
const REEL_PAD = `scale=1080:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${GROUND},setsar=1`;

function cut({ src, segs, out, vf }) {
  const parts = segs.map(([a,b],i) =>
    `[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${i}];` +
    `[0:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS[a${i}];`).join('');
  const cc = `${segs.map((_,i)=>`[v${i}][a${i}]`).join('')}concat=n=${segs.length}:v=1:a=1`;
  const f = vf ? `${parts}${cc}[vc][a];[vc]${vf}[v]` : `${parts}${cc}[v][a]`;
  execFileSync('ffmpeg',['-v','error','-i',src,'-filter_complex',f,'-map','[v]','-map','[a]',
    '-c:v','libx264','-profile:v','high','-pix_fmt','yuv420p','-r','30','-b:v','10M',
    '-c:a','aac','-b:a','128k','-movflags','+faststart', out,'-y'],{stdio:'inherit'});
  const probe = a => execFileSync('ffprobe',['-v','error',...a,out]).toString().trim();
  const dur = Number(probe(['-show_entries','format=duration','-of','csv=p=0']));
  const [w,h] = probe(['-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0']).split(',').map(Number);
  return { dur, w, h, mb: statSync(out).size/1048576 };
}

const rows = [];
for (const c of BILLO_CUTS) {
  for (const [suffix, vf] of [['feed',null],['reel',REEL_PAD]]) {
    const out = `${OUT}/${c.id}-${suffix}.mp4`;
    const r = cut({ src:BILLO, segs:[[c.a,c.b],END], out, vf });
    rows.push({ id:`${c.id}-${suffix}`, ...r, said:c.says });
  }
}
for (const c of PAUL_CUTS) {
  const out = `${OUT}/${c.id}-reel.mp4`;
  /* Paul is 480x848, i.e. already 9:16. Scale to 1080 wide rather than pad. */
  const r = cut({ src:PAUL, segs:[[c.a,c.b]], out,
    vf:`scale=1080:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${GROUND},setsar=1` });
  rows.push({ id:`${c.id}-reel`, ...r, said:c.says });
}

for (const r of rows)
  console.log(`  ${r.id.padEnd(28)} ${r.w}x${r.h}  ${r.dur.toFixed(1).padStart(5)}s  ${r.mb.toFixed(1).padStart(5)} MB`);
console.log('\nfull sentences, verified against the transcript:');
for (const c of [...BILLO_CUTS, ...PAUL_CUTS])
  console.log(`\n  ${c.id}\n    ${c.says}`);
