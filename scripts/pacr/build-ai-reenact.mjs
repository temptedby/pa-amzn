/** build-ai-reenact.mjs — wrap an AI-animated clip into a labelled 1080x1920 social reel.
 *
 *  What these are, exactly: a REAL verbatim Amazon review, over a DRAMATIZATION built by animating
 *  one of our own photographs. The person on screen is not the reviewer and never claims to be, so
 *  every reel carries "Dramatization" on the face of it. A generated person presenting as a customer
 *  is a fabricated endorsement; a labelled dramatization of a real review is ordinary advertising.
 *
 *  ffmpeg on this machine has NO drawtext and NO subtitles filter, so every word here is composited
 *  as a transparent PNG rendered by render.mjs. Learned 2026-08-11; do not reach for a text filter.
 *
 *  RUN: node scripts/pacr/build-ai-reenact.mjs
 */
import { render } from './render.mjs';
import { C, FONT, RESET } from './tokens.mjs';
import { REVIEWS } from './reviews.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';

const SRC = 'build/creative/ai-reenact', OUT = 'build/creative/ai-reels';
const W = 1080, H = 1920, GROUND = '0x16191B';
mkdirSync(OUT, { recursive: true });

/** clip file -> which review it dramatises. Explicit, because a reel is a claim about a person. */
const PAIRS = [
  { file: 'kevin-jeans.mp4',    review: 'kevin'    },
  { file: 'meda48-purse.mp4',   review: 'meda48'   },
  { file: 'adam3914-water.mp4', review: 'adam3914' },
];

const probe = f => {
  const [w, h] = execFileSync('ffprobe', ['-v','error','-select_streams','v:0',
    '-show_entries','stream=width,height','-of','csv=p=0:s=x', f]).toString().trim().split('x').map(Number);
  return { w, h };
};
const S = n => '★'.repeat(n) + '☆'.repeat(5 - n);
const qsize = q => q.length > 200 ? 35 : q.length > 130 ? 40 : 46;

let built = 0;
for (const p of PAIRS) {
  const src = `${SRC}/${p.file}`;
  if (!existsSync(src)) { console.log(`  skip ${p.file}, not on disk`); continue; }
  const r = REVIEWS.find(x => x.id === p.review);
  const { w: vw, h: vh } = probe(src);

  /* Place the clip whole. Width-fit, capped at 56% of the canvas height, so the quote above and the
     disclosure below always have room and the clip is never cropped into. */
  const ch = Math.min(Math.round(W * vh / vw), Math.round(H * 0.56));
  const cwv = Math.round(ch * vw / vh);
  const x = Math.round((W - cwv) / 2), y = Math.round(H * 0.315);

  const overlay = `${OUT}/_${r.id}-text.png`;
  await render({
    canvas: { w: W, h: H }, out: overlay, format: 'png', transparent: true,
    manifest: { kind: 'ai-reenact overlay', review: r.id, clip: p.file },
    html: `<!doctype html><html><head><meta charset="utf-8"><style>${RESET}
      html,body{background:transparent}</style></head><body>
      <div style="width:${W}px;height:${H}px;position:relative;background:transparent">
        <div style="position:absolute;left:0;right:0;top:0;height:${Math.round(H*0.315)}px;
          background:linear-gradient(to bottom, ${C.ink} 62%, rgba(22,25,27,0) 100%)"></div>
        <div style="position:absolute;left:0;right:0;bottom:0;height:${Math.round(H*0.145)}px;
          background:linear-gradient(to top, ${C.ink} 62%, rgba(22,25,27,0) 100%)"></div>
        <div style="position:absolute;left:80px;right:80px;top:120px">
          <div data-fit style="font-family:${FONT};font-weight:400;font-size:27px;letter-spacing:.16em;
            color:${C.seal};margin-bottom:20px">${S(r.stars)}</div>
          <div data-fit style="font-family:${FONT};font-weight:500;font-size:${qsize(r.quote)}px;
            line-height:1.28;letter-spacing:-.014em;color:#fff">“${r.quote}”</div>
          <div data-fit style="font-family:${FONT};font-weight:600;font-size:23px;color:#fff;
            margin-top:24px">${r.name}<span style="font-weight:400;color:#9FADB3"> · ${r.date}</span></div>
        </div>
        <div style="position:absolute;left:80px;right:80px;bottom:120px">
          <div style="height:1px;background:rgba(255,255,255,.22);margin-bottom:24px"></div>
          <div data-fit style="font-family:${FONT};font-weight:600;font-size:16px;letter-spacing:.14em;
            text-transform:uppercase;color:#93B6C4">Verified Amazon review · Dramatization</div>
          <div data-fit style="font-family:${FONT};font-weight:400;font-size:18px;line-height:1.45;
            color:#9FADB3;margin-top:11px">The words are the customer's own. The scene is our own photography, animated. The person shown is not the reviewer.</div>
        </div>
      </div></body></html>`,
  });

  const filt = `[0:v]scale=${cwv}:${ch}[vid];`
    + `color=c=${GROUND}:s=${W}x${H}:r=30:d=6[bg];`
    + `[bg][vid]overlay=${x}:${y}:shortest=1[withvid];`
    + `[withvid][1:v]overlay=0:0:shortest=1,setsar=1[v]`;
  const out = `${OUT}/${r.id}-reenact.mp4`;
  execFileSync('ffmpeg', ['-v','error','-y','-i',src,'-loop','1','-i',overlay,
    '-filter_complex',filt,'-map','[v]','-an',
    '-c:v','libx264','-pix_fmt','yuv420p','-crf','19','-preset','medium', out]);
  console.log(`  ${r.id.padEnd(10)} clip ${vw}x${vh} placed ${cwv}x${ch} at y=${y}   ${(statSync(out).size/1e6).toFixed(1)} MB`);
  built++;
}
console.log(`\n${built} reels -> ${OUT}`);
