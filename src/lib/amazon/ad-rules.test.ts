import { describe, it, expect } from "vitest";
import { shouldKill, nextBid, decide, acosOf, ACOS_PIVOT } from "./ad-rules";

// William's simplified spec (2026-07-24): $4 MTD + bad ACOS -> kill for the month;
// ±10% bid step at the 50% pivot; protect profitable keywords.

describe("shouldKill — $4 MTD + not profitable", () => {
  it("does not kill below the $4 bar even with 0 orders", () => {
    expect(shouldKill({ spend: 3.99, orders: 0, sales: 0 })).toBe(false);
  });
  it("kills at $4 with 0 orders", () => {
    expect(shouldKill({ spend: 4, orders: 0, sales: 0 })).toBe(true);
  });
  it("kills at $4+ when ACOS is at/above the 50% pivot even WITH orders", () => {
    expect(shouldKill({ spend: 5, orders: 2, sales: 8 })).toBe(true);   // 62.5% ACOS
    expect(shouldKill({ spend: 5, orders: 2, sales: 10 })).toBe(true);  // exactly 50%
  });
  it("PROTECTS a profitable keyword past $4 (ACOS < 50% keeps running)", () => {
    expect(shouldKill({ spend: 4.5, orders: 3, sales: 20 })).toBe(false); // 22.5% ACOS
  });
});

describe("nextBid — ±10% at the 50% pivot", () => {
  it("raises +10% when ACOS is below 50%", () => {
    expect(nextBid(1.0, { spend: 2, orders: 2, sales: 10 })).toBe(1.1); // 20% ACOS
  });
  it("lowers -10% when ACOS is at/above 50%", () => {
    expect(nextBid(1.0, { spend: 6, orders: 1, sales: 10 })).toBe(0.9); // 60% ACOS
    expect(nextBid(1.0, { spend: 5, orders: 1, sales: 10 })).toBe(0.9); // exactly 50% -> lower
  });
  it("holds when there is no ACOS signal (0 sales)", () => {
    expect(nextBid(0.5, { spend: 1, orders: 0, sales: 0 })).toBe(0.5);
  });
  it("clamps to the [0.10, 2.50] band and returns whole cents", () => {
    expect(nextBid(2.5, { spend: 1, orders: 1, sales: 10 })).toBe(2.5);  // +10% capped at 2.50
    expect(nextBid(0.1, { spend: 6, orders: 1, sales: 10 })).toBe(0.1);  // -10% floored at 0.10
    expect(nextBid(0.37, { spend: 1, orders: 1, sales: 10 })).toBe(0.41); // 0.407 -> 0.41
  });
  it("treats a zero/absent current bid as the floor", () => {
    expect(nextBid(0, { spend: 1, orders: 1, sales: 10 })).toBe(0.11); // floor 0.10 +10%
  });
});

describe("decide — kill first, else ±10%, else hold", () => {
  it("kills over bidding", () => {
    expect(decide(1.0, { spend: 5, orders: 0, sales: 0 })).toEqual({ action: "kill" });
  });
  it("bids when profitable and under the kill bar", () => {
    expect(decide(1.0, { spend: 2, orders: 2, sales: 10 })).toEqual({ action: "bid", bid: 1.1 });
  });
  it("holds when no signal", () => {
    expect(decide(0.5, { spend: 1, orders: 0, sales: 0 })).toEqual({ action: "hold" });
  });
});

describe("acosOf", () => {
  it("is null without conversion", () => expect(acosOf({ spend: 3, orders: 0, sales: 0 })).toBeNull());
  it("is spend/sales with conversion", () => expect(acosOf({ spend: 3, orders: 1, sales: 6 })).toBe(0.5));
  it("pivot constant is 0.50", () => expect(ACOS_PIVOT).toBe(0.5));
});
