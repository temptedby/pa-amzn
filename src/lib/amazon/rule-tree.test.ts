import { it, expect } from "vitest";
import { shouldKill, searchStep, KILL_SPEND, KILL_MIN_ROAS } from "./ad-rules";

// William 2026-08-15, his rule stated as four branches. Each keyword judged on its own numbers.
const ev = (o: Partial<{spend:number;sales:number;orders:number;clicks:number;impressions:number}>) =>
  ({ spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, ...o });

it("1. has not spent -> never cut, raised instead", () => {
  const v = searchStep(0.40, ev({ impressions: 900 }));          // shown, no clicks, no spend
  expect(v.direction).toBe("up");
  const w = searchStep(0.40, ev({}));                            // not even shown
  expect(w.direction).toBe("up");
});

it("2. over $4 with no conversion -> stop", () => {
  expect(shouldKill({ spend: 4.01, orders: 0, sales: 0 })).toBe(true);
  expect(shouldKill({ spend: 3.99, orders: 0, sales: 0 })).toBe(false);   // not yet $4
});

it("3. converted and at or above 1.0 -> lower the bid, never stop", () => {
  for (const roas of [1.01, 1.25, 1.63, 2.5, 9.0]) {
    const spend = 10, sales = 10 * roas;
    expect(shouldKill({ spend, orders: 1, sales })).toBe(false);
    const v = searchStep(0.65, ev({ spend, sales, orders: 1, clicks: 12, impressions: 900 }));
    expect(v.direction).toBe("down");
  }
});

it("4. below 1.0 -> stop", () => {
  expect(shouldKill({ spend: 10, orders: 1, sales: 9.99 })).toBe(true);
  expect(shouldKill({ spend: 10, orders: 1, sales: 10.0 })).toBe(false);  // exactly 1.0 survives
});

it("the constants are his numbers", () => {
  expect(KILL_SPEND).toBe(4);
  expect(KILL_MIN_ROAS).toBe(1.0);
});
