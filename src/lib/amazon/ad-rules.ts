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

// Reintroduction throttles (William 2026-08-02). There is deliberately NO cap on total spend:
// a keyword that is making money should be free to spend. What IS capped is UNPROVEN exposure —
// keywords that have not yet earned a conversion and are burning their $4 of rope.
//
// The pool self-regulates. A keyword leaves the trial pool the moment it either converts (it is
// now proven, and spends without limit under the kill rule) or hits $4 without converting (it is
// killed). Winners and losers both free their slot, so the only thing bounded is how much money
// can be at risk on unproven keywords at any one instant:
// William chose the daily rate as the ONLY gate (2026-08-02), having been shown the alternative:
// no concurrent-in-trial cap. So the number of unproven keywords in flight grows by up to 10/day
// until they start resolving themselves — each one either converts (proven, leaves the pool) or
// hits the $4 kill bar (dead, leaves the pool). Exposure is therefore unbounded in the early
// weeks rather than capped at an instant-in-time figure.
//
// The count is still measured and reported every run (ReintroState.inTrial) so the ramp is
// visible, and `maxInTrial` remains an optional opts field if a ceiling is ever wanted.
export const REINTRO_PER_DAY = 40;             // 4 runs x REINTRO_PER_RUN. Was 10/day; William 2026-08-06 moved to a 6-hourly launch.
export const REINTRO_MAX_ACOS = 0.50;   // William: eligible if never spent, or spent at ACOS < 50%
export const REINTRO_START_BID = 0.25;  // William 2026-08-05: enter LOW, climb only if it fails to spend
export const REINTRO_LIFETIME_ROAS_MIN = 2.0;  // William 2026-08-05: "past 2x roas or more ... need to reset each month"
export const REINTRO_LIFETIME_MIN_ORDERS = 2;  // one order is an anecdote, not a ROAS
export const REINTRO_PER_RUN = 10;             // William 2026-08-06: launch every 6h, ~40/day, all 176 live in ~4.5 days
export const REINTRO_COHORT_DAILY_CAP = 25;    // $/day across the reintroduced cohort. Amazon's budgets do not
                                               // constrain this account (0.3% used), so the ceiling has to be ours.
export const REINTRO_PROTECT_DAYS = 14;        // no automatic bid CUT inside the 14-day attribution window — the
                                               // cut is what walked these words to the floor. The $4 kill still applies.


// Bid ladder (William 2026-08-05, revised same day). A reintroduced keyword enters LOW and gains
// $0.10 EVERY DAY it fails to spend, until it either spends or reaches the $0.85 ceiling.
// William: "keep raising the spend $.10 a day until the keyword spends max of $.85".
// Rationale: a keyword that is not spending is not risking anything, so raising it costs nothing
// and is the only way to find the bid that actually wins an auction. This supersedes the earlier
// 3-days-per-rung / $0.50-top version from the same conversation.
export const BID_LADDER_STEP = 0.10;   // added per day of zero spend
export const BID_LADDER_MAX = 0.85;    // ceiling; never climbs past this on non-spend alone
export const LADDER_STEP_DAYS = 1;     // one day at a rung earns the next

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
  /** Lifetime ROAS from our own `kw_lifetime` table, spanning years rather than Amazon's 95-day
   *  window. null when the word has no lifetime record. William 2026-08-06: promote best ROAS first. */
  lifetimeRoas?: number | null;
  /** Lifetime spend behind that ROAS, $. Used to break ties toward the better-evidenced word. */
  lifetimeSpend?: number;
  /** Lifetime sales, $. The ranking key among lifetime winners: they are all profitable by
   *  definition, so prefer the one that has actually produced the most money. */
  lifetimeSales?: number;
  /** Lifetime orders. The evidence bar — a 79x ROAS built on one order and $0.25 of spend is noise. */
  lifetimeOrders?: number;
}

/** Live throttle state, measured fresh each run — never trusted from a cache. */
export interface ReintroState {
  /** Keywords already switched on today by this job. */
  introducedToday: number;
  /** Keywords currently on trial: reintroduced, still under $4 spend, not yet converted. */
  inTrial: number;
  /** Month-to-date spend by the whole reintroduced cohort, $. Reported for visibility; NOT a gate. */
  cohortMonthSpend: number;
  /** Today's spend by the cohort, $. THIS is the gate — the circuit breaker reads it every run. */
  cohortSpendToday?: number;
}

export interface ReintroOpts {
  perDay?: number;
  /** Cap for a SINGLE run. With a 6-hourly cron this is what sets the real pace. */
  perRun?: number;
  /** Halt promotions once the cohort has spent this much today. */
  cohortDailyCap?: number;
  /** A word whose LIFETIME ROAS clears this comes back even if the recent window looks bad, because
   *  the recent window is exactly what the monthly rules broke. William 2026-08-05: "if they
   *  previously over lifetime were above a 2x roas ... these are the keywords that need to reset". */
  lifetimeRoasMin?: number;
  /** Minimum lifetime orders before a lifetime ROAS is treated as evidence at all. Without this the
   *  ranking is led by words with one order on a quarter of a dollar. */
  lifetimeMinOrders?: number;
  /** Permanently dead keywords (deadKey() values). Never reintroduced, whatever the report window says. */
  deadKeys?: Set<string>;
  /** Optional ceiling on concurrent UNPROVEN keywords. Unset by William's choice — 10/day is the
   *  only gate. Left available so a ceiling can be reinstated without a code change. */
  maxInTrial?: number;
  maxAcos?: number;
  startBid?: number;
  floor?: number;
}

export interface ReintroPick { keywordId: string; keywordText: string; matchType: string; fromBid: number; toBid: number; reason: "lifetime" | "proven" | "untested" }

export interface ReintroPlan {
  promote: ReintroPick[];
  /** Why the batch stopped, when it stopped early. */
  blockedBy: ("perDay" | "perRun" | "maxInTrial" | "dailyCap")[];
  eligible: number;
}

/**
 * Pure selector for Rule 4. Picks which floored keywords to switch on THIS run.
 *
 * Eligibility (William 2026-08-02): the keyword never spent, OR it spent at ACOS < 50%, OR its
 * LIFETIME ROAS clears 2x (William 2026-08-05). The lifetime path matters because Amazon's window is
 * only 95 days and the monthly kill/bid rules are what drove these words to the floor in the first
 * place, so recent history is evidence of our own mistake rather than of the keyword.
 * Ordering: lifetime winners first (best ROAS first), then window-proven (lowest ACOS first), then
 * never-spent, so the limited number of trial slots goes to the strongest evidence available.
 * Throttle: the per-day count, and by William's choice that is the only one. No total spend cap
 * (a keyword making money spends freely) and no concurrent-in-trial ceiling unless opts sets one.
 */
export function selectReintroductions(
  candidates: ReintroCandidate[],
  state: ReintroState,
  opts: ReintroOpts = {},
): ReintroPlan {
  const perDay = opts.perDay ?? REINTRO_PER_DAY;
  const maxInTrial = opts.maxInTrial ?? Infinity;   // no ceiling by default (William 2026-08-02)
  const maxAcos = opts.maxAcos ?? REINTRO_MAX_ACOS;
  const startBid = opts.startBid ?? REINTRO_START_BID;
  const floor = opts.floor ?? BID_FLOOR;
  const roasMin = opts.lifetimeRoasMin ?? REINTRO_LIFETIME_ROAS_MIN;
  const minOrders = opts.lifetimeMinOrders ?? REINTRO_LIFETIME_MIN_ORDERS;

  const perRun = opts.perRun ?? REINTRO_PER_RUN;
  const dailyCap = opts.cohortDailyCap ?? REINTRO_COHORT_DAILY_CAP;

  const blocked = new Set<"perDay" | "perRun" | "maxInTrial" | "dailyCap">();

  // Hard stops that apply before we look at any candidate.
  if (state.inTrial >= maxInTrial) blocked.add("maxInTrial");
  if (state.introducedToday >= perDay) blocked.add("perDay");
  // The circuit breaker. Amazon's daily budgets are not a control on this account — $745/day is
  // authorised against ~$2.50/day of real spend — so the only ceiling is the one we enforce.
  if ((state.cohortSpendToday ?? 0) >= dailyCap) blocked.add("dailyCap");

  const dead = opts.deadKeys ?? new Set<string>();

  const eligible: (ReintroCandidate & { acos: number | null; tier: 0 | 1 | 2 })[] = [];
  for (const c of candidates) {
    if (dead.has(deadKey(c.keywordText, c.matchType))) continue;  // tombstoned, never resurrect
    if (c.bid > floor) continue;                       // only rescue keywords stuck AT the floor
    const acos = c.histOrders > 0 && c.histSales > 0 ? c.histSpend / c.histSales : null;
    const lroas = c.lifetimeRoas ?? null;
    // Both bars must clear: profitable AND actually evidenced. A word at 79x on $0.25 and one order
    // outranks a word at 24x on $9.81 and ten orders if you sort on the ratio alone, and the second
    // one is the real asset.
    const lifetimeProven = lroas !== null && lroas >= roasMin && (c.lifetimeOrders ?? 0) >= minOrders;
    if (!lifetimeProven && c.histSpend > 0) {
      // Spent inside the window with no lifetime record to vouch for it: it must have earned its
      // way back on the window alone.
      if (acos === null || acos >= maxAcos) continue;
    }
    eligible.push({ ...c, acos, tier: lifetimeProven ? 0 : acos !== null ? 1 : 2 });
  }

  // Tier 0: lifetime winners, best ROAS first — years of evidence beats a 95-day window, and the
  // window is what the monthly rules corrupted. Tier 1: proven inside the window, lowest ACOS first.
  // Tier 2: never spent. Stable within each group so the same run order is reproducible.
  eligible.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.tier === 0) {
      // Every tier-0 word is already profitable, so rank by the money it has produced, not by the
      // ratio. Ratio decides eligibility; volume decides priority.
      const sd = (b.lifetimeSales ?? 0) - (a.lifetimeSales ?? 0);
      if (Math.abs(sd) > 1e-9) return sd;
      const d = (b.lifetimeRoas as number) - (a.lifetimeRoas as number);
      if (Math.abs(d) > 1e-9) return d;
    }
    if (a.tier === 1) return (a.acos as number) - (b.acos as number);
    return a.keywordId.localeCompare(b.keywordId);
  });

  const promote: ReintroPick[] = [];
  // 25% of the account is duplicate records of the same text+match (2026-08-04). Promoting three
  // copies of one word burns three of the ten daily slots and makes the copies bid against each
  // other, so only one copy of a word travels per run.
  const takenWords = new Set<string>();
  let today = state.introducedToday, trial = state.inTrial;
  if (blocked.has("dailyCap")) return { promote, blockedBy: [...blocked], eligible: eligible.length };
  for (const c of eligible) {
    if (promote.length >= perRun) { blocked.add("perRun"); break; }
    if (today >= perDay) { blocked.add("perDay"); break; }
    if (trial >= maxInTrial) { blocked.add("maxInTrial"); break; }
    const wk = deadKey(c.keywordText, c.matchType);
    if (takenWords.has(wk)) continue;
    takenWords.add(wk);
    promote.push({
      keywordId: c.keywordId,
      keywordText: c.keywordText,
      matchType: c.matchType,
      fromBid: c.bid,
      toBid: round2(clamp(startBid, floor, BID_CAP)),
      reason: c.tier === 0 ? "lifetime" : c.tier === 1 ? "proven" : "untested",
    });
    today++; trial++;
  }
  return { promote, blockedBy: [...blocked], eligible: eligible.length };
}


/**
 * Is a reintroduced keyword still inside its protection window?
 *
 * Sales are attributed over 14 days, so a word promoted on Monday cannot be fairly judged until the
 * Monday after next. The ±10% cut at the 52% pivot judges month-to-date, sees zero orders because
 * the orders have not been attributed yet, and cuts. Repeat that four times a day and the word is
 * back at the floor inside a week — which is exactly the history in ad_engine_log for
 * `phone tethered`: 0.49 -> 0.94 -> 0.35 over six days.
 *
 * Protection suppresses the CUT only. The $4 kill still applies at full force, so a word that
 * genuinely does not work still stops costing money.
 */
export function isProtected(promotedAt: string, now: number, days = REINTRO_PROTECT_DAYS): boolean {
  const t = Date.parse(promotedAt);
  if (!Number.isFinite(t)) return false;
  return now - t < days * 864e5;
}

// ---------------------------------------------------------------------------
// Bid ladder (Rule 5, William 2026-08-05)
// ---------------------------------------------------------------------------

export interface LadderState {
  /** Current bid, $. */
  bid: number;
  /** Spend accumulated since this keyword last had its bid changed, $. */
  spendSinceStep: number;
  /** Whole days since this keyword last had its bid changed. */
  daysSinceStep: number;
}

/**
 * Next bid for a reintroduced keyword that is failing to spend: current + $0.10 per day of zero
 * spend, capped at $0.85. Returns null when no change is due, so callers skip the write entirely.
 *
 * A keyword that HAS spent is deliberately left alone: it is generating data now, so the normal
 * ACOS rule in nextBid() owns it and the $4 kill rule bounds its downside. The ladder exists only
 * to rescue keywords that are enabled but priced too low to win anything.
 */
export function nextLadderBid(
  s: LadderState,
  opts: { stepDays?: number; step?: number; max?: number } = {},
): number | null {
  const stepDays = opts.stepDays ?? LADDER_STEP_DAYS;
  const step = opts.step ?? BID_LADDER_STEP;
  const max = opts.max ?? BID_LADDER_MAX;
  if (s.spendSinceStep > 0) return null;        // it spent, the bid is working, hands off
  if (s.daysSinceStep < stepDays) return null;  // not waited long enough
  if (s.bid >= max - 0.005) return null;        // already at the ceiling
  return round2(Math.min(s.bid + step, max));
}

/**
 * Ladder verdict including the approval gate at the ceiling (William 2026-08-05).
 *
 * A keyword that has climbed all the way to $0.85 and STILL will not spend is telling us something
 * the rules cannot decide alone: the word may be worth more than our ceiling, or it may be dead.
 * Rather than silently parking it forever, the engine asks. "escalate" means notify William via
 * Telegram and wait for a human answer; it never raises the bid on its own.
 */
export type LadderVerdict =
  | { action: "raise"; bid: number }
  | { action: "escalate"; bid: number }   // at the ceiling, still not spending: ask William
  | { action: "hold" };

export function ladderVerdict(
  s: LadderState,
  opts: { stepDays?: number; step?: number; max?: number } = {},
): LadderVerdict {
  const stepDays = opts.stepDays ?? LADDER_STEP_DAYS;
  const max = opts.max ?? BID_LADDER_MAX;
  if (s.spendSinceStep > 0) return { action: "hold" };        // spending, the ACOS rule owns it
  if (s.daysSinceStep < stepDays) return { action: "hold" };  // still waiting out the day
  if (s.bid >= max - 0.005) return { action: "escalate", bid: s.bid };
  const next = nextLadderBid(s, opts);
  return next === null ? { action: "hold" } : { action: "raise", bid: next };
}

// ---------------------------------------------------------------------------
// Permanent kill list (Rule 6, William 2026-08-05)
// "if spent $4 and have no history we kill the word not to use anymore"
// ---------------------------------------------------------------------------

/**
 * A keyword that burned the full $4 of rope and NEVER converted is dead for good, not just for the
 * month. Recording that permanently is not optional bookkeeping: Amazon only serves ~65-95 days of
 * report history, so a keyword killed in June reads as "never spent" by September, becomes eligible
 * for reintroduction again, and burns another $4. The tombstone is what breaks that cycle.
 *
 * Note the asymmetry with shouldKill(): that pauses for the month at $4 when unprofitable, which
 * includes keywords that DID convert but at a bad ACOS. Those can recover and come back on the 1st.
 * This is narrower and harsher: $4 spent, zero orders, no evidence it can ever convert.
 */
export function isPermanentlyDead(p: Perf, killSpend = KILL_SPEND): boolean {
  return p.spend >= killSpend && p.orders === 0;
}

/** Stable identity for the kill list. Text is lowercased/collapsed so casing cannot resurrect a word. */
export function deadKey(keywordText: string, matchType: string): string {
  return `${(keywordText || "").trim().toLowerCase().replace(/\s+/g, " ")}|${(matchType || "").toUpperCase()}`;
}

/** One calendar month of performance for a single keyword. `month` is "YYYY-MM". */
export interface MonthPerf { month: string; spend: number; orders: number; sales: number }

/** Months required in a row before a former winner is retired for good. */
export const RETIRE_CONSECUTIVE_MONTHS = 3;

/**
 * Retire a keyword permanently after N consecutive months of burning the full $4 with no
 * conversion, regardless of how well it once performed (William 2026-08-05:
 * "if a word has 3 consecutive months of $4 spend no conversion even if in the past was good
 * then cut the word").
 *
 * This is the counterpart to isPermanentlyDead(): that one retires a word that never proved
 * itself, this one retires a word whose proof has gone stale. A past winner earns three months of
 * patience, not indefinite patience.
 *
 * NOTE: Amazon serves only 95 days of report history (verified 2026-08-05 against the API's own
 * "data retention start date" error), which is barely 3 months and shrinks below it the moment a
 * 4th month exists. So this rule REQUIRES locally stored monthly history; it cannot be evaluated
 * from the live API alone.
 */
export function shouldRetirePermanently(
  history: MonthPerf[],
  opts: { months?: number; killSpend?: number } = {},
): boolean {
  const need = opts.months ?? RETIRE_CONSECUTIVE_MONTHS;
  const killSpend = opts.killSpend ?? KILL_SPEND;
  if (need <= 0) return false;
  // Chronological, so "consecutive" means consecutive in calendar order, not insertion order.
  const sorted = [...history].sort((a, b) => a.month.localeCompare(b.month));
  let run = 0;
  let prev: string | null = null;
  for (const m of sorted) {
    const failed = m.spend >= killSpend && m.orders === 0;
    // A gap in the calendar breaks the run: we cannot claim months we have no data for.
    const adjacent = prev === null || isNextMonth(prev, m.month);
    run = failed ? (adjacent ? run + 1 : 1) : 0;
    if (run >= need) return true;
    prev = m.month;
  }
  return false;
}

/** True when `b` is the calendar month immediately following `a`. Both "YYYY-MM". */
export function isNextMonth(a: string, b: string): boolean {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  if (!ay || !am || !by || !bm) return false;
  return by * 12 + bm === ay * 12 + am + 1;
}
