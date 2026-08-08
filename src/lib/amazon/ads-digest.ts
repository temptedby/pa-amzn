// Daily "how are the models performing" digest — the answer to "is the engine actually working?"
// without having to open a terminal.
//
// It reports on the SYSTEM as much as the results, because 2026-08-02 showed the two are easy to
// confuse: for seven weeks the engine looked idle when it was in fact failing to collect its
// reports, and ad_engine_log recorded adds Amazon had rejected. So the digest carries three things
// a bare performance report would not:
//   - cron heartbeats, so "it did nothing" is distinguishable from "it never ran";
//   - applied-vs-rejected counts, so a rejected batch cannot read as a success;
//   - report job states, so a stalled queue is visible on the day it stalls.

import { db } from "@/lib/db/client";

export interface DigestStats {
  generatedAt: string;
  runs24h: number;
  runsWithActions24h: number;
  lastRunAt: string | null;
  kills24h: number; bids24h: number; adds24h: number;
  rejected24h: number;
  kills7d: number; bids7d: number; adds7d: number;
  reintroToday: number; reintroCohort: number;
  reports: { status: string; n: number }[];
  staleReports: number;
  /** Per ad product, so a channel that has stopped acting cannot hide behind the account total.
   *  William 2026-08-08: "for display search sponsor whatever it is all should be reported." */
  products: ProductStats[];
}

export interface ProductStats {
  /** Display label: Products / Brands / Display. */
  label: string;
  kills24h: number; bids24h: number; adds24h: number;
  kills7d: number; bids7d: number; adds7d: number;
  rejected24h: number;
  lastActionAt: string | null;
}

const pad = (n: number) => String(n).padStart(3, " ");

/** Pure formatter — the digest text. Kept separate from the DB read so it unit-tests. */
export function formatAdsDigest(s: DigestStats): string {
  const L: string[] = [];
  L.push(`PA-AMZN ad engine — ${s.generatedAt.slice(0, 10)}`);
  L.push("");

  // Health first. A silent engine is the failure mode that cost seven weeks.
  L.push("ENGINE HEALTH");
  // runs24h counts `run` heartbeat rows; actingRuns24h counts distinct runs that logged an action.
  // They are independent sources, not a subset, so never phrase the second as "of those". Before
  // the heartbeat shipped (2026-08-02) no run wrote a `run` row, so a zero here can legitimately
  // mean "older code" rather than "cron is dead" until a full cycle has passed.
  L.push(`  heartbeats logged : ${s.runs24h}${s.runs24h === 0 ? "   <-- no heartbeat in 24h; cron may not be firing" : ""}`);
  L.push(`  runs that acted   : ${s.runsWithActions24h}`);
  L.push(`  last activity     : ${s.lastRunAt ? s.lastRunAt.replace("T", " ").slice(0, 16) + " UTC" : "never"}`);
  if (s.lastRunAt) {
    const hrs = (Date.parse(s.generatedAt) - Date.parse(s.lastRunAt)) / 3_600_000;
    // The engine cron is every 6h, so anything past ~7h means a slot was missed.
    if (hrs > 7) L.push(`  GAP: ${hrs.toFixed(1)}h since last activity — the 6-hourly cron has missed at least one slot`);
  }
  if (s.rejected24h > 0) L.push(`  REJECTED BY AMAZON: ${s.rejected24h} action(s) in 24h — logged but not applied`);
  L.push("");

  L.push("ACTIONS");
  L.push(`             24h    7d`);
  L.push(`  paused   ${pad(s.kills24h)}   ${pad(s.kills7d)}`);
  L.push(`  re-bid   ${pad(s.bids24h)}   ${pad(s.bids7d)}`);
  L.push(`  added    ${pad(s.adds24h)}   ${pad(s.adds7d)}`);
  L.push("");

  // Every ad product, always, even at zero. An empty row is information: it says that channel's
  // engine ran and found nothing, or that it is not running at all. Before 2026-08-08 only
  // Sponsored Products was governed, and Display's 0.87x lifetime return was invisible here.
  L.push("BY AD PRODUCT");
  L.push(`                    paused      re-bid      added    last action`);
  L.push(`                   24h   7d    24h   7d    24h   7d`);
  for (const p of s.products) {
    const last = p.lastActionAt ? p.lastActionAt.replace("T", " ").slice(0, 16) : "never";
    L.push(`  ${p.label.padEnd(16)}${pad(p.kills24h)} ${pad(p.kills7d)}   ${pad(p.bids24h)} ${pad(p.bids7d)}   ${pad(p.adds24h)} ${pad(p.adds7d)}    ${last}`);
    if (p.rejected24h > 0) L.push(`     ^ ${p.rejected24h} action(s) REJECTED by Amazon in 24h`);
  }
  const silent = s.products.filter((p) => p.lastActionAt === null);
  if (silent.length) {
    L.push(`  NOTE: ${silent.map((p) => p.label).join(", ")} ${silent.length === 1 ? "has" : "have"} never logged an action.`);
    L.push(`        That is expected while nothing has crossed the $4 bar, and a red flag if spend is rising.`);
  }
  L.push("");

  L.push("REINTRODUCTION (floor trap)");
  L.push(`  brought back today : ${s.reintroToday}`);
  L.push(`  cohort to date     : ${s.reintroCohort}`);
  L.push("");

  L.push("REPORT QUEUE");
  if (!s.reports.length) L.push("  no report jobs yet");
  for (const r of s.reports) L.push(`  ${r.status.padEnd(10)} ${r.n}`);
  if (s.staleReports > 0) L.push(`  STALE: ${s.staleReports} job(s) requested over 24h ago and still not collected`);

  return L.join("\n");
}

async function scalar(sql: string, args: unknown[] = []): Promise<number> {
  const r = await db().execute({ sql, args: args as never[] });
  const row = (r.rows as unknown as Record<string, unknown>[])[0];
  return row ? Number(Object.values(row)[0] ?? 0) : 0;
}

/** Read the engine's own logs and build the digest stats. Read-only. */
export async function gatherAdsDigest(nowIso = new Date().toISOString()): Promise<DigestStats> {
  const since24 = new Date(Date.parse(nowIso) - 24 * 3_600_000).toISOString();
  const since7 = new Date(Date.parse(nowIso) - 7 * 24 * 3_600_000).toISOString();
  const today = nowIso.slice(0, 10);

  // ad_engine_log may not exist on a fresh DB; the engine creates it on its first live run.
  await db().execute(`CREATE TABLE IF NOT EXISTS ad_engine_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT NOT NULL, action TEXT NOT NULL,
    keyword TEXT, match_type TEXT, from_bid REAL, to_bid REAL, acos REAL, spend REAL)`);
  await db().execute("ALTER TABLE ad_engine_log ADD COLUMN applied INTEGER DEFAULT 1").catch(() => {});
  await db().execute("ALTER TABLE ad_engine_log ADD COLUMN ad_product TEXT").catch(() => {});
  await db().execute(`CREATE TABLE IF NOT EXISTS ad_reintro_cohort (
    keyword_id TEXT PRIMARY KEY, keyword_text TEXT, match_type TEXT,
    promoted_at TEXT NOT NULL, from_bid REAL, to_bid REAL, reason TEXT)`);
  await db().execute(`CREATE TABLE IF NOT EXISTS ads_report_jobs (
    key TEXT PRIMARY KEY, purpose TEXT, report_id TEXT, status TEXT NOT NULL,
    requested_at TEXT NOT NULL, collected_at TEXT, rows_json TEXT, note TEXT)`);

  const cnt = (action: string, since: string) =>
    scalar("SELECT COUNT(*) FROM ad_engine_log WHERE action = ? AND run_at >= ?", [action, since]);

  const lastRow = await db().execute("SELECT MAX(run_at) AS m FROM ad_engine_log");
  const lastRunAt = (lastRow.rows as unknown as Record<string, unknown>[])[0]?.m as string | null;

  const reportRows = await db().execute("SELECT status, COUNT(*) AS n FROM ads_report_jobs GROUP BY status");

  // Sponsored Products rows predate the ad_product column and were written with it NULL, so NULL
  // means Products. Brands and Display always name themselves.
  const WHERE: Record<string, string> = {
    "Products": "(ad_product IS NULL OR ad_product = 'SPONSORED_PRODUCTS')",
    "Brands": "ad_product = 'SPONSORED_BRANDS'",
    "Display": "ad_product = 'SPONSORED_DISPLAY'",
  };
  const products: ProductStats[] = [];
  for (const [label, w] of Object.entries(WHERE)) {
    const c = (action: string, since: string) =>
      scalar(`SELECT COUNT(*) FROM ad_engine_log WHERE ${w} AND action = ? AND run_at >= ?`, [action, since]);
    const lastRow = await db().execute(`SELECT MAX(run_at) AS m FROM ad_engine_log WHERE ${w} AND action <> 'run'`);
    const last = (lastRow.rows as unknown as Record<string, unknown>[])[0]?.m as string | null;
    products.push({
      label,
      kills24h: await c("kill", since24), bids24h: await c("rebid", since24), adds24h: await c("add", since24),
      kills7d: await c("kill", since7), bids7d: await c("rebid", since7), adds7d: await c("add", since7),
      rejected24h: await scalar(`SELECT COUNT(*) FROM ad_engine_log WHERE ${w} AND applied = 0 AND run_at >= ?`, [since24]),
      lastActionAt: last ? String(last) : null,
    });
  }

  return {
    generatedAt: nowIso,
    runs24h: await scalar("SELECT COUNT(*) FROM ad_engine_log WHERE action = 'run' AND run_at >= ?", [since24]),
    runsWithActions24h: await scalar("SELECT COUNT(DISTINCT run_at) FROM ad_engine_log WHERE action <> 'run' AND run_at >= ?", [since24]),
    lastRunAt: lastRunAt ? String(lastRunAt) : null,
    kills24h: await cnt("kill", since24), bids24h: await cnt("rebid", since24), adds24h: await cnt("add", since24),
    rejected24h: await scalar("SELECT COUNT(*) FROM ad_engine_log WHERE applied = 0 AND run_at >= ?", [since24]),
    kills7d: await cnt("kill", since7), bids7d: await cnt("rebid", since7), adds7d: await cnt("add", since7),
    reintroToday: await scalar("SELECT COUNT(*) FROM ad_reintro_cohort WHERE substr(promoted_at,1,10) = ?", [today]),
    reintroCohort: await scalar("SELECT COUNT(*) FROM ad_reintro_cohort"),
    reports: (reportRows.rows as unknown as Record<string, unknown>[]).map((r) => ({ status: String(r.status), n: Number(r.n) })),
    staleReports: await scalar("SELECT COUNT(*) FROM ads_report_jobs WHERE status <> 'COMPLETED' AND requested_at < ?", [since24]),
    products,
  };
}
