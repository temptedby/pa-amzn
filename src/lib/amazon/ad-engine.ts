import { gunzipSync } from "node:zlib";
import { adsConfigFromEnv, getAdsAccessToken, type AdsConfig } from "./ads-api";
import { db } from "@/lib/db/client";
import { decide, type Perf } from "./ad-rules";

// Autonomous Sponsored-Products engine. Designed to run every few hours via cron,
// so every action is SAFE TO REPEAT:
//   - KILL switch: ENABLED keyword, >= $4 spend & 0 orders (30d)  -> pause (idempotent)
//   - HARVEST: a search term with >= $4 spend AND ACOS <= 50% (ROAS >= 2x) over the trailing
//          ~60d -> add it as EXACT + PHRASE keywords IN THE AD GROUP IT CONVERTED IN (H1 fix:
//          was a single global anchor ad group, so 18/19 campaigns could never receive a harvest).
//          Rule: ad-engine-harvest-rule.md (William 2026-06-26); deduped per ad group; idempotent.
//   - BID: target-ACOS convergence, capped ±25%/run (whole-cent, never breaches the cap -> C1 fix),
//          floor/cap. NOT compounding WITHIN a run (does ratchet across runs -> audit R1, parked).
// Apply is gated behind dryRun. Reuses the LWA token + region from ads-api.ts.

const BASE = "https://advertising-api.amazon.com";
const KW_CT = "application/vnd.spKeyword.v3+json";
const RPT_CT = "application/vnd.createasyncreportrequest.v3+json";
// Kill + bid rules now live in ad-rules.ts (William 2026-07-24): $4-MTD kill + ±10% bid at the 50%
// ACOS pivot. Break-even ~52% (VALIDATED via SP-API getMyFeesEstimate: $9.49 - COGS $0.62 - referral
// $1.42 - FBA $2.52 = $4.93 contribution; 4.93/9.49), so the 50% pivot keeps every kept keyword profitable.
const FLOOR = 0.10, CAP = 2.50, MAX_STEP = 0.25; // ±25% per run
const NEW_KW_BID = 0.50;
// Harvest rule (ad-engine-harvest-rule.md, William 2026-06-26): a search term qualifies at
// >= $4 spend AND ACOS <= 50% (== ROAS >= 2x == sales >= 2*cost), measured over the trailing window.
export const HARVEST_MIN_SPEND = 4;          // $ spend bar before a term is worth harvesting
export const HARVEST_MAX_ACOS = 0.50;        // <= break-even ACOS (~52% Single, validated); keeps margin
const HARVEST_WINDOW_DAYS = 60;              // trailing window (chunked into <=31d Ads-API reports)
// Monthly REACTIVATION (ad-engine-harvest-rule.md step 4, William 2026-06-26): once a month, re-enable
// any PAUSED keyword whose trailing 65 days still holds cost >= $4 AND ACOS <= 50% (ROAS >= 2x) -
// same winner bar as harvest, so a keyword the kill-switch paused but that has since recovered comes back.
export const REACT_WINDOW_DAYS = 65;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Kw { keywordId: string; keywordText: string; matchType: string; state: string; bid: number; campaignId: string; adGroupId: string }
interface Row { keywordId?: string; keyword?: string; searchTerm?: string; matchType?: string; clicks?: number; cost?: number; sales14d?: number; purchases14d?: number; campaignId?: string | number; adGroupId?: string | number }
export interface SearchTermRow { searchTerm?: string; campaignId?: string | number; adGroupId?: string | number; cost?: number; sales14d?: number; purchases14d?: number }
export interface HarvestAdd { campaignId: string; adGroupId: string; keywordText: string; matchType: "EXACT" | "PHRASE"; state: "ENABLED"; bid: number }
export interface ReactivationCandidate { keywordId: string; keywordText: string; matchType: string; cost: number; acos: number }
export interface ReactivationResult {
  ok: boolean; dryRun: boolean;
  reactivated: { text: string; matchType: string; cost: number; acos: number }[];
  errors: string[]; durationMs: number; reason?: string;
}
export interface AdEngineResult {
  ok: boolean; dryRun: boolean;
  killed: { text: string; spend: number }[];
  bids: { text: string; from: number; to: number; acos: number }[];
  added: { text: string; matchType: string }[];
  errors: string[]; durationMs: number; reason?: string;
}

async function ads(cfg: AdsConfig, token: string, path: string, method: string, body: unknown, ct = "application/json") {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Amazon-Advertising-API-ClientId": cfg.clientId,
      "Amazon-Advertising-API-Scope": cfg.profileId!,
      "Content-Type": ct, Accept: ct,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, json: text ? JSON.parse(text) : null };
}

async function report(cfg: AdsConfig, token: string, reportTypeId: string, groupBy: string[], columns: string[], sd: string, ed: string): Promise<Row[]> {
  const cfgBody = { name: "eng", startDate: sd, endDate: ed, configuration: { adProduct: "SPONSORED_PRODUCTS", groupBy, columns, reportTypeId, timeUnit: "SUMMARY", format: "GZIP_JSON" } };
  const cr = await ads(cfg, token, "/reporting/reports", "POST", cfgBody, RPT_CT);
  let rid: string | undefined = cr.json?.reportId;
  if (!rid && cr.json?.code === "425") rid = String(cr.json.detail || "").match(/([0-9a-f-]{36})/)?.[1];
  if (!rid) throw new Error(`report create failed: ${JSON.stringify(cr.json).slice(0, 200)}`);
  let url: string | undefined;
  for (let i = 0; i < 28; i++) {           // ~28 * 5s = 140s budget per report
    await sleep(5000);
    const s = await ads(cfg, token, `/reporting/reports/${rid}`, "GET", null, RPT_CT);
    if (s.json?.status === "COMPLETED") { url = s.json.url; break; }
    if (s.json?.status === "FAILURE") throw new Error("report FAILURE");
  }
  if (!url) throw new Error("report timed out");
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  return JSON.parse(gunzipSync(buf).toString());
}

// Clamp a raw target bid to the ±MAX_STEP/run band and global [FLOOR, CAP], rounded to whole cents.
// C1 fix (ad-engine-audit-2026-06-25.md): round the band edges INWARD - lo UP, hi DOWN - so rounding
// a small bid to cents can never push it past the ±25%/run cap (e.g. 0.10->0.13 was +30%; now <=0.12).
export function clampBidStep(currentBid: number, rawTarget: number): number {
  const base = currentBid || NEW_KW_BID;
  const lo = Math.max(FLOOR, Math.ceil(base * (1 - MAX_STEP) * 100) / 100);
  const hi = Math.min(CAP, Math.floor(base * (1 + MAX_STEP) * 100) / 100);
  return Math.max(lo, Math.min(hi, +rawTarget.toFixed(2)));
}

// Trailing window split into non-overlapping <=31-day chunks (Ads API caps reports at ~31 days).
// HARVEST_WINDOW_DAYS=60 -> [now-30, now] and [now-60, now-31].
export function harvestWindows(days: number, now: number): [string, string][] {
  const MS = 864e5, CHUNK = 30, wins: [string, string][] = [];
  for (let end = 0; end < days; end += CHUNK + 1) {
    wins.push([iso(new Date(now - Math.min(end + CHUNK, days) * MS)), iso(new Date(now - end * MS))]);
  }
  return wins;
}

// Pure harvest selector (H1 fix). Aggregates spSearchTerm rows by (campaign|adGroup|term), then
// applies William's rule (ad-engine-harvest-rule.md): cost >= HARVEST_MIN_SPEND AND ACOS <= HARVEST_MAX_ACOS.
// Each qualifying term is harvested as EXACT + PHRASE INTO THE AD GROUP IT CONVERTED IN, skipping any
// (adGroup, matchType, text) already present. `existing` keys are `${adGroupId}|${matchType}|${lowerText}`.
export function harvestCandidates(rows: SearchTermRow[], existing: Set<string>, bid = NEW_KW_BID): HarvestAdd[] {
  const agg = new Map<string, { cid: string; agid: string; term: string; cost: number; sales: number }>();
  for (const r of rows) {
    const term = (r.searchTerm || "").trim();
    const cid = r.campaignId != null ? String(r.campaignId) : "";
    const agid = r.adGroupId != null ? String(r.adGroupId) : "";
    if (!term || !cid || !agid) continue;            // need the source ad group to harvest into
    if (/^b0[a-z0-9]{8}$/i.test(term)) continue;     // ASIN, not a customer search phrase
    const key = `${cid}|${agid}|${term.toLowerCase()}`;
    const o = agg.get(key) ?? { cid, agid, term, cost: 0, sales: 0 };
    o.cost += r.cost ?? 0; o.sales += r.sales14d ?? 0;
    agg.set(key, o);
  }
  const adds: HarvestAdd[] = [];
  for (const o of agg.values()) {
    if (o.cost < HARVEST_MIN_SPEND) continue;                          // >= $4 spend
    if (!(o.sales > 0 && o.cost / o.sales <= HARVEST_MAX_ACOS)) continue; // ACOS <= 50% (ROAS >= 2x)
    const t = o.term.toLowerCase();
    for (const mt of ["EXACT", "PHRASE"] as const) {
      if (existing.has(`${o.agid}|${mt}|${t}`)) continue;
      adds.push({ campaignId: o.cid, adGroupId: o.agid, keywordText: o.term, matchType: mt, state: "ENABLED", bid });
    }
  }
  return adds;
}

// Pure reactivation selector (ad-engine-harvest-rule.md step 4). From the currently PAUSED keywords
// + their trailing-window performance (aggregated per keywordId), pick those to re-enable: a paused
// keyword qualifies when its trailing 65d holds cost >= HARVEST_MIN_SPEND AND ACOS <= HARVEST_MAX_ACOS
// (same winner bar as harvest). Only PAUSED keywords are considered, so re-running is idempotent.
export function reactivationCandidates(
  paused: { keywordId: string; keywordText: string; matchType: string; state: string }[],
  perfById: Map<string, { cost: number; sales: number }>,
): ReactivationCandidate[] {
  const out: ReactivationCandidate[] = [];
  for (const k of paused) {
    if (k.state !== "PAUSED") continue;                         // never touch an already-ENABLED keyword
    const p = perfById.get(String(k.keywordId));
    if (!p) continue;                                            // no recent spend -> nothing to prove it recovered
    if (p.cost < HARVEST_MIN_SPEND) continue;                   // >= $4 spend
    if (!(p.sales > 0 && p.cost / p.sales <= HARVEST_MAX_ACOS)) continue; // ACOS <= 50% (ROAS >= 2x)
    out.push({ keywordId: String(k.keywordId), keywordText: k.keywordText, matchType: k.matchType, cost: +p.cost.toFixed(2), acos: +(p.cost / p.sales).toFixed(4) });
  }
  return out;
}

export async function runAdEngine(opts: { dryRun?: boolean } = {}): Promise<AdEngineResult> {
  const dryRun = opts.dryRun ?? false;
  const start = Date.now();
  const out: AdEngineResult = { ok: false, dryRun, killed: [], bids: [], added: [], errors: [], durationMs: 0 };
  const cfg = adsConfigFromEnv();
  if (!cfg || !cfg.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }
  const token = await getAdsAccessToken(cfg);

  // keywords
  const kws: Kw[] = [];
  let next: string | undefined;
  do {
    const r = await ads(cfg, token, "/sp/keywords/list", "POST", { maxResults: 1000, ...(next ? { nextToken: next } : {}) }, KW_CT);
    (r.json?.keywords ?? []).forEach((k: Kw) => kws.push(k));
    next = r.json?.nextToken;
  } while (next);
  const byId = new Map(kws.map((k) => [String(k.keywordId), k]));
  // per-ad-group keyword index so harvest only skips a term already present IN THAT ad group (H1).
  const haveByAg = new Set(kws.map((k) => `${k.adGroupId}|${k.matchType}|${(k.keywordText || "").toLowerCase().trim()}`));

  const now = new Date();
  const ed = iso(now), sd = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))); // month-to-date

  // (1) keyword performance -> kill + bid
  const kt = await report(cfg, token, "spTargeting", ["targeting"], ["keywordId", "keyword", "clicks", "cost", "sales14d", "purchases14d"], sd, ed);
  const killOps: { keywordId: string; state: string }[] = [], bidOps: { keywordId: string; bid: number }[] = [];
  for (const r of kt) {
    const k = byId.get(String(r.keywordId)); if (!k || k.state !== "ENABLED") continue;
    const perf: Perf = { spend: r.cost ?? 0, orders: r.purchases14d ?? 0, sales: r.sales14d ?? 0 };
    const v = decide(k.bid || NEW_KW_BID, perf); // $4-MTD kill + ±10% bid at the 50% pivot (ad-rules.ts)
    if (v.action === "kill") { killOps.push({ keywordId: String(k.keywordId), state: "PAUSED" }); out.killed.push({ text: k.keywordText, spend: +perf.spend.toFixed(2) }); }
    else if (v.action === "bid") { const acos = perf.sales > 0 ? perf.spend / perf.sales : 0; bidOps.push({ keywordId: String(k.keywordId), bid: v.bid }); out.bids.push({ text: k.keywordText, from: k.bid, to: v.bid, acos: +(acos * 100).toFixed(0) / 100 }); }
  }

  // (2) search terms -> harvest into the SOURCE ad group (H1 fix), William's >=$4 & ACOS<=50% rule.
  // Wrapped so a harvest-report failure (timeout, 4xx) can never block the kill/bid apply above.
  let addOps: HarvestAdd[] = [];
  try {
    const stRows: SearchTermRow[] = [];
    for (const [csd, ced] of harvestWindows(HARVEST_WINDOW_DAYS, Date.now())) {
      const chunk = await report(cfg, token, "spSearchTerm", ["searchTerm"],
        ["searchTerm", "campaignId", "adGroupId", "clicks", "cost", "sales14d", "purchases14d"], csd, ced);
      for (const r of chunk) stRows.push(r as SearchTermRow);
    }
    addOps = harvestCandidates(stRows, haveByAg, NEW_KW_BID);
    for (const a of addOps) out.added.push({ text: a.keywordText, matchType: a.matchType });
  } catch (e) { out.errors.push("harvest: " + (e instanceof Error ? e.message : String(e))); }

  if (!dryRun) {
    try {
      if (killOps.length) { const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: killOps }, KW_CT); if (!r.ok) out.errors.push(`kill: ${r.status}`); }
      if (bidOps.length) { const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: bidOps }, KW_CT); if (!r.ok) out.errors.push(`bid: ${r.status}`); }
      if (addOps.length) { const r = await ads(cfg, token, "/sp/keywords", "POST", { keywords: addOps }, KW_CT); if (!r.ok) out.errors.push(`add: ${r.status}`); }
    } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); }
    // Persist every action to the decision log so the algorithm is auditable + trackable over time.
    try { await persistLog(out); } catch (e) { out.errors.push("log: " + (e instanceof Error ? e.message : String(e))); }
  }

  out.ok = true; out.durationMs = Date.now() - start;
  return out;
}

// Decision log — one row per add/cut/re-bid, queryable history of what the engine did.
async function persistLog(r: AdEngineResult): Promise<void> {
  await db().execute(`CREATE TABLE IF NOT EXISTS ad_engine_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT NOT NULL, action TEXT NOT NULL,
    keyword TEXT, match_type TEXT, from_bid REAL, to_bid REAL, acos REAL, spend REAL)`);
  const runAt = new Date().toISOString();
  const rows: Array<[string, string | null, string | null, number | null, number | null, number | null, number | null]> = [
    ...r.killed.map((k) => ["kill", k.text, null, null, null, null, k.spend] as [string, string, null, null, null, null, number]),
    ...r.added.map((a) => ["add", a.text, a.matchType, null, null, null, null] as [string, string, string, null, null, null, null]),
    ...r.bids.map((b) => ["rebid", b.text, null, b.from, b.to, b.acos, null] as [string, string, null, number, number, number, null]),
  ];
  for (const [action, kw, mt, fb, tb, acos, spend] of rows) {
    await db().execute({ sql: "INSERT INTO ad_engine_log (run_at,action,keyword,match_type,from_bid,to_bid,acos,spend) VALUES (?,?,?,?,?,?,?,?)", args: [runAt, action, kw, mt, fb, tb, acos, spend] });
  }
}

// Monthly reactivation job (ad-engine-harvest-rule.md step 4). Separate cadence from runAdEngine
// (which runs every 6h): this is invoked once a month. Lists PAUSED keywords, pulls their trailing
// 65d performance (chunked into <=31d Ads-API reports), and re-enables any that recovered to the
// >= $4 spend / ACOS <= 50% winner bar. dryRun previews without applying. Idempotent.
export async function runMonthlyReactivation(opts: { dryRun?: boolean } = {}): Promise<ReactivationResult> {
  const dryRun = opts.dryRun ?? false;
  const start = Date.now();
  const out: ReactivationResult = { ok: false, dryRun, reactivated: [], errors: [], durationMs: 0 };
  const cfg = adsConfigFromEnv();
  if (!cfg || !cfg.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }
  const token = await getAdsAccessToken(cfg);

  // paused keywords only
  const paused: Kw[] = [];
  let next: string | undefined;
  do {
    const r = await ads(cfg, token, "/sp/keywords/list", "POST", { maxResults: 1000, stateFilter: { include: ["PAUSED"] }, ...(next ? { nextToken: next } : {}) }, KW_CT);
    (r.json?.keywords ?? []).forEach((k: Kw) => { if (k.state === "PAUSED") paused.push(k); });
    next = r.json?.nextToken;
  } while (next);
  if (!paused.length) { out.ok = true; out.durationMs = Date.now() - start; return out; }

  // trailing 65d keyword performance, aggregated per keywordId across the chunked windows
  const perfById = new Map<string, { cost: number; sales: number }>();
  try {
    for (const [csd, ced] of harvestWindows(REACT_WINDOW_DAYS, Date.now())) {
      const chunk = await report(cfg, token, "spTargeting", ["targeting"], ["keywordId", "clicks", "cost", "sales14d", "purchases14d"], csd, ced);
      for (const r of chunk) {
        if (r.keywordId == null) continue;
        const id = String(r.keywordId);
        const o = perfById.get(id) ?? { cost: 0, sales: 0 };
        o.cost += r.cost ?? 0; o.sales += r.sales14d ?? 0;
        perfById.set(id, o);
      }
    }
  } catch (e) { out.errors.push("reactivation report: " + (e instanceof Error ? e.message : String(e))); out.durationMs = Date.now() - start; return out; }

  const cands = reactivationCandidates(paused, perfById);
  for (const c of cands) out.reactivated.push({ text: c.keywordText, matchType: c.matchType, cost: c.cost, acos: c.acos });

  if (!dryRun && cands.length) {
    try {
      const ops = cands.map((c) => ({ keywordId: c.keywordId, state: "ENABLED" }));
      const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: ops }, KW_CT);
      if (!r.ok) out.errors.push(`reactivate: ${r.status}`);
    } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); }
    try { await persistReactivation(out); } catch (e) { out.errors.push("log: " + (e instanceof Error ? e.message : String(e))); }
  }

  out.ok = true; out.durationMs = Date.now() - start;
  return out;
}

// Log each reactivation to the same auditable ad_engine_log (action = "reactivate").
async function persistReactivation(r: ReactivationResult): Promise<void> {
  await db().execute(`CREATE TABLE IF NOT EXISTS ad_engine_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT NOT NULL, action TEXT NOT NULL,
    keyword TEXT, match_type TEXT, from_bid REAL, to_bid REAL, acos REAL, spend REAL)`);
  const runAt = new Date().toISOString();
  for (const a of r.reactivated) {
    await db().execute({ sql: "INSERT INTO ad_engine_log (run_at,action,keyword,match_type,from_bid,to_bid,acos,spend) VALUES (?,?,?,?,?,?,?,?)", args: [runAt, "reactivate", a.text, a.matchType, null, null, a.acos, a.cost] });
  }
}

export function summarizeReactivation(r: ReactivationResult): string {
  const lines = [`Monthly reactivation ${r.dryRun ? "(preview)" : "ran"} — ${r.reactivated.length} keywords re-enabled. ${r.errors.length} errors. ${Math.round(r.durationMs / 1000)}s`, ""];
  if (r.reactivated.length) { lines.push("RE-ENABLED (paused but trailing 65d holds >=$4 spend, ACOS<=50%):"); r.reactivated.forEach((a) => lines.push(`  ${a.matchType}  ACOS ${(a.acos * 100).toFixed(0)}%  $${a.cost} spend  ${a.text}`)); lines.push(""); }
  if (r.errors.length) lines.push("ERRORS: " + r.errors.join("; "));
  return lines.join("\n");
}

export function summarizeAdEngine(r: AdEngineResult): string {
  const lines = [
    `Ad engine ${r.dryRun ? "(preview)" : "ran"} — ${r.killed.length} paused, ${r.bids.length} bid changes, ${r.added.length} keywords added. ${r.errors.length} errors. ${Math.round(r.durationMs / 1000)}s`,
    "",
  ];
  if (r.killed.length) { lines.push("PAUSED (>=$4 MTD spend, no sale or ACOS>=50%):"); r.killed.forEach((k) => lines.push(`  $${k.spend} wasted  ${k.text}`)); lines.push(""); }
  if (r.added.length) { lines.push("HARVESTED keywords (>=$4 spend, ACOS<=50%, into source ad group):"); r.added.forEach((a) => lines.push(`  ${a.matchType}  ${a.text}`)); lines.push(""); }
  if (r.bids.length) { lines.push("BID changes (±10% at the 50% ACOS pivot):"); r.bids.slice(0, 30).forEach((b) => lines.push(`  ACOS ${(b.acos * 100).toFixed(0)}%  $${b.from}->$${b.to}  ${b.text}`)); lines.push(""); }
  if (r.errors.length) lines.push("ERRORS: " + r.errors.join("; "));
  return lines.join("\n");
}
