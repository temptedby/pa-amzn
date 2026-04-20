import { describe, it, expect } from "vitest";
import {
  decide,
  DEFAULT_CONFIG,
  configForListPriceCents,
  type KeywordState,
  type Window,
} from "./bid-engine";

function w(overrides: Partial<Window> = {}): Window {
  return { impressions: 0, clicks: 0, spendCents: 0, salesCents: 0, orders: 0, ...overrides };
}

function s(overrides: Partial<KeywordState> = {}): KeywordState {
  return {
    currentBidCents: 50,
    lastBidChangeAt: null,
    rolling7d: w(),
    rolling3d: w(),
    prior3d: w(),
    ...overrides,
  };
}

describe("kill switch", () => {
  it("pauses when 7d spend ≥ $4 with 0 conversions", () => {
    const action = decide(s({ rolling7d: w({ impressions: 200, clicks: 12, spendCents: 400, orders: 0 }) }));
    expect(action.type).toBe("pause_keyword");
    expect(action.rule).toBe("kill_switch");
  });

  it("does NOT pause when 7d has any conversions", () => {
    const action = decide(
      s({
        rolling7d: w({ impressions: 200, clicks: 12, spendCents: 500, salesCents: 949, orders: 1 }),
        rolling3d: w({ impressions: 100, clicks: 6, spendCents: 200, salesCents: 949, orders: 1 }),
        prior3d: w({ impressions: 100, clicks: 6, spendCents: 300, salesCents: 949, orders: 1 }),
      }),
    );
    expect(action.type).not.toBe("pause_keyword");
  });

  it("does NOT pause when spend is just under threshold", () => {
    const action = decide(s({ rolling7d: w({ impressions: 100, clicks: 5, spendCents: 399, orders: 0 }) }));
    expect(action.type).not.toBe("pause_keyword");
  });
});

describe("dead keyword", () => {
  it("pauses when bid ≥ $2 and 0 impressions in 7d", () => {
    const action = decide(s({ currentBidCents: 200, rolling7d: w({ impressions: 0 }) }));
    expect(action.type).toBe("pause_keyword");
    expect(action.rule).toBe("dead_keyword_giveup");
  });

  it("raises bid +10% when 0 impressions and bid < $2", () => {
    const action = decide(s({ currentBidCents: 50, rolling7d: w({ impressions: 0 }) }));
    expect(action.type).toBe("increase_bid");
    expect(action.rule).toBe("dead_keyword_wake");
    if (action.type === "increase_bid") expect(action.newBidCents).toBe(55);
  });
});

describe("rate limit", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const activeState = {
    rolling7d: w({ impressions: 50, clicks: 3, spendCents: 100, salesCents: 949, orders: 1 }),
    rolling3d: w({ impressions: 30, clicks: 2, spendCents: 50, salesCents: 949, orders: 1 }),
    prior3d: w({ impressions: 20, clicks: 1, spendCents: 50, salesCents: 949, orders: 1 }),
  };

  it("blocks change when last change was < 6h ago", () => {
    const recent = new Date(now.getTime() - 3 * 3_600_000).toISOString();
    const action = decide(s({ ...activeState, lastBidChangeAt: recent }), DEFAULT_CONFIG, now);
    expect(action.type).toBe("no_change");
    expect(action.rule).toBe("rate_limited");
  });

  it("allows change when last change was ≥ 6h ago", () => {
    const old = new Date(now.getTime() - 7 * 3_600_000).toISOString();
    const action = decide(s({ ...activeState, lastBidChangeAt: old }), DEFAULT_CONFIG, now);
    expect(action.type).not.toBe("no_change");
  });
});

describe("exploration", () => {
  it("drops bid -10% when 0 conversions, spend < $4, has impressions", () => {
    const action = decide(
      s({
        currentBidCents: 50,
        rolling7d: w({ impressions: 30, clicks: 5, spendCents: 200, orders: 0 }),
      }),
    );
    expect(action.type).toBe("decrease_bid");
    expect(action.rule).toBe("exploration_drop");
    if (action.type === "decrease_bid") expect(action.newBidCents).toBe(45);
  });
});

describe("momentum", () => {
  it("raises +10% when 3d ACOS held or improved vs prior", () => {
    // current ACOS 10% (100/1000), prior 10% (150/1500) — tied, counts as held
    const action = decide(
      s({
        currentBidCents: 50,
        rolling7d: w({ impressions: 200, clicks: 20, spendCents: 250, salesCents: 2500, orders: 3 }),
        rolling3d: w({ impressions: 100, clicks: 10, spendCents: 100, salesCents: 1000, orders: 1 }),
        prior3d: w({ impressions: 100, clicks: 10, spendCents: 150, salesCents: 1500, orders: 2 }),
      }),
    );
    expect(action.type).toBe("increase_bid");
    expect(action.rule).toBe("momentum_up");
    if (action.type === "increase_bid") expect(action.newBidCents).toBe(55);
  });

  it("drops -10% when 3d ACOS worsened vs prior", () => {
    // current 20% (200/1000), prior 10% (100/1000)
    const action = decide(
      s({
        currentBidCents: 50,
        rolling7d: w({ impressions: 200, clicks: 20, spendCents: 300, salesCents: 2000, orders: 2 }),
        rolling3d: w({ impressions: 100, clicks: 10, spendCents: 200, salesCents: 1000, orders: 1 }),
        prior3d: w({ impressions: 100, clicks: 10, spendCents: 100, salesCents: 1000, orders: 1 }),
      }),
    );
    expect(action.type).toBe("decrease_bid");
    expect(action.rule).toBe("momentum_down");
  });

  it("holds when 3d has no sales despite 7d activity", () => {
    const action = decide(
      s({
        currentBidCents: 50,
        rolling7d: w({ impressions: 200, clicks: 20, spendCents: 300, salesCents: 949, orders: 1 }),
        rolling3d: w({ impressions: 100, clicks: 10, spendCents: 200, salesCents: 0, orders: 0 }),
        prior3d: w({ impressions: 100, clicks: 10, spendCents: 100, salesCents: 949, orders: 1 }),
      }),
    );
    expect(action.type).toBe("no_change");
    expect(action.rule).toBe("no_recent_signal");
  });

  it("raises on first signal when prior window has no sales", () => {
    const action = decide(
      s({
        currentBidCents: 50,
        rolling7d: w({ impressions: 200, clicks: 20, spendCents: 300, salesCents: 949, orders: 1 }),
        rolling3d: w({ impressions: 100, clicks: 10, spendCents: 100, salesCents: 949, orders: 1 }),
        prior3d: w({ impressions: 100, clicks: 10, spendCents: 200, salesCents: 0, orders: 0 }),
      }),
    );
    expect(action.type).toBe("increase_bid");
    expect(action.rule).toBe("momentum_up_new");
  });
});

describe("soft cap", () => {
  it("forces decrease above soft cap when ACOS > aspirational", () => {
    // bid $2.50 > $2 cap; 3d ACOS 20% > 10% aspirational.
    // Momentum would say up (current 20% better than prior 30%) but soft cap overrides.
    const action = decide(
      s({
        currentBidCents: 250,
        rolling7d: w({ impressions: 200, clicks: 20, spendCents: 500, salesCents: 2500, orders: 3 }),
        rolling3d: w({ impressions: 100, clicks: 10, spendCents: 200, salesCents: 1000, orders: 1 }),
        prior3d: w({ impressions: 100, clicks: 10, spendCents: 300, salesCents: 1000, orders: 1 }),
      }),
    );
    expect(action.type).toBe("decrease_bid");
    expect(action.rule).toBe("above_soft_cap_default_down");
  });

  it("slow-grows +5% above soft cap when ACOS ≤ aspirational and momentum up", () => {
    // bid $2.50; current 3d ACOS 8% (80/1000), prior 10% (100/1000) — held/improved, under aspirational
    const action = decide(
      s({
        currentBidCents: 250,
        rolling7d: w({ impressions: 200, clicks: 20, spendCents: 180, salesCents: 2000, orders: 2 }),
        rolling3d: w({ impressions: 100, clicks: 10, spendCents: 80, salesCents: 1000, orders: 1 }),
        prior3d: w({ impressions: 100, clicks: 10, spendCents: 100, salesCents: 1000, orders: 1 }),
      }),
    );
    expect(action.type).toBe("increase_bid");
    if (action.type === "increase_bid") {
      expect(action.pct).toBe(5);
      expect(action.newBidCents).toBe(Math.round(250 * 1.05));
    }
  });
});

describe("bid floor", () => {
  it("does not drop below Amazon's $0.02 floor", () => {
    const action = decide(s({ currentBidCents: 2, rolling7d: w({ impressions: 30, clicks: 5, spendCents: 50, orders: 0 }) }));
    expect(action.type).toBe("decrease_bid");
    if (action.type === "decrease_bid") expect(action.newBidCents).toBe(2);
  });
});

describe("per-SKU config scaling", () => {
  it("scales soft cap linearly with list price", () => {
    expect(configForListPriceCents(949).softCapCents).toBe(200);   // single
    expect(configForListPriceCents(1049).softCapCents).toBe(221);  // pro
    expect(configForListPriceCents(1349).softCapCents).toBe(284);  // 2-pack
    expect(configForListPriceCents(1649).softCapCents).toBe(348);  // 3-pack
  });
});
