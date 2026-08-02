import { gunzipSync } from "node:zlib";
import { adsConfigFromEnv, getAdsAccessToken, type AdsConfig } from "./ads-api";
import { db } from "@/lib/db/client";
import {
  decide, isValidKeywordText, shortenToValidKeyword, selectReintroductions,
  BID_FLOOR, REINTRO_PER_DAY, KILL_SPEND,
  type Perf, type ReintroCandidate, type ReintroState, type ReintroPick,
} from "./ad-rules";

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
// Harvest rule (.agent/ad-engine-rules-2026-08-02.md Rule 3, William 2026-08-02): a search term
// qualifies as soon as it CONVERTS — no spend bar. It is added as PHRASE + EXACT into the ad group
// it converted in, and then lives under the kill rule ($4 of rope, then off). Harvesting only after
// $4 of spend added just 3 keywords in six weeks; converting terms are the whole point.
// HARVEST_MIN_SPEND / HARVEST_MAX_ACOS remain the bar for monthly REACTIVATION of paused keywords.
export const HARVEST_MIN_SPEND = 4;          // $ spend bar for reactivating a PAUSED keyword
export const HARVEST_MAX_ACOS = 0.50;        // reactivation bar: proven ACOS <= 50% (ROAS >= 2x)
const HARVEST_WINDOW_DAYS = 60;              // trailing window (chunked into <=31d Ads-API reports)
// Monthly REACTIVATION (ad-engine-harvest-rule.md step 4, William 2026-06-26): once a month, re-enable
// any PAUSED keyword whose trailing 65 days still holds cost >= $4 AND ACOS <= 50% (ROAS >= 2x) -
// same winner bar as harvest, so a keyword the kill-switch paused but that has since recovered comes back.
export const REACT_WINDOW_DAYS = 65;
// Reintroduction history window. Amazon's Ads API retains SP report history for roughly 60-95 days;
// true lifetime figures exist only in the Campaign Manager console. 90d is the longest we can
// reliably stitch, so "lifetime" in Rule 4 means "the longest window the API will give us".
export const REINTRO_HISTORY_DAYS = 90;
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
  const agg = new Map<string, { cid: string; agid: string; term: string; cost: number; sales: number; orders: number }>();
  for (const r of rows) {
    const term = (r.searchTerm || "").trim();
    const cid = r.campaignId != null ? String(r.campaignId) : "";
    const agid = r.adGroupId != null ? String(r.adGroupId) : "";
    if (!term || !cid || !agid) continue;            // need the source ad group to harvest into
    if (/^b0[a-z0-9]{8}$/i.test(term)) continue;     // ASIN, not a customer search phrase
    const key = `${cid}|${agid}|${term.toLowerCase()}`;
    const o = agg.get(key) ?? { cid, agid, term, cost: 0, sales: 0, orders: 0 };
    o.cost += r.cost ?? 0; o.sales += r.sales14d ?? 0; o.orders += r.purchases14d ?? 0;
    agg.set(key, o);
  }
  const adds: HarvestAdd[] = [];
  for (const o of agg.values()) {
    if (!(o.orders > 0)) continue;                   // Rule 3: harvest on the FIRST conversion
    // Amazon caps keyword text at 80 chars / 10 words and rejects anything longer, so shorten an
    // over-long term to its longest valid leading root instead of retrying it forever (the live
    // 2026-08-01 loop: a 98-char, 14-word term re-submitted every run). Skip only if no root fits.
    const text = isValidKeywordText(o.term) ? o.term : shortenToValidKeyword(o.term);
    if (!text) continue;
    const t = text.toLowerCase();
    for (const mt of ["EXACT", "PHRASE"] as const) {
      if (existing.has(`${o.agid}|${mt}|${t}`)) continue;
      adds.push({ campaignId: o.cid, adGroupId: o.agid, keywordText: text, matchType: mt, state: "ENABLED", bid });
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
    // Track whether Amazon ACCEPTED each batch. The log records outcomes, not intentions: before
    // this, a rejected add was still written as "add", which is how a 98-char keyword appeared in
    // ad_engine_log 8 times while never existing in the account (2026-08-01 loop).
    const applied = { kill: killOps.length === 0, bid: bidOps.length === 0, add: addOps.length === 0 };
    try {
      if (killOps.length) { const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: killOps }, KW_CT); applied.kill = r.ok; if (!r.ok) out.errors.push(`kill: ${r.status}`); }
      if (bidOps.length) { const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: bidOps }, KW_CT); applied.bid = r.ok; if (!r.ok) out.errors.push(`bid: ${r.status}`); }
      if (addOps.length) { const r = await ads(cfg, token, "/sp/keywords", "POST", { keywords: addOps }, KW_CT); applied.add = r.ok; if (!r.ok) out.errors.push(`add: ${r.status}`); }
    } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); }
    // Persist every action to the decision log so the algorithm is auditable + trackable over time.
    try { await persistLog(out, applied); } catch (e) { out.errors.push("log: " + (e instanceof Error ? e.message : String(e))); }
  }

  out.ok = true; out.durationMs = Date.now() - start;
  return out;
}

// Decision log — one row per add/cut/re-bid, queryable history of what the engine did.
// Two guarantees (rules doc Rules 3 + 5):
//   1. `applied` records whether Amazon ACCEPTED the change. A rejected batch is logged with
//      applied=0 rather than silently recorded as done.
//   2. Every live run writes a `run` heartbeat row even when it took no action, so "did the $4
//      cutoff actually run?" is answerable. Without it, a run that did nothing is indistinguishable
//      from a cron that never fired — which is why 12:00 UTC has never appeared in the log.
async function persistLog(r: AdEngineResult, applied: { kill: boolean; bid: boolean; add: boolean }): Promise<void> {
  await db().execute(`CREATE TABLE IF NOT EXISTS ad_engine_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT NOT NULL, action TEXT NOT NULL,
    keyword TEXT, match_type TEXT, from_bid REAL, to_bid REAL, acos REAL, spend REAL)`);
  // Additive migration; ignore "duplicate column name" on re-run.
  await db().execute("ALTER TABLE ad_engine_log ADD COLUMN applied INTEGER DEFAULT 1").catch(() => {});
  const runAt = new Date().toISOString();
  const ins = async (action: string, kw: string | null, mt: string | null, fb: number | null, tb: number | null, acos: number | null, spend: number | null, ok: boolean) =>
    db().execute({
      sql: "INSERT INTO ad_engine_log (run_at,action,keyword,match_type,from_bid,to_bid,acos,spend,applied) VALUES (?,?,?,?,?,?,?,?,?)",
      args: [runAt, action, kw, mt, fb, tb, acos, spend, ok ? 1 : 0],
    });
  // Heartbeat first, so it lands even if a later insert fails.
  await ins("run", null, null, null, null, null, null, r.errors.length === 0);
  for (const k of r.killed) await ins("kill", k.text, null, null, null, null, k.spend, applied.kill);
  for (const a of r.added) await ins("add", a.text, a.matchType, null, null, null, null, applied.add);
  for (const b of r.bids) await ins("rebid", b.text, null, b.from, b.to, b.acos, null, applied.bid);
}

// ---------------------------------------------------------------------------
// Rule 4 — REINTRODUCTION of keywords stuck at the $0.10 floor
// ---------------------------------------------------------------------------
// 1,840 of 2,275 enabled keywords bid exactly $0.10 while July CPC was $0.59, so they win nothing
// and can never generate the ACOS signal any bid rule needs. This job walks them back on, at most
// REINTRO_PER_DAY a day, and only when they never spent or spent at ACOS < 50%.
//
// Every promoted keyword is recorded in `ad_reintro_cohort` so the three throttles can be measured
// from reality on each run rather than trusted from a cache:
//   perDay — promoted today. By William's choice (2026-08-02) this is the ONLY gate: no total
//            spend cap, and no ceiling on how many unproven keywords are in flight at once.
// Unproven-in-flight count and cohort month-to-date spend are both still measured and reported
// every run so the ramp stays visible, they just do not block a promotion.
// A promoted keyword then lives under Rule 1 like everything else: $4 of rope, then off. It leaves
// the trial pool by converting (proven) or by being killed at $4 (dead), so winners and losers both
// free their slot and the only bounded quantity is money at risk on UNPROVEN keywords right now.

export interface ReintroRunResult {
  ok: boolean; dryRun: boolean;
  promoted: ReintroPick[];
  eligible: number;
  blockedBy: string[];
  state: ReintroState;
  errors: string[]; durationMs: number; reason?: string;
}

async function reintroCohort(): Promise<{ ids: Set<string>; today: number }> {
  await db().execute(`CREATE TABLE IF NOT EXISTS ad_reintro_cohort (
    keyword_id TEXT PRIMARY KEY, keyword_text TEXT, match_type TEXT,
    promoted_at TEXT NOT NULL, from_bid REAL, to_bid REAL, reason TEXT)`);
  const r = await db().execute("SELECT keyword_id, promoted_at FROM ad_reintro_cohort");
  const todayIso = new Date().toISOString().slice(0, 10);
  const ids = new Set<string>();
  let today = 0;
  for (const row of r.rows as unknown as { keyword_id: string; promoted_at: string }[]) {
    ids.add(String(row.keyword_id));
    if (String(row.promoted_at).slice(0, 10) === todayIso) today++;
  }
  return { ids, today };
}

/** Bring floored keywords back, throttled. dryRun previews the exact batch without applying. */
export async function runReintroduction(opts: { dryRun?: boolean } = {}): Promise<ReintroRunResult> {
  const dryRun = opts.dryRun ?? true;   // preview by default — this switches on live spend
  const start = Date.now();
  const out: ReintroRunResult = {
    ok: false, dryRun, promoted: [], eligible: 0, blockedBy: [],
    state: { introducedToday: 0, inTrial: 0, cohortMonthSpend: 0 }, errors: [], durationMs: 0,
  };
  const cfg = adsConfigFromEnv();
  if (!cfg || !cfg.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }
  const token = await getAdsAccessToken(cfg);

  try {
    // (1) every ENABLED keyword sitting AT the floor
    const kws: Kw[] = [];
    let next: string | undefined;
    do {
      const r = await ads(cfg, token, "/sp/keywords/list", "POST", { maxResults: 1000, stateFilter: { include: ["ENABLED"] }, ...(next ? { nextToken: next } : {}) }, KW_CT);
      (r.json?.keywords ?? []).forEach((k: Kw) => { if (k.state === "ENABLED" && (k.bid ?? 0) <= BID_FLOOR) kws.push(k); });
      next = r.json?.nextToken;
    } while (next);

    // (2) longest history the API allows, stitched from <=31d chunks
    const hist = new Map<string, { cost: number; sales: number; orders: number }>();
    for (const [csd, ced] of harvestWindows(REINTRO_HISTORY_DAYS, Date.now())) {
      const chunk = await report(cfg, token, "spTargeting", ["targeting"], ["keywordId", "keyword", "clicks", "cost", "sales14d", "purchases14d"], csd, ced);
      for (const r of chunk) {
        const id = String(r.keywordId ?? "");
        if (!id) continue;
        const o = hist.get(id) ?? { cost: 0, sales: 0, orders: 0 };
        o.cost += r.cost ?? 0; o.sales += r.sales14d ?? 0; o.orders += r.purchases14d ?? 0;
        hist.set(id, o);
      }
    }

    // (3) month-to-date spend, used for the cohort cap and the in-trial count
    const now = new Date();
    const mtd = new Map<string, { cost: number; orders: number }>();
    for (const r of await report(cfg, token, "spTargeting", ["targeting"], ["keywordId", "keyword", "clicks", "cost", "sales14d", "purchases14d"],
      iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), iso(now))) {
      const id = String(r.keywordId ?? "");
      if (id) mtd.set(id, { cost: r.cost ?? 0, orders: r.purchases14d ?? 0 });
    }

    // (4) measure the throttle state from reality
    const { ids: cohort, today } = await reintroCohort();
    let cohortMonthSpend = 0, inTrial = 0;
    for (const id of cohort) {
      const m = mtd.get(id);
      if (!m) { inTrial++; continue; }                       // promoted, no spend yet -> still on trial
      cohortMonthSpend += m.cost;
      if (m.cost < KILL_SPEND && m.orders === 0) inTrial++;  // rope not yet used up
    }
    out.state = { introducedToday: today, inTrial, cohortMonthSpend: +cohortMonthSpend.toFixed(2) };

    // (5) decide
    const candidates: ReintroCandidate[] = kws
      .filter((k) => !cohort.has(String(k.keywordId)))       // never re-promote the same keyword
      .map((k) => {
        const h = hist.get(String(k.keywordId));
        return {
          keywordId: String(k.keywordId), keywordText: k.keywordText, matchType: k.matchType,
          bid: k.bid ?? 0, histSpend: h?.cost ?? 0, histSales: h?.sales ?? 0, histOrders: h?.orders ?? 0,
        };
      });
    const plan = selectReintroductions(candidates, out.state);
    out.promoted = plan.promote;
    out.eligible = plan.eligible;
    out.blockedBy = plan.blockedBy;

    // (6) apply
    if (!dryRun && plan.promote.length) {
      const ops = plan.promote.map((p) => ({ keywordId: p.keywordId, bid: p.toBid }));
      const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: ops }, KW_CT);
      if (!r.ok) { out.errors.push(`reintro: ${r.status}`); out.promoted = []; }
      else {
        const at = new Date().toISOString();
        for (const p of plan.promote) {
          await db().execute({
            sql: "INSERT OR IGNORE INTO ad_reintro_cohort (keyword_id,keyword_text,match_type,promoted_at,from_bid,to_bid,reason) VALUES (?,?,?,?,?,?,?)",
            args: [p.keywordId, p.keywordText, p.matchType, at, p.fromBid, p.toBid, p.reason],
          });
        }
      }
    }
    out.ok = true;
  } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); }
  out.durationMs = Date.now() - start;
  return out;
}

export function summarizeReintroduction(r: ReintroRunResult): string {
  const lines = [
    `Reintroduction ${r.dryRun ? "(preview)" : "ran"} — ${r.promoted.length} promoted of ${r.eligible} eligible. ${r.errors.length} errors. ${Math.round(r.durationMs / 1000)}s`,
    `Gate: ${r.state.introducedToday}/${REINTRO_PER_DAY} promoted today. Reported only: ${r.state.inTrial} unproven in flight (~$${(r.state.inTrial * KILL_SPEND).toFixed(2)} at risk), cohort spend MTD $${r.state.cohortMonthSpend}.`,
    r.blockedBy.length ? `Stopped by: ${r.blockedBy.join(", ")}.` : "",
    "",
  ];
  r.promoted.forEach((p) => lines.push(`  ${p.reason.toUpperCase().padEnd(8)} $${p.fromBid} -> $${p.toBid}  [${p.matchType}] ${p.keywordText}`));
  if (r.errors.length) lines.push("ERRORS: " + r.errors.join("; "));
  return lines.join("\n");
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
