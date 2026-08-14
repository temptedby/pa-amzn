/** build-video-aplus.mjs — a compliant Amazon detail-page cut from footage we already own.
 *
 *  Amazon detail page wants 16:9, >=1280x720, 6-45s, H.264, AAC >=96 kbps.
 *  Source is 1920x1080 H.264 / 317 kbps AAC / 63.3s, so this is a CUT, not a shoot.
 *
 *  What is deliberately EXCISED, found by contact-sheeting the source rather than reading its
 *  metadata (old branding is pixels — no catalog field would have shown any of this):
 *    00.0-07.5   product lineup includes NECK LANYARD and WRIST LANYARD, both discontinued
 *    27.0-32.0   "STRETCHES UP TO 27 INCHES" is the Pro spec; Black publishes 31"
 *    40.5-54.5   "CHOOSE OPTION WITH LANYARD", and at 44.8 a model wears a neck lanyard
 *
 *  Also dropped, on positioning rather than compliance: the black-and-white pickpocketing scene at
 *  07.5-12.5. William's pillar is DISCREET, not fear, and an Amazon thumbnail should open on the
 *  product doing its job rather than on a theft.
 *
 *  Segments stay CHRONOLOGICAL so the music bed does not jump more than it has to.
 *
 *  RUN: node scripts/pacr/build-video-aplus.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

const SRC = 'assets/source/Final Video/177 SEC01 Megan Mann Securisee.mp4';
const OUT = 'build/creative/video/amazon-detail-discreet.mp4';
mkdirSync('build/creative/video', { recursive: true });

/** [start, end, why] */
const SEG = [
  [12.8, 17.2, 'opens on the product worn, in colour — frame 0 is the carousel thumbnail'],
  [17.4, 27.0, 'attaches through the case, still charges'],
  [32.0, 40.5, 'the cord, the carabiner, the belt clip, worn walking'],
  [54.5, 58.5, 'ordinary use, nothing on show'],
  [59.5, 62.5, 'end card'],
];

/* trim + setpts reset per segment, then concat. Output seeking with a PTS reset is what stops
   ffmpeg leaving a black or duplicated first frame — and frame 0 IS the carousel thumbnail. */
const parts = SEG.map(([a, b], i) =>
  `[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${i}];` +
  `[0:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS[a${i}];`).join('');
const chain = SEG.map((_, i) => `[v${i}][a${i}]`).join('');
const filter = `${parts}${chain}concat=n=${SEG.length}:v=1:a=1[v][a]`;

execFileSync('ffmpeg', ['-v', 'error', '-i', SRC, '-filter_complex', filter,
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '24',
  '-b:v', '10M', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
  OUT, '-y'], { stdio: 'inherit' });

/* ---- verify the RENDERED FILE. A green build is not a pass. ---- */
const probe = (args) => execFileSync('ffprobe', ['-v', 'error', ...args, OUT]).toString().trim();
const dur = Number(probe(['-show_entries', 'format=duration', '-of', 'csv=p=0']));
const [w, h] = probe(['-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0']).split(',').map(Number);
const abr = Number(probe(['-select_streams', 'a:0', '-show_entries', 'stream=bit_rate', '-of', 'csv=p=0']));

execFileSync('ffmpeg', ['-v', 'error', '-ss', '0', '-i', OUT, '-frames:v', '1',
  'build/creative/video/_t0.jpg', '-y']);
const t0 = execFileSync('ffmpeg', ['-v', 'error', '-i', 'build/creative/video/_t0.jpg',
  '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
const bright = t0[0];

const fail = [];
if (dur < 6 || dur > 45)        fail.push(`duration ${dur.toFixed(1)}s outside Amazon's 6-45s`);
if (w < 1280 || h < 720)        fail.push(`${w}x${h} under the 1280x720 floor`);
if (Math.abs(w / h - 16 / 9) > 0.01) fail.push(`aspect ${(w / h).toFixed(3)} is not 16:9`);
if (abr < 96000)                fail.push(`audio ${Math.round(abr / 1000)} kbps under the 96 kbps floor`);
if (bright < 25)                fail.push(`frame 0 mean brightness ${bright} reads as black — it is the thumbnail`);

console.log(`\n  amazon-detail-discreet.mp4`);
console.log(`    ${w}x${h}  ${dur.toFixed(1)}s  ${(statSync(OUT).size / 1048576).toFixed(1)} MB  audio ${Math.round(abr / 1000)} kbps  frame0 brightness ${bright}`);
console.log(fail.length ? '    FAIL:\n' + fail.map(f => '      ! ' + f).join('\n')
                        : '    passes Amazon detail-page spec on every checked field');
