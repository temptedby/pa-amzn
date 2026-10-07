import { describe, it, expect } from "vitest";
import {
  bacos, planBacosThrottle, BACOS_TARGET, BACOS_PRESS_BELOW,
  BACOS_STEP_DOWN, BACOS_STEP_UP, BACOS_MIN_CAMPAIGN_BUDGET, BACOS_DORMANT_CAP,
} from "./bacos";

const camps = (...spends: number[]) =>
  spends.map((s, i) => ({ campaignId: `c${i}`, budget: 250, windowSpend: s }));

describe("bacos()", () => {
  it("is ad spend over TOTAL revenue, organic included", () => {
    expect(bacos(40, 100)).toBeCloseTo(0.40, 10);
  });
  it("is null when there is no revenue, never Infinity", () => {
    // The old tacos.mjs printed "TACOS Infinity%" and "organic $-156.86" off a zero denominator.
    expect(bacos(95.65, 0)).toBeNull();
    expect(bacos(0, 0)).toBeNull();
  });
  it("reports October as measured: 81.1% on booked revenue", () => {
    expect(bacos(307.48, 379.22)! * 100).toBeCloseTo(81.1, 1);
  });
});

describe("planBacosThrottle — direction", () => {
  it("throttles when BACOS is over target", () => {
    const p = planBacosThrottle(307.48, 379.22, 7, camps(200, 100, 7.48));
    expect(p.action).toBe("throttle");
    expect(p.bacos!).toBeGreaterThan(BACOS_TARGET);
  });

  it("presses when BACOS is comfortably under target", () => {
    // 25% BACOS, below the 32% press line.
    const p = planBacosThrottle(100, 400, 7, camps(100));
    expect(p.action).toBe("press");
    expect(p.nextDaily).toBeGreaterThan(p.currentDaily);
  });

  it("HOLDS inside the dead band, so the governor cannot oscillate", () => {
    // 36% sits between the 32% press line and the 40% target.
    const p = planBacosThrottle(36, 100, 7, camps(36));
    expect(p.action).toBe("hold");
    expect(p.moves).toEqual([]);
    expect(p.bacos!).toBeGreaterThan(BACOS_PRESS_BELOW);
    expect(p.bacos!).toBeLessThan(BACOS_TARGET);
  });

  it("the target boundary is a hold, not a throttle", () => {
    const p = planBacosThrottle(40, 100, 7, camps(40));
    expect(p.bacos!).toBeCloseTo(0.40, 10);
    expect(p.action).toBe("hold");
  });
});

describe("planBacosThrottle — slow is smooth", () => {
  it("steps down by the step size, it does not jump to the allowance", () => {
    const p = planBacosThrottle(307.48, 379.22, 7, camps(307.48));
    // allowance is 40% of revenue over 7 days = $21.67/day, current is $43.93/day.
    expect(p.currentDaily).toBeCloseTo(43.93, 2);
    expect(p.allowedDaily).toBeCloseTo(21.67, 2);
    // one step down is -20%, which lands well short of the allowance.
    expect(p.nextDaily).toBeCloseTo(43.93 * (1 - BACOS_STEP_DOWN), 2);
    expect(p.nextDaily).toBeGreaterThan(p.allowedDaily);
  });

  it("walks to the allowance in a handful of days rather than one", () => {
    let spend = 307.48;
    const rev = 379.22;
    const days: number[] = [];
    for (let i = 0; i < 10; i++) {
      const p = planBacosThrottle(spend, rev, 7, camps(spend));
      days.push(p.nextDaily);
      if (p.action !== "throttle") break;
      spend = p.nextDaily * 7;          // next window spends at the new rate
    }
    expect(days[0]).toBeCloseTo(35.14, 1);
    // it arrives, and takes more than three days to do it
    expect(days[days.length - 1]).toBeLessThanOrEqual(21.68);
    expect(days.length).toBeGreaterThan(3);
  });

  it("never throttles BELOW the allowance", () => {
    // current is barely over the allowance, so a full 20% step would undershoot.
    const p = planBacosThrottle(42, 100, 7, camps(42));
    expect(p.allowedDaily).toBeCloseTo(40 / 7, 4);
    expect(p.nextDaily).toBeCloseTo(p.allowedDaily, 4);
  });

  it("never presses ABOVE the allowance", () => {
    const p = planBacosThrottle(10, 100, 7, camps(10));
    expect(p.action).toBe("press");
    expect(p.nextDaily).toBeLessThanOrEqual(p.allowedDaily + 1e-9);
  });

  it("the up step is gentler than the down step", () => {
    expect(BACOS_STEP_UP).toBeLessThan(BACOS_STEP_DOWN);
  });

  it("respects an explicit maxDaily ceiling", () => {
    const p = planBacosThrottle(10, 100, 7, camps(10), { maxDaily: 1.2 });
    expect(p.nextDaily).toBeLessThanOrEqual(1.2);
  });
});

describe("planBacosThrottle — refuses to act on nothing", () => {
  it("holds when revenue is zero instead of throttling to the floor", () => {
    // A reporting gap must not read as catastrophic efficiency.
    const p = planBacosThrottle(50, 0, 7, camps(50));
    expect(p.action).toBe("unknown");
    expect(p.bacos).toBeNull();
    expect(p.moves).toEqual([]);
  });

  it("holds when there is no spend to redistribute", () => {
    const p = planBacosThrottle(0, 400, 7, camps(0));
    expect(p.action).toBe("hold");
    expect(p.moves).toEqual([]);
  });
});

describe("planBacosThrottle — distributing the budget", () => {
  it("splits the planned spend pro-rata on what each campaign actually spent", () => {
    const p = planBacosThrottle(700, 1000, 7, [
      { campaignId: "big", budget: 250, windowSpend: 600 },
      { campaignId: "small", budget: 250, windowSpend: 100 },
    ]);
    expect(p.action).toBe("throttle");
    const big = p.moves.find((m) => m.campaignId === "big")!;
    const small = p.moves.find((m) => m.campaignId === "small")!;
    // 600:100 is 6:1, and the shares should keep that ratio
    expect(big.toBudget / small.toBudget).toBeCloseTo(6, 1);
    // and together they should add up to the planned daily spend
    expect(big.toBudget + small.toBudget).toBeCloseTo(p.nextDaily, 1);
  });

  // SUPERSEDED RULE, kept as a test of the replacement. Until the first live dry run on 2026-10-07
  // an idle campaign was given the floor as a SHARE, which meant the floor could act as a raise.
  // It is now pulled down to the dormant cap instead, and never raised.
  it("pulls an idle campaign down to the dormant cap, and never up to it", () => {
    const p = planBacosThrottle(700, 1000, 7, [
      { campaignId: "spender", budget: 250, windowSpend: 700 },
      { campaignId: "idle", budget: 250, windowSpend: 0 },
    ]);
    const idle = p.moves.find((m) => m.campaignId === "idle")!;
    expect(idle.toBudget).toBe(BACOS_DORMANT_CAP);
    expect(idle.toBudget).toBeLessThan(idle.fromBudget);
  });

  it("never writes a budget under the floor", () => {
    const p = planBacosThrottle(700, 1000, 7,
      Array.from({ length: 40 }, (_, i) => ({ campaignId: `c${i}`, budget: 250, windowSpend: 1 })));
    for (const m of p.moves) expect(m.toBudget).toBeGreaterThanOrEqual(BACOS_MIN_CAMPAIGN_BUDGET);
  });

  it("writes nothing for a campaign already at its planned budget", () => {
    const p = planBacosThrottle(700, 1000, 7, [
      { campaignId: "a", budget: 80, windowSpend: 700 },
    ]);
    // 700/7 = 100/day, one step down = 80/day, which is already this campaign's budget
    expect(p.nextDaily).toBeCloseTo(80, 2);
    expect(p.moves).toEqual([]);
  });
});

describe("planBacosThrottle — the October decision", () => {
  it("on the real numbers it throttles toward $21.67/day and says why", () => {
    const p = planBacosThrottle(307.48, 379.22, 7, camps(288.85, 15.19, 3.44));
    expect(p.action).toBe("throttle");
    expect(p.reason).toContain("81.1%");
    expect(p.reason).toContain("40%");
    expect(p.allowedDaily).toBeCloseTo(21.67, 2);
    expect(p.moves.length).toBe(3);
  });

  it("BACOS 40% is exactly ad ROAS 2.5x, so the goal has a bid-side twin", () => {
    expect(1 / BACOS_TARGET).toBeCloseTo(2.5, 10);
  });
});

// ---------------------------------------------------------------------------------------------
// The three distribution rules, every one of them found by the first LIVE DRY RUN on 2026-10-07
// rather than by reasoning about the code. The dry run proposed raising the 3-Pack test campaign
// from $2.00 to $5.00 during a throttle, and authorised $82.01/day against a $39.07/day plan.
// ---------------------------------------------------------------------------------------------
describe("planBacosThrottle — a throttle only ever throttles", () => {
  it("never raises a budget during a throttle, even to reach the floor", () => {
    const p = planBacosThrottle(341.82, 431.27, 7, [
      { campaignId: "spender", name: "big", budget: 250, windowSpend: 323.19 },
      { campaignId: "threepack", name: "3-Pack test", budget: 2, windowSpend: 0 },
    ]);
    expect(p.action).toBe("throttle");
    const tp = p.moves.find((m) => m.campaignId === "threepack");
    expect(tp).toBeUndefined();          // left at $2.00, not raised to the $5 floor
    for (const m of p.moves) expect(m.toBudget).toBeLessThanOrEqual(m.fromBudget);
  });

  it("never lowers a budget during a press", () => {
    const p = planBacosThrottle(100, 400, 7, [
      { campaignId: "a", budget: 5, windowSpend: 100 },
      { campaignId: "idle", budget: 3, windowSpend: 0 },
    ]);
    expect(p.action).toBe("press");
    for (const m of p.moves) expect(m.toBudget).toBeGreaterThanOrEqual(m.fromBudget);
  });

  it("leaves a small deliberate budget alone when it is already under the dormant cap", () => {
    const p = planBacosThrottle(341.82, 431.27, 7, [
      { campaignId: "spender", budget: 250, windowSpend: 323.19 },
      { campaignId: "idle-low", budget: 3, windowSpend: 0 },
    ]);
    // $3 is already under the $5 dormant cap, so it is not touched at all
    expect(p.moves.find((m) => m.campaignId === "idle-low")).toBeUndefined();
  });

  it("pulls a dormant campaign down to the dormant cap, so it cannot wake up holding a big budget", () => {
    const p = planBacosThrottle(341.82, 431.27, 7, [
      { campaignId: "spender", budget: 250, windowSpend: 323.19 },
      { campaignId: "sleeping-giant", budget: 500, windowSpend: 0 },
    ]);
    const sg = p.moves.find((m) => m.campaignId === "sleeping-giant")!;
    expect(sg.toBudget).toBe(BACOS_DORMANT_CAP);
    // capping at the planned daily spend was the first attempt and left far too much authorised
    expect(sg.toBudget).toBeLessThan(p.nextDaily);
  });

  it("the spenders' budgets add up to the plan, not to a multiple of it", () => {
    const p = planBacosThrottle(341.82, 431.27, 7, [
      { campaignId: "a", budget: 250, windowSpend: 155.86 },
      { campaignId: "b", budget: 90, windowSpend: 150.35 },
      { campaignId: "c", budget: 100, windowSpend: 7.36 },
      { campaignId: "d", budget: 60, windowSpend: 6.14 },
      { campaignId: "e", budget: 25, windowSpend: 2.53 },
    ]);
    const spenderTotal = p.moves
      .filter((m) => ["a", "b", "c", "d", "e"].includes(m.campaignId))
      .reduce((s, m) => s + m.toBudget, 0);
    // floors on the three small campaigns lift it a little, but nowhere near the old 2.1x
    expect(spenderTotal).toBeLessThan(p.nextDaily * 1.35);
  });

  it("the real 11-campaign October shape no longer authorises more than it plans", () => {
    const real = [
      { campaignId: "1", budget: 250, windowSpend: 155.86 },
      { campaignId: "2", budget: 90, windowSpend: 150.35 },
      { campaignId: "3", budget: 100, windowSpend: 7.36 },
      { campaignId: "4", budget: 60, windowSpend: 6.14 },
      { campaignId: "5", budget: 25, windowSpend: 2.53 },
      { campaignId: "6", budget: 50, windowSpend: 0.77 },
      { campaignId: "7", budget: 50, windowSpend: 0.18 },
      { campaignId: "8", budget: 100, windowSpend: 0 },
      { campaignId: "9", budget: 2, windowSpend: 0 },
      { campaignId: "10", budget: 10, windowSpend: 0 },
      { campaignId: "11", budget: 10, windowSpend: 0 },
    ];
    const p = planBacosThrottle(341.82, 431.27, 7, real);
    const after = real.reduce((s, c) => {
      const mv = p.moves.find((m) => m.campaignId === c.campaignId);
      return s + (mv ? mv.toBudget : c.budget);
    }, 0);
    const before = real.reduce((s, c) => s + c.budget, 0);
    expect(before).toBe(747);
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThan(82.01);     // the figure the flawed first version produced
    // and it should be in the same order of magnitude as the plan, not a multiple of it
    expect(after).toBeLessThan(p.nextDaily * 2);
    for (const m of p.moves) expect(m.toBudget).toBeLessThanOrEqual(m.fromBudget);
  });
});
