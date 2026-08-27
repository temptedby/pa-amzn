import { describe, it, expect } from "vitest";
import {
  findViolations, isLate, isClean, formatWatch,
  type WatchScope, type PerfRow, type LiveEntity, type WatchReport,
} from "./engine-watch";
import { KILL_MIN_ROAS, killSpendFor } from "./ad-rules";

const US: WatchScope = { country: "US", adProduct: "Products", currency: "USD" };
const CA: WatchScope = { country: "CA", adProduct: "Products", currency: "CAD" };
const MX: WatchScope = { country: "MX", adProduct: "Products", currency: "MXN" };

const on = (id: string, bid = 0.5): [string, LiveEntity] => [id, { id, state: "ENABLED", bid }];
const off = (id: string): [string, LiveEntity] => [id, { id, state: "PAUSED", bid: 0.5 }];
const row = (id: string, spend: number, sales: number, orders: number): PerfRow =>
  ({ id, label: `word ${id}`, spend, sales, orders });

describe("findViolations — the bar itself", () => {
  it("flags an enabled word past the bar that never converted", () => {
    const v = findViolations(US, [row("1", 5.48, 0, 0)], new Map([on("1")]));
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("never converted");
    expect(v[0].roas).toBeNull();
  });

  it("flags an enabled word past the bar converting under 1.5x", () => {
    const v = findViolations(US, [row("1", 19.25, 28.47, 3)], new Map([on("1")]));
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("under the roas bar");
    expect(v[0].roas).toBeCloseTo(1.48, 2);
  });

  it("does NOT flag a word past the bar that clears 1.5x", () => {
    expect(findViolations(US, [row("1", 10, 20, 2)], new Map([on("1")]))).toHaveLength(0);
  });

  it("does NOT flag a word under the spend bar, however bad it looks", () => {
    // The $4 rope is the rule working as written. Alerting on it hourly would train the
    // recipient to ignore the alert.
    expect(findViolations(US, [row("1", 3.99, 0, 0)], new Map([on("1")]))).toHaveLength(0);
  });

  it("does NOT flag a word that is already switched off", () => {
    expect(findViolations(US, [row("1", 50, 0, 0)], new Map([off("1")]))).toHaveLength(0);
  });

  it("does NOT flag a word missing from live state", () => {
    expect(findViolations(US, [row("1", 50, 0, 0)], new Map())).toHaveLength(0);
  });

  it("counts one verdict per id even when the report repeats it", () => {
    const v = findViolations(US, [row("1", 5, 0, 0), row("1", 5, 0, 0)], new Map([on("1")]));
    expect(v).toHaveLength(1);
  });

  it("orders by spend, worst first", () => {
    const v = findViolations(US, [row("a", 5, 0, 0), row("b", 40, 0, 0)], new Map([on("a"), on("b")]));
    expect(v.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("findViolations — every country uses its OWN bar", () => {
  // Derived from the shared table, so raising a bar in one place cannot leave this test agreeing
  // with a number the engine no longer uses.
  it("CAD 5 is inside the Canadian rope but past the US one", () => {
    expect(killSpendFor("CAD")).toBeGreaterThan(killSpendFor("USD"));
    expect(findViolations(CA, [row("1", 5, 0, 0)], new Map([on("1")]))).toHaveLength(0);
    expect(findViolations(US, [row("1", 5, 0, 0)], new Map([on("1")]))).toHaveLength(1);
  });

  it("MXN 60 is inside the Mexican rope, MXN 70 is not", () => {
    expect(findViolations(MX, [row("1", 60, 0, 0)], new Map([on("1")]))).toHaveLength(0);
    expect(findViolations(MX, [row("1", 70, 0, 0)], new Map([on("1")]))).toHaveLength(1);
  });
});

describe("findViolations — the roas bar is the shared constant", () => {
  it("uses KILL_MIN_ROAS, so it cannot drift from the engine", () => {
    const justUnder = KILL_MIN_ROAS - 0.01;
    const justOver = KILL_MIN_ROAS + 0.01;
    const spend = 10;
    expect(findViolations(US, [row("1", spend, spend * justUnder, 1)], new Map([on("1")]))).toHaveLength(1);
    expect(findViolations(US, [row("1", spend, spend * justOver, 1)], new Map([on("1")]))).toHaveLength(0);
  });

  it("orders without sales, or sales without orders, count as never converted", () => {
    expect(findViolations(US, [row("1", 10, 0, 3)], new Map([on("1")]))[0].kind).toBe("never converted");
    expect(findViolations(US, [row("1", 10, 30, 0)], new Map([on("1")]))[0].kind).toBe("never converted");
  });
});

describe("the five words switched off on 2026-08-27", () => {
  // The real pick list. Every one must be caught by this rule, or the watchdog would have let
  // them through the way the engine did.
  const real: Array<[string, number, number, number]> = [
    ["phone tether PHRASE", 19.25, 28.47, 3],
    ["phone anti drop tether BROAD", 6.49, 9.49, 1],
    ["retractable lanyard phone EXACT", 5.48, 0, 0],
    ["phone case with leash PHRASE", 4.64, 0, 0],
    ["anti theft phone strap PHRASE", 4.43, 0, 0],
  ];
  it("catches all five", () => {
    const rows = real.map(([l, s, sa, o], i) => ({ id: String(i), label: l, spend: s, sales: sa, orders: o }));
    const live = new Map(rows.map((r) => on(r.id)));
    expect(findViolations(US, rows, live)).toHaveLength(5);
  });
});

describe("isLate", () => {
  it("a scope never seen is late", () => {
    expect(isLate(undefined, 100)).toBe(true);
    expect(isLate({ minutesSinceRun: null, runs24h: 0, runsWithActions24h: 0 }, 100)).toBe(true);
  });
  it("inside the window is not late", () => {
    expect(isLate({ minutesSinceRun: 61, runs24h: 24, runsWithActions24h: 9 }, 100)).toBe(false);
  });
  it("one whole missed hour is late", () => {
    expect(isLate({ minutesSinceRun: 130, runs24h: 22, runsWithActions24h: 8 }, 100)).toBe(true);
  });
});

const base = (over: Partial<WatchReport> = {}): WatchReport => ({
  generatedAt: "2026-08-27T14:15:00.000Z",
  lateAfterMinutes: 100,
  health: { "US Products": { minutesSinceRun: 35, runs24h: 24, runsWithActions24h: 9 } },
  lateScopes: [], violations: [], unread: [], orphanReports: 0, heartbeat: false,
  ...over,
});

describe("isClean and the message", () => {
  it("clean means no violations, nothing unread, nothing late", () => {
    expect(isClean(base())).toBe(true);
  });

  it("an UNREAD scope is NOT clean — we could not look, which is not the same as fine", () => {
    const r = base({ unread: [{ scope: CA, reason: "no completed report" }] });
    expect(isClean(r)).toBe(false);
    expect(formatWatch(r)).toContain("COULD NOT CHECK");
  });

  it("the clean message says silence means clean, so a dead watchdog is detectable", () => {
    const t = formatWatch(base());
    expect(t).toContain("all clean");
    expect(t).toContain("heartbeat");
  });

  it("a violation message names the country, the money and the word", () => {
    const r = base({
      violations: [{
        scope: US, id: "1", label: "retractable lanyard phone EXACT",
        spend: 5.48, sales: 0, orders: 0, roas: null, bid: 0.83, kind: "never converted",
      }],
    });
    expect(isClean(r)).toBe(false);
    const t = formatWatch(r);
    expect(t).toContain("US Products");
    expect(t).toContain("USD 5.48");
    expect(t).toContain("retractable lanyard phone EXACT");
    expect(t).toContain("no sales");
  });

  it("a late engine is reported even with zero violations", () => {
    const r = base({ lateScopes: ["CA Products"], health: { "CA Products": { minutesSinceRun: 400, runs24h: 2, runsWithActions24h: 0 } } });
    expect(isClean(r)).toBe(false);
    expect(formatWatch(r)).toContain("ENGINE NOT RUNNING");
  });

  it("caps a long list rather than sending an unreadable wall", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      scope: US, id: String(i), label: `w${i}`, spend: 10, sales: 0, orders: 0,
      roas: null, bid: 0.5, kind: "never converted" as const,
    }));
    expect(formatWatch(base({ violations: many }))).toContain("and 15 more");
  });
});
