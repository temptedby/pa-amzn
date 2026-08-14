import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { killPlan } from "../src/lib/amazon/ad-engine";
import { shouldKill, KILL_MIN_ROAS, nextBid } from "../src/lib/amazon/ad-rules";

// LIVE confirmation of the 2026-08-13 kill line and the flat-dime step, against the real account.
//   npx vitest run --config vitest.live.config.ts scripts/live-killrule.spec.mts --testTimeout=1800000
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}
const A = "https://advertising-api.amazon.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const usd = (n: number) => "$" + Number(n || 0).toFixed(2);

it("the new kill line, applied to the live account", async () => {
  const tok = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: process.env.ADS_REFRESH_TOKEN!, client_id: process.env.ADS_CLIENT_ID!, client_secret: process.env.ADS_CLIENT_SECRET! }).toString(),
  }).then((r) => r.json()).then((j: any) => j.access_token);
  const H = (ct: string) => ({ Authorization: `Bearer ${tok}`, "Amazon-Advertising-API-ClientId": process.env.ADS_CLIENT_ID!, "Amazon-Advertising-API-Scope": process.env.ADS_PROFILE_ID!, "Content-Type": ct, Accept: ct });

  // 1. REAL month-to-date performance, straight from the reporting API.
  const cfg = { name: "killrule", startDate: "2026-08-01", endDate: "2026-08-13", configuration: { adProduct: "SPONSORED_PRODUCTS", groupBy: ["targeting"], columns: ["keyword", "keywordId", "matchType", "cost", "sales14d", "purchases14d"], reportTypeId: "spTargeting", timeUnit: "SUMMARY", format: "GZIP_JSON" } };
  const cr: any = await fetch(`${A}/reporting/reports`, { method: "POST", headers: H("application/vnd.createasyncreportrequest.v3+json"), body: JSON.stringify(cfg) }).then((r) => r.json());
  let rid = cr.reportId ?? String(cr.detail || "").match(/([0-9a-f-]{36})/)?.[1];
  expect(rid, `report create failed: ${JSON.stringify(cr)}`).toBeTruthy();
  let rows: any[] | null = null;
  for (let i = 0; i < 150; i++) {
    await sleep(8000);
    const s: any = await fetch(`${A}/reporting/reports/${rid}`, { headers: H("application/vnd.createasyncreportrequest.v3+json") }).then((r) => r.json());
    if (s.status === "COMPLETED") { rows = JSON.parse(gunzipSync(Buffer.from(await (await fetch(s.url)).arrayBuffer())).toString()); break; }
    if (s.status === "FAILURE") throw new Error("report FAILURE " + JSON.stringify(s));
  }
  expect(rows, "report never completed").toBeTruthy();

  // 2. REAL live keyword states and bids.
  const byId = new Map<string, any>();
  let n: string | undefined;
  do {
    const r: any = await fetch(`${A}/sp/keywords/list`, { method: "POST", headers: H("application/vnd.spKeyword.v3+json"), body: JSON.stringify({ maxResults: 1000, ...(n ? { nextToken: n } : {}) }) }).then((x) => x.json());
    for (const k of r.keywords || []) byId.set(String(k.keywordId), { keywordText: k.keywordText, matchType: k.matchType, state: k.state, bid: k.bid });
    n = r.nextToken;
  } while (n);

  // 3. The REAL killPlan, on the real numbers.
  const picks = killPlan(rows as any, byId);
  const spenders = (rows as any[]).filter((r) => (+r.cost || 0) >= 4);
  const out: string[] = [];
  out.push(`LIVE ${new Date().toISOString()} — ${rows!.length} report rows, ${byId.size} keywords on the account`);
  out.push(`Every keyword past the $4 bar, and what the NEW rule does with it:`, "");
  const kills = new Set(picks.map((p) => p.keywordId));
  for (const r of spenders.sort((a, b) => (+b.cost) - (+a.cost))) {
    const id = String(r.keywordId); const k = byId.get(id);
    const spend = +r.cost || 0, sales = +r.sales14d || 0, orders = +r.purchases14d || 0;
    const roas = spend > 0 ? sales / spend : 0;
    const state = k?.state ?? "GONE";
    const oldRule = spend >= 4 && (orders === 0 || spend / (sales || 1e9) >= 0.52) ? "KILL" : "keep";
    const verdict = state !== "ENABLED" ? `already ${state}` : kills.has(id) ? "KILL" : `KEEP, bid ${usd(k.bid)} -> ${usd(nextBid(k.bid || 0.37, { spend, orders, sales }))}`;
    out.push(`  ${usd(spend).padStart(8)} -> ${usd(sales).padStart(8)}  ${orders}ord  ${roas.toFixed(2).padStart(5)}x  ${String(r.matchType).padEnd(6)} old:${oldRule.padEnd(5)} new:${verdict.padEnd(26)} ${String(r.keyword).slice(0, 40)}`);
  }
  out.push("", `killPlan picked ${picks.length}: ${picks.map((p) => `${p.text} (${usd(p.spend)})`).join(", ") || "none"}`);
  const txt = out.join("\n");
  console.log("\n" + txt);
  writeFileSync(process.env.KILLRULE_OUT || "/tmp/killrule.txt", txt + "\n");

  // 4. The guarantee, checked against the real rows rather than asserted.
  for (const r of spenders) {
    const spend = +r.cost || 0, sales = +r.sales14d || 0, orders = +r.purchases14d || 0;
    const roas = spend > 0 ? sales / spend : 0;
    const verdict = shouldKill({ spend, orders, sales });
    if (orders > 0 && roas >= KILL_MIN_ROAS) expect(verdict, `${r.keyword} at ${roas.toFixed(2)}x must survive`).toBe(false);
    if (orders === 0) expect(verdict, `${r.keyword} never converted, must die`).toBe(true);
  }
}, 3_600_000);
