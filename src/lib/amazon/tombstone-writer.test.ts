/**
 * The tombstone rule, pinned to the words William actually described.
 *
 * William 2026-10-06: "remove all words that didnt convert last month and spent $4 to not
 * reactivate this month" and "pause the 28 please and dont reopen in nov".
 *
 * The distinction that matters, and the reason isPermanentlyDead() is NOT shouldKill():
 *   $4 spent, ZERO orders      -> retired for good. No evidence it can ever convert.
 *   $4 spent, converted badly  -> switched off for the month only. Attribution can still lift it,
 *                                 and the 14-day window means a recent kill is judged half-blind.
 *
 * Measured 2026-10-06: 131 words spent $4+ in September with zero orders, $609.87 between them.
 * 33 spent $61.38 again in October and returned $0.00. 8 of October's first 20 kills had already
 * been killed in a previous month; "safety leash phone" and "retractable iphone leash" are on
 * their third month. kw_tombstone had 0 rows the whole time, because nothing wrote to it.
 */
import { describe, it, expect } from "vitest";
import { isPermanentlyDead, shouldKill, deadKey, KILL_SPEND } from "./ad-rules";

describe("what gets retired for good, and what only rests for the month", () => {
  it("retires a word that spent the bar and never converted", () => {
    expect(isPermanentlyDead({ spend: 5.71, orders: 0, sales: 0 })).toBe(true);
    expect(isPermanentlyDead({ spend: KILL_SPEND, orders: 0, sales: 0 })).toBe(true);
  });

  it("does NOT retire a word that converted, even below the kill bar", () => {
    // "cell phone retractable tether" EXACT: $6.91 -> $9.49, 1.37x. Off for the month, not retired.
    const weak = { spend: 6.91, orders: 1, sales: 9.49 };
    expect(shouldKill(weak)).toBe(true);
    expect(isPermanentlyDead(weak)).toBe(false);
  });

  it("does NOT retire a word that never reached the bar, however badly it did", () => {
    // 76% of October's search spend sat on words with no sale, most of them under $4. The bar
    // cannot reach those, and a tombstone must not pretend it did.
    expect(isPermanentlyDead({ spend: 3.99, orders: 0, sales: 0 })).toBe(false);
  });

  it("the three September words that cost the most are all retired", () => {
    for (const spend of [5.71, 5.44, 5.27]) {
      expect(isPermanentlyDead({ spend, orders: 0, sales: 0 })).toBe(true);
    }
  });

  it("identity is word AND match type, so casing and spacing cannot resurrect a word", () => {
    expect(deadKey("Retractable  Lanyard Phone", "exact")).toBe(deadKey("retractable lanyard phone", "EXACT"));
    expect(deadKey("retractable lanyard phone", "EXACT")).not.toBe(deadKey("retractable lanyard phone", "PHRASE"));
  });
});
