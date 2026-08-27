// Deferred Amazon Ads report jobs — create in one run, collect in a later one.
//
// WHY (measured 2026-08-02, not assumed): ad-engine.ts polled a report inline for 140 seconds
// (28 x 5s) and threw "report timed out" past that. Real queue latency on this account is ~9
// minutes: the SP July campaign report completed at poll 69 (~552s), SD July was still PENDING at
// ~567s, and the SP August report never completed inside 9 minutes at all. The live
// runReintroduction() preview died at 151s on exactly this. So the engine's report step has been
// failing routinely, which explains 11 keywords touched in seven weeks better than any rule does.
//
// CORRECTED 2026-08-17. The 9-minute figure was measured at the wrong time of day, and the
// conclusion drawn from it was wrong. Amazon's own createdAt/updatedAt across 19 reports:
//     00:00Z  14 reports   0.4 to  4.8 min   mean 2.6
//     07-08Z   2 reports   9.1 to 10.7 min
//     12-13Z   3 reports  28.2 to 31.5 min
// The engine runs at 00Z/06Z/12Z/18Z. Its engine-mtd report on 2026-08-17 was created at 00:01:21Z
// and COMPLETED at 00:01:52Z: 31 seconds against the 300s route budget. So getReport now WAITS up
// to INLINE_POLL_MS for a report, and only falls back to the deferred path when that is not enough.
// The deferred machinery below is kept exactly as it was, as the slow-case safety net.
//
//   Run N   : ensureRequested() creates the report at Amazon and persists its reportId. Returns null.
//   Run N+1 : tryCollect() polls ONCE (cheap), and if COMPLETED downloads the rows and acts.
//
// The engine is therefore fast when Amazon is fast and eventually-consistent when it is not. A
// pass with no data yet is still a normal outcome rather than an error: it takes no action and says
// so. What is NOT acceptable, and was the 2026-08-16 overspend, is a pass that acts confidently on
// a reading from the previous midnight. DATA_STALE_HOURS now expires inside the cron to stop that.
//
// Amazon's own duplicate-request response (425, "The Request is a duplicate of : <uuid>") is
// treated as success and the existing reportId is adopted, so re-requesting is always safe.

import { gunzipSync } from "node:zlib";
import { db } from "@/lib/db/client";
import type { AdsConfig } from "./ads-api";

const BASE = "https://advertising-api.amazon.com";
const RPT_CT = "application/vnd.createasyncreportrequest.v3+json";

/** How long a requested-but-uncollected job may sit before we give up and request a fresh one. */
export const JOB_STALE_HOURS = 24;
/**
 * How old collected data may be before the engine should not act on it.
 *
 * Was 30. Lowered to 2 on 2026-08-17, because 30 was longer than the cache key's own lifetime and
 * so could never expire inside a day: `reportKey` ends with the report's END DATE, which only
 * changes at UTC midnight, so all four daily runs resolved to one row and re-read one snapshot.
 * `kw_perf_snapshot` recorded the consequence three times a day: 06Z, 12Z and 18Z on 2026-08-16
 * every one read $199.91 against a live $320.99. Three keywords went from $0.00 to $7-$8 inside
 * that blind window and the $4 kill never saw them.
 *
 * 2 hours is deliberately shorter than the 6-hourly cron: every run now re-requests rather than
 * re-reading. That is only affordable because of INLINE_POLL_MS below.
 */
export const DATA_STALE_HOURS = 2;

/**
 * How long a run may wait inline for a report it just asked for.
 *
 * The header of this file used to assert that waiting was impossible: "Real queue latency on this
 * account is ~9 minutes" and "Vercel caps a function at 300s". The first half was measured at the
 * wrong time of day. Recovered from Amazon's own createdAt/updatedAt across 19 reports, latency is
 * almost entirely a function of when you ask:
 *
 *     00:00Z   14 reports    0.4 to  4.8 min   mean 2.6
 *     07-08Z    2 reports    9.1 to 10.7 min
 *     12-13Z    3 reports   28.2 to 31.5 min
 *
 * The engine runs at 00Z, 06Z, 12Z and 18Z. Its own engine-mtd report on 2026-08-17 was created at
 * 00:01:21Z and COMPLETED at 00:01:52Z: thirty-one seconds, against a 300s budget. Waiting is not
 * only possible at the hours that matter, it is cheap.
 *
 * 90s covers the midnight case many times over and leaves most of the budget for the engine's own
 * work. When it is not enough the deferred path is untouched: we return "requested" and a later run
 * collects, exactly as before. The fast case gets fast without removing the slow-case safety net.
 */
export const INLINE_POLL_MS = 90_000;
/** Gap between inline status polls. */
export const INLINE_POLL_EVERY_MS = 5_000;

export interface ReportSpec {
  /** Free-text label for what needs this report, e.g. "engine-mtd" or "reintro-history-1". */
  purpose: string;
  adProduct: string;
  reportTypeId: string;
  groupBy: string[];
  columns: string[];
  startDate: string;
  endDate: string;
}

export interface ReportJob {
  key: string;
  reportId: string | null;
  status: string;              // REQUESTED | COMPLETED | FAILED
  requestedAt: string;
  collectedAt: string | null;
}

export type CollectOutcome<T> =
  | { state: "ready"; rows: T[]; ageHours: number }
  | { state: "pending"; job: ReportJob }
  | { state: "requested"; job: ReportJob }
  | { state: "failed"; reason: string };

/** Stable identity for a report request. Same spec on a later run finds the same job. */
export function reportKey(s: ReportSpec): string {
  return [s.purpose, s.adProduct, s.reportTypeId, s.startDate, s.endDate,
    s.groupBy.join("+"), s.columns.slice().sort().join("+")].join("|");
}

/** Hours between two ISO timestamps. Exported for testing the staleness rules. */
export function hoursBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000;
}

/** A job is worth abandoning when it was requested too long ago and still has not completed. */
export function isStaleJob(job: ReportJob, nowIso: string, staleHours = JOB_STALE_HOURS): boolean {
  return job.status !== "COMPLETED" && hoursBetween(job.requestedAt, nowIso) >= staleHours;
}

/** Collected rows are only safe to act on while they are fresh enough. */
export function isFreshData(collectedAtIso: string, nowIso: string, staleHours = DATA_STALE_HOURS): boolean {
  return hoursBetween(collectedAtIso, nowIso) < staleHours;
}

/** Pull the reportId out of Amazon's 425 duplicate-request detail string. */
export function duplicateReportId(detail: unknown): string | null {
  return String(detail ?? "").match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1] ?? null;
}

async function ensureTable(): Promise<void> {
  await db().execute(`CREATE TABLE IF NOT EXISTS ads_report_jobs (
    key TEXT PRIMARY KEY, purpose TEXT, report_id TEXT, status TEXT NOT NULL,
    requested_at TEXT NOT NULL, collected_at TEXT, rows_json TEXT, note TEXT)`);
}

async function loadJob(key: string): Promise<(ReportJob & { rowsJson: string | null }) | null> {
  await ensureTable();
  const r = await db().execute({ sql: "SELECT key, report_id, status, requested_at, collected_at, rows_json FROM ads_report_jobs WHERE key = ?", args: [key] });
  const row = (r.rows as unknown as Record<string, unknown>[])[0];
  if (!row) return null;
  return {
    key: String(row.key), reportId: row.report_id == null ? null : String(row.report_id),
    status: String(row.status), requestedAt: String(row.requested_at),
    collectedAt: row.collected_at == null ? null : String(row.collected_at),
    rowsJson: row.rows_json == null ? null : String(row.rows_json),
  };
}

async function ads(cfg: AdsConfig, token: string, path: string, method: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Amazon-Advertising-API-ClientId": cfg.clientId,
      "Amazon-Advertising-API-Scope": cfg.profileId!,
      "Content-Type": RPT_CT, Accept: RPT_CT,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, json: text ? JSON.parse(text) : null };
}

/** One status poll. Returns rows when COMPLETED, a reason on FAILURE, or null while still building. */
async function pollOnce<T>(
  cfg: AdsConfig, token: string, reportId: string, key: string, nowIso: string,
): Promise<{ rows: T[] } | { failed: string } | null> {
  const s = await ads(cfg, token, `/reporting/reports/${reportId}`, "GET", null);
  const status = String(s.json?.status ?? "");
  if (status === "COMPLETED" && s.json?.url) {
    const buf = Buffer.from(await (await fetch(s.json.url)).arrayBuffer());
    const rows = JSON.parse(gunzipSync(buf).toString()) as T[];
    await db().execute({
      sql: "UPDATE ads_report_jobs SET status='COMPLETED', collected_at=?, rows_json=? WHERE key=?",
      args: [nowIso, JSON.stringify(rows), key],
    });
    return { rows };
  }
  if (status === "FAILURE") {
    await db().execute({
      sql: "UPDATE ads_report_jobs SET status='FAILED', note=? WHERE key=?",
      args: [String(s.json?.failureReason ?? "FAILURE").slice(0, 300), key],
    });
    return { failed: `report FAILURE: ${String(s.json?.failureReason ?? "").slice(0, 120)}` };
  }
  return null;
}

/**
 * Poll a building report for up to `budgetMs`, then give up and let a later run collect it.
 * Measured queue time at the engine's own hours is about 31 seconds, so this normally returns rows
 * on the first or second poll and the deferred fallback stays unused.
 */
async function pollInline<T>(
  cfg: AdsConfig, token: string, reportId: string, key: string, nowIso: string,
  budgetMs = INLINE_POLL_MS, everyMs = INLINE_POLL_EVERY_MS,
): Promise<{ rows: T[] } | { failed: string } | null> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const r = await pollOnce<T>(cfg, token, reportId, key, nowIso);
    if (r) return r;
    if (Date.now() + everyMs >= deadline) return null;
    await new Promise((res) => setTimeout(res, everyMs));
  }
}

/**
 * Get report rows if a previously-requested report has finished; otherwise request one and wait for
 * it, up to `opts.inlineWaitMs` (default INLINE_POLL_MS). When the wait runs out the deferred path
 * is untouched: we return "requested"/"pending" and a later run collects.
 *
 * `inlineWaitMs: 0` polls the status ONCE and returns immediately. That is the mode report-warm
 * needs. Warm walks five specs in one function; at the 90s default that is a 450s worst case
 * against a 300s Vercel budget, so the last specs could be cut off mid-run and never requested at
 * all. Warm's whole job is to ASK, not to wait, and the engine 40 minutes later does the waiting.
 */
export async function getReport<T = Record<string, unknown>>(
  cfg: AdsConfig, token: string, spec: ReportSpec, nowIso = new Date().toISOString(),
  opts: { inlineWaitMs?: number } = {},
): Promise<CollectOutcome<T>> {
  const inlineWaitMs = opts.inlineWaitMs ?? INLINE_POLL_MS;
  const key = reportKey(spec);
  const existing = await loadJob(key);

  // Already collected and still fresh -> hand back the cached rows, no API call at all.
  if (existing?.status === "COMPLETED" && existing.collectedAt && existing.rowsJson) {
    if (isFreshData(existing.collectedAt, nowIso)) {
      return { state: "ready", rows: JSON.parse(existing.rowsJson) as T[], ageHours: +hoursBetween(existing.collectedAt, nowIso).toFixed(2) };
    }
  }

  // A live job that has not gone stale -> wait for it, within the inline budget.
  if (existing && existing.reportId && existing.status === "REQUESTED" && !isStaleJob(existing, nowIso)) {
    const r = await pollInline<T>(cfg, token, existing.reportId, key, nowIso, inlineWaitMs);
    if (r && "rows" in r) return { state: "ready", rows: r.rows, ageHours: 0 };
    if (r && "failed" in r) return { state: "failed", reason: r.failed };
    return { state: "pending", job: { key, reportId: existing.reportId, status: existing.status, requestedAt: existing.requestedAt, collectedAt: existing.collectedAt } };
  }

  // Nothing usable -> request a fresh report, then wait for it within budget.
  const cr = await ads(cfg, token, "/reporting/reports", "POST", {
    name: spec.purpose, startDate: spec.startDate, endDate: spec.endDate,
    configuration: {
      adProduct: spec.adProduct, groupBy: spec.groupBy, columns: spec.columns,
      reportTypeId: spec.reportTypeId, timeUnit: "SUMMARY", format: "GZIP_JSON",
    },
  });
  const reportId: string | null = cr.json?.reportId ?? (String(cr.json?.code) === "425" ? duplicateReportId(cr.json?.detail) : null);
  if (!reportId) return { state: "failed", reason: `report create failed: ${JSON.stringify(cr.json).slice(0, 200)}` };

  await db().execute({
    sql: `INSERT INTO ads_report_jobs (key, purpose, report_id, status, requested_at, collected_at, rows_json)
          VALUES (?,?,?,'REQUESTED',?,NULL,NULL)
          ON CONFLICT(key) DO UPDATE SET report_id=excluded.report_id, status='REQUESTED', requested_at=excluded.requested_at, collected_at=NULL, rows_json=NULL`,
    args: [key, spec.purpose, reportId, nowIso],
  });
  // Wait for the report we just asked for. At the engine's own hours this comes back in about
  // 31 seconds, so the run no longer has to exit empty and leave the engine on old numbers.
  const fresh = await pollInline<T>(cfg, token, reportId, key, nowIso, inlineWaitMs);
  if (fresh && "rows" in fresh) return { state: "ready", rows: fresh.rows, ageHours: 0 };
  if (fresh && "failed" in fresh) return { state: "failed", reason: fresh.failed };
  return { state: "requested", job: { key, reportId, status: "REQUESTED", requestedAt: nowIso, collectedAt: null } };
}
