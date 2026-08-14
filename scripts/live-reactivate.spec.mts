import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { runMonthlyReactivation, summarizeReactivation } from "../src/lib/amazon/ad-engine";
import { runSbReactivation, summarizeSbReactivation } from "../src/lib/amazon/sb-engine";

// LIVE PREVIEW of the monthly reset, both channels. dryRun means nothing is applied.
//   npx vitest run --config vitest.live.config.ts scripts/live-reactivate.spec.mts --testTimeout=900000
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}

it("previews what the 1st-of-month reset would re-enable", async () => {
  const sp = await runMonthlyReactivation({ dryRun: true });
  const sb = await runSbReactivation({ dryRun: true });
  const text = summarizeReactivation(sp) + "\n\n" + summarizeSbReactivation(sb);
  console.log("\n=== DRY RUN, nothing applied ===\n" + text);
  console.log("\nSP notes:\n  " + sp.notes.join("\n  "));
  writeFileSync("/tmp/reactivate.txt", text + "\n\nRAW SP: " + JSON.stringify(sp, null, 1) + "\n\nRAW SB: " + JSON.stringify(sb, null, 1));
  expect(sp.ok && sb.ok).toBe(true);
}, 3_600_000);
