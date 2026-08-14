import { describe, it, expect } from "vitest";
import { monthStart, wordKey } from "./sb-engine";
import { shouldKill, KILL_SPEND } from "./ad-rules";

// Regression tests written from the REAL August 2026 Sponsored Brands month, pulled 2026-08-07 via
// the legacy v2 HSA reports. These are the numbers that made William say "the company is losing
// money", so the rule's verdict on each of them is pinned here rather than left to inspection.
describe("Sponsored Brands, August 2026 actuals", () => {
  it("kills `phone security`: $49.20 spent, $18.98 back — a 259% ACOS", () => {
    expect(shouldKill({ spend: 49.20, sales: 18.98, orders: 2 })).toBe(true);
  });

  it("SPARES `phone retractable holder`: over $4, but 2.61x and the only profitable word in the channel", () => {
    // The literal reading of "turn it off if it spends more than $4" would kill this. Killing
    // profitable words at $4 is what switched off 151 winners holding $46,283 of lifetime sales.
    expect(shouldKill({ spend: 14.00, sales: 36.47, orders: 3 })).toBe(false);
  });

  it("spares `phone assured` at $3.83 with no sale — under the line by 17 cents", () => {
    expect(shouldKill({ spend: 3.83, sales: 0, orders: 0 })).toBe(false);
  });

  it("kills the same word the moment it crosses $4 with nothing to show", () => {
    expect(shouldKill({ spend: KILL_SPEND, sales: 0, orders: 0 })).toBe(true);
  });
});

describe("each keyword stands on its own", () => {
  // William 2026-08-07: "should not kill copy everything is on its own". A keyword is (text, match
  // type). Copies under a different match type are separate decisions with separate bids.
  it("keeps match types apart — PHRASE and EXACT are separately biddable", () => {
    expect(wordKey("phone security", "PHRASE")).not.toBe(wordKey("phone security", "EXACT"));
  });

  it("normalises casing and whitespace, which Amazon's reports vary between runs", () => {
    expect(wordKey(" Phone Tether ", "exact")).toBe(wordKey("phone tether", "EXACT"));
  });

  it("judges a keyword on its own spend, so a copy under $4 is not killed by a sibling", () => {
    expect(shouldKill({ spend: 1.20, sales: 0, orders: 0 })).toBe(false);
    expect(shouldKill({ spend: 2.80, sales: 0, orders: 0 })).toBe(false);
    expect(shouldKill({ spend: 5.55, sales: 0, orders: 0 })).toBe(true);
  });
});

describe("monthStart", () => {
  it("resets the window on the 1st, which is when reactivation reconsiders every killed word", () => {
    expect(monthStart("2026-08-07")).toBe("2026-08-01");
    expect(monthStart("2026-08-01")).toBe("2026-08-01");
    expect(monthStart("2026-12-31")).toBe("2026-12-01");
  });
});
