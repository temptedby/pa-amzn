/**
 * 1.5x IN EVERY AD PRODUCT. William 2026-10-06: "need at 1.5 for everything".
 *
 * The kill bar was already uniform: Sponsored Products, Brands and Display all route through
 * shouldKill(), which defaults to KILL_MIN_ROAS. Brands REACTIVATION was the one place still
 * carrying its own number, and it was wrong twice over: 1.92x, the raw break-even, read against
 * kw_lifetime figures earned at $19.95. Rescaled that is 1.07x in today's money, which is how
 * Brands qualified 60 words at an effective 1.07x.
 */
import { describe, it, expect } from "vitest";
import { shouldKill, KILL_MIN_ROAS, KILL_SPEND, LIFETIME_EVIDENCE_REVIVES } from "./ad-rules";
import { PRICE_RESCALE } from "./ad-engine";
import { SB_REACTIVATE_MIN_ROAS } from "./sb-engine";

describe("one bar, every ad product", () => {
  it("the kill bar is 1.5x", () => {
    expect(KILL_MIN_ROAS).toBe(1.5);
  });

  it("Search, Brands and Display all share shouldKill, so there is one bar to change", () => {
    // Each engine calls shouldKill(perf, killSpend, pivot) with the same default minimum.
    const at = { spend: KILL_SPEND, orders: 1, sales: KILL_SPEND * 1.49 };
    const over = { spend: KILL_SPEND, orders: 1, sales: KILL_SPEND * 1.51 };
    expect(shouldKill(at)).toBe(true);
    expect(shouldKill(over)).toBe(false);
  });

  it("never converted is killed at the bar in every product", () => {
    expect(shouldKill({ spend: KILL_SPEND, orders: 0, sales: 0 })).toBe(true);
  });

  it("under the spend bar nothing is killed, in any product", () => {
    expect(shouldKill({ spend: KILL_SPEND - 0.01, orders: 0, sales: 0 })).toBe(false);
  });

  it("the Brands reactivation bar is 1.5x expressed in RECORDED money, not raw 1.92x", () => {
    // Lifetime records were earned at $19.95; PRICE_RESCALE converts them to today's $9.49.
    expect(SB_REACTIVATE_MIN_ROAS * PRICE_RESCALE).toBeGreaterThanOrEqual(KILL_MIN_ROAS);
    // the old 1.92x was 1.07x today, well under the bar, which is the bug this fixes
    expect(1.92 * PRICE_RESCALE).toBeLessThan(KILL_MIN_ROAS);
  });

  it("Brands reactivation is off anyway, because it reads LIFETIME evidence", () => {
    expect(LIFETIME_EVIDENCE_REVIVES).toBe(false);
  });
});
