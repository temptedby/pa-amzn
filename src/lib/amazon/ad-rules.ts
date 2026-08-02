// Shared, pure ad-engine decision rules — William's spec (2026-08-02).
// Written down in full in .agent/ad-engine-rules-2026-08-02.md; this file is its implementation.
// ONE system across Sponsored Products, Sponsored Brands (incl. Video) and Sponsored Display.
//
//   KILL: month-to-date spend >= $4 with nothing to show for it — 0 orders, OR ACOS at/above the
//         52% break-even — is paused for the rest of the month. The 1st-of-month reactivation job
//         brings back any that recovered. A profitable term (ACOS < 52%) is never killed on spend
//         alone, so winners are protected.
//
//   BID:  step ±10% per run around the 52% pivot. Below the pivot -> raise to buy share; at/above
//         -> lower. Bounded to [FLOOR, CAP], whole cents. No ACOS signal yet and below the kill
//         bar -> hold the bid unchanged.
//
//   HARVEST: a search term that CONVERTS is added as PHRASE + EXACT into the ad group it converted
//         in, then lives under the kill rule. Amazon caps keyword text at 80 chars / 10 words, so
//         an over-long term is shortened to a valid root rather than retried forever (see below).
//
//   REINTRODUCTION: keywords parked at the $0.10 floor come back at most 10/day, triple-throttled,
//         eligible only if they never spent or spent at ACOS < 50%.
//
// Pure functions so they unit-test without the Ads API (whose async report queue is unreliable).
// Each per-ad-product engine feeds in {spend, orders, sales} and applies the verdict via that
// product's own entity endpoints.

export const KILL_SPEND = 4;      // $ month-to-date before the kill bar applies
// 52% = VALIDATED break-even on the Single via SP-API getMyFeesEstimate: $9.49 price - $0.62 COGS
// - $1.42 referral - $2.52 FBA = $4.93 contribution; 4.93/9.49 = 0.519. At or above it we lose money.
// William 2026-08-02 chose the true break-even over a rounded 50%/55%.
export const ACOS_PIVOT = 0.52;
export const BID_STEP = 0.10;     // ±10% per run (replaces the old ±25% convergence)
export const BID_FLOOR = 0.10;
export const BID_CAP = 2.50;

// Amazon's HARD limits on Sponsored Products keyword text. Not our policy — the API rejects
// anything longer, so an over-long term must be shortened, never retried as-is.
// https://www.adbadger.com/blog/how-many-keywords-can-you-use-in-amazon-listings-the-complete-guide-for-sellers/
export const KEYWORD_MAX_CHARS = 80;
export const KEYWORD_MAX_WORDS = 10;

// Reintroduction throttles. All three must pass before a keyword is switched on, so the worst case
// is bounded: REINTRO_MAX_IN_TRIAL * KILL_SPEND = $160 of open exposure, and the cohort can never
// spend more than REINTRO_MONTHLY_SPEND_CAP in a month.
export const REINTRO_PER_DAY = 10;
export const REINTRO_MAX_IN_TRIAL = 40;
export const REINTRO_MONTHLY_SPEND_CAP = 150;
export const REINTRO_MAX_ACOS = 0.50;   // William: eligible if never spent, or spent at ACOS < 50%
export const REINTRO_START_BID = 0.50;  // $0.10 wins nothing; July SP CPC was $0.59

export interface Perf {
  spend: number;   // month-to-date cost, $
  orders: number;  // attributed units/orders
  sales: number;   // attributed sales, $
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

/** ACOS as a fraction, or null when there is no conversion to measure. */
export function acosOf(p: Perf): number | null {
  return p.orders > 0 && p.sales > 0 ? p.spend / p.sales : null;
}

/** KILL verdict: $4+ month-to-date AND not profitable (no sale, or ACOS >= pivot). */
export function shouldKill(p: Perf, killSpend = KILL_SPEND, pivot = ACOS_PIVOT): boolean {
  if (p.spend < killSpend) return false;
  const acos = acosOf(p);
  return acos === null || acos >= pivot;
}

/** ±step bid at the pivot. Below pivot raise, at/above lower; hold if no ACOS signal.
 *  Always returns a whole-cent bid within [floor, cap]. */
export function nextBid(
  currentBid: number,
  p: Perf,
  opts: { step?: number; pivot?: number; floor?: number; cap?: number } = {},
): number {
  const step = opts.step ?? BID_STEP;
  const pivot = opts.pivot ?? ACOS_PIVOT;
  const floor = opts.floor ?? BID_FLOOR;
  const cap = opts.cap ?? BID_CAP;
  const base = currentBid > 0 ? currentBid : floor;
  const acos = acosOf(p);
  if (acos === null) return round2(clamp(base, floor, cap)); // no signal -> hold
  const raw = acos < pivot ? base * (1 + step) : base * (1 - step);
  return round2(clamp(raw, floor, cap));
}

export type Verdict =
  | { action: "kill" }
  | { action: "bid"; bid: number }
  | { action: "hold" };

/** Single decision for one ENABLED entity: kill first, else a ±10% bid step, else hold. */
export function decide(
  currentBid: number,
  p: Perf,
  opts: { killSpend?: number; step?: number; pivot?: number; floor?: number; cap?: number } = {},
): Verdict {
  if (shouldKill(p, opts.killSpend, opts.pivot)) return { action: "kill" };
  const bid = nextBid(currentBid, p, opts);
  if (Math.abs(bid - (currentBid || 0)) >= 0.01) return { action: "bid", bid };
  return { action: "hold" };
}

// ---------------------------------------------------------------------------
// Keyword text validity (Amazon's hard limits)
// ---------------------------------------------------------------------------

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);

/** True when Amazon will accept this keyword text: non-empty, <= 80 chars, <= 10 words. */
export function isValidKeywordText(text: string, maxChars = KEYWORD_MAX_CHARS, maxWords = KEYWORD_MAX_WORDS): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return t.length <= maxChars && words(t).length <= maxWords;
}

/**
 * Shorten an over-long search term to the longest leading root Amazon will accept, cutting on WORD
 * boundaries so the phrase stays meaningful. Returns null when no valid root exists (e.g. a single
 * 90-character token). Keeps the harvest value instead of dropping the term — see rules doc Rule 3.
 */
export function shortenToValidKeyword(
  text: string,
  maxChars = KEYWORD_MAX_CHARS,
  maxWords = KEYWORD_MAX_WORDS,
): string | null {
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (isValidKeywordText(t, maxChars, maxWords)) return t;
  const w = words(t);
  // Drop trailing words until BOTH limits are satisfied.
  for (let n = Math.min(w.length, maxWords); n >= 1; n--) {
    const cand = w.slice(0, n).join(" ");
    if (cand.length <= maxChars) return cand;
  }
  return null; // even the first word is too long
}

// ---------------------------------------------------------------------------
// Reintroduction (the $0.10 floor trap)
// ---------------------------------------------------------------------------

/** A floored keyword plus whatever history the Ads API window could give us. */
export interface ReintroCandidate {
  keywordId: string;
  keywordText: string;
  matchType: string;
  bid: number;
  /** Spend over the longest available window. 0 means "no data in window" — treated as never-spent. */
  histSpend: number;
  histSales: number;
  histOrders: number;
}

/** Live throttle state, measured fresh each run — never trusted from a cache. */
export interface ReintroState {
  /** Keywords already switched on today by this job. */
  introducedToday: number;
  /** Keywords currently on trial: reintroduced, still under $4 spend, not yet converted. */
  inTrial: number;
  /** Month-to-date spend by the whole reintroduced cohort, $. */
  cohortMonthSpend: number;
}

export interface ReintroOpts {
  perDay?: number;
  maxInTrial?: number;
  monthlySpendCap?: number;
  maxAcos?: number;
  startBid?: number;
  floor?: number;
}

export interface ReintroPick { keywordId: string; keywordText: string; matchType: string; fromBid: number; toBid: number; reason: "proven" | "untested" }

export interface ReintroPlan {
  promote: ReintroPick[];
  /** Why the batch stopped, when it stopped early. Empty when the per-day quota was the only limit. */
  blockedBy: ("perDay" | "maxInTrial" | "monthlySpendCap")[];
  eligible: number;
}

/**
 * Pure selector for Rule 4. Picks which floored keywords to switch on THIS run.
 *
 * Eligibility (William 2026-08-02): the keyword never spent, OR it spent at ACOS < 50%.
 * Ordering: proven performers first (converted, lowest ACOS first), then never-spent ones, so the
 * capped budget is spent on the strongest evidence available.
 * Throttles: per-day count, concurrent-in-trial count, and the cohort's month-to-date spend. ALL
 * must pass — the batch stops at whichever binds first, and says which one it was.
 */
export function selectReintroductions(
  candidates: ReintroCandidate[],
  state: ReintroState,
  opts: ReintroOpts = {},
): ReintroPlan {
  const perDay = opts.perDay ?? REINTRO_PER_DAY;
  const maxInTrial = opts.maxInTrial ?? REINTRO_MAX_IN_TRIAL;
  const monthlyCap = opts.monthlySpendCap ?? REINTRO_MONTHLY_SPEND_CAP;
  const maxAcos = opts.maxAcos ?? REINTRO_MAX_ACOS;
  const startBid = opts.startBid ?? REINTRO_START_BID;
  const floor = opts.floor ?? BID_FLOOR;

  const blocked = new Set<"perDay" | "maxInTrial" | "monthlySpendCap">();

  // Hard stops that apply before we look at any candidate.
  if (state.cohortMonthSpend >= monthlyCap) blocked.add("monthlySpendCap");
  if (state.inTrial >= maxInTrial) blocked.add("maxInTrial");
  if (state.introducedToday >= perDay) blocked.add("perDay");

  const eligible: (ReintroCandidate & { acos: number | null })[] = [];
  for (const c of candidates) {
    if (c.bid > floor) continue;                       // only rescue keywords stuck AT the floor
    const acos = c.histOrders > 0 && c.histSales > 0 ? c.histSpend / c.histSales : null;
    if (c.histSpend > 0) {
      // Spent before: it must have earned its way back.
      if (acos === null || acos >= maxAcos) continue;
    }
    eligible.push({ ...c, acos });
  }

  // Proven first (lowest ACOS wins), then never-spent. Stable within group by keywordId so the
  // same run order is reproducible.
  eligible.sort((a, b) => {
    const ap = a.acos !== null ? 0 : 1, bp = b.acos !== null ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (ap === 0) return (a.acos as number) - (b.acos as number);
    return a.keywordId.localeCompare(b.keywordId);
  });

  const promote: ReintroPick[] = [];
  let today = state.introducedToday, trial = state.inTrial;
  for (const c of eligible) {
    if (today >= perDay) { blocked.add("perDay"); break; }
    if (trial >= maxInTrial) { blocked.add("maxInTrial"); break; }
    if (state.cohortMonthSpend >= monthlyCap) { blocked.add("monthlySpendCap"); break; }
    promote.push({
      keywordId: c.keywordId,
      keywordText: c.keywordText,
      matchType: c.matchType,
      fromBid: c.bid,
      toBid: round2(clamp(startBid, floor, BID_CAP)),
      reason: c.acos !== null ? "proven" : "untested",
    });
    today++; trial++;
  }
  return { promote, blockedBy: [...blocked], eligible: eligible.length };
}
