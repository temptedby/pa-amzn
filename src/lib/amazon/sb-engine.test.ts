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

describe("aggregating by word, not by copy", () => {
  // The whole reason the $4 rule never fired: `phone tether` exists 18 times in Sponsored Products,
  // five of them ENABLED. Each copy stayed under $4 while the word was past it.
  it("treats every copy of a word as one bucket", () => {
    const copies = [
      { text: "phone tether", match: "EXACT", spend: 1.20 },
      { text: "Phone Tether", match: "exact", spend: 1.55 },   // Amazon's casing varies per report
      { text: " phone tether ", match: "EXACT", spend: 2.80 }, // and so does the whitespace
    ];
    const buckets = new Map<string, number>();
    for (const c of copies) {
      const k = wordKey(c.text, c.match);
      buckets.set(k, (buckets.get(k) ?? 0) + c.spend);
    }
    expect(buckets.size).toBe(1);
    const total = buckets.get("phone tether|EXACT")!;
    expect(total).toBeCloseTo(5.55, 2);
    // Individually every copy survives. Together the word dies. That is the fix.
    expect(copies.every((c) => !shouldKill({ spend: c.spend, sales: 0, orders: 0 }))).toBe(true);
    expect(shouldKill({ spend: total, sales: 0, orders: 0 })).toBe(true);
  });

  it("keeps match types apart — PHRASE and EXACT are separately biddable", () => {
    expect(wordKey("phone security", "PHRASE")).not.toBe(wordKey("phone security", "EXACT"));
  });
});

describe("monthStart", () => {
  it("resets the window on the 1st, which is when reactivation reconsiders every killed word", () => {
    expect(monthStart("2026-08-07")).toBe("2026-08-01");
    expect(monthStart("2026-08-01")).toBe("2026-08-01");
    expect(monthStart("2026-12-31")).toBe("2026-12-01");
  });
});
