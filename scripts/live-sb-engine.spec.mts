import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { runSbEngine, summarizeSbEngine } from "../src/lib/amazon/sb-engine";

// LIVE harness for the Sponsored Brands kill. Lives in scripts/ with a .spec.mts extension so the
// default vitest glob never picks it up — it makes real Amazon calls and would hang CI.
//   dry run:  npx vitest run --config vitest.live.config.ts scripts/live-sb-engine.spec.mts --testTimeout=900000
//   apply:    SB_APPLY=1 npx vitest run --config vitest.live.config.ts scripts/live-sb-engine.spec.mts --testTimeout=900000
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}

it("runs the Sponsored Brands $4 kill against the live account", async () => {
  const dryRun = process.env.SB_APPLY !== "1";
  // Backfill the whole month on the first run so the month-to-date total is real; the cron only
  // ever needs today + yesterday after that.
  const r = await runSbEngine({ dryRun, ingestDays: Number(process.env.SB_DAYS ?? 2) });
  const text = summarizeSbEngine(r);
  console.log("\n" + (dryRun ? "=== DRY RUN, nothing applied ===" : "=== APPLIED ===") + "\n" + text);
  writeFileSync(process.env.SB_OUT || "/tmp/sb-engine.txt", text + "\n\nRAW: " + JSON.stringify(r, null, 1));
  expect(r.ok).toBe(true);
}, 3_600_000);
