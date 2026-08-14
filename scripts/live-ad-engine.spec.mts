import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { runAdEngine, summarizeAdEngine } from "../src/lib/amazon/ad-engine";

// LIVE preview of the Sponsored Products engine. dryRun means nothing is applied.
//   npx vitest run --config vitest.live.config.ts scripts/live-ad-engine.spec.mts --testTimeout=900000
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}

it("previews the Sponsored Products engine against the live account", async () => {
  const r = await runAdEngine({ dryRun: true });
  const text = summarizeAdEngine(r);
  console.log("\n=== DRY RUN, nothing applied ===\n" + text);
  console.log("\nNOTES:\n  " + r.notes.join("\n  "));
  writeFileSync(process.env.ENGINE_OUT || "/tmp/ad-engine.txt", text + "\n\nRAW: " + JSON.stringify(r, null, 1));
  expect(r.ok).toBe(true);
}, 3_600_000);
