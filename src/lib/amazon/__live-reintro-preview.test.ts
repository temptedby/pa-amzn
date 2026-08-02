import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runReintroduction, summarizeReintroduction } from "./ad-engine";

// One-off LIVE PREVIEW harness (not part of the suite — filename is ignored by the default
// include glob usage below; run explicitly). Read-only: dryRun true means nothing is applied.
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

it("previews the reintroduction batch against the live account", async () => {
  const r = await runReintroduction({ dryRun: true });
  console.log("\n" + summarizeReintroduction(r));
  console.log("\nRAW:", JSON.stringify({ ok: r.ok, eligible: r.eligible, promoted: r.promoted.length, state: r.state, blockedBy: r.blockedBy, errors: r.errors, secs: Math.round(r.durationMs / 1000) }, null, 1));
  expect(r).toBeTruthy();
}, 3_600_000);
