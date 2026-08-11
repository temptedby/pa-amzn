/** build-video-social.mjs — 9:16 masters for Reels / TikTok / Shorts, from the same source.
 *
 *  One export serves all three: 1080x1920, H.264, 30fps, AAC. Safe zone is 900x1400 centred,
 *  so the source's burned caption cards land inside it and are never eaten by platform UI.
 *
 *  The source is 1920x1080. It is reframed with a BLURRED FILL rather than letterboxed or
 *  cropped, because cropping a 16:9 frame to 9:16 slices whoever is at the edges.
 *
 *  Segments avoid every discontinued-lanyard and 27-inch section — see build-video-aplus.mjs.
 *
 *  RUN: node scripts/pacr/build-video-social.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

const SRC = 'assets/source/Final Video/177 SEC01 Megan Mann Securisee.mp4';
const DIR = 'build/creative/video';
mkdirSync(DIR, { recursive: true });

const CUTS = [
  { name: 'social-01-discreet', a: 12.8, b: 22.0, why: 'worn on two people, cord visible, then how it attaches' },
  { name: 'social-02-attach',   a: 17.4, b: 27.0, why: 'loops through the case opening, still charges' },
  { name: 'social-03-worn',     a: 32.0, b: 40.5, why: 'the cord, the clip, and it worn walking' },
];

/* blurred fill: background is the frame scaled UP and blurred, foreground is the whole frame
   scaled to width and centred. Nothing is cropped out of the subject. */
const VF = '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2[bg];'
         + '[0:v]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1';

const rows = [];
for (const c of CUTS) {
  const out = `${DIR}/${c.name}.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-ss', String(c.a), '-to', String(c.b), '-i', SRC,
    '-filter_complex', VF, '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-r', '30', '-b:v', '12M', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    out, '-y'], { stdio: 'inherit' });

  const probe = a => execFileSync('ffprobe', ['-v', 'error', ...a, out]).toString().trim();
  const dur = Number(probe(['-show_entries', 'format=duration', '-of', 'csv=p=0']));
  const [w, h] = probe(['-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0']).split(',').map(Number);
  execFileSync('ffmpeg', ['-v', 'error', '-ss', '0', '-i', out, '-frames:v', '1', `${DIR}/_${c.name}_t0.jpg`, '-y']);
  const bright = execFileSync('ffmpeg', ['-v', 'error', '-i', `${DIR}/_${c.name}_t0.jpg`,
    '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])[0];

  const bad = [];
  if (w !== 1080 || h !== 1920) bad.push(`${w}x${h} is not 1080x1920`);
  if (dur < 5 || dur > 15)      bad.push(`${dur.toFixed(1)}s outside the 5-15s target`);
  if (bright < 25)              bad.push(`frame 0 brightness ${bright} reads as black`);
  rows.push({ n: c.name, w, h, dur, mb: statSync(out).size / 1048576, bright, bad });
}

for (const r of rows)
  console.log(`  ${r.n.padEnd(20)} ${r.w}x${r.h}  ${r.dur.toFixed(1).padStart(4)}s  ${r.mb.toFixed(1)} MB  frame0 ${String(r.bright).padStart(3)}  ${r.bad.length ? 'FAIL ' + r.bad.join('; ') : 'ok'}`);
