import { adsConfigFromEnv, getAdsAccessToken, type AdsConfig } from "./ads-api";
import { db } from "@/lib/db/client";
import { recordBidRun, type LedgerObservation } from "./bid-ledger";
import { approvedCeilings, unaskedGates, markAsked, formatGateAsk } from "./bid-gate";
import { getReport, type ReportSpec } from "./ads-reports";
import {
  decide, shouldKill, isValidKeywordText, shortenToValidKeyword, selectReintroductions, deadKey, isProtected,
  bidWithMemory, BID_COOLDOWN_HOURS, BID_CONFIRM_CEILING, activeCeiling, nextGate,
  type BidChange, type SinceChange,
  ladderVerdict, BID_LADDER_MAX, BID_LADDER_STEP,
  BID_FLOOR, REINTRO_PER_DAY, KILL_SPEND,
  lifetimeOnlyPool,
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
// Return bar for HARVESTING a new keyword out of a search term (William 2026-08-07). Break-even is
// 1.92x from real fees ($9.49 price, $0.62 COGS, $1.42 referral, $2.52 FBA), so 2x is the first
// rung that actually makes money rather than merely converting.
export const HARVEST_MIN_ROAS = 2;
// Monthly reset bars for bringing a PAUSED keyword back on LIFETIME evidence. Break-even is 1.92x;
// the 2-order floor exists because a 79x return built on one order and $0.25 of spend is noise.
export const REACTIVATE_MIN_ROAS = 1.92;
export const REACTIVATE_MIN_ORDERS = 2;
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
interface Row { keywordId?: string; keyword?: string; searchTerm?: string; matchType?: string; clicks?: number; impressions?: number; cost?: number; sales14d?: number; purchases14d?: number; campaignId?: string | number; adGroupId?: string | number }
export interface SearchTermRow {
  searchTerm?: string; campaignId?: string | number; adGroupId?: string | number;
  cost?: number; sales14d?: number; purchases14d?: number;
  /** The keyword that matched this search term. */
  keyword?: string;
  /** BROAD | PHRASE | EXACT, or TARGETING_EXPRESSION* for auto campaigns. */
  matchType?: string;
}
export interface HarvestAdd { campaignId: string; adGroupId: string; keywordText: string; matchType: "EXACT" | "PHRASE"; state: "ENABLED"; bid: number }
/** `via` records WHICH route brought a keyword back: recent recovery, or its lifetime record. */
export interface ReactivationCandidate { keywordId: string; keywordText: string; matchType: string; cost: number; acos: number; via: "window" | "lifetime" }
export interface ReactivationResult {
  ok: boolean; dryRun: boolean;
  reactivated: { text: string; matchType: string; cost: number; acos: number; via: "window" | "lifetime" }[];
  notes: string[];
  errors: string[]; durationMs: number; reason?: string;
}
export interface AdEngineResult {
  ok: boolean; dryRun: boolean;
  killed: { text: string; spend: number; matchType: string; keywordId: string; applied?: boolean }[];
  bids: {
    text: string; from: number; to: number; acos: number; reason?: string; keywordId?: string;
    roasBefore?: number | null;
    /** what THIS bid level produced, carried into kw_bid_history as the next run's baseline */
    impressionsBefore?: number; clicksBefore?: number; salesBefore?: number; windowHours?: number;
  }[];
  /** Wanted a raise past the $0.85 ceiling and stopped. William confirms these by hand. */
  needsConfirm: { text: string; matchType: string; keywordId: string; bid: number; wouldBe: number; roas: number | null }[];
  /** Killed earlier this month, then vindicated by late attribution and switched back on. */
  revived: { text: string; matchType: string; keywordId: string; roas: number; spend: number; sales: number; applied?: boolean }[];
  added: { text: string; matchType: string }[];
  /** Report-readiness lines. A pass with data still queued is normal, so it is a note, not an error. */
  notes: string[];
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


// Deferred report accessor. Wraps ads-reports.getReport so an engine pass NEVER blocks on Amazon's
// queue (measured ~9 min on this account against the old 140s inline budget). Returns [] plus a
// human-readable note when the data is not ready yet — that is a normal outcome, not an error.
const SP_COLS = ["keywordId", "keyword", "clicks", "impressions", "cost", "sales14d", "purchases14d"];
// `keyword` and `matchType` added 2026-08-08: without them a search term cannot be attributed to
// the keyword that caught it, so "terms that hit on broad match" was not expressible. Probed live
// first — Amazon accepts both on spSearchTerm and returns them populated on every row.
const ST_COLS = ["searchTerm", "keyword", "matchType", "campaignId", "adGroupId", "clicks", "cost", "sales14d", "purchases14d"];

/** The ONE place a Sponsored Products report spec is built. Everything that needs a spec goes
 *  through here, so the warm-up job and the engine cannot drift into different cache keys — a
 *  mismatch of one column name would silently request a second report instead of reusing the
 *  warmed one, which is exactly the failure this indirection exists to prevent. */
export function spSpec(
  purpose: string, reportTypeId: string, groupBy: string[], columns: string[], sd: string, ed: string,
): ReportSpec {
  return { purpose, adProduct: "SPONSORED_PRODUCTS", reportTypeId, groupBy, columns, startDate: sd, endDate: ed };
}

/**
 * Every report the Sponsored Products engines will ask for on a run starting at `nowMs`.
 *
 * Amazon takes 9-15 minutes to build a report, so an engine that requests and acts in the same run
 * can never act on that run — it exits, and the next run six hours later collects. That is why a
 * keyword change could sit six hours behind the data. The warm-up cron calls getReport() on each of
 * these ~20 minutes ahead of the engines, so by the time an engine runs, every report it needs is
 * already COMPLETED and it acts immediately on ~20-minute-old data instead of ~6-hour-old data.
 */
export function spReportSpecs(nowMs = Date.now()): ReportSpec[] {
  const now = new Date(nowMs);
  const ed = iso(now), sd = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const specs: ReportSpec[] = [spSpec("engine-mtd", "spTargeting", ["targeting"], SP_COLS, sd, ed)];
  const hw = harvestWindows(HARVEST_WINDOW_DAYS, nowMs);
  hw.forEach(([a, b], i) => specs.push(spSpec(`engine-harvest-${i}`, "spSearchTerm", ["searchTerm"], ST_COLS, a, b)));
  const rw = harvestWindows(REINTRO_HISTORY_DAYS, nowMs);
  rw.forEach(([a, b], i) => specs.push(spSpec(`reintro-history-${i}`, "spTargeting", ["targeting"], SP_COLS, a, b)));
  specs.push(spSpec("reintro-mtd", "spTargeting", ["targeting"], SP_COLS, sd, ed));
  return specs;
}

async function deferredRows(
  cfg: AdsConfig, token: string, notes: string[],
  purpose: string, reportTypeId: string, groupBy: string[], columns: string[], sd: string, ed: string,
): Promise<{ rows: Row[]; ready: boolean }> {
  const spec: ReportSpec = spSpec(purpose, reportTypeId, groupBy, columns, sd, ed);
  const r = await getReport<Row>(cfg, token, spec);
  if (r.state === "ready") { notes.push(`${purpose}: ready (${r.rows.length} rows, ${r.ageHours}h old)`); return { rows: r.rows, ready: true }; }
  if (r.state === "failed") { notes.push(`${purpose}: FAILED — ${r.reason}`); return { rows: [], ready: false }; }
  notes.push(`${purpose}: ${r.state}, collect on a later run`);
  return { rows: [], ready: false };
}

// Per-item outcome of a Sponsored Products bulk write.
//
// Amazon answers /sp/keywords with HTTP 207 and a body that splits the batch:
//   { keywords: { success: [{index, keywordId}], error: [{index, errors:[{errorType, errorValue}]}] } }
// 207 is inside the 2xx range, so `res.ok` is TRUE even when EVERY item failed. That is the bug
// behind `applied=1` on a keyword Amazon refused 40 times in a row: the log recorded that we asked,
// not that it happened. Proved live 2026-08-07 by submitting one valid id and one invalid one — the
// response carried both a success and an error under a single ok status.
export interface BulkOutcome {
  succeededIdx: Set<number>;
  failed: { index: number; reason: string; message: string }[];
}
export function parseBulkOutcome(json: unknown, opCount: number): BulkOutcome {
  const out: BulkOutcome = { succeededIdx: new Set(), failed: [] };
  const node = (json as { keywords?: { success?: unknown[]; error?: unknown[] } } | null)?.keywords;
  if (!node || (!node.success && !node.error)) {
    // Unrecognised body: claim nothing. Silence must read as failure, never as success.
    return out;
  }
  for (const s of node.success ?? []) {
    const i = (s as { index?: number }).index;
    if (typeof i === "number") out.succeededIdx.add(i);
  }
  for (const e of node.error ?? []) {
    const row = e as { index?: number; errors?: { errorType?: string; errorValue?: Record<string, { reason?: string; message?: string }> }[] };
    const first = row.errors?.[0];
    const detail = first?.errorValue ? Object.values(first.errorValue)[0] : undefined;
    out.failed.push({
      index: typeof row.index === "number" ? row.index : -1,
      reason: detail?.reason ?? first?.errorType ?? "UNKNOWN",
      message: detail?.message ?? "",
    });
  }
  // An item Amazon mentioned in neither list did not succeed, so it is never counted as applied.
  void opCount;
  return out;
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
// applies William's rule: the term must have CONVERTED and must return at least HARVEST_MIN_ROAS.
// There is deliberately no minimum spend — a term that converted on 42 cents is the cheapest
// evidence in the account — but there IS a return bar, which is what was missing until 2026-08-07.
// Each qualifying term is harvested as EXACT + PHRASE INTO THE AD GROUP IT CONVERTED IN, skipping any
// (adGroup, matchType, text) already present. `existing` keys are `${adGroupId}|${matchType}|${lowerText}`.
export function harvestCandidates(
  rows: SearchTermRow[], existing: Set<string>, bid = NEW_KW_BID,
  opts: { discoveryMatchTypes?: string[] } = {},
): HarvestAdd[] {
  // ONLY BROAD DISCOVERIES ARE HARVESTED (William 2026-08-08): "only way to add new phrase and
  // exact is if they perform as search terms for broad keywords".
  //
  // Broad is the only match type that surfaces phrasings nobody put in a keyword list, so it is the
  // only one where promoting a term to EXACT + PHRASE creates something that did not exist. A term
  // found by a PHRASE keyword promoted to PHRASE is just a copy of itself.
  //
  // Auto campaigns report as TARGETING_EXPRESSION / TARGETING_EXPRESSION_PREDEFINED with the keyword
  // text "loose-match", NOT as BROAD, so they are excluded by this list as written. That is the
  // literal reading of William's rule and it is left as a parameter rather than hard-coded, because
  // auto is the other half of the industry's discovery tier and is a live open question.
  const discovery = new Set((opts.discoveryMatchTypes ?? ["BROAD"]).map((m) => m.toUpperCase()));
  const agg = new Map<string, { cid: string; agid: string; term: string; cost: number; sales: number; orders: number }>();
  for (const r of rows) {
    const term = (r.searchTerm || "").trim();
    const cid = r.campaignId != null ? String(r.campaignId) : "";
    const agid = r.adGroupId != null ? String(r.adGroupId) : "";
    if (!term || !cid || !agid) continue;            // need the source ad group to harvest into
    if (/^b0[a-z0-9]{8}$/i.test(term)) continue;     // ASIN, not a customer search phrase
    // A row with no match type predates the column and cannot be shown to be a broad discovery, so
    // it is skipped. Silence must not read as eligibility.
    if (!discovery.has(String(r.matchType || "").toUpperCase())) continue;
    const key = `${cid}|${agid}|${term.toLowerCase()}`;
    const o = agg.get(key) ?? { cid, agid, term, cost: 0, sales: 0, orders: 0 };
    o.cost += r.cost ?? 0; o.sales += r.sales14d ?? 0; o.orders += r.purchases14d ?? 0;
    agg.set(key, o);
  }
  const adds: HarvestAdd[] = [];
  for (const o of agg.values()) {
    if (!(o.orders > 0)) continue;                   // must have converted at all
    // William 2026-08-07: "need to be adding search terms or words that have better than a 2 roas".
    // Until now the gate was the FIRST conversion alone, with no return bar at all, so a term that
    // converted once at 500% ACOS earned two keywords and then $4 of rope before the kill rule could
    // reach it. Break-even on this product is 1.92x, so a 2x bar is the first rung that makes money.
    if (!(o.sales >= HARVEST_MIN_ROAS * o.cost)) continue;
    // Amazon caps keyword text at 80 chars / 10 words and rejects anything longer, so shorten an
    // over-long term to its longest valid leading root instead of retrying it forever (the live
    // 2026-08-01 loop: a 98-char, 14-word term re-submitted every run). Skip only if no root fits.
    // Normalise first, then validate. A term Amazon will not take must never be submitted twice:
    // "…tether – durable clip-on leash for" was resubmitted 40 times, logged applied=1 every run.
    const text = isValidKeywordText(o.term) ? o.term : shortenToValidKeyword(o.term);
    if (!text || !isValidKeywordText(text)) continue;   // belt and braces: never emit an invalid op
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
  lifetimeByWord?: Map<string, { roas: number; spend: number; sales: number; orders: number }>,
  opts: { minRoas?: number; minOrders?: number } = {},
): ReactivationCandidate[] {
  const minRoas = opts.minRoas ?? REACTIVATE_MIN_ROAS;
  const minOrders = opts.minOrders ?? REACTIVATE_MIN_ORDERS;
  const out: ReactivationCandidate[] = [];
  for (const k of paused) {
    if (k.state !== "PAUSED") continue;                         // never touch an already-ENABLED keyword

    // ROUTE A — recent recovery. Trailing window shows >= $4 spend at ACOS <= 50%.
    const p = perfById.get(String(k.keywordId));
    if (p && p.cost >= HARVEST_MIN_SPEND && p.sales > 0 && p.cost / p.sales <= HARVEST_MAX_ACOS) {
      out.push({ keywordId: String(k.keywordId), keywordText: k.keywordText, matchType: k.matchType,
                 cost: +p.cost.toFixed(2), acos: +(p.cost / p.sales).toFixed(4), via: "window" });
      continue;
    }

    // ROUTE B — LIFETIME record (William 2026-08-07: "if the words converted in past we refresh at
    // the start of the new month").
    //
    // Route A alone is a catch-22 and always was: a PAUSED keyword does not spend, so it cannot
    // accumulate trailing-window evidence, so it can never prove it recovered. Anything paused for
    // longer than the window is stranded for good. Measured 2026-08-07: 106 Sponsored Products
    // words clear 1.92x lifetime on 2+ orders, holding $27,764 of lifetime sales, and route A finds
    // essentially none of them. That is the same mechanism that left 151 winners switched off.
    const lt = lifetimeByWord?.get(deadKey(k.keywordText, k.matchType));
    if (lt && lt.orders >= minOrders && lt.roas >= minRoas) {
      out.push({ keywordId: String(k.keywordId), keywordText: k.keywordText, matchType: k.matchType,
                 cost: +lt.spend.toFixed(2), acos: +(1 / lt.roas).toFixed(4), via: "lifetime" });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE $4 KILL, as a pure function (William 2026-08-08: "should not be pausing all key words when
// only 1 spends")
// ---------------------------------------------------------------------------
// This was always per-keyword-id, but only Sponsored Brands and Sponsored Display had a test
// saying so, so the claim rested on reading the loop. Now it is pinned like the other two.
//
// The unit of judgement is the KEYWORD ID, never the text. 541 groups on this account hold more
// than one copy of the same (text, match type); each copy is a separate row with its own bid, its
// own spend and its own verdict. A word can be paused in one campaign and running in another, and
// that is correct, not a bug to be tidied up.

/** One keyword the $4 rule would pause, identified by id. */
export interface KillPick { keywordId: string; text: string; matchType: string; spend: number }

export function killPlan(
  rows: { keywordId?: string | number | null; cost?: number; purchases14d?: number; sales14d?: number }[],
  byId: Map<string, { keywordText: string; matchType: string; state: string; bid?: number | null }>,
  newKwBid = NEW_KW_BID,
): KillPick[] {
  const out: KillPick[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.keywordId == null) continue;
    const id = String(r.keywordId);
    if (seen.has(id)) continue;                              // one verdict per id, whatever the report repeats
    const k = byId.get(id);
    if (!k || k.state !== "ENABLED") continue;               // already off, or gone from the account
    const perf: Perf = { spend: r.cost ?? 0, orders: r.purchases14d ?? 0, sales: r.sales14d ?? 0 };
    if (decide(k.bid || newKwBid, perf).action !== "kill") continue;
    seen.add(id);
    out.push({ keywordId: id, text: k.keywordText, matchType: k.matchType, spend: +perf.spend.toFixed(2) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// IN-MONTH REVIVAL after attribution (William 2026-08-08)
// ---------------------------------------------------------------------------
// "if a word is turned off and the 14 day attribution kicks in for sales dont turn it back on that
// month until that word reaches a 2.0 roas", and "turn it back on the moment the attribtion credits
// it above a 2.0".
//
// The problem this fixes, measured on the live account 2026-08-08. Amazon credits a sale to the
// click that caused it, up to 14 days later. The $4 kill reads month-to-date on the day it runs, so
// a keyword whose sale has not landed yet reads as zero orders and gets paused. Both kills the
// engine has made this month turned out to have converted:
//
//   phone tether PHRASE                       killed as "$5.55, 0 orders"  -> $7.55 -> $9.49,  1 order
//   hand strap universal phone lanyard...     killed as "$6.95, 0 orders"  -> $13.61 -> $16.49, 1 order
//
// Until now the only way back was the monthly reset on the 1st, so a word that proved itself on the
// 3rd sat dark for four weeks. This re-checks every 6h and switches it back on as soon as the credit
// lands.
//
// NO FLAPPING, by arithmetic rather than by a cooldown. shouldKill() pauses below the 52% ACOS pivot,
// which is 1.923x; revival needs 2.0x. Nothing sits in both windows, so a keyword cannot be killed
// and revived by the same data. The 1.923x-2.0x band is deliberately dead space.
export const REVIVE_MIN_ROAS = 2.0;

/** One keyword the $4 kill paused, with the month it happened in. */
export interface KillLedgerRow { keywordId: string; word: string; matchType: string; month: string }
export interface RevivalPick { keywordId: string; word: string; matchType: string; roas: number; spend: number; sales: number }

/**
 * Which of this month's killed keywords attribution has now vindicated.
 *
 * Deliberately narrow. It considers ONLY keywords this engine killed in the CURRENT month, so it
 * can never resurrect a word paused by hand, paused in an earlier month, or retired for good. And
 * it re-enables only what is still PAUSED on the account right now: if William turned something
 * back on himself, the engine leaves it alone rather than writing over his decision.
 */
export function inMonthRevivals(
  ledger: KillLedgerRow[],
  liveById: Map<string, { state: string }>,
  mtdById: Map<string, { spend: number; sales: number; orders: number }>,
  month: string,
  minRoas = REVIVE_MIN_ROAS,
): RevivalPick[] {
  const out: RevivalPick[] = [];
  const seen = new Set<string>();
  for (const row of ledger) {
    if (row.month !== month) continue;                     // this month's kills only
    const id = String(row.keywordId);
    if (seen.has(id)) continue;
    const live = liveById.get(id);
    if (!live || live.state !== "PAUSED") continue;        // gone, archived, or already back on
    const p = mtdById.get(id);
    if (!p || p.spend <= 0 || p.orders <= 0 || p.sales <= 0) continue;
    const roas = p.sales / p.spend;
    if (roas < minRoas) continue;                          // not vindicated yet, keep waiting
    seen.add(id);
    out.push({ keywordId: id, word: row.word, matchType: row.matchType,
               roas: +roas.toFixed(2), spend: +p.spend.toFixed(2), sales: +p.sales.toFixed(2) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bid memory storage (William 2026-08-07).
//
// `kw_bid_history` is what the engine did. `kw_perf_snapshot` is what the account looked like when
// it did it. Together they answer the only question that matters about a bid change: did it work?
//
// The snapshot stores MONTH-TO-DATE totals because that is what the report returns. Performance
// SINCE a change is therefore (MTD now - MTD at the change), which is exact inside a month. A
// change made in an earlier month has already had its month reset, so everything on the clock now
// is "since" by definition.
// ---------------------------------------------------------------------------
async function ensureBidMemory(): Promise<void> {
  await db().execute(`CREATE TABLE IF NOT EXISTS kw_bid_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, keyword_id TEXT NOT NULL, changed_at TEXT NOT NULL,
    from_bid REAL NOT NULL, to_bid REAL NOT NULL, roas_before REAL, reason TEXT, ad_product TEXT)`);
  // What the PREVIOUS bid level produced, so the next run can tell a good move from a bad one
  // (William 2026-08-10: "Less impressions less sales then we start to go the other way").
  // Added to an existing table, so each column is added separately and only a genuine
  // "duplicate column" is swallowed.
  for (const col of ["imp_before INTEGER", "clicks_before INTEGER", "sales_before REAL", "window_hours REAL"]) {
    try { await db().execute(`ALTER TABLE kw_bid_history ADD COLUMN ${col}`); }
    catch (e) { if (!/duplicate column/i.test(String(e))) throw e; }
  }
  await db().execute(`CREATE INDEX IF NOT EXISTS kw_bid_history_kw ON kw_bid_history (keyword_id, changed_at DESC)`);
  await db().execute(`CREATE TABLE IF NOT EXISTS kw_perf_snapshot (
    taken_at TEXT NOT NULL, keyword_id TEXT NOT NULL, month TEXT NOT NULL,
    mtd_spend REAL DEFAULT 0, mtd_sales REAL DEFAULT 0, mtd_orders INTEGER DEFAULT 0, mtd_clicks INTEGER DEFAULT 0,
    mtd_impressions INTEGER DEFAULT 0,
    PRIMARY KEY (taken_at, keyword_id))`);
  // Added 2026-08-10 with the direction reversal. Existing databases predate the column, and a
  // missing one would make every keyword read as zero impressions and get RAISED — the opposite of
  // the intended behaviour — so it is added explicitly and the failure is swallowed only when the
  // column is already there.
  try { await db().execute(`ALTER TABLE kw_perf_snapshot ADD COLUMN mtd_impressions INTEGER DEFAULT 0`); }
  catch (e) { if (!/duplicate column/i.test(String(e))) throw e; }
  await db().execute(`CREATE INDEX IF NOT EXISTS kw_perf_snapshot_kw ON kw_perf_snapshot (keyword_id, taken_at DESC)`);
  // THE FOUND FLOOR (William 2026-08-10). When a cut silences a keyword, the engine puts the bid
  // back and writes the restored bid here. From then on the search will not cut at or below it.
  // Without this the word would be re-cut every run and flap two cents forever, and with every
  // path in the new rule pointing DOWN this table is the only thing that stops a working keyword
  // walking to the $0.10 floor where 1,750 others are already stuck.
  await db().execute(`CREATE TABLE IF NOT EXISTS kw_bid_floor (
    keyword_id TEXT NOT NULL, month TEXT NOT NULL, bid REAL NOT NULL, found_at TEXT NOT NULL,
    PRIMARY KEY (keyword_id, month))`);
}

/** The proven floors for this month, keyed by keyword id. */
async function foundFloors(month: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const r = await db().execute({ sql: "SELECT keyword_id, bid FROM kw_bid_floor WHERE month = ?", args: [month] });
    for (const row of r.rows) out.set(String(row.keyword_id), Number(row.bid));
  } catch { /* table is created above; an empty map just means no floors are known yet */ }
  return out;
}

/** Remember the bid a keyword was restored to. Keeps the HIGHEST floor found in the month. */
async function recordFloor(keywordId: string, month: string, bid: number): Promise<void> {
  await db().execute({
    sql: `INSERT INTO kw_bid_floor (keyword_id, month, bid, found_at) VALUES (?,?,?,?)
          ON CONFLICT(keyword_id, month) DO UPDATE SET bid = max(bid, excluded.bid), found_at = excluded.found_at`,
    args: [keywordId, month, bid, new Date().toISOString()],
  });
}

/**
 * The kill ledger. A row per keyword the $4 rule paused, so the revival check knows exactly which
 * words are ITS to reconsider. ad_engine_log cannot do this job: it records kills by text with a
 * null match type and no keyword id, and three copies of one word share that text.
 */
async function ensureKillLedger(): Promise<void> {
  await db().execute(`CREATE TABLE IF NOT EXISTS kw_kill_ledger (
    keyword_id TEXT NOT NULL, month TEXT NOT NULL, word TEXT, match_type TEXT,
    killed_at TEXT NOT NULL, kill_spend REAL, revived_at TEXT, revive_roas REAL,
    PRIMARY KEY (keyword_id, month))`);
}

/** Record kills Amazon ACCEPTED. A refused kill left the keyword running, so it is not ours to revive. */
async function recordKills(killed: AdEngineResult["killed"], month: string): Promise<void> {
  const at = new Date().toISOString();
  for (const k of killed) {
    if (k.applied === false) continue;
    // ON CONFLICT DO NOTHING: a keyword killed, revived, then killed again inside one month keeps
    // its FIRST kill row. Overwriting would clear revived_at and let it be revived twice off one
    // sale, which is the loop this whole rule is meant to avoid.
    await db().execute({
      sql: `INSERT INTO kw_kill_ledger (keyword_id, month, word, match_type, killed_at, kill_spend)
            VALUES (?,?,?,?,?,?) ON CONFLICT(keyword_id, month) DO NOTHING`,
      args: [String(k.keywordId), month, k.text, k.matchType, at, k.spend],
    });
  }
}

/** This month's kills that have not been revived yet. */
async function openKills(month: string): Promise<KillLedgerRow[]> {
  const r = await db().execute({
    sql: "SELECT keyword_id, word, match_type, month FROM kw_kill_ledger WHERE month = ? AND revived_at IS NULL",
    args: [month],
  });
  return r.rows.map((row) => ({
    keywordId: String(row.keyword_id), word: String(row.word ?? ""),
    matchType: String(row.match_type ?? ""), month: String(row.month),
  }));
}

/** The most recent bid change per keyword. */
async function lastBidChanges(): Promise<Map<string, BidChange>> {
  const out = new Map<string, BidChange>();
  try {
    const r = await db().execute(`SELECT keyword_id, changed_at, from_bid, to_bid, roas_before,
             imp_before, clicks_before, sales_before, window_hours FROM kw_bid_history
      WHERE id IN (SELECT MAX(id) FROM kw_bid_history GROUP BY keyword_id)`);
    for (const row of r.rows) {
      out.set(String(row.keyword_id), {
        changedAt: String(row.changed_at), fromBid: Number(row.from_bid), toBid: Number(row.to_bid),
        roasBefore: row.roas_before == null ? null : Number(row.roas_before),
        // Left undefined on pre-2026-08-10 rows on purpose. searchStep will not turn a keyword
        // round on a baseline it does not actually have.
        impressionsBefore: row.imp_before == null ? undefined : Number(row.imp_before),
        windowHours: row.window_hours == null ? undefined : Number(row.window_hours),
        clicksBefore: row.clicks_before == null ? undefined : Number(row.clicks_before),
        salesBefore: row.sales_before == null ? undefined : Number(row.sales_before),
      });
    }
  } catch { /* first run — no history yet */ }
  return out;
}

/**
 * Performance accumulated since each keyword's last bid change.
 *
 * `nowMtd` is this run's month-to-date per keyword. For a change made THIS month we subtract the
 * snapshot taken closest to the change; for one made in an earlier month the month has already
 * reset, so the whole current figure counts. Differences are floored at zero — a restated report
 * (Amazon revises attribution for 14 days) must never produce negative spend.
 */
async function perfSinceChange(
  changes: Map<string, BidChange>,
  nowMtd: Map<string, SinceChange>,
  month: string,
): Promise<Map<string, SinceChange>> {
  const out = new Map<string, SinceChange>();

  // A KEYWORD WITH NO RECORDED BID CHANGE STILL HAS A WINDOW: the whole month.
  //
  // This map is the ONLY evidence searchStep() gets. A keyword missing from it reads as
  // `since === undefined`, which that function treats as "no impressions and no clicks" and answers
  // by RAISING, while `isSpending` reads `since?.spend ?? 0` and computes false — so the one guard
  // that stops a spending word being raised is also disarmed.
  //
  // `changes` only holds keywords that have a `kw_bid_history` row, and that table has been empty
  // since it was created (the INSERT named a column the table does not have; see bid-ledger.ts).
  // So without this, the first run after deploy raises EVERY enabled keyword by a dime, including
  // ones sitting at $3.90 month-to-date and 0.4x. That is precisely the "raised into
  // unprofitability, then killed for being unprofitable" loop this whole PR exists to end.
  //
  // Seeding from month-to-date is both correct and the conservative direction: no bid change means
  // nothing has happened to reset the window, so month-to-date IS the performance since the last
  // move. `planBids()` already does exactly this for Brands and Display.
  for (const [kwId, now] of nowMtd) out.set(kwId, now);

  for (const [kwId, ch] of changes) {
    const now = nowMtd.get(kwId);
    if (!now) continue;
    if (ch.changedAt.slice(0, 7) !== month.slice(0, 7)) { out.set(kwId, now); continue; }
    try {
      const r = await db().execute({
        sql: `SELECT mtd_spend s, mtd_sales sa, mtd_orders o, mtd_clicks c, mtd_impressions i FROM kw_perf_snapshot
               WHERE keyword_id = ? AND month = ? AND taken_at <= ? ORDER BY taken_at DESC LIMIT 1`,
        args: [kwId, month, ch.changedAt],
      });
      const b = r.rows[0];
      const base = b
        ? { spend: Number(b.s ?? 0), sales: Number(b.sa ?? 0), orders: Number(b.o ?? 0), clicks: Number(b.c ?? 0), impressions: Number(b.i ?? 0) }
        : { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
      out.set(kwId, {
        spend: Math.max(0, now.spend - base.spend), sales: Math.max(0, now.sales - base.sales),
        orders: Math.max(0, now.orders - base.orders), clicks: Math.max(0, now.clicks - base.clicks),
        impressions: Math.max(0, (now.impressions ?? 0) - base.impressions),
      });
    } catch { out.set(kwId, now); }
  }
  return out;
}

export async function runAdEngine(opts: { dryRun?: boolean } = {}): Promise<AdEngineResult> {
  const dryRun = opts.dryRun ?? false;
  const start = Date.now();
  const out: AdEngineResult = { ok: false, dryRun, killed: [], bids: [], needsConfirm: [], revived: [], added: [], notes: [], errors: [], durationMs: 0 };
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
  const kt = (await deferredRows(cfg, token, out.notes, "engine-mtd", "spTargeting", ["targeting"], SP_COLS, sd, ed)).rows;
  // Freshly reintroduced keywords are shielded from the automatic bid CUT for the 14-day attribution
  // window. Without this the engine reads "0 orders" on a word whose orders simply have not been
  // attributed yet, cuts 10%, and repeats four times a day until the word is back at the floor —
  // which is the documented history of `phone tethered` (0.49 -> 0.94 -> 0.35 in six days) and the
  // reason 151 profitable words ended up switched off. The $4 kill is NOT suppressed.
  const protectedIds = new Map<string, string>();
  try {
    const pr = await db().execute("SELECT keyword_id, promoted_at FROM ad_reintro_cohort");
    for (const row of pr.rows) protectedIds.set(String(row.keyword_id), String(row.promoted_at));
  } catch { /* no cohort table yet — nothing to protect */ }
  const nowMs = Date.now();
  let shielded = 0;

  // Bid memory: what we last did to each keyword, and what happened since.
  await ensureBidMemory();
  const month = sd.slice(0, 7);
  const nowMtd = new Map<string, SinceChange>();
  for (const r of kt) {
    if (r.keywordId == null) continue;
    nowMtd.set(String(r.keywordId), {
      spend: r.cost ?? 0, sales: r.sales14d ?? 0, orders: r.purchases14d ?? 0, clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
    });
  }
  const lastChange = await lastBidChanges();
  const since = await perfSinceChange(lastChange, nowMtd, sd);
  let heldByCooldown = 0, rolledBack = 0;

  // THE $4 RULE IS EVALUATED PER KEYWORD, ON ITS OWN (William 2026-08-07).
  //
  // Each keyword id is judged against its own month-to-date spend and pauses on its own. Copies of
  // the same text are separate keywords with separate bids, so they are separate decisions.
  const killOps: { keywordId: string; state: string }[] = [], bidOps: { keywordId: string; bid: number }[] = [];
  const killedAt = new Map<number, number>();   // kill-op index -> index into out.killed
  for (const p of killPlan(kt, byId)) {
    killedAt.set(killOps.length, out.killed.length);
    killOps.push({ keywordId: p.keywordId, state: "PAUSED" });
    out.killed.push({ text: p.text, matchType: p.matchType, spend: p.spend, keywordId: p.keywordId });
  }
  const killIds = new Set(out.killed.map((k) => k.keywordId));
  // The bids this month's search has already proven a keyword needs. Read once; the loop below
  // never cuts at or below one of these. See ensureBidMemory() for why this table exists.
  const floors = await foundFloors(month);
  const spCeilings = await approvedCeilings("SPONSORED_PRODUCTS");
  const restoredFloors: { keywordId: string; bid: number }[] = [];
  // Every ENABLED keyword we have numbers for, whether or not its bid moves this run. The ledger
  // needs the ones that did NOT move as much as the ones that did — a bid level only reveals what
  // it produced by being observed while it sits there.
  const ledgerObs: LedgerObservation[] = [];
  for (const r of kt) {
    const k = byId.get(String(r.keywordId)); if (!k || k.state !== "ENABLED") continue;
    ledgerObs.push({
      entityId: String(k.keywordId), label: k.keywordText, matchType: k.matchType,
      bid: k.bid || NEW_KW_BID,
      counters: {
        spend: r.cost ?? 0, sales: r.sales14d ?? 0, orders: r.purchases14d ?? 0,
        clicks: (r as { clicks?: number }).clicks ?? 0,
        impressions: (r as { impressions?: number }).impressions ?? 0,
      },
    });
    const perf: Perf = { spend: r.cost ?? 0, orders: r.purchases14d ?? 0, sales: r.sales14d ?? 0 };
    if (killIds.has(String(k.keywordId))) continue;   // paused this run; no bid decision on a dead word
    {
      // Bid decisions go through memory: cooldown first, then roll back a raise that hurt, then
      // the ordinary +-10% step. Without the cooldown this ran four times a day and compounded.
      const id = String(k.keywordId);
      // How long the CURRENT evidence window has been open. With no recorded change the window is
      // the month so far, which is exactly what perfSinceChange seeded it with.
      const lc = lastChange.get(id);
      const sinceHours = lc
        ? Math.max(0, (nowMs - Date.parse(lc.changedAt)) / 3_600_000)
        : Math.max(0, (nowMs - Date.parse(sd + "T00:00:00Z")) / 3_600_000);
      const m = bidWithMemory(k.bid || NEW_KW_BID, perf, lc, since.get(id), nowMs,
        { floorFound: floors.get(id) ?? null, ceiling: activeCeiling(spCeilings.get(id) ?? null), sinceHours });
      if (m.bid === null) {
        if (m.reason.startsWith("held:")) heldByCooldown++;
        // The $0.85 line. The engine has run out of authority here, so it surfaces the word rather
        // than raising it or quietly dropping it. Reported EVERY run it wants more, on purpose:
        // this is a standing ask, and one that goes silent after the first mention gets forgotten.
        else if (m.escalate) {
          const ev = since.get(id);
          out.needsConfirm.push({
            text: k.keywordText, matchType: k.matchType, keywordId: id,
            bid: k.bid || NEW_KW_BID, wouldBe: m.wouldBe ?? 0,
            roas: ev && ev.spend > 0 ? +(ev.sales / ev.spend).toFixed(2) : null,
          });
        }
        continue;
      }
      const promotedAt = protectedIds.get(id);
      const isCut = m.bid < (k.bid || NEW_KW_BID);
      // THE SHIELD ENDS THE MOMENT THE WORD CONVERTS.
      //
      // The shield exists because a freshly woken keyword reads as zero orders while attribution
      // catches up, gets cut, and walks back to the floor. That reasoning only holds while there is
      // nothing to read. Once a keyword has an order the evidence has arrived, and on 2026-08-13 we
      // measured attribution on a settled period and found it lands on day ONE, not day fourteen
      // (sales1d = sales7d = sales14d = sales30d = $48.96).
      //
      // Without this, three of the six keywords William re-enabled on 2026-08-15 could not be cut
      // at all, despite 10 to 13 clicks and real orders each, because they had been reintroduced
      // days earlier. That directly blocked his instruction: "continue to lower the bids to see if
      // we can raise the ROAS." 260 enabled keywords were shielded at the time.
      const hasEvidence = perf.orders > 0;
      if (isCut && !hasEvidence && promotedAt && isProtected(promotedAt, nowMs)) { shielded++; continue; }
      if (m.reason.includes("turning around")) rolledBack++;
      const acos = perf.sales > 0 ? perf.spend / perf.sales : 0;
      // roasBefore is measured on the window SINCE the last move, which is what the next run will
      // compare against. Using month-to-date here would blur the very signal the climb depends on.
      const ev = since.get(id);
      const roasBefore = ev && ev.spend > 0 ? ev.sales / ev.spend : null;
      // An UNDO: the previous cut silenced this word, so this bid is the cheapest one it is known
      // to work at. Recorded only after Amazon accepts the write, below.
      if (m.restored) restoredFloors.push({ keywordId: id, bid: m.bid });
      bidOps.push({ keywordId: id, bid: m.bid });
      out.bids.push({
        text: k.keywordText, from: k.bid, to: m.bid, acos: +(acos * 100).toFixed(0) / 100,
        reason: m.reason, keywordId: id, roasBefore,
        // The evidence THIS bid level produced. Next run compares its own window against it.
        impressionsBefore: ev?.impressions ?? 0, clicksBefore: ev?.clicks ?? 0, salesBefore: ev?.sales ?? 0,
        // The LENGTH of the window those numbers cover, so the next run compares rate with rate.
        windowHours: sinceHours,
      });
    }
  }
  // Observe every bid level even when nothing moved this run. A level only reveals what it
  // produced by being watched while it sits there, so the runs that change nothing are the ones
  // that fill the history in.
  if (!dryRun && !bidOps.length && ledgerObs.length) {
    try { await recordBidRun("SPONSORED_PRODUCTS", month, ledgerObs, new Map()); }
    catch (e) { out.errors.push("bid ledger: " + (e instanceof Error ? e.message : String(e))); }
  }
  if (out.needsConfirm.length && !dryRun) {
    try {
      const escs = out.needsConfirm.map((n) => {
        const ev = since.get(n.keywordId);
        return { id: n.keywordId, label: `${n.text} (${n.matchType})`, bid: n.bid,
                 wouldBe: nextGate(n.bid), impressions: ev?.impressions ?? 0,
                 clicks: ev?.clicks ?? 0, spend: ev?.spend ?? 0, reason: "" };
      });
      const fresh = await unaskedGates("SPONSORED_PRODUCTS", escs);
      if (fresh.length) {
        const { sendTelegram, telegramConfigured } = await import("@/lib/notify/telegram");
        if (telegramConfigured()) {
          await sendTelegram(formatGateAsk("SPONSORED_PRODUCTS", fresh));
          await markAsked("SPONSORED_PRODUCTS", fresh);
          out.notes.push(`asked William about ${fresh.length} keyword(s) at their ceiling`);
        } else out.notes.push(`${fresh.length} at their ceiling, but Telegram is not configured — nothing sent`);
      }
    } catch (e) { out.errors.push("gate ask: " + (e instanceof Error ? e.message : String(e))); }
  }
  if (shielded) out.notes.push(`${shielded} bid cuts suppressed: cohort inside the 14-day attribution window`);
  if (heldByCooldown) out.notes.push(`${heldByCooldown} bids held: last change younger than ${BID_COOLDOWN_HOURS}h`);
  // ---- IN-MONTH REVIVAL (William 2026-08-08) --------------------------------------------
  // Runs BEFORE this run's kills are recorded, so a keyword cannot be killed and revived in the
  // same pass. It reads the same month-to-date rows the kill just used, which is the point: those
  // rows now carry sales that had not been attributed when the kill was made.
  try {
    await ensureKillLedger();
    const open = await openKills(month);
    if (open.length) {
      const picks = inMonthRevivals(open, byId, nowMtd, month);
      for (const p of picks) out.revived.push({ text: p.word, matchType: p.matchType, keywordId: p.keywordId, roas: p.roas, spend: p.spend, sales: p.sales });
      if (!dryRun && picks.length) {
        const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: picks.map((p) => ({ keywordId: p.keywordId, state: "ENABLED" })) }, KW_CT);
        // Amazon answers 207 with a per-item body, so res.ok alone would call a refusal a success.
        //
        // Read through parseBulkOutcome rather than reaching into the body here. The success and
        // error arrays are nested under `keywords`, not at the top level, so a hand-rolled
        // `r.json?.success` finds undefined, decides there is no per-item detail, and falls back to
        // `r.ok` — which is TRUE for a 207 in which every single item failed. That would mark the
        // keyword revived, stamp `revived_at`, and exclude it from openKills() for the rest of the
        // month while it sits PAUSED on the account. Same "applied=1 for a write Amazon refused"
        // failure this engine was rewritten to stop claiming.
        const outcome = parseBulkOutcome(r.json, picks.length);
        const at = new Date().toISOString();
        for (const [i, p] of out.revived.entries()) {
          const applied = r.ok && outcome.succeededIdx.has(i);
          p.applied = applied;
          if (!applied) continue;
          await db().execute({
            sql: "UPDATE kw_kill_ledger SET revived_at = ?, revive_roas = ? WHERE keyword_id = ? AND month = ?",
            args: [at, p.roas, p.keywordId, month],
          });
        }
        if (!r.ok) out.errors.push(`revive: ${r.status}`);
      }
      out.notes.push(`revival: ${open.length} killed this month, ${picks.length} back above ${REVIVE_MIN_ROAS.toFixed(1)}x`);
    }
  } catch (e) { out.errors.push("revive: " + (e instanceof Error ? e.message : String(e))); }

  if (out.needsConfirm.length) {
    out.notes.push(
      `NEEDS YOU: ${out.needsConfirm.length} keyword(s) want a bid above the $${BID_CONFIRM_CEILING.toFixed(2)} ceiling and were left alone.\n` +
      out.needsConfirm.map((n) => `  $${n.bid.toFixed(2)} -> $${n.wouldBe.toFixed(2)}  ${n.roas === null ? "no ROAS yet" : n.roas + "x"}  ${n.text} (${n.matchType})`).join("\n"));
  }
  if (rolledBack) out.notes.push(`${rolledBack} keyword(s) turned around: the last bid move made them worse`);

  // (2) search terms -> harvest into the SOURCE ad group (H1 fix), William's >=$4 & ACOS<=50% rule.
  // Wrapped so a harvest-report failure (timeout, 4xx) can never block the kill/bid apply above.
  let addOps: HarvestAdd[] = [];
  try {
    const stRows: SearchTermRow[] = [];
    const hw = harvestWindows(HARVEST_WINDOW_DAYS, Date.now());
    for (let i = 0; i < hw.length; i++) {
      const { rows: chunk } = await deferredRows(cfg, token, out.notes, `engine-harvest-${i}`, "spSearchTerm", ["searchTerm"],
        ST_COLS, hw[i][0], hw[i][1]);
      for (const r of chunk) stRows.push(r as SearchTermRow);
    }
    addOps = harvestCandidates(stRows, haveByAg, NEW_KW_BID);
    for (const a of addOps) out.added.push({ text: a.keywordText, matchType: a.matchType });
  } catch (e) { out.errors.push("harvest: " + (e instanceof Error ? e.message : String(e))); }

  if (!dryRun) {
    // Track whether Amazon ACCEPTED each batch. The log records outcomes, not intentions: before
    // this, a rejected add was still written as "add", which is how a 98-char keyword appeared in
    // ad_engine_log 8 times while never existing in the account (2026-08-01 loop).
    // r.ok is NOT the answer. Amazon returns 207 — inside the 2xx range, so ok is true — with a body
    // that splits the batch into success[] and error[]. Each op's fate is read out of that body.
    const applied = { kill: killOps.length === 0, bid: bidOps.length === 0, add: addOps.length === 0 };
    const note = (label: string, o: BulkOutcome, n: number) => {
      if (o.failed.length) {
        const f = o.failed[0];
        out.errors.push(`${label}: ${o.failed.length}/${n} refused — ${f.reason}${f.message ? ` (${f.message.slice(0, 120)})` : ""}`);
      }
      out.notes.push(`${label}: ${o.succeededIdx.size}/${n} accepted by Amazon`);
    };
    try {
      if (killOps.length) {
        const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: killOps }, KW_CT);
        const o = parseBulkOutcome(r.json, killOps.length);
        applied.kill = o.succeededIdx.size === killOps.length;
        note("kill", o, killOps.length);
        // Amazon's verdict, per keyword. An op it did not acknowledge is not reported as paused.
        out.killed.forEach((k) => { k.applied = false; });
        for (const i of o.succeededIdx) {
          const at = killedAt.get(i);
          if (at !== undefined) out.killed[at].applied = true;
        }
      }
      if (bidOps.length) {
        const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: bidOps }, KW_CT);
        const o = parseBulkOutcome(r.json, bidOps.length);
        applied.bid = o.succeededIdx.size === bidOps.length;
        note("bid", o, bidOps.length);
        // The epoch ledger: only the bids Amazon ACCEPTED become history.
        try {
          const acceptedSp = new Map<string, { fromBid: number; toBid: number; direction: "up" | "down"; reason: string }>();
          for (const i of o.succeededIdx) {
            const b = out.bids[i]; if (!b || !b.keywordId) continue;
            acceptedSp.set(b.keywordId, {
              fromBid: b.from ?? 0, toBid: b.to,
              direction: b.to > (b.from ?? 0) ? "up" : "down", reason: b.reason ?? "",
            });
          }
          await recordBidRun("SPONSORED_PRODUCTS", month, ledgerObs, acceptedSp);
        } catch (e) { out.errors.push("bid ledger: " + (e instanceof Error ? e.message : String(e))); }
        // Record ONLY the changes Amazon accepted. A refused write that entered the history would
        // start a cooldown on a bid that never moved, and would later be judged as if it had.
        const at = new Date().toISOString();
        for (const i of o.succeededIdx) {
          const b = out.bids[i]; if (!b || !b.keywordId) continue;
          try {
            await db().execute({
              sql: `INSERT INTO kw_bid_history (keyword_id,changed_at,from_bid,to_bid,roas_before,reason,ad_product,
                                               imp_before,clicks_before,sales_before,window_hours)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              args: [b.keywordId, at, b.from ?? 0, b.to, b.roasBefore ?? null, b.reason ?? null, "SPONSORED_PRODUCTS",
                     b.impressionsBefore ?? 0, b.clicksBefore ?? 0, b.salesBefore ?? 0, b.windowHours ?? null],
            });
          } catch (e) { out.errors.push("bid history: " + (e instanceof Error ? e.message : String(e))); }
          // A restored bid becomes this word's proven floor, but ONLY once Amazon has accepted the
          // restore. Writing it on intent would floor a keyword at a bid it never actually got back
          // to, which is the same "applied=1 for a write that failed" fault that logged 40 phantom
          // keyword additions in August.
          const rf = restoredFloors.find((f) => f.keywordId === b.keywordId);
          if (rf) {
            try { await recordFloor(rf.keywordId, month, rf.bid); }
            catch (e) { out.errors.push("bid floor: " + (e instanceof Error ? e.message : String(e))); }
          }
        }
      }
      if (addOps.length) {
        const r = await ads(cfg, token, "/sp/keywords", "POST", { keywords: addOps }, KW_CT);
        const o = parseBulkOutcome(r.json, addOps.length);
        applied.add = o.succeededIdx.size === addOps.length;
        note("add", o, addOps.length);
        // Only keywords Amazon actually created are reported as added. Without this, a term it
        // refuses is re-harvested and re-logged every run forever — 40 times and counting for one.
        out.added = out.added.filter((_, i) => o.succeededIdx.has(i));
      }
    } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); }
    // Snapshot month-to-date performance for EVERY keyword, whether or not it changed. This is the
    // baseline a future rollback differences against; without it "what happened since the raise?"
    // has no answer. Written after the applies so a failed write cannot lose the snapshot.
    try {
      const at = new Date().toISOString();
      for (const [kwId, p] of nowMtd) {
        await db().execute({
          sql: `INSERT OR REPLACE INTO kw_perf_snapshot (taken_at,keyword_id,month,mtd_spend,mtd_sales,mtd_orders,mtd_clicks,mtd_impressions)
                VALUES (?,?,?,?,?,?,?,?)`,
          args: [at, kwId, sd, p.spend, p.sales, p.orders, p.clicks, p.impressions ?? 0],
        });
      }
      // 90 days of snapshots is far more than the 7-day evaluation window needs.
      await db().execute({ sql: "DELETE FROM kw_perf_snapshot WHERE taken_at < ?", args: [new Date(Date.now() - 90 * 864e5).toISOString()] });
    } catch (e) { out.errors.push("snapshot: " + (e instanceof Error ? e.message : String(e))); }

    // Persist every action to the decision log so the algorithm is auditable + trackable over time.
    try { await persistLog(out, applied); } catch (e) { out.errors.push("log: " + (e instanceof Error ? e.message : String(e))); }
    // Ledger the kills so the next run can reconsider them once attribution catches up.
    try { await ensureKillLedger(); await recordKills(out.killed, month); } catch (e) { out.errors.push("kill ledger: " + (e instanceof Error ? e.message : String(e))); }
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
  /** Bids stepped up $0.10 because the keyword went a whole day without spending. */
  laddered: { keywordId: string; keywordText: string; from: number; to: number }[];
  /** At the $0.85 ceiling and STILL not spending. Needs William, never auto-raised. */
  escalated: { keywordId: string; keywordText: string; bid: number }[];
  eligible: number;
  blockedBy: string[];
  state: ReintroState;
  notes: string[];
  errors: string[]; durationMs: number; reason?: string;
}

// Lifetime evidence from our own database, backfilled from console exports (2019 onward) by
// scripts/ingest-keyword-csv.mjs. Amazon's reporting API only retains 95 days, and the monthly
// kill/bid rules are precisely what walked these words down to the floor, so the recent window
// records our own mistake rather than the keyword's worth. Keyed like deadKey(): "text|MATCHTYPE".
async function lifetimeRoasByKeyword(): Promise<Map<string, { roas: number; spend: number; sales: number; orders: number }>> {
  const out = new Map<string, { roas: number; spend: number; sales: number; orders: number }>();
  try {
    const r = await db().execute(
      `SELECT word, match_type, SUM(spend) AS spend, SUM(sales) AS sales, SUM(orders) AS orders
         FROM kw_lifetime
        WHERE COALESCE(ad_product,'SPONSORED_PRODUCTS') = 'SPONSORED_PRODUCTS'
          AND COALESCE(marketplace,'US') = 'US'
        GROUP BY word, match_type`);
    for (const row of r.rows) {
      const spend = Number(row.spend ?? 0), sales = Number(row.sales ?? 0), orders = Number(row.orders ?? 0);
      if (spend <= 0) continue;
      out.set(deadKey(String(row.word ?? ""), String(row.match_type ?? "")), { roas: sales / spend, spend, sales, orders });
    }
  } catch { /* table absent -> fall back to window-only evidence, never block the run */ }
  return out;
}

// Words retired for good ($4 with no conversion, or 3 consecutive dead months). A 95-day window
// makes a killed keyword look untested again by month four, so the tombstone is what stops us
// paying to relearn the same lesson every quarter.
async function deadKeySet(): Promise<Set<string>> {
  try {
    const r = await db().execute("SELECT dead_key FROM kw_tombstone");
    return new Set(r.rows.map((x) => String(x.dead_key)));
  } catch { return new Set(); }
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
    ok: false, dryRun, promoted: [], laddered: [], escalated: [], eligible: 0, blockedBy: [],
    state: { introducedToday: 0, inTrial: 0, cohortMonthSpend: 0 }, notes: [], errors: [], durationMs: 0,
  };
  const cfg = adsConfigFromEnv();
  if (!cfg || !cfg.profileId) { out.reason = "ADS_* env not configured"; out.durationMs = Date.now() - start; return out; }
  const token = await getAdsAccessToken(cfg);

  try {
    // (1) every ENABLED keyword sitting AT the floor
    const kws: Kw[] = [];
    const byIdRe = new Map<string, Kw>();
    let next: string | undefined;
    do {
      const r = await ads(cfg, token, "/sp/keywords/list", "POST", { maxResults: 1000, stateFilter: { include: ["ENABLED"] }, ...(next ? { nextToken: next } : {}) }, KW_CT);
      (r.json?.keywords ?? []).forEach((k: Kw) => {
        byIdRe.set(String(k.keywordId), k);                    // every enabled keyword, for the ladder
        if (k.state === "ENABLED" && (k.bid ?? 0) <= BID_FLOOR) kws.push(k);   // floored ones, for promotion
      });
      next = r.json?.nextToken;
    } while (next);

    // (2) longest history the API allows, stitched from <=31d chunks
    const hist = new Map<string, { cost: number; sales: number; orders: number }>();
    // SAFETY: a missing history window would make a keyword that spent badly look "never spent"
    // and therefore eligible. So every window must be READY before anything is promoted — a
    // partially-collected history is worse than none.
    let historyComplete = true;
    const rw = harvestWindows(REINTRO_HISTORY_DAYS, Date.now());
    for (let i = 0; i < rw.length; i++) {
      const [csd, ced] = rw[i];
      const { rows: chunk, ready } = await deferredRows(cfg, token, out.notes, `reintro-history-${i}`, "spTargeting", ["targeting"], SP_COLS, csd, ced);
      if (!ready) historyComplete = false;
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
    const mtdOut = await deferredRows(cfg, token, out.notes, "reintro-mtd", "spTargeting", ["targeting"], SP_COLS,
      iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), iso(now));
    for (const r of mtdOut.rows) {
      const id = String(r.keywordId ?? "");
      if (id) mtd.set(id, { cost: r.cost ?? 0, orders: r.purchases14d ?? 0 });
    }

    // REPORTS PENDING NO LONGER STOPS THE LAUNCH (William 2026-08-08: "we need 40 a day not 20").
    //
    // Amazon's report queue takes minutes, so a run that REQUESTS a window cannot also collect it.
    // The old code returned empty whenever any window was outstanding, which meant roughly every
    // other 6-hourly run promoted nothing — 20/day against the 40 the schedule was built for.
    //
    // The original safety concern was real and is preserved: without the window, a keyword that
    // recently spent badly reads as "never spent" and would be promoted as untested. So when the
    // window is missing we fall back to LIFETIME evidence from our own database (kw_lifetime, 2019
    // onward, which is broader than Amazon's 95-day retention) and promote only the two groups
    // William named — proven 2x+ winners, and words with no spending record at all. Anything
    // holding a lifetime record that FAILS the 2x bar is skipped this run rather than guessed at.
    const reportsReady = historyComplete && mtdOut.ready;
    if (!reportsReady) {
      out.notes.push("reports still queued — promoting on lifetime evidence only (2x+ winners and never-spent words); window-only candidates wait for the next run");
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
    // Today's cohort spend drives the circuit breaker. Amazon's account day resets at 07:00 UTC.
    // Preferred source is kw_daily (our own history). If it has not been written for today yet, fall
    // back to the month-to-date average, which is conservative on a ramping cohort because early
    // days are cheaper than late ones.
    const dayOfMonth = now.getUTCDate();
    let cohortSpendToday = cohortMonthSpend / Math.max(1, dayOfMonth);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      // kw_daily is keyed by (word, match_type), not keywordId, so join through the cohort table.
      const q = await db().execute({
        sql: `SELECT COALESCE(SUM(d.spend),0) AS s
                FROM kw_daily d
                JOIN ad_reintro_cohort c
                  ON lower(trim(c.keyword_text)) = lower(trim(d.word))
                 AND upper(c.match_type)         = upper(d.match_type)
               WHERE substr(d.day,1,10) = ?
                 AND d.ad_product = 'SPONSORED_PRODUCTS'`,
        args: [todayIso],
      });
      const s = Number(q.rows[0]?.s ?? 0);
      if (s > 0) cohortSpendToday = s;
    } catch { /* kw_daily may lack keyword_id or today's rows — the average stands in */ }
    out.state = {
      introducedToday: today, inTrial,
      cohortMonthSpend: +cohortMonthSpend.toFixed(2),
      cohortSpendToday: +cohortSpendToday.toFixed(2),
    };

    // (5) decide
    const [lifetime, deadKeys] = await Promise.all([lifetimeRoasByKeyword(), deadKeySet()]);
    const candidates: ReintroCandidate[] = kws
      .filter((k) => !cohort.has(String(k.keywordId)))       // never re-promote the same keyword
      .map((k) => {
        const h = hist.get(String(k.keywordId));
        const lt = lifetime.get(deadKey(k.keywordText, k.matchType));
        return {
          keywordId: String(k.keywordId), keywordText: k.keywordText, matchType: k.matchType,
          bid: k.bid ?? 0, histSpend: h?.cost ?? 0, histSales: h?.sales ?? 0, histOrders: h?.orders ?? 0,
          lifetimeRoas: lt?.roas ?? null, lifetimeSpend: lt?.spend ?? 0,
          lifetimeSales: lt?.sales ?? 0, lifetimeOrders: lt?.orders ?? 0,
        };
      });
    out.notes.push(`lifetime evidence: ${lifetime.size} words, ${deadKeys.size} tombstoned`);
    // With no window to judge on, a word carrying a lifetime record that does not clear the 2x bar
    // is a known non-winner, not an untested one. Skip it this run rather than let a missing report
    // launder it into the "never spent" tier.
    const pool = reportsReady ? candidates : lifetimeOnlyPool(candidates);
    if (!reportsReady) out.notes.push(`lifetime-only pool: ${pool.length} of ${candidates.length} candidates`);
    const plan = selectReintroductions(pool, out.state, { deadKeys });
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
          // Seed the ladder at the entry bid. Day one of the climb starts now.
          await db().execute({
            sql: `INSERT INTO kw_bid_state (keyword_id, word, match_type, current_bid, last_bid_change_at, ladder_active)
                  VALUES (?,?,?,?,?,1)
                  ON CONFLICT(keyword_id) DO UPDATE SET current_bid=excluded.current_bid, last_bid_change_at=excluded.last_bid_change_at, ladder_active=1`,
            args: [p.keywordId, p.keywordText.trim().toLowerCase(), p.matchType.toUpperCase(), p.toBid, at],
          });
        }
      }
    }

    // ---- Rule 5, the bid ladder (William 2026-08-05; revised 2026-08-08) ------------------
    // Enter at $0.25. EVERY RUN a promoted keyword goes without spending a cent, add $0.10, until
    // it spends. A keyword that HAS spent is left alone: it is producing data, so the ACOS rule owns
    // it and the $4 kill bounds it. There is no $0.85 stop any more — William 2026-08-08, "increase
    // their bids until they spend ... at $.1 each until $4 is hit and turn off if they dont have a
    // roas of 2x". BID_CAP is the only absolute stop.
    //
    // UNLIKE promotion, the ladder cannot run on lifetime evidence. Its whole input is "has this
    // keyword spent since I last raised it", which only the month-to-date window answers. With no
    // window, every keyword reads as zero-spend and the ladder would raise words that are already
    // spending — the exact compounding that walked `phone tethered` 0.49 -> 0.94 -> 0.35. So it sits
    // out any run whose report is still queued.
    if (!mtdOut.ready) out.notes.push("bid ladder skipped this run: month-to-date report still queued, and raising on unknown spend is how the oscillation started");
    try {
      const st = mtdOut.ready
        ? await db().execute(
            "SELECT keyword_id, word, match_type, current_bid, last_bid_change_at, escalated_at FROM kw_bid_state WHERE ladder_active = 1")
        : { rows: [] as Record<string, unknown>[] };
      const ladderOps: { keywordId: string; bid: number }[] = [];
      for (const row of st.rows) {
        const id = String(row.keyword_id);
        const k = byIdRe.get(id);
        if (!k || k.state !== "ENABLED") continue;             // paused or gone: not our business
        // ONE JOB PER KEYWORD PER RUN. The main ad-engine's bid search also steps a flat $0.10 up
        // when a keyword is not spending, and it acts on every keyword that HAS a row in the
        // month-to-date report. If the ladder also stepped those, they would climb $0.20 a run —
        // double what William specified. So the ladder takes only the keywords the main engine
        // cannot see: the truly silent ones, with no report row at all.
        if (mtd.has(id)) continue;
        const changedAt = Date.parse(String(row.last_bid_change_at ?? "")) || 0;
        const v = ladderVerdict({
          bid: Number(row.current_bid ?? k.bid ?? 0),
          spendSinceStep: 0,                                    // no report row at all: it has spent nothing
          daysSinceStep: changedAt ? Math.floor((Date.now() - changedAt) / 864e5) : 0,
        });
        if (v.action === "raise") {
          ladderOps.push({ keywordId: id, bid: v.bid });
          out.laddered.push({ keywordId: id, keywordText: k.keywordText, from: Number(row.current_bid ?? 0), to: v.bid });
        } else if (v.action === "escalate" && !row.escalated_at) {
          out.escalated.push({ keywordId: id, keywordText: k.keywordText, bid: v.bid });
        }
      }
      if (!dryRun && ladderOps.length) {
        const r = await ads(cfg, token, "/sp/keywords", "PUT", { keywords: ladderOps }, KW_CT);
        if (!r.ok) { out.errors.push(`ladder: ${r.status}`); out.laddered = []; }
        else {
          const at = new Date().toISOString();
          for (const op of ladderOps) {
            await db().execute({
              sql: "UPDATE kw_bid_state SET current_bid = ?, last_bid_change_at = ? WHERE keyword_id = ?",
              args: [op.bid, at, op.keywordId],
            });
          }
        }
      }
      if (!dryRun && out.escalated.length) {
        const at = new Date().toISOString();
        for (const e of out.escalated) {
          await db().execute({ sql: "UPDATE kw_bid_state SET escalated_at = ? WHERE keyword_id = ?", args: [at, e.keywordId] });
        }
      }
      if (out.laddered.length) out.notes.push(`ladder: ${out.laddered.length} bids stepped up $${BID_LADDER_STEP.toFixed(2)}`);
      if (out.escalated.length) out.notes.push(`ladder: ${out.escalated.length} at the $${BID_LADDER_MAX.toFixed(2)} ceiling and still not spending — needs William`);
    } catch (e) { out.errors.push(`ladder: ${e instanceof Error ? e.message : String(e)}`); }

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
    r.laddered.length ? `Bid ladder: ${r.laddered.length} stepped up.\n` + r.laddered.map((l) => `  $${l.from.toFixed(2)} -> $${l.to.toFixed(2)}  ${l.keywordText}`).join("\n") : "",
    r.escalated.length ? `NEEDS YOU: ${r.escalated.length} at the $0.85 ceiling and still not spending.\n` + r.escalated.map((e) => `  ${e.keywordText}`).join("\n") : "",
    "",
  ];
  r.promoted.forEach((p) => lines.push(`  ${p.reason.toUpperCase().padEnd(8)} $${p.fromBid} -> $${p.toBid}  [${p.matchType}] ${p.keywordText}`));
  if (r.notes.length) { lines.push("Reports: " + r.notes.join(" | ")); lines.push(""); }
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
  const out: ReactivationResult = { ok: false, dryRun, reactivated: [], notes: [], errors: [], durationMs: 0 };
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

  // trailing 65d keyword performance, aggregated per keywordId across the chunked windows.
  // SAFETY: reactivation only re-enables keywords that PROVE recovery, so a missing window can
  // only ever under-qualify, never wrongly re-enable. Still, acting on half a history would give
  // a misleading picture, so every window must be collected before anything is re-enabled.
  let reactivateReady = true;
  const perfById = new Map<string, { cost: number; sales: number }>();
  try {
    for (const [csd, ced] of harvestWindows(REACT_WINDOW_DAYS, Date.now())) {
      const { rows: chunk, ready: chunkReady } = await deferredRows(cfg, token, out.notes, `reactivate-${csd}`, "spTargeting", ["targeting"], SP_COLS, csd, ced);
      if (!chunkReady) reactivateReady = false;
      for (const r of chunk) {
        if (r.keywordId == null) continue;
        const id = String(r.keywordId);
        const o = perfById.get(id) ?? { cost: 0, sales: 0 };
        o.cost += r.cost ?? 0; o.sales += r.sales14d ?? 0;
        perfById.set(id, o);
      }
    }
  } catch (e) { out.errors.push("reactivation report: " + (e instanceof Error ? e.message : String(e))); out.durationMs = Date.now() - start; return out; }

  // Lifetime evidence comes from our own database, not Amazon's queue, so it is always available.
  const lifetime = await lifetimeRoasByKeyword();
  out.notes.push(`${lifetime.size} words of Sponsored Products lifetime history`);

  // A stalled report queue must no longer strand the monthly reset. Route A (recent recovery) needs
  // the window and is skipped when it is not ready; route B (lifetime record) does not need it at
  // all, and route B is the one that reaches words paused longer than the window.
  if (!reactivateReady) {
    out.notes.push("trailing-window reports not collected — lifetime evidence only this run");
    perfById.clear();
  }

  const cands = reactivationCandidates(paused, perfById, lifetime);
  for (const c of cands) out.reactivated.push({ text: c.keywordText, matchType: c.matchType, cost: c.cost, acos: c.acos, via: c.via });

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
  if (r.reactivated.length) {
    const w = r.reactivated.filter((a) => a.via === "window"), lt = r.reactivated.filter((a) => a.via === "lifetime");
    if (w.length) {
      lines.push("RE-ENABLED — recent recovery (trailing 65d: >=$4 spend at ACOS<=50%):");
      w.forEach((a) => lines.push(`  ${a.matchType}  ACOS ${(a.acos * 100).toFixed(0)}%  $${a.cost} spend  ${a.text}`));
      lines.push("");
    }
    if (lt.length) {
      lines.push("RE-ENABLED — proven in the past (lifetime >=1.92x on 2+ orders):");
      lt.forEach((a) => lines.push(`  ${a.matchType}  ${(1 / a.acos).toFixed(2)}x lifetime  $${a.cost} lifetime spend  ${a.text}`));
      lines.push("");
    }
  }
  if (r.errors.length) lines.push("ERRORS: " + r.errors.join("; "));
  return lines.join("\n");
}

export function summarizeAdEngine(r: AdEngineResult): string {
  const lines = [
    `Ad engine ${r.dryRun ? "(preview)" : "ran"} — ${r.killed.length} paused, ${r.bids.length} bid changes, ${r.added.length} keywords added. ${r.errors.length} errors. ${Math.round(r.durationMs / 1000)}s`,
    "",
  ];
  if (r.killed.length) {
    lines.push("PAUSED (>=$4 MTD spend on that keyword, no sale or ACOS>=52%):");
    r.killed.forEach((k) => lines.push(
      `  $${k.spend} wasted  ${k.matchType} "${k.text}"${k.applied === false ? "   [AMAZON REFUSED]" : ""}`));
    lines.push("");
  }
  if (r.revived.length) {
    lines.push("BACK ON — killed this month, then attribution credited the sale (>=2.0x):");
    r.revived.forEach((v) => lines.push(
      `  ${v.roas}x  $${v.spend} -> $${v.sales}  ${v.matchType} "${v.text}"${v.applied === false ? "   [AMAZON REFUSED]" : ""}`));
    lines.push("");
  }
  if (r.added.length) { lines.push("HARVESTED keywords (converted at >=2x ROAS, into the source ad group, accepted by Amazon):"); r.added.forEach((a) => lines.push(`  ${a.matchType}  ${a.text}`)); lines.push(""); }
  if (r.bids.length) {
    lines.push(`BID search (climb while profitable, turn around when a move makes it worse):`);
    r.bids.slice(0, 30).forEach((b) => lines.push(`  $${b.from}->$${b.to}  ${b.text}${b.reason ? `   [${b.reason}]` : ""}`));
    lines.push("");
  }
  if (r.errors.length) lines.push("ERRORS: " + r.errors.join("; "));
  return lines.join("\n");
}
