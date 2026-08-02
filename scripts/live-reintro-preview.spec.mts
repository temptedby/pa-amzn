import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { runReintroduction, summarizeReintroduction } from "../src/lib/amazon/ad-engine";

// One-off LIVE PREVIEW harness. Deliberately lives in scripts/ with a .spec.mts extension so the
// default vitest glob (src/**/*.test.ts) never picks it up — it makes real Amazon API calls and
// would hang CI. Read-only: dryRun true means nothing is applied.
//   REINTRO_OUT=/tmp/x.txt npx vitest run --config vitest.live.config.ts --testTimeout=600000
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

it("previews the reintroduction batch against the live account", async () => {
  const r = await runReintroduction({ dryRun: true });
  writeFileSync(process.env.REINTRO_OUT || "/tmp/reintro-preview.txt",
    summarizeReintroduction(r) + "\n\nRAW: " + JSON.stringify(r, null, 1));
  expect(r).toBeTruthy();
}, 3_600_000);
