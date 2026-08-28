/**
 * THE HOURLY WATCHDOG.
 *
 * William 2026-08-27: "hourly check to make sure no issues with engine running and if anytime
 * there is a word over $4 spend in any spend category or any country or any converting word below
 * 1.5x roas then please send the notification make sure it is timed to allow for the reports to
 * run", and "telegram it is please i dont want to fill the inbox".
 *
 * SILENT WHEN CLEAN. It speaks only when something is wrong, plus one heartbeat a day so that
 * silence can never mean "the watchdog itself is dead". That distinction is the whole point: on
 * 2026-08-27 we found production had no RESEND_API_KEY, so twenty days of alerts failed instantly
 * and the absence of mail read exactly like good news.
 *
 * IT NEVER REQUESTS A REPORT. Measured on this account, Amazon's report queue runs 11 minutes at
 * midnight UTC and 39 minutes at midday. A watchdog that asked for its own data would spend most
 * of every hour waiting and would frequently have nothing to say. It reads the SAME cached report
 * the engine just judged on, which is both instant and the correct thing to audit against: we are
 * asking whether the engine acted properly on the evidence it actually had.
 *
 * NOT-READ IS NEVER REPORTED AS CLEAN. A scope whose report is missing, stale or unreadable is
 * reported as UNREAD and counts as a finding, because "we could not look" and "we looked and it
 * was fine" are different answers and only one of them is reassuring.
 */

import { killSpendFor, KILL_MIN_ROAS } from "./ad-rules";

/** One thing the watchdog looked at: a country crossed with an ad product. */
export interface WatchScope {
  country: string;
  adProduct: string;
  currency: string;
}

/** One entity that should be off and is not. */
export interface WatchViolation {
  scope: WatchScope;
  id: string;
  label: string;
  spend: number;
  sales: number;
  orders: number;
  roas: number | null;
  bid: number | null;
  /** "no sales at all" or "converting under the bar" */
  kind: "never converted" | "under the roas bar";
}

/** A scope we could not judge. Counts as a finding, never as clean. */
export interface WatchUnread {
  scope: WatchScope;
  reason: string;
}

export interface EngineHealth {
  /** Minutes since the last run row for this scope, null when there has never been one. */
  minutesSinceRun: number | null;
  /** Runs recorded in the last 24h. */
  runs24h: number;
  /** Runs in the last 24h that recorded at least one decision. */
  runsWithActions24h: number;
}

export interface WatchReport {
  generatedAt: string;
  /** How late a run may be before we complain, in minutes. */
  lateAfterMinutes: number;
  health: Record<string, EngineHealth>;
  lateScopes: string[];
  violations: WatchViolation[];
  unread: WatchUnread[];
  /** Report jobs asked for and never collected, older than two hours. */
  orphanReports: number;
  /** True when this run should send the once-a-day "all clean" heartbeat. */
  heartbeat: boolean;
}

/** A row as it comes out of a targeting report, whatever the ad product. */
export interface PerfRow {
  id: string;
  label: string;
  spend: number;
  sales: number;
  orders: number;
}

/** Live state of one entity on Amazon. */
export interface LiveEntity {
  id: string;
  state: string;
  bid?: number | null;
}

/**
 * THE RULE, and it is deliberately the same shape as shouldKill.
 *
 * An entity is a violation when it is ENABLED, has spent past its currency's bar, and either never
 * converted or converts below the bar. Anything under the spend bar is NOT a violation: the $4 rope
 * is the rule working as written, not a leak in it, and reporting it hourly would train William to
 * ignore the alert.
 */
export function findViolations(
  scope: WatchScope,
  rows: PerfRow[],
  live: Map<string, LiveEntity>,
  minRoas = KILL_MIN_ROAS,
): WatchViolation[] {
  const bar = killSpendFor(scope.currency);
  const out: WatchViolation[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.id || seen.has(r.id)) continue;
    const l = live.get(r.id);
    if (!l || l.state !== "ENABLED") continue;      // already off, or gone
    if (r.spend < bar) continue;                     // inside the rope
    const converted = r.orders > 0 && r.sales > 0;
    const roas = r.spend > 0 ? r.sales / r.spend : 0;
    if (converted && roas >= minRoas) continue;      // earning its keep
    seen.add(r.id);
    out.push({
      scope, id: r.id, label: r.label,
      spend: +r.spend.toFixed(2), sales: +r.sales.toFixed(2), orders: r.orders,
      roas: converted ? +roas.toFixed(2) : null,
      bid: l.bid ?? null,
      kind: converted ? "under the roas bar" : "never converted",
    });
  }
  return out.sort((a, b) => b.spend - a.spend);
}

/**
 * Is this scope's engine overdue?
 *
 * `lateAfterMinutes` is generous on purpose. The engines are hourly, but Vercel cron fires within a
 * window rather than on the second, Amazon's queue is measured at up to 40 minutes, and a run that
 * finds nothing to do still writes its run row. 100 minutes means one whole missed hour before we
 * complain, so a single slow cron does not page anybody.
 */
export function isLate(h: EngineHealth | undefined, lateAfterMinutes: number): boolean {
  if (!h) return true;                       // never seen at all
  if (h.minutesSinceRun === null) return true;
  return h.minutesSinceRun > lateAfterMinutes;
}

/** Nothing to say? Then say nothing. */
export function isClean(r: WatchReport): boolean {
  return r.violations.length === 0 && r.unread.length === 0 && r.lateScopes.length === 0;
}

const money = (n: number, ccy: string) => `${ccy} ${n.toFixed(2)}`;

/** The message. Short, because it arrives on a phone. */
export function formatWatch(r: WatchReport): string {
  const when = r.generatedAt.replace("T", " ").slice(0, 16) + " UTC";
  if (isClean(r)) {
    const scopes = Object.keys(r.health).length;
    return [
      `PA-AMZN watchdog — all clean`,
      ``,
      `${when}`,
      `${scopes} engine${scopes === 1 ? "" : "s"} checked, all ran on time.`,
      `No entity past its spend bar is still enabled, in any country or ad type.`,
      ``,
      `This is the once-a-day heartbeat. Silence between these means clean;`,
      `no heartbeat for a day means the watchdog itself has stopped.`,
    ].join("\n");
  }

  const L: string[] = [`PA-AMZN watchdog — ${r.violations.length + r.unread.length + r.lateScopes.length} issue(s)`, ``, when, ``];

  if (r.lateScopes.length) {
    L.push(`ENGINE NOT RUNNING`);
    for (const s of r.lateScopes) {
      const h = r.health[s];
      const ago = h?.minutesSinceRun === null || h?.minutesSinceRun === undefined ? "never" : `${Math.round(h.minutesSinceRun)} min ago`;
      L.push(`  ${s}: last run ${ago} (expected within ${r.lateAfterMinutes} min)`);
    }
    L.push(``);
  }

  if (r.violations.length) {
    L.push(`STILL SPENDING PAST THE BAR`);
    for (const v of r.violations.slice(0, 25)) {
      const roas = v.roas === null ? "no sales" : `${v.roas.toFixed(2)}x`;
      L.push(`  ${v.scope.country} ${v.scope.adProduct}`);
      L.push(`    ${money(v.spend, v.scope.currency)} spent, ${roas}, bid ${v.bid ?? "?"} — ${v.label}`);
    }
    if (r.violations.length > 25) L.push(`  ...and ${r.violations.length - 25} more`);
    L.push(``);
  }

  if (r.unread.length) {
    L.push(`COULD NOT CHECK (not the same as clean)`);
    for (const u of r.unread) L.push(`  ${u.scope.country} ${u.scope.adProduct}: ${u.reason}`);
    L.push(``);
  }

  if (r.orphanReports > 0) L.push(`${r.orphanReports} report request(s) asked for and never collected.`);

  return L.join("\n").trimEnd();
}

// ---------------------------------------------------------------------------
// GATHERING. Everything above this line is pure and unit-tested; everything
// below talks to Turso and Amazon.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db/client";
import { adsConfigFromEnv, getAdsAccessToken, type AdsConfig } from "./ads-api";
import { getReport, reportKey, type ReportSpec } from "./ads-reports";
import { spSpec } from "./ad-engine";
import { sdReportSpec } from "./sd-engine";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const KW_CT = "application/vnd.spKeyword.v3+json";
const A = "https://advertising-api.amazon.com";

/** How late a run may be before we say the engine is not running. One whole missed hour. */
export const LATE_AFTER_MINUTES = 100;

/** Which countries we watch, and the env var that names each account. */
export const WATCHED_COUNTRIES: Array<{ country: string; currency: string; envVar: string }> = [
  { country: "US", currency: "USD", envVar: "ADS_PROFILE_ID" },
  { country: "CA", currency: "CAD", envVar: "ADS_PROFILE_ID_CA" },
  { country: "MX", currency: "MXN", envVar: "ADS_PROFILE_ID_MX" },
];

const scopeName = (s: WatchScope) => `${s.country} ${s.adProduct}`;

/** Live Sponsored Products keywords for one account, every page. */
async function liveKeywords(cfg: AdsConfig, token: string): Promise<Map<string, LiveEntity>> {
  const out = new Map<string, LiveEntity>();
  let next: string | undefined;
  do {
    const res = await fetch(`${A}/sp/keywords/list`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Amazon-Advertising-API-ClientId": cfg.clientId,
        "Amazon-Advertising-API-Scope": String(cfg.profileId),
        "Content-Type": KW_CT, Accept: KW_CT,
      },
      body: JSON.stringify({ maxResults: 1000, ...(next ? { nextToken: next } : {}) }),
    });
    if (!res.ok) throw new Error(`keywords/list ${res.status}`);
    const j = await res.json() as { keywords?: Array<{ keywordId: string | number; state: string; bid?: number; keywordText?: string; matchType?: string }>; nextToken?: string };
    for (const k of j.keywords ?? []) {
      out.set(String(k.keywordId), { id: String(k.keywordId), state: k.state, bid: k.bid ?? null });
    }
    next = j.nextToken;
  } while (next);
  return out;
}

/** Live Sponsored Display targets. */
async function liveSdTargets(cfg: AdsConfig, token: string): Promise<Map<string, LiveEntity>> {
  const res = await fetch(`${A}/sd/targets`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Amazon-Advertising-API-ClientId": cfg.clientId,
      "Amazon-Advertising-API-Scope": String(cfg.profileId),
      "Content-Type": "application/json", Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`sd/targets ${res.status}`);
  const j = await res.json() as Array<{ targetId: string | number; state: string; bid?: number }>;
  const out = new Map<string, LiveEntity>();
  for (const t of j) out.set(String(t.targetId), { id: String(t.targetId), state: t.state, bid: t.bid ?? null });
  return out;
}

/** Live Sponsored Brands keywords. */
async function liveSbKeywords(cfg: AdsConfig, token: string): Promise<Map<string, LiveEntity>> {
  // TWO HEADER RULES, both learned from real responses on 2026-08-28, and they are not symmetric:
  //   Accept MUST be the vendor type. `application/json` answers 406 "No match for accept header".
  //   Content-Type MUST BE ABSENT on this GET. Sending any Content-Type answers 415 "Cannot consume
  //   content type", including the vendor type itself.
  // Writing is the mirror image (Content-Type: application/json, Accept: ...sbkeywordresponse...),
  // which is exactly why mixing the two up is so easy. The cost of this one was that the watchdog
  // threw on every run and Sponsored Brands went unwatched entirely.
  const res = await fetch(`${A}/sb/keywords`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Amazon-Advertising-API-ClientId": cfg.clientId,
      "Amazon-Advertising-API-Scope": String(cfg.profileId),
      Accept: "application/vnd.sbkeyword.v3+json",
    },
  });
  if (!res.ok) throw new Error(`sb/keywords ${res.status}`);
  const j = await res.json() as Array<{ keywordId: string | number; state: string; bid?: number }>;
  const out = new Map<string, LiveEntity>();
  for (const k of j) out.set(String(k.keywordId), { id: String(k.keywordId), state: k.state, bid: k.bid ?? null });
  return out;
}

/**
 * Read a report from the CACHE ONLY.
 *
 * inlineWaitMs 0 means one status poll and no waiting. If the engine's report is not sitting there
 * finished, we return null and the caller reports the scope UNREAD. The watchdog must never join
 * Amazon's queue: at 39 minutes median at midday it would miss its own hourly slot.
 */
async function cachedRows<T>(cfg: AdsConfig, token: string, spec: ReportSpec): Promise<T[] | null> {
  const r = await getReport<T>(cfg, token, spec, new Date().toISOString(), { inlineWaitMs: 0 });
  return r.state === "ready" ? r.rows : null;
}

/** Engine health per scope, straight from the engine's own run rows. */
async function health(nowIso: string): Promise<Record<string, EngineHealth>> {
  const out: Record<string, EngineHealth> = {};
  const rows = await db().execute(
    `SELECT ad_product, action, run_at FROM ad_engine_log WHERE run_at >= datetime('now','-24 hours')`,
  );
  // ad_product is NULL on Sponsored Products rows for historical reasons.
  const label = (p: unknown) => (p === null || p === undefined ? "Products" : String(p) === "SPONSORED_BRANDS" ? "Brands" : String(p) === "SPONSORED_DISPLAY" ? "Display" : String(p));
  const byScope = new Map<string, { last: string | null; runs: Set<string>; acted: Set<string> }>();
  for (const r of rows.rows) {
    const name = `US ${label(r.ad_product)}`;
    const at = String(r.run_at);
    const e = byScope.get(name) ?? { last: null, runs: new Set<string>(), acted: new Set<string>() };
    if (!e.last || at > e.last) e.last = at;
    const slot = at.slice(0, 13);
    if (String(r.action) === "run") e.runs.add(slot); else e.acted.add(slot);
    byScope.set(name, e);
  }
  for (const [name, e] of byScope) {
    out[name] = {
      minutesSinceRun: e.last ? (Date.parse(nowIso) - Date.parse(e.last)) / 60000 : null,
      runs24h: e.runs.size,
      runsWithActions24h: e.acted.size,
    };
  }
  return out;
}

/** Did we already send the daily heartbeat? One a day, on the first clean run after 13:00 UTC. */
async function heartbeatDue(nowIso: string): Promise<boolean> {
  await db().execute(`CREATE TABLE IF NOT EXISTS watch_heartbeat (day TEXT PRIMARY KEY, sent_at TEXT)`);
  const hour = Number(nowIso.slice(11, 13));
  if (hour < 13) return false;
  const day = nowIso.slice(0, 10);
  const r = await db().execute({ sql: `SELECT day FROM watch_heartbeat WHERE day = ?`, args: [day] });
  return r.rows.length === 0;
}

export async function markHeartbeatSent(nowIso = new Date().toISOString()): Promise<void> {
  await db().execute({
    sql: `INSERT OR REPLACE INTO watch_heartbeat (day, sent_at) VALUES (?, ?)`,
    args: [nowIso.slice(0, 10), nowIso],
  });
}

/** Sponsored Brands month-to-date, from the table the SB engine already fills each day. */
async function sbMonthToDate(monthStart: string): Promise<PerfRow[] | null> {
  try {
    const r = await db().execute({
      sql: `SELECT keyword_id, MAX(keyword_text) t, MAX(match_type) m,
                   SUM(cost) spend, SUM(sales) sales, SUM(orders) orders
              FROM sb_daily WHERE day >= ? GROUP BY keyword_id`,
      args: [monthStart],
    });
    if (!r.rows.length) return null;
    return r.rows.map((x: Record<string, unknown>) => ({
      id: String(x.keyword_id),
      label: `${x.t} (${x.m})`,
      spend: Number(x.spend ?? 0), sales: Number(x.sales ?? 0), orders: Number(x.orders ?? 0),
    }));
  } catch { return null; }
}

/** Everything, for every country and every ad product. */
export async function gatherWatch(nowIso = new Date().toISOString()): Promise<WatchReport> {
  const now = new Date(nowIso);
  const monthStart = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const violations: WatchViolation[] = [];
  const unread: WatchUnread[] = [];
  const base = adsConfigFromEnv();

  for (const c of WATCHED_COUNTRIES) {
    const profileId = process.env[c.envVar];
    const spScope: WatchScope = { country: c.country, adProduct: "Products", currency: c.currency };
    if (!base || !profileId) {
      unread.push({ scope: spScope, reason: `${c.envVar} not configured` });
      continue;
    }
    const cfg: AdsConfig = { ...base, profileId };
    let token: string;
    try { token = await getAdsAccessToken(cfg); }
    catch (e) { unread.push({ scope: spScope, reason: `auth failed: ${e instanceof Error ? e.message : String(e)}` }); continue; }

    // --- Sponsored Products
    try {
      const spec = spSpec("engine-mtd", "spTargeting", ["targeting"],
        ["keywordId", "keyword", "clicks", "impressions", "cost", "sales14d", "purchases14d"], monthStart, iso(now));
      const rows = await cachedRows<{ keywordId?: string | number; keyword?: string; cost?: number; sales14d?: number; purchases14d?: number }>(cfg, token, spec);
      if (!rows) {
        unread.push({ scope: spScope, reason: "the engine's own report is not collected yet" });
      } else {
        const live = await liveKeywords(cfg, token);
        violations.push(...findViolations(spScope, rows.map((r) => ({
          id: String(r.keywordId ?? ""), label: String(r.keyword ?? r.keywordId ?? "?"),
          spend: r.cost ?? 0, sales: r.sales14d ?? 0, orders: r.purchases14d ?? 0,
        })), live));
      }
    } catch (e) {
      unread.push({ scope: spScope, reason: e instanceof Error ? e.message : String(e) });
    }

    // --- Sponsored Display and Brands run in the US account only.
    if (c.country !== "US") continue;

    const sdScope: WatchScope = { country: c.country, adProduct: "Display", currency: c.currency };
    try {
      const rows = await cachedRows<{ targetingId?: string | number; targetingText?: string; cost?: number; sales?: number; purchases?: number }>(cfg, token, sdReportSpec(now.getTime()));
      if (!rows) {
        unread.push({ scope: sdScope, reason: "the engine's own report is not collected yet" });
      } else {
        const live = await liveSdTargets(cfg, token);
        violations.push(...findViolations(sdScope, rows.map((r) => ({
          id: String(r.targetingId ?? ""), label: String(r.targetingText ?? r.targetingId ?? "?"),
          spend: r.cost ?? 0, sales: r.sales ?? 0, orders: r.purchases ?? 0,
        })), live));
      }
    } catch (e) {
      unread.push({ scope: sdScope, reason: e instanceof Error ? e.message : String(e) });
    }

    const sbScope: WatchScope = { country: c.country, adProduct: "Brands", currency: c.currency };
    try {
      const rows = await sbMonthToDate(monthStart);
      if (!rows) {
        unread.push({ scope: sbScope, reason: "sb_daily has nothing for this month yet" });
      } else {
        const live = await liveSbKeywords(cfg, token);
        violations.push(...findViolations(sbScope, rows, live));
      }
    } catch (e) {
      unread.push({ scope: sbScope, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const h = await health(nowIso);
  const lateScopes = Object.keys(h).filter((k) => isLate(h[k], LATE_AFTER_MINUTES));

  let orphanReports = 0;
  try {
    const r = await db().execute(
      `SELECT COUNT(*) n FROM ads_report_jobs WHERE status != 'COMPLETED' AND requested_at < datetime('now','-2 hours')`,
    );
    orphanReports = Number(r.rows[0]?.n ?? 0);
  } catch { /* table may not exist on a fresh database */ }

  return {
    generatedAt: nowIso,
    lateAfterMinutes: LATE_AFTER_MINUTES,
    health: h,
    lateScopes,
    violations,
    unread,
    orphanReports,
    heartbeat: await heartbeatDue(nowIso),
  };
}

export { scopeName, reportKey };
