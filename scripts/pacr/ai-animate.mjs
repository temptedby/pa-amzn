/** ai-animate.mjs — AI image-to-video, driven from OUR OWN photographs.
 *
 *  William approved this on 2026-08-12 ("yes thats fine just keep track and social scene can
 *  charge PA"), so two things are load-bearing:
 *
 *  1. THE MONEY IS SOCIAL SCENE'S. The credential lives in ~/projects/social-scene/.env.fal and the
 *     charge lands on that account. Every generation therefore reads fal's REAL balance before and
 *     after and records the DIFFERENCE, not a published price. A price field is a guess; a balance
 *     delta is what Social Scene will actually invoice PA for. Ledger: confabulator/ai-spend-ledger.md
 *
 *  2. IMAGE-TO-VIDEO ONLY, NEVER TEXT-TO-VIDEO. The first frame is always a real photograph from our
 *     own shoot, so the product in the clip is OUR tether with OUR geometry and the person is someone
 *     who was actually there. Generating a tether from a text prompt would put a competitor's
 *     hardware on our page, which is the whole reason this was parked on 08-11.
 *
 *  PROMPT RULES, from our own 1-star reviews rather than from taste:
 *    - never a phone rising, retracting, or hanging suspended by the cord. Stevo, Nov 2022:
 *      "They show a phone hanging from this lanyard about knee high but actually he must be holding
 *      the line." The cord retracts; the phone is guided back by hand. Prompt motion accordingly.
 *    - never invent product, text, logos or a second person. Motion only, on what is already there.
 *
 *  Anything built here is a DRAMATIZATION of a real verbatim review. It is never presented as
 *  footage of the reviewer, and the card that carries it has to say so.
 *
 *  RUN: node scripts/pacr/ai-animate.mjs <source.jpg> "<motion prompt>" <out.mp4> [model]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const FAL_ENV = '/Users/williamholdeman/projects/social-scene/.env.fal';
const LEDGER  = 'confabulator/ai-spend-ledger.md';
const LEDGER_JSON = 'confabulator/ai-spend-ledger.json';
const MIN_BALANCE = 1.00;          // stop well before zero; a dead key mid-batch is worse than a pause

const [src, prompt, out, model = 'fal-ai/kling-video/v1.6/standard/image-to-video'] = process.argv.slice(2);
if (!src || !prompt || !out) {
  console.error('usage: ai-animate.mjs <source.jpg> "<motion prompt>" <out.mp4> [model]');
  process.exit(64);
}
const abs = path.resolve(out);
if (abs.startsWith('/tmp/') || abs.startsWith('/private/tmp/')) {
  console.error('REFUSED: a paid deliverable never lands in a temp dir.'); process.exit(65);
}
for (const bad of [/retract/i, /rises?\b/i, /lifts? (the )?phone/i, /hangs?\b/i, /suspend/i, /dangl/i]) {
  if (bad.test(prompt)) {
    console.error(`REFUSED: prompt matches ${bad}. The cord retracts, the phone does not. ` +
                  'A generated clip of a phone pulling itself up is the exact claim our 1-star reviews call a lie.');
    process.exit(66);
  }
}

const FAL = Object.fromEntries(fs.readFileSync(FAL_ENV, 'utf8').split('\n')
  .map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
  .map(m => [m[1], m[2].replace(/^["']|["']$/g, '').trim()])).FAL_KEY;
const H = { Authorization: `Key ${FAL}`, 'Content-Type': 'application/json' };
const balance = async () => Number(await fetch('https://rest.alpha.fal.ai/billing/user_balance',
  { headers: { Authorization: `Key ${FAL}` } }).then(r => r.text()));

const before = await balance();
if (!Number.isFinite(before)) { console.error('could not read the fal balance; refusing to spend blind'); process.exit(1); }
if (before < MIN_BALANCE) { console.error(`fal balance $${before.toFixed(2)} is below the $${MIN_BALANCE.toFixed(2)} floor. Stopping.`); process.exit(1); }

/* Downscale the first frame. The model does not need 6000px and the upload is the slow part. */
const small = 'build/creative/_ai-src.jpg';
fs.mkdirSync('build/creative', { recursive: true });
const sharp = (await import('sharp')).default;
await sharp(src).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toFile(small);
const dataUri = `data:image/jpeg;base64,${fs.readFileSync(small).toString('base64')}`;

console.log(`[ai] ${path.basename(src)}  ->  ${out}`);
console.log(`[ai] model ${model}   balance before $${before.toFixed(4)}`);

const submit = await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers: H,
  body: JSON.stringify({ image_url: dataUri, prompt, duration: '5', aspect_ratio: '9:16' }) }).then(r => r.json());
if (!submit.request_id) { console.error('submit failed:', JSON.stringify(submit).slice(0, 400)); process.exit(1); }

let status = 'IN_QUEUE';
for (let i = 0; i < 120 && status !== 'COMPLETED'; i++) {
  await new Promise(s => setTimeout(s, 5000));
  const sj = await fetch(submit.status_url, { headers: H }).then(r => r.json());
  status = sj.status || '?';
  if (i % 6 === 5) console.log(`    ${(i + 1) * 5}s  ${status}`);
  if (status === 'FAILED') { console.error('FAILED:', JSON.stringify(sj).slice(0, 400)); process.exit(1); }
}
if (status !== 'COMPLETED') { console.error('timed out at', status); process.exit(1); }

const res = await fetch(submit.response_url, { headers: H }).then(r => r.json());
const url = res.video?.url || res.output?.video?.url || res.video_url;
if (!url) { console.error('no video url:', JSON.stringify(res).slice(0, 400)); process.exit(1); }
fs.mkdirSync(path.dirname(abs), { recursive: true });
const buf = Buffer.from(await fetch(url).then(r => r.arrayBuffer()));
fs.writeFileSync(abs, buf);

/* fal's balance SETTLES a beat after the job finishes. Read once immediately and it returns the
   pre-charge number, which is how the first run on 2026-08-12 logged a $0.0000 clip that actually
   cost $0.28. Poll until it moves, and if it never does, record null rather than a comfortable zero. */
let after = before, settled = false;
for (let i = 0; i < 24 && !settled; i++) {
  await new Promise(s => setTimeout(s, 5000));
  const b = await balance();
  if (Number.isFinite(b) && Math.abs(b - before) > 1e-6) { after = b; settled = true; }
}
const cost = settled ? +(before - after).toFixed(4) : null;
if (!settled) console.log('[ai] WARNING: fal balance never moved. Cost recorded as unknown, not as zero.');
const row = { at: new Date().toISOString(), model, source: src, out, prompt,
              bytes: buf.length, balanceBefore: before, balanceAfter: settled ? after : null, costUSD: cost,
              payer: 'Social Scene fal.ai account', rebillTo: 'PA-AMZN' };

const prior = fs.existsSync(LEDGER_JSON) ? JSON.parse(fs.readFileSync(LEDGER_JSON, 'utf8')) : [];
prior.push(row);
fs.writeFileSync(LEDGER_JSON, JSON.stringify(prior, null, 2));

if (!fs.existsSync(LEDGER)) fs.writeFileSync(LEDGER,
`# AI generation spend, billed to Social Scene, rebilled to PA-AMZN

William approved on 2026-08-12: "yes thats fine just keep track and social scene can charge PA".

The credential is Social Scene's fal.ai account, so Social Scene pays the vendor and invoices
PA-AMZN. Every row below is a REAL balance delta read from fal before and after the call, not a
published rate card. Total at the bottom is what Social Scene should charge.

| when (UTC) | out | model | cost |
|---|---|---|---|
`);
const shown = cost === null ? 'unknown' : `$${cost.toFixed(4)}`;
fs.appendFileSync(LEDGER, `| ${row.at.slice(0, 16).replace('T', ' ')} | ${path.basename(out)} | ${model.split('/').slice(1, 3).join('/')} | ${shown} |\n`);

const total = prior.reduce((s, r) => s + (r.costUSD || 0), 0);
console.log(`[ai] DONE  ${(buf.length / 1e6).toFixed(1)} MB   this clip ${shown}   ` +
            `running total $${total.toFixed(4)} across ${prior.length}   fal balance $${after.toFixed(2)}`);
