// Deferred Amazon Ads report jobs — create in one run, collect in a later one.
//
// WHY (measured 2026-08-02, not assumed): ad-engine.ts polled a report inline for 140 seconds
// (28 x 5s) and threw "report timed out" past that. Real queue latency on this account is ~9
// minutes: the SP July campaign report completed at poll 69 (~552s), SD July was still PENDING at
// ~567s, and the SP August report never completed inside 9 minutes at all. The live
// runReintroduction() preview died at 151s on exactly this. So the engine's report step has been
// failing routinely, which explains 11 keywords touched in seven weeks better than any rule does.
//
// Raising the inline budget cannot fix it either: Vercel caps a function at 300s (route
// maxDuration), and a full engine pass needs several reports. So we stop waiting.
//
//   Run N   : ensureRequested() creates the report at Amazon and persists its reportId. Returns null.
//   Run N+1 : tryCollect() polls ONCE (cheap), and if COMPLETED downloads the rows and acts.
//
// The engine therefore becomes eventually-consistent instead of failing. A pass with no data yet
// is a normal outcome, not an error — it simply takes no action and says so.
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
/** How old collected data may be before the engine should not act on it. */
export const DATA_STALE_HOURS = 30;

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

/**
 * Get report rows if a previously-requested report has finished; otherwise request one and return
 * without waiting. NEVER blocks for more than a single status poll, so a run stays well inside
 * Vercel's 300s function budget no matter how backed up Amazon's queue is.
 */
export async function getReport<T = Record<string, unknown>>(
  cfg: AdsConfig, token: string, spec: ReportSpec, nowIso = new Date().toISOString(),
): Promise<CollectOutcome<T>> {
  const key = reportKey(spec);
  const existing = await loadJob(key);

  // Already collected and still fresh -> hand back the cached rows, no API call at all.
  if (existing?.status === "COMPLETED" && existing.collectedAt && existing.rowsJson) {
    if (isFreshData(existing.collectedAt, nowIso)) {
      return { state: "ready", rows: JSON.parse(existing.rowsJson) as T[], ageHours: +hoursBetween(existing.collectedAt, nowIso).toFixed(2) };
    }
  }

  // A live job that has not gone stale -> poll it exactly once.
  if (existing && existing.reportId && existing.status === "REQUESTED" && !isStaleJob(existing, nowIso)) {
    const s = await ads(cfg, token, `/reporting/reports/${existing.reportId}`, "GET", null);
    const status = String(s.json?.status ?? "");
    if (status === "COMPLETED" && s.json?.url) {
      const buf = Buffer.from(await (await fetch(s.json.url)).arrayBuffer());
      const rows = JSON.parse(gunzipSync(buf).toString()) as T[];
      await db().execute({
        sql: "UPDATE ads_report_jobs SET status='COMPLETED', collected_at=?, rows_json=? WHERE key=?",
        args: [nowIso, JSON.stringify(rows), key],
      });
      return { state: "ready", rows, ageHours: 0 };
    }
    if (status === "FAILURE") {
      await db().execute({ sql: "UPDATE ads_report_jobs SET status='FAILED', note=? WHERE key=?", args: [String(s.json?.failureReason ?? "FAILURE").slice(0, 300), key] });
      return { state: "failed", reason: `report FAILURE: ${String(s.json?.failureReason ?? "").slice(0, 120)}` };
    }
    return { state: "pending", job: { key, reportId: existing.reportId, status: existing.status, requestedAt: existing.requestedAt, collectedAt: existing.collectedAt } };
  }

  // Nothing usable -> request a fresh report and return immediately.
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
  return { state: "requested", job: { key, reportId, status: "REQUESTED", requestedAt: nowIso, collectedAt: null } };
}
