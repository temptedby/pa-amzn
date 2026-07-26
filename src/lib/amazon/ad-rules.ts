// Shared, pure ad-engine decision rules — William's simplified spec (2026-07-24).
// ONE system across Sponsored Products, Sponsored Brands (incl. Video) and Sponsored Display.
//
//   KILL: an entity (keyword / target) or search term whose MONTH-TO-DATE spend has reached
//         $4 with nothing to show for it — 0 orders, OR ACOS at/above the 50% break-even —
//         is paused for the rest of the month. The 1st-of-month reactivation job brings back
//         any that have since recovered. A profitable term (ACOS < 50%) is never killed on spend
//         alone, so winners are protected.
//
//   BID:  step ±10% per run around the 50% ACOS pivot. ACOS < 50% (profitable) -> raise +10%
//         to buy more share; ACOS >= 50% -> lower -10%. Bounded to [FLOOR, CAP], whole cents.
//         No ACOS signal yet (0 sales) and below the kill bar -> hold the bid unchanged.
//
// Pure functions so they unit-test without the Ads API (whose async report queue is unreliable).
// Each per-ad-product engine feeds in {spend, orders, sales} and applies the verdict via that
// product's own entity endpoints.

export const KILL_SPEND = 4;      // $ month-to-date before the kill bar applies
export const ACOS_PIVOT = 0.50;   // validated break-even ~52%; also the bid raise/lower pivot
export const BID_STEP = 0.10;     // ±10% per run (replaces the old ±25% convergence)
export const BID_FLOOR = 0.10;
export const BID_CAP = 2.50;

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
