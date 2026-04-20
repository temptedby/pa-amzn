import { describe, it, expect } from "vitest";
import { decideHarvest, DEFAULT_HARVEST_CONFIG, type SearchTermStats } from "./harvest-engine";

function stats(overrides: Partial<SearchTermStats> = {}): SearchTermStats {
  return {
    term: "phone clip iphone",
    sourceMatchType: "auto",
    rolling14d: { impressions: 500, clicks: 40, spendCents: 400, salesCents: 1898, orders: 2 },
    alreadyGraduatedTo: [],
    ...overrides,
  };
}

describe("harvest engine", () => {
  it("skips when fewer than min orders", () => {
    const action = decideHarvest(stats({ rolling14d: { impressions: 200, clicks: 10, spendCents: 200, salesCents: 949, orders: 1 } }));
    expect(action.type).toBe("skip");
  });

  it("skips when ACOS ≥ exact threshold (50%)", () => {
    // $5 spend / $9.49 sales = 52.7% ACOS
    const action = decideHarvest(stats({ rolling14d: { impressions: 200, clicks: 20, spendCents: 500, salesCents: 949, orders: 2 } }));
    expect(action.type).toBe("skip");
  });

  it("graduates to exact only when 30% ≤ ACOS < 50%", () => {
    // $3 spend / $9.49 sales = 31.6% ACOS, 2 orders
    const action = decideHarvest(stats({ rolling14d: { impressions: 200, clicks: 15, spendCents: 300, salesCents: 949, orders: 2 } }));
    expect(action.type).toBe("graduate");
    if (action.type === "graduate") {
      expect(action.matchTypes).toEqual(["exact"]);
      expect(action.startingBidCents).toBe(37);
      expect(action.addSourceNegative).toBe(true);
    }
  });

  it("graduates to exact AND phrase when ACOS < 30%", () => {
    // $4 spend / $18.98 sales = 21% ACOS, 2 orders
    const action = decideHarvest(stats({ rolling14d: { impressions: 400, clicks: 30, spendCents: 400, salesCents: 1898, orders: 2 } }));
    expect(action.type).toBe("graduate");
    if (action.type === "graduate") {
      expect(action.matchTypes).toEqual(["exact", "phrase"]);
    }
  });

  it("graduates to phrase only when already exact and ACOS < 30%", () => {
    const action = decideHarvest(
      stats({
        sourceMatchType: "broad",
        alreadyGraduatedTo: ["exact"],
        rolling14d: { impressions: 400, clicks: 30, spendCents: 400, salesCents: 1898, orders: 2 },
      }),
    );
    expect(action.type).toBe("graduate");
    if (action.type === "graduate") {
      expect(action.matchTypes).toEqual(["phrase"]);
    }
  });

  it("skips when source is already exact match", () => {
    const action = decideHarvest(stats({ sourceMatchType: "exact" }));
    expect(action.type).toBe("skip");
  });

  it("skips when already graduated to all eligible types", () => {
    const action = decideHarvest(
      stats({
        sourceMatchType: "auto",
        alreadyGraduatedTo: ["exact", "phrase"],
        rolling14d: { impressions: 400, clicks: 30, spendCents: 400, salesCents: 1898, orders: 2 },
      }),
    );
    expect(action.type).toBe("skip");
  });

  it("defaults starting bid to $0.37 per PRD", () => {
    expect(DEFAULT_HARVEST_CONFIG.startingBidCents).toBe(37);
  });
});
