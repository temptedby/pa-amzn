import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { runSdEngine, summarizeSdEngine } from "../src/lib/amazon/sd-engine";

// LIVE PREVIEW harness for the Sponsored Display kill. dryRun -> reads the account, applies nothing.
//   SD_OUT=/tmp/sd.txt npx vitest run --config vitest.live.config.ts --testTimeout=900000 scripts/live-sd-engine.spec.mts
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

it("previews the Sponsored Display kill against the live account", async () => {
  const r = await runSdEngine({ dryRun: true });
  writeFileSync(process.env.SD_OUT || "/tmp/sd-preview.txt",
    summarizeSdEngine(r) + "\n\nRAW: " + JSON.stringify(r, null, 1));
  expect(r).toBeTruthy();
}, 3_600_000);
