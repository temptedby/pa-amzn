import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { adsConfigFromEnv, getAdsAccessToken } from "../src/lib/amazon/ads-api";
import { fetchSbKeywordDay, accountDay } from "../src/lib/amazon/sb-v2";

// READ-ONLY. Pull the Sponsored Brands days that sb_daily is missing, straight from the legacy v2
// report, and print what they actually cost. Does NOT write to the database.
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

it("reads the missing Sponsored Brands days", async () => {
  const cfg = adsConfigFromEnv()!;
  const token = await getAdsAccessToken(cfg);
  const L: string[] = [];
  L.push(`account day right now: ${accountDay()}`);
  for (const day of (process.env.SB_DAYS || "2026-08-06,2026-08-07,2026-08-08").split(",")) {
    try {
      const rows = await fetchSbKeywordDay(cfg, token, day);
      const cost = rows.reduce((a, r) => a + (r.cost ?? 0), 0);
      const sales = rows.reduce((a, r) => a + (r.sales ?? 0), 0);
      const active = rows.filter((r) => (r.cost ?? 0) > 0);
      L.push(`${day}  ${rows.length} rows  $${cost.toFixed(2)} spend  $${sales.toFixed(2)} sales  ${active.length} with spend`);
      active.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0)).slice(0, 6)
        .forEach((r) => L.push(`      $${(r.cost ?? 0).toFixed(2)}  ${r.orders ?? 0} ord  [${r.matchType}] ${r.keywordText}`));
    } catch (e) {
      L.push(`${day}  ERROR: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
    }
  }
  const out = L.join("\n");
  writeFileSync(process.env.SBF_OUT || "/tmp/sb-backfill.txt", out);
  expect(out.length).toBeGreaterThan(0);
}, 3_600_000);
