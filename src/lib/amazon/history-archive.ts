/**
 * OUR OWN HISTORY, kept past Amazon's retention window.
 *
 * William 2026-08-23: "make sure we are saving data from this month to go back further once we
 * build over time, to not just rely on Amazon's 65 day limit."
 *
 * Amazon serves roughly 65 to 95 days of report history and then the data is gone. Measured
 * 2026-08-23: the oldest window it would still build was 2026-05-20, 96 days back. Every rule that
 * reasons about a keyword's PAST therefore stands on sand. shouldRetirePermanently() needs three
 * consecutive months, and by month four Amazon has already forgotten month one, which is precisely
 * the cycle kw_tombstone exists to break.
 *
 * This writes at DAY grain into tables we own, so nothing is ever recomputed from a window that has
 * since expired. It is IDEMPOTENT: a sale attributed late updates the day it BELONGS to rather than
 * the day we noticed it, which is why the day grain matters and a running total would not do.
 *
 * Deliberately NOT routed through ads-reports.getReport(). That path builds SUMMARY reports and its
 * cache key has no timeUnit in it, so a DAILY request would collide with the engine's SUMMARY
 * request for the same dates and hand one of them the other's rows.
 */
import { adsConfigFromEnv, getAdsAccessToken, type AdsConfig } from "./ads-api";
import { db } from "@/lib/db/client";
import { gunzipSync } from "node:zlib";

const BASE = "https://advertising-api.amazon.com";
const V3 = "application/vnd.createasyncreportrequest.v3+json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Rows per Turso round trip. Keeps a batch well inside request size limits. */
export const WRITE_CHUNK = 500;

/** Amazon refuses report windows wider than 31 days. Newest first, so the most useful data lands
 *  first if a later chunk times out. */
export function archiveWindows(days: number, now: Date): [string, string][] {
  const out: [string, string][] = [];
  const today = new Date(iso(now) + "T12:00:00Z");
  const floor = new Date(today.getTime() - days * 864e5);
  let end = new Date(today);
  while (end > floor) {
    const raw = new Date(end.getTime() - 30 * 864e5);
    const start = raw < floor ? floor : raw;
    out.push([iso(start), iso(end)]);
    end = new Date(start.getTime() - 864e5);
  }
  return out;
}

export interface ArchiveResult {
  ok: boolean; dryRun: boolean;
  windows: string[]; keywordDays: number; monthsHeld: string[];
  requested: string[]; collected: string[]; pending: string[];
  earliest: string | null; latest: string | null;
  notes: string[]; errors: string[]; durationMs: number;
}

interface Row {
  date?: string; keywordId?: string | number; keyword?: string; matchType?: string;
  campaignId?: string | number; adGroupId?: string | number;
  impressions?: number; clicks?: number; cost?: number; purchases14d?: number; sales14d?: number;
}

/** Stable identity for one archive window's report job. The `daily` marker is what keeps this out
 *  of the engine's SUMMARY cache: same dates, same columns, different report, different key. */
export function archiveJobKey(profileId: string, start: string, end: string): string {
  return `archive-daily|${profileId}|${start}|${end}`;
}

const REQUEST_HEADERS = (cfg: AdsConfig, token: string) => ({
  Authorization: `Bearer ${token}`,
  "Amazon-Advertising-API-ClientId": cfg.clientId,
  "Amazon-Advertising-API-Scope": cfg.profileId!,
  "Content-Type": V3, Accept: V3,
});

const REPORT_BODY = (start: string, end: string) => ({
  name: `archive-${start}-${end}`, startDate: start, endDate: end,
  configuration: {
    adProduct: "SPONSORED_PRODUCTS", groupBy: ["targeting"],
    columns: ["date", "keywordId", "keyword", "matchType", "campaignId", "adGroupId",
      "impressions", "clicks", "cost", "purchases14d", "sales14d"],
    reportTypeId: "spTargeting", timeUnit: "DAILY", format: "GZIP_JSON",
  },
});

/** A report job row, reusing the table ads-reports.ts already owns. */
interface ArchiveJob { reportId: string | null; status: string; requestedAt: string }

async function loadArchiveJob(key: string): Promise<ArchiveJob | null> {
  const r = await db().execute({
    sql: "SELECT report_id, status, requested_at FROM ads_report_jobs WHERE key = ?", args: [key],
  });
  const row = (r.rows as unknown as Record<string, unknown>[])[0];
  if (!row) return null;
  return {
    reportId: row.report_id == null ? null : String(row.report_id),
    status: String(row.status), requestedAt: String(row.requested_at),
  };
}

/** A report Amazon never finished. After this long, ask again rather than wait for ever. */
export const ARCHIVE_JOB_STALE_HOURS = 6;

export function isArchiveJobStale(requestedAt: string, nowIso: string): boolean {
  return (Date.parse(nowIso) - Date.parse(requestedAt)) / 3_600_000 >= ARCHIVE_JOB_STALE_HOURS;
}

/**
 * ASK for a window's report and remember the id. Does NOT wait for it.
 *
 * THIS IS THE WHOLE FIX. The old code blocked here, polling every 8 seconds for up to 200 polls,
 * because Amazon's report queue is a fixed ~5 to 10 minutes per window whatever the window's width
 * (measured 2026-08-28: a 1-day report took 10.0 minutes, a 27-day report 9.1). Two windows meant
 * roughly 589 seconds against a 300-second Vercel budget, so the job was killed just past halfway
 * EVERY DAY and kw_day last wrote 2026-08-26.
 *
 * Waiting was never necessary. The report keeps building after we hang up, so we store the id and
 * a later run collects it. Each invocation now costs seconds instead of minutes and the platform
 * timeout stops being the binding constraint.
 */
async function requestWindow(
  cfg: AdsConfig, token: string, key: string, start: string, end: string, nowIso: string,
): Promise<{ requested: true } | { err: string }> {
  const cr = await fetch(`${BASE}/reporting/reports`, {
    method: "POST", headers: REQUEST_HEADERS(cfg, token), body: JSON.stringify(REPORT_BODY(start, end)),
  });
  const body = await cr.json().catch(() => ({}));
  let rid: string | undefined = body?.reportId;
  // A 425 duplicate-request answer names the id of the report already building. That is a usable
  // job, not an error, and re-reading it is how a retry stops stacking up duplicate reports.
  if (!rid) {
    const m = String(body?.detail ?? "").match(/([0-9a-f-]{36})/);
    if (m) rid = m[1];
  }
  // A window past Amazon's retention answers with an explicit error naming the earliest date it
  // will serve. That is the edge of history, not a failure, and it is worth surfacing verbatim.
  if (!rid) return { err: String(body?.detail ?? JSON.stringify(body)).slice(0, 220) };
  await db().execute({
    sql: `INSERT INTO ads_report_jobs (key,purpose,report_id,status,requested_at)
          VALUES (?,?,?,'REQUESTED',?)
          ON CONFLICT(key) DO UPDATE SET report_id=excluded.report_id, status='REQUESTED',
            requested_at=excluded.requested_at, collected_at=NULL, rows_json=NULL, note=NULL`,
    args: [key, `archive ${start}..${end}`, rid, nowIso],
  });
  return { requested: true };
}

/** ONE status poll on an already-requested report. Never blocks. */
async function collectWindow(
  cfg: AdsConfig, token: string, key: string, reportId: string, nowIso: string,
): Promise<{ rows: Row[] } | { err: string } | null> {
  const s = await (await fetch(`${BASE}/reporting/reports/${reportId}`, {
    headers: REQUEST_HEADERS(cfg, token),
  })).json().catch(() => ({}));
  const status = String(s?.status ?? "");
  if (status === "COMPLETED" && s?.url) {
    const buf = Buffer.from(await (await fetch(s.url)).arrayBuffer());
    const rows = JSON.parse(gunzipSync(buf).toString()) as Row[];
    await db().execute({
      sql: "UPDATE ads_report_jobs SET status='COMPLETED', collected_at=? WHERE key=?",
      args: [nowIso, key],
    });
    return { rows };
  }
  if (status === "FAILURE") {
    await db().execute({
      sql: "UPDATE ads_report_jobs SET status='FAILED', note=? WHERE key=?",
      args: [String(s?.failureReason ?? "FAILURE").slice(0, 300), key],
    });
    return { err: `report FAILURE: ${String(s?.failureReason ?? "").slice(0, 120)}` };
  }
  return null;   // still building; a later run collects it
}

async function ensureTables(): Promise<void> {
  await db().execute(`CREATE TABLE IF NOT EXISTS kw_day (
    keyword_id TEXT NOT NULL, day TEXT NOT NULL, word TEXT, match_type TEXT,
    campaign_id TEXT, ad_group_id TEXT, ad_product TEXT NOT NULL DEFAULT 'SPONSORED_PRODUCTS',
    spend REAL NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0, orders INTEGER NOT NULL DEFAULT 0,
    sales REAL NOT NULL DEFAULT 0, first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY (keyword_id, day, ad_product))`);
  await db().execute(`CREATE TABLE IF NOT EXISTS kw_month (
    keyword_id TEXT NOT NULL, month TEXT NOT NULL, word TEXT, match_type TEXT,
    ad_product TEXT NOT NULL DEFAULT 'SPONSORED_PRODUCTS',
    spend REAL NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0, orders INTEGER NOT NULL DEFAULT 0,
    sales REAL NOT NULL DEFAULT 0, days_with_spend INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL, PRIMARY KEY (keyword_id, month, ad_product))`);
  await db().execute(`CREATE TABLE IF NOT EXISTS ad_day_observation (
    day TEXT NOT NULL, observed_on TEXT NOT NULL,
    ad_product TEXT NOT NULL DEFAULT 'SPONSORED_PRODUCTS',
    spend REAL NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
    orders INTEGER NOT NULL DEFAULT 0, sales REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (day, observed_on, ad_product))`);
  await db().execute(`CREATE TABLE IF NOT EXISTS ads_report_jobs (
    key TEXT PRIMARY KEY, purpose TEXT, report_id TEXT, status TEXT NOT NULL,
    requested_at TEXT NOT NULL, collected_at TEXT, rows_json TEXT, note TEXT)`);
  await db().execute(`CREATE INDEX IF NOT EXISTS idx_kw_day_day ON kw_day (day)`);
  await db().execute(`CREATE INDEX IF NOT EXISTS idx_kw_month_month ON kw_month (month)`);
}

/**
 * Top up the archive. `days` defaults to 40, comfortably wider than the 14-day attribution window,
 * so a day is rewritten several times as its sales land and settles on the truth.
 */
export async function runHistoryArchive(
  opts: { days?: number; dryRun?: boolean; now?: Date } = {},
): Promise<ArchiveResult> {
  const started = Date.now();
  const days = opts.days ?? 40;
  const dryRun = opts.dryRun ?? false;
  const now = opts.now ?? new Date();
  const out: ArchiveResult = {
    ok: false, dryRun, windows: [], keywordDays: 0, monthsHeld: [],
    requested: [], collected: [], pending: [],
    earliest: null, latest: null, notes: [], errors: [], durationMs: 0,
  };
  const cfg = adsConfigFromEnv();
  if (!cfg?.profileId) { out.errors.push("ADS_* env not configured"); out.durationMs = Date.now() - started; return out; }
  const token = await getAdsAccessToken(cfg);
  if (!dryRun) await ensureTables();

  const stamp = now.toISOString(), today = iso(now);
  const months = new Map<string, { kid: string; month: string; word: string | null; mt: string | null;
    spend: number; clicks: number; imps: number; orders: number; sales: number; days: number }>();

  const writes: { sql: string; args: (string | number | null)[] }[] = [];

  for (const [start, end] of archiveWindows(days, now)) {
    const label = `${start}..${end}`;
    out.windows.push(label);
    const key = archiveJobKey(String(cfg.profileId), start, end);

    // ---- ask or collect, never wait -------------------------------------------------------
    let rows: Row[] | null = null;
    const job = dryRun ? null : await loadArchiveJob(key);
    if (job?.reportId && job.status === "REQUESTED" && !isArchiveJobStale(job.requestedAt, stamp)) {
      const c = await collectWindow(cfg, token, key, job.reportId, stamp);
      if (c && "rows" in c) { rows = c.rows; out.collected.push(label); }
      else if (c && "err" in c) { out.errors.push(`${label}: ${c.err}`); continue; }
      else { out.pending.push(label); continue; }              // still building, try next run
    } else {
      // Nothing usable: no job, a stale one Amazon never finished, or a previous COMPLETED row
      // whose data has since moved on. Ask for a fresh report and let the next run collect it.
      if (dryRun) { out.pending.push(label); continue; }
      const r = await requestWindow(cfg, token, key, start, end, stamp);
      if ("err" in r) { out.errors.push(`${label}: ${r.err}`); continue; }
      out.requested.push(label);
      continue;
    }

    // ---- write what we collected ----------------------------------------------------------
    const usable = rows.filter((x) => x.keywordId != null && x.date);
    const perDay = new Map<string, { s: number; c: number; o: number; sa: number }>();
    for (const x of usable) {
      const day = String(x.date), kid = String(x.keywordId);
      if (!out.earliest || day < out.earliest) out.earliest = day;
      if (!out.latest || day > out.latest) out.latest = day;
      const spend = +(x.cost ?? 0), clicks = +(x.clicks ?? 0), imps = +(x.impressions ?? 0);
      const orders = +(x.purchases14d ?? 0), sales = +(x.sales14d ?? 0);
      writes.push({
        sql: `INSERT INTO kw_day (keyword_id,day,word,match_type,campaign_id,ad_group_id,ad_product,spend,clicks,impressions,orders,sales,first_seen_at,updated_at)
              VALUES (?,?,?,?,?,?,'SPONSORED_PRODUCTS',?,?,?,?,?,?,?)
              ON CONFLICT(keyword_id,day,ad_product) DO UPDATE SET
                spend=excluded.spend, clicks=excluded.clicks, impressions=excluded.impressions,
                orders=excluded.orders, sales=excluded.sales, word=excluded.word,
                match_type=excluded.match_type, updated_at=excluded.updated_at`,
        args: [kid, day, x.keyword ?? null, x.matchType ?? null,
          x.campaignId != null ? String(x.campaignId) : null,
          x.adGroupId != null ? String(x.adGroupId) : null,
          spend, clicks, imps, orders, sales, stamp, stamp],
      });
      out.keywordDays++;
      const mk = `${kid}|${day.slice(0, 7)}`;
      const m = months.get(mk) ?? { kid, month: day.slice(0, 7), word: x.keyword ?? null, mt: x.matchType ?? null,
        spend: 0, clicks: 0, imps: 0, orders: 0, sales: 0, days: 0 };
      m.spend += spend; m.clicks += clicks; m.imps += imps; m.orders += orders; m.sales += sales;
      if (spend > 0) m.days++;
      months.set(mk, m);
      const o = perDay.get(day) ?? { s: 0, c: 0, o: 0, sa: 0 };
      o.s += spend; o.c += clicks; o.o += orders; o.sa += sales;
      perDay.set(day, o);
    }
    // What each day looked like AS READ TODAY. This is what makes a real attribution settling curve
    // possible: it records the reading as well as the value.
    for (const [day, o] of perDay) {
      writes.push({
        sql: `INSERT INTO ad_day_observation (day,observed_on,ad_product,spend,clicks,orders,sales)
              VALUES (?,?,'SPONSORED_PRODUCTS',?,?,?,?)
              ON CONFLICT(day,observed_on,ad_product) DO UPDATE SET
                spend=excluded.spend, clicks=excluded.clicks, orders=excluded.orders, sales=excluded.sales`,
        args: [day, today, o.s, o.c, o.o, o.sa],
      });
    }
  }

  if (!dryRun) {
    for (const m of months.values()) {
      writes.push({
        sql: `INSERT INTO kw_month (keyword_id,month,word,match_type,ad_product,spend,clicks,impressions,orders,sales,days_with_spend,updated_at)
              VALUES (?,?,?,?,'SPONSORED_PRODUCTS',?,?,?,?,?,?,?)
              ON CONFLICT(keyword_id,month,ad_product) DO UPDATE SET
                spend=excluded.spend, clicks=excluded.clicks, impressions=excluded.impressions,
                orders=excluded.orders, sales=excluded.sales, days_with_spend=excluded.days_with_spend,
                word=excluded.word, match_type=excluded.match_type, updated_at=excluded.updated_at`,
        args: [m.kid, m.month, m.word, m.mt, m.spend, m.clicks, m.imps, m.orders, m.sales, m.days, stamp],
      });
    }
    // ONE round trip per WRITE_CHUNK rows instead of one per keyword-day. 4,131 separate awaits
    // against Turso was minutes of pure latency on top of the report wait.
    for (let i = 0; i < writes.length; i += WRITE_CHUNK) {
      await db().batch(writes.slice(i, i + WRITE_CHUNK), "write");
    }
    out.notes.push(`${writes.length} row writes in ${Math.ceil(writes.length / WRITE_CHUNK)} batch(es)`);
    const r = await db().execute("SELECT month FROM kw_month GROUP BY month ORDER BY month");
    out.monthsHeld = r.rows.map((x: Record<string, unknown>) => String(x.month));
    out.notes.push(`archive now holds ${out.monthsHeld.length} month(s): ${out.monthsHeld.join(", ")}`);
    // The rule this exists to feed. Say plainly whether it can fire yet.
    out.notes.push(out.monthsHeld.length >= 3
      ? "three consecutive months held: the retirement rule has the history it needs"
      : `only ${out.monthsHeld.length} month(s) held: the three-month retirement rule cannot fire yet`);
  }
  if (out.requested.length) out.notes.push(`requested ${out.requested.length} report(s), a later run collects: ${out.requested.join(", ")}`);
  if (out.pending.length) out.notes.push(`${out.pending.length} still building: ${out.pending.join(", ")}`);
  if (out.collected.length) out.notes.push(`collected ${out.collected.length}: ${out.collected.join(", ")}`);
  // Asking for a report IS progress. A run that requested two windows and wrote nothing is working
  // exactly as designed, and must not read as a failure.
  out.ok = out.errors.length === 0 || out.keywordDays > 0 || out.requested.length > 0;
  out.durationMs = Date.now() - started;
  return out;
}
