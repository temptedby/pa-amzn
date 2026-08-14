import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { warmReports, summarizeWarm } from "../src/lib/amazon/report-warm";

for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

it("warms every report the engines need, against the live account", async () => {
  const r = await warmReports();
  writeFileSync(process.env.WARM_OUT || "/tmp/warm.txt", summarizeWarm(r) + "\n\nRAW: " + JSON.stringify(r, null, 1));
  expect(r.ok).toBe(true);
}, 3_600_000);
