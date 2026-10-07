/**
 * LIVE, READ-ONLY preview of the BACOS governor. Writes nothing to Amazon.
 *
 *   npx vitest run --config vitest.live.config.ts scripts/live-bacos-preview.spec.mts --testTimeout=300000
 *
 * WHY THIS READS OUR OWN ARCHIVE AND NOT A REPORT. The first version of this harness asked the Ads
 * API for a 7-day per-campaign spend report and died after 900s with the report still PENDING. That
 * is normal here: queue time is a fixed cost unrelated to window size (a 10-day report once took 3x
 * longer than a 31-day one). A governor that has to run every day cannot block on that queue, so it
 * reads kw_day / ad_day_observation, which the warm job already fills and which answers instantly.
 *
 * ad_day_observation records the same trading day observed on several dates, which is how we know
 * how much a fresh day understates: 2026-10-06 read $5.79 when observed on the 6th and $38.42 when
 * observed on the 7th. Only the LATEST observation of each day is used.
 *
 * BRANDS AND DISPLAY ARE NOT IN THE ARCHIVE. Only SPONSORED_PRODUCTS is written to
 * ad_day_observation, so SB and SD spend (about 6% of October, $18.63 of $307.48) has to be supplied
 * separately or the numerator is too small. Too small is the dangerous direction for a brake: it
 * makes BACOS look better than it is and invites more spend. Pass BACOS_OTHER_SPEND with the SB+SD
 * figure for the window; if it is absent this prints a warning and says the reading is incomplete
 * rather than quietly treating the missing 6% as zero.
 */
import { it } from "vitest";
import fs from "node:fs";
import { planBacosThrottle, BACOS_TARGET, BACOS_PRESS_BELOW } from "../src/lib/amazon/bacos";

const OUT = process.env.BACOS_OUT || "/tmp/bacos-preview.txt";
const L = (s: string) => { fs.appendFileSync(OUT, s + "\n"); console.log(s); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
) as Record<string, string>;

const WINDOW_DAYS = Number(process.env.BACOS_WINDOW_DAYS || 7);
const OTHER_SPEND = process.env.BACOS_OTHER_SPEND ? Number(process.env.BACOS_OTHER_SPEND) : null;
const A = "https://advertising-api.amazon.com";
const SP = "https://sellingpartnerapi-na.amazon.com";
const iso = (d: Date) => d.toISOString().slice(0, 10);

it("what the BACOS governor would do today", async () => {
  fs.writeFileSync(OUT, "");
  const end = new Date(Date.now() - 864e5);                       // yesterday, the last full day
  const start = new Date(end.getTime() - (WINDOW_DAYS - 1) * 864e5);
  L(`window ${iso(start)}..${iso(end)}  (${WINDOW_DAYS} days)`);

  // ---- per-campaign spend, from our own archive (instant) ----------------------------------
  const { createClient } = await import("@libsql/client");
  const db = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
  const byCamp = await db.execute({
    sql: `SELECT campaign_id, ROUND(SUM(spend),2) spend, SUM(clicks) clicks
          FROM kw_day WHERE day BETWEEN ? AND ? GROUP BY campaign_id`,
    args: [iso(start), iso(end)],
  });
  const spendBy = new Map<string, number>();
  for (const r of byCamp.rows) spendBy.set(String(r.campaign_id), Number(r.spend) || 0);

  // Account-level SP spend from the day observations, taking only the latest read of each day.
  const tot = await db.execute({
    sql: `WITH latest AS (SELECT day, ad_product, MAX(observed_on) mo FROM ad_day_observation
                          WHERE day BETWEEN ? AND ? GROUP BY day, ad_product)
          SELECT ROUND(SUM(o.spend),2) spend, SUM(o.clicks) clicks, SUM(o.orders) orders, ROUND(SUM(o.sales),2) sales
          FROM ad_day_observation o JOIN latest l
            ON l.day=o.day AND l.ad_product=o.ad_product AND l.mo=o.observed_on`,
    args: [iso(start), iso(end)],
  });
  const spSpend = Number(tot.rows[0]?.spend) || 0;
  const adSales = Number(tot.rows[0]?.sales) || 0;
  L(`\nSponsored Products spend (archive) $${spSpend.toFixed(2)}   ad sales $${adSales.toFixed(2)}`);

  let adSpend = spSpend, incomplete = false;
  if (OTHER_SPEND == null) {
    incomplete = true;
    L(`!! INCOMPLETE: Brands + Display spend is NOT in the archive and was not supplied.`);
    L(`   Re-run with BACOS_OTHER_SPEND=<SB+SD for the window> from scripts/audit-spend.mjs.`);
    L(`   Treating it as zero would understate spend and flatter BACOS, so the plan below is a FLOOR.`);
  } else {
    adSpend += OTHER_SPEND;
    L(`Brands + Display spend (supplied)  $${OTHER_SPEND.toFixed(2)}`);
  }
  L(`TOTAL ad spend used               $${adSpend.toFixed(2)}`);

  // ---- total revenue, Orders API (no queue, includes Pending) -------------------------------
  const st = (await (await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: env.SP_API_REFRESH_TOKEN,
      client_id: env.SP_API_CLIENT_ID, client_secret: env.SP_API_CLIENT_SECRET }),
  })).json()).access_token;
  let next: string | null = null, orders: any[] = [];
  do {
    const u: string = next
      ? `${SP}/orders/v0/orders?NextToken=${encodeURIComponent(next)}&MarketplaceIds=ATVPDKIKX0DER`
      : `${SP}/orders/v0/orders?CreatedAfter=${iso(start)}T00:00:00Z&MarketplaceIds=ATVPDKIKX0DER`;
    const r = await fetch(u, { headers: { "x-amz-access-token": st } });
    if (!r.ok) { L(`orders HTTP ${r.status} — revenue UNREAD, no plan shown`); return; }
    const p = (await r.json()).payload ?? {};
    orders = orders.concat(p.Orders ?? []); next = p.NextToken ?? null;
    await sleep(1200);
  } while (next);

  let revenue = 0, units = 0, pending = 0, counted = 0;
  for (const o of orders) {
    if (/Cancel/i.test(o.OrderStatus ?? "")) continue;
    const d = (o.PurchaseDate ?? "").slice(0, 10);
    if (d < iso(start) || d > iso(end)) continue;
    const amt = parseFloat(o.OrderTotal?.Amount ?? "0") || 0;
    if (!amt) pending++;
    revenue += amt; counted++;
    units += (o.NumberOfItemsShipped ?? 0) + (o.NumberOfItemsUnshipped ?? 0);
  }
  L(`\nrevenue $${revenue.toFixed(2)} from ${counted} order(s), ${units} units` +
    (pending ? `  (${pending} with no total yet, so revenue is understated and BACOS overstated)` : ""));

  // ---- live campaigns + budgets (a plain list call, no queue) -------------------------------
  const at = (await (await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: env.ADS_REFRESH_TOKEN,
      client_id: env.ADS_CLIENT_ID, client_secret: env.ADS_CLIENT_SECRET }),
  })).json()).access_token;
  const CT = "application/vnd.spCampaign.v3+json";
  const cr = await fetch(`${A}/sp/campaigns/list`, { method: "POST",
    headers: { "Amazon-Advertising-API-ClientId": env.ADS_CLIENT_ID,
      "Amazon-Advertising-API-Scope": env.ADS_PROFILE_ID, Authorization: `Bearer ${at}`,
      "Content-Type": CT, Accept: CT },
    body: JSON.stringify({ maxResults: 200, stateFilter: { include: ["ENABLED"] } }) });
  if (!cr.ok) { L(`campaigns HTTP ${cr.status} — UNREAD, no plan shown`); return; }
  const camps = ((await cr.json()).campaigns ?? []) as { campaignId: string; name: string; budget?: { budget?: number } }[];
  L(`\nenabled SP campaigns: ${camps.length}`);

  // ---- the plan ----------------------------------------------------------------------------
  const plan = planBacosThrottle(adSpend, revenue, WINDOW_DAYS,
    camps.map((c) => ({ campaignId: String(c.campaignId), name: c.name,
      budget: c.budget?.budget ?? 0, windowSpend: spendBy.get(String(c.campaignId)) ?? 0 })));

  L(`\n${"=".repeat(72)}`);
  L(`BACOS ${plan.bacos == null ? "undefined" : (plan.bacos * 100).toFixed(1) + "%"}` +
    `   target ${(BACOS_TARGET * 100).toFixed(0)}%   press below ${(BACOS_PRESS_BELOW * 100).toFixed(0)}%` +
    (incomplete ? "   (FLOOR — SB/SD missing)" : ""));
  L(`ACTION: ${plan.action.toUpperCase()}`);
  L(`  ${plan.reason}`);
  L(`${"=".repeat(72)}`);
  L(`\ncurrent   $${plan.currentDaily.toFixed(2)}/day`);
  L(`allowed   $${plan.allowedDaily.toFixed(2)}/day at ${(BACOS_TARGET * 100).toFixed(0)}% BACOS`);
  L(`this move $${plan.nextDaily.toFixed(2)}/day`);

  const budgetNow = camps.reduce((s, c) => s + (c.budget?.budget ?? 0), 0);
  L(`\nauthorised budget now $${budgetNow.toFixed(2)}/day, which is ` +
    `${(budgetNow / Math.max(plan.currentDaily, 0.01)).toFixed(0)}x actual spend. That is why budget is not a brake today.`);

  L(`\n${plan.moves.length} budget move(s):`);
  L(`      from         to   window spend   campaign`);
  for (const m of plan.moves.sort((a, b) => (spendBy.get(b.campaignId) ?? 0) - (spendBy.get(a.campaignId) ?? 0))) {
    L(`  ${("$" + m.fromBudget.toFixed(2)).padStart(9)} -> ${("$" + m.toBudget.toFixed(2)).padStart(9)}` +
      `   ${("$" + (spendBy.get(m.campaignId) ?? 0).toFixed(2)).padStart(11)}   ${(m.name ?? m.campaignId).slice(0, 44)}`);
  }
  const after = camps.reduce((s, c) => {
    const mv = plan.moves.find((m) => m.campaignId === String(c.campaignId));
    return s + (mv ? mv.toBudget : (c.budget?.budget ?? 0));
  }, 0);
  L(`\nauthorised budget after: $${after.toFixed(2)}/day (from $${budgetNow.toFixed(2)})`);
  L(`\nDRY RUN. Nothing was written to Amazon.`);
});
