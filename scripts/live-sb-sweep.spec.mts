import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { adsConfigFromEnv, getAdsAccessToken } from "../src/lib/amazon/ads-api";
import { fetchSbKeywords, fetchSbCampaigns } from "../src/lib/amazon/sb-v2";
import { db } from "../src/lib/db/client";
import { shouldKill } from "../src/lib/amazon/ad-rules";

// READ-ONLY. Sponsored Brands half of the overspend sweep, using the project's OWN reader so the
// Accept headers are the verified ones. A hand-rolled GET /sb/keywords with Content-Type json
// returns nothing usable, which produced a FALSE "clean" in scripts/overspend-sweep.mjs.
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

it("finds any Sponsored Brands keyword past $4 and unprofitable that is STILL ENABLED", async () => {
  const cfg = adsConfigFromEnv()!;
  const token = await getAdsAccessToken(cfg);
  const [live, camps] = await Promise.all([fetchSbKeywords(cfg, token), fetchSbCampaigns(cfg, token)]);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const q = await db().execute({
    sql: `SELECT keyword_id, MAX(keyword_text) t, MAX(match_type) m,
                 SUM(cost) c, SUM(sales) s, SUM(orders) o
            FROM sb_daily WHERE day >= ? GROUP BY keyword_id`,
    args: [monthStart],
  });
  const byId = new Map(live.map((k) => [k.keywordId, k]));
  const L: string[] = [];
  L.push(`SB keywords readable: ${live.length}, ENABLED: ${live.filter((k) => k.state === "ENABLED").length}`);
  L.push(`sb_daily rows this month: ${q.rows.length}`);
  let offenders = 0, spend = 0;
  for (const r of q.rows as unknown as Record<string, unknown>[]) {
    const perf = { spend: Number(r.c ?? 0), sales: Number(r.s ?? 0), orders: Number(r.o ?? 0) };
    spend += perf.spend;
    if (!shouldKill(perf)) continue;
    const k = byId.get(String(r.keyword_id));
    if (!k || k.state !== "ENABLED") continue;
    offenders++;
    const acos = perf.sales > 0 ? `${Math.round((perf.spend / perf.sales) * 100)}%` : "no sale";
    L.push(`  STILL ON  $${perf.spend.toFixed(2)}  ${perf.orders} ord  ${acos}  [${r.m}] ${r.t}  id=${r.keyword_id}  campaign=${camps.get(k.campaignId)?.state ?? "?"}`);
  }
  L.push(`SB month-to-date spend: $${spend.toFixed(2)}`);
  L.push(`STILL ENABLED past the bar: ${offenders}`);
  writeFileSync(process.env.SB_OUT || "/tmp/sb-sweep.txt", L.join("\n"));
  expect(live.length).toBeGreaterThan(0);   // a zero read is a failed read, not a clean account
}, 900_000);
