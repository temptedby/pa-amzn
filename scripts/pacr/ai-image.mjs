/** ai-image.mjs — AI image EDITING, driven from one of our own product photographs.
 *
 *  Same two rules as ai-animate.mjs, for the same reasons:
 *
 *  1. THE MONEY IS SOCIAL SCENE'S. The credential is ~/projects/social-scene/.env.fal, so every run
 *     reads fal's REAL balance before and after and records the DIFFERENCE. A published price is a
 *     guess; a balance delta is what Social Scene will invoice PA. Ledger: ai-spend-ledger.md
 *
 *  2. IMAGE-TO-IMAGE ONLY, NEVER TEXT-TO-IMAGE. The input is always a real photograph of OUR
 *     hardware. A tether generated from a text prompt is somebody else's product on our page.
 *
 *  AND ONE MORE, from the 08-12 ledger: "where the hardware is thin the model degrades it, and in
 *  one clip erased it off a waistband entirely". So the input frame must show the clip LARGE, and
 *  the output is compared against the real product by eye before anything ships. This script never
 *  writes into a delivery folder — output goes to build/creative/ai-test for review.
 *
 *  RUN: node scripts/pacr/ai-image.mjs <source.jpg> "<edit instruction>" <out.jpg>
 */
import fs from 'node:fs'; import path from 'node:path'; import sharp from 'sharp';

const [src, prompt, out] = process.argv.slice(2);
if (!src || !prompt || !out) { console.error('usage: ai-image.mjs <source.jpg> "<instruction>" <out.jpg>'); process.exit(1); }

// Prompt gate, from our own one-star reviews rather than from taste. Stevo, Nov 2022: "They show a
// phone hanging from this lanyard about knee high but actually he must be holding the line."
const BANNED = /\b(retract|retracts|retracting|hang|hangs|hanging|suspend|suspended|dangl\w*|pulls? (it )?up|lifts?)\b/i;
if (BANNED.test(prompt)) { console.error(`refused: the prompt implies the cord lifts or suspends the item.\n  ${prompt}`); process.exit(1); }

const envRaw = fs.readFileSync('/Users/williamholdeman/projects/social-scene/.env.fal', 'utf8');
const KEY = (envRaw.match(/FAL_KEY\s*=\s*"?([^"\n]+)"?/) || [])[1];
if (!KEY) { console.error('no FAL_KEY'); process.exit(1); }
const H = { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' };
const MIN_BALANCE = 1.00;

const balance = async () => Number(await fetch('https://rest.alpha.fal.ai/billing/user_balance',
  { headers: { Authorization: `Key ${KEY}` } }).then(r => r.text()).catch(() => NaN));

const before = await balance();
if (!Number.isFinite(before)) { console.error('could not read the fal balance; refusing to spend blind'); process.exit(1); }
if (before < MIN_BALANCE) { console.error(`balance $${before.toFixed(2)} below the $${MIN_BALANCE.toFixed(2)} floor`); process.exit(1); }

const MODEL = 'fal-ai/flux-pro/kontext';
// DOWNSCALE FIRST. A 2500px source base64-encodes to megabytes and the submit came back with an
// empty body — "Unexpected end of JSON input" — rather than an error message. The model does not
// need the extra pixels. Same reason ai-animate.mjs downscales its first frame.
const small = await sharp(src).resize(1280, 1280, { fit: 'inside' }).jpeg({ quality: 88 }).toBuffer();
const dataUri = `data:image/jpeg;base64,${small.toString('base64')}`;
console.log(`[ai] ${MODEL}  balance before $${before.toFixed(4)}`);

const submit = await fetch(`https://queue.fal.run/${MODEL}`, { method: 'POST', headers: H,
  body: JSON.stringify({ prompt, image_url: dataUri, guidance_scale: 3.5, num_images: 1, output_format: 'jpeg' }) })
  .then(async r => { const t = await r.text(); try { return JSON.parse(t); } catch { return { _status: r.status, _body: t.slice(0, 300) }; } });
if (!submit.request_id) { console.error('submit failed:', JSON.stringify(submit).slice(0, 400)); process.exit(1); }
console.log('[ai] queued', submit.request_id);

// USE THE URLS FAL RETURNS. Constructing `/requests/<id>/status` by hand returned an empty body for
// this model — the path differs for namespaced models — and the poll died on JSON.parse AFTER the
// generation had already been paid for. submit.status_url and submit.response_url are exact.
const jget = async (u) => { const r = await fetch(u, { headers: { Authorization: `Key ${KEY}` } });
  const t = await r.text(); try { return JSON.parse(t); } catch { return { _status: r.status, _body: t.slice(0, 200) }; } };
let res = null;
for (let i = 0; i < 90; i++) {
  await new Promise(r => setTimeout(r, 4000));
  const st = await jget(submit.status_url);
  if (st.status === 'COMPLETED') { res = await jget(submit.response_url); break; }
  if (st.status === 'FAILED' || st._status >= 400) { console.error('generation FAILED', JSON.stringify(st).slice(0, 300)); process.exit(1); }
}
if (!res) { console.error('timed out'); process.exit(1); }
const url = res.images?.[0]?.url;
if (!url) { console.error('no image in result:', JSON.stringify(res).slice(0, 300)); process.exit(1); }

fs.mkdirSync(path.dirname(out), { recursive: true });
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
fs.writeFileSync(out, buf);

// fal's balance settles a beat after the job finishes, so poll rather than read once.
let after = before, settled = false;
for (let i = 0; i < 12; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const b = await balance();
  if (Number.isFinite(b) && b < before - 1e-6) { after = b; settled = true; break; }
}
const cost = settled ? before - after : null;
if (!settled) console.log('[ai] WARNING: balance never moved. Cost recorded as unknown, not as zero.');
console.log(`[ai] wrote ${out}  ${(buf.length/1024).toFixed(0)} KB  cost ${cost===null?'UNKNOWN':'$'+cost.toFixed(4)}`);
fs.appendFileSync('confabulator/ai-spend-ledger.jsonl',
  JSON.stringify({ at: new Date().toISOString(), model: MODEL, source: src, out, prompt,
    balanceBefore: before, balanceAfter: settled ? after : null, costUSD: cost,
    payer: 'Social Scene fal.ai account', rebillTo: 'PA-AMZN' }) + '\n');
