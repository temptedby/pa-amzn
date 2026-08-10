/**
 * PACR GUARD - the shared hard-block. Import it as the FIRST line of any renderer:
 *
 *     import "../pacr/pacr-guard.mjs";   // adjust the relative path
 *     // renderer code below only runs when a valid pass-token exists for PACR_INTENT
 *
 * It recomputes the hash from the intent named by env PACR_INTENT using the SAME canonical()
 * the gate uses (imported, never copied, so the two can never drift) and refuses to run unless
 * the gate already passed for THIS exact candidate. No token, no render.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { canonical } from "../../src/lib/creative/pacr-rules.mjs";

const die = (msg) => { console.error(`[PACR] BLOCKED: ${msg}`); process.exit(3); };

const p = process.env.PACR_INTENT;
if (!p) die("no PACR_INTENT env set. Run scripts/pacr/pacr-gate.mjs --intent <intent.json> first, then re-run with PACR_INTENT=<that file>.");
if (!existsSync(p)) die(`PACR_INTENT file does not exist: ${p}`);

let intent;
try { intent = JSON.parse(readFileSync(p, "utf8")); } catch (e) { die(`cannot read PACR_INTENT: ${e.message}`); }

const token = join("/tmp", `pacr-pass-${createHash("sha256").update(canonical(intent)).digest("hex")}.token`);
if (!existsSync(token)) {
  console.error(`[PACR] BLOCKED: no valid pass-token for this exact candidate.`);
  console.error(`       expected: ${token}`);
  console.error(`       run: node scripts/pacr/pacr-gate.mjs --intent ${p}`);
  process.exit(3);
}
console.error(`[PACR] pass-token verified, rendering allowed: ${token}`);
