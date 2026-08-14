#!/usr/bin/env node
/**
 * PACR GATE - the hard pre-build gate for Phone Assured creative.
 * Mirror of scripts/social-scene-brc-gate.py in the Social Scene repo. Same contract:
 * check the candidate BEFORE it is rendered, and on PASS emit a token the renderer needs.
 *
 *   node scripts/pacr/pacr-gate.mjs --intent path/to/intent.json
 *   node scripts/pacr/pacr-gate.mjs --intent path/to/intent.json --commit   # log the template use
 *   node scripts/pacr/pacr-gate.mjs --hash   path/to/intent.json            # print the token path
 *
 * PASS -> writes /tmp/pacr-pass-<sha256(canonical intent)>.token, exit 0
 * FAIL -> prints every failure with its rule number, no token, exit 2
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkIntent, canonical } from "../../src/lib/creative/pacr-rules.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOG = join(ROOT, "confabulator", "pacr-design-log.json");

export const tokenPath = (intent) =>
  join("/tmp", `pacr-pass-${createHash("sha256").update(canonical(intent)).digest("hex")}.token`);

const loadLog = () => { try { return JSON.parse(readFileSync(LOG, "utf8")); } catch { return []; } };

// Only run the CLI when this file IS the program. Without this guard, the renderer guard's
// `import { tokenPath }` executed the whole CLI and exited 64 on a usage error, which is exactly
// how the first real render attempt failed.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (!isMain) { /* imported as a library: export only */ }
else main();

function main() {
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const intentPath = flag("--intent") || flag("--hash");
if (!intentPath) {
  console.error("usage: pacr-gate.mjs --intent <intent.json> [--commit] | --hash <intent.json>");
  process.exit(64);
}
const intent = JSON.parse(readFileSync(intentPath, "utf8"));

if (args.includes("--hash")) { console.log(tokenPath(intent)); process.exit(0); }

// context the rules need but cannot know on their own
const log = loadLog();
const recentTemplates = log
  .filter((e) => e.surface === intent.surface)
  .slice(-12).reverse().map((e) => e.template_id);
const ctx = {
  recentTemplates,
  strengthVerified: existsSync(join(ROOT, "confabulator", "pacr-measurements.json")),
};

const { ok, failures, warnings } = checkIntent(intent, ctx);

for (const w of warnings) console.warn(`  warn  ${w.rule}: ${w.message}`);

if (!ok) {
  console.error(`\nPACR GATE: BLOCKED (${failures.length} failure${failures.length === 1 ? "" : "s"})\n`);
  for (const f of failures) console.error(`  FAIL  ${f.rule}: ${f.message}`);
  console.error("\nNo token, no render. Fix the candidate and run the gate again.\n");
  process.exit(2);
}

const token = tokenPath(intent);
writeFileSync(token, `${new Date().toISOString()}\n${canonical(intent)}\n`);
console.log(`PACR GATE: PASS -> ${token}`);

if (args.includes("--commit")) {
  mkdirSync(dirname(LOG), { recursive: true });
  log.push({
    at: new Date().toISOString(),
    surface: intent.surface, product: intent.product,
    template_id: intent.template_id, output: intent.output || null,
  });
  writeFileSync(LOG, JSON.stringify(log, null, 1));
  console.log(`PACR GATE: logged template "${intent.template_id}" on ${intent.surface}`);
}
}
