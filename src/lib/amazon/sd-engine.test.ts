import { describe, it, expect } from "vitest";
import { selectSdKills, type SdTargetPerf, type SdTargetState } from "./sd-engine";

const target = (id: string, o: Partial<SdTargetState> = {}): [string, SdTargetState] =>
  [id, { targetId: id, state: "enabled", campaignId: "C1", adGroupId: "G1", bid: 0.5, ...o }];

const perf = (id: string, o: Partial<SdTargetPerf> = {}): SdTargetPerf =>
  ({ targetId: id, text: `target ${id}`, spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, ...o });

const LIVE = new Map<string, SdTargetState>([target("t1"), target("t2"), target("t3")]);
const CAMPS = new Set(["C1"]);

describe("Sponsored Display $4 kill — the rule Products and Brands already use", () => {
  it("pauses a target past $4 with no sale at all", () => {
    const p = selectSdKills([perf("t1", { spend: 6.2, orders: 0, sales: 0 })], LIVE, CAMPS);
    expect(p.kill.map((k) => k.targetId)).toEqual(["t1"]);
    expect(p.kill[0].acos).toBeNull();
  });

  it("pauses a target past $4 that returns less than 1x", () => {
    // $8 spent, $4 back = 0.5x. The ads cost more than the sales they produced, and no cheaper
    // bid rescues that. William 2026-08-13 moved this line down from the 1.923x break-even.
    const p = selectSdKills([perf("t1", { spend: 8, orders: 2, sales: 4 })], LIVE, CAMPS);
    expect(p.kill).toHaveLength(1);
    expect(p.kill[0].acos).toBe(2);
  });

  it("SPARES a target between 1x and break-even — it gets its bid cut, not a pause", () => {
    // $8 -> $10 is 1.25x: losing money against the 1.923x break-even, but still returning cash.
    // "at a 1.63 we need to attempt to lower the keyword bid before turning off" (William 08-13).
    const p = selectSdKills([perf("t1", { spend: 8, orders: 2, sales: 10 })], LIVE, CAMPS);
    expect(p.kill).toHaveLength(0);
  });

  it("leaves a PROFITABLE target alone however much it spends, and names it", () => {
    const p = selectSdKills([perf("t1", { spend: 40, orders: 20, sales: 200 })], LIVE, CAMPS);
    expect(p.kill).toHaveLength(0);
    expect(p.survived.map((s) => s.targetId)).toEqual(["t1"]);
  });

  it("does not touch anything under the $4 line, however bad the ratio", () => {
    const p = selectSdKills([perf("t1", { spend: 3.99, orders: 0, sales: 0 })], LIVE, CAMPS);
    expect(p.kill).toHaveLength(0);
    expect(p.survived).toHaveLength(0);   // under the bar is not a decision, it is silence
  });
});

describe("each spend is individual (William 2026-08-08)", () => {
  it("NEVER sums spend across targets — three targets at $2 each stay on", () => {
    // The whole point. $6 across three targets is not a $6 target. Nothing is combined.
    const p = selectSdKills([
      perf("t1", { spend: 2, orders: 0 }),
      perf("t2", { spend: 2, orders: 0 }),
      perf("t3", { spend: 2, orders: 0 }),
    ], LIVE, CAMPS);
    expect(p.kill).toHaveLength(0);
  });

  it("pauses ONLY the target that crossed the line, never its neighbours", () => {
    const p = selectSdKills([
      perf("t1", { spend: 9, orders: 0 }),          // over
      perf("t2", { spend: 3.5, orders: 0 }),        // under
      perf("t3", { spend: 12, orders: 6, sales: 80 }),  // over but 15% ACOS, profitable
    ], LIVE, CAMPS);
    expect(p.kill.map((k) => k.targetId)).toEqual(["t1"]);
    expect(p.survived.map((s) => s.targetId)).toEqual(["t3"]);
  });

  it("judges two targets pointing at the SAME ASIN separately", () => {
    const same = [perf("t1", { text: "asinSameAs B01", spend: 9, orders: 0 }),
                  perf("t2", { text: "asinSameAs B01", spend: 1, orders: 0 })];
    const p = selectSdKills(same, LIVE, CAMPS);
    expect(p.kill.map((k) => k.targetId)).toEqual(["t1"]);
  });
});

describe("only acts on what is actually actionable", () => {
  it("skips a target that is already paused, and counts it", () => {
    const live = new Map([target("t1", { state: "paused" })]);
    const p = selectSdKills([perf("t1", { spend: 9, orders: 0 })], live, CAMPS);
    expect(p.kill).toHaveLength(0);
    expect(p.alreadyOff).toBe(1);
  });

  it("skips a target the report knows about but the account does not", () => {
    const p = selectSdKills([perf("ghost", { spend: 9, orders: 0 })], LIVE, CAMPS);
    expect(p.kill).toHaveLength(0);
    expect(p.alreadyOff).toBe(1);
  });

  it("flags a target whose CAMPAIGN is not enabled rather than silently attempting it", () => {
    const live = new Map([target("t1", { campaignId: "C_OFF" })]);
    const p = selectSdKills([perf("t1", { spend: 9, orders: 0 })], live, CAMPS);
    expect(p.kill).toHaveLength(1);
    expect(p.kill[0].unwritable).toBe(true);
  });

  it("treats Display's lowercase state strings as equal to Products' uppercase ones", () => {
    const lower = new Map([target("t1", { state: "enabled" })]);
    const upper = new Map([target("t1", { state: "ENABLED" })]);
    const row = [perf("t1", { spend: 9, orders: 0 })];
    expect(selectSdKills(row, lower, CAMPS).kill).toHaveLength(1);
    expect(selectSdKills(row, upper, CAMPS).kill).toHaveLength(1);
  });

  it("leads with the most expensive offender", () => {
    const p = selectSdKills([
      perf("t1", { spend: 5, orders: 0 }),
      perf("t2", { spend: 30, orders: 0 }),
      perf("t3", { spend: 12, orders: 0 }),
    ], LIVE, CAMPS);
    expect(p.kill.map((k) => k.spend)).toEqual([30, 12, 5]);
  });

  it("never reports an unapplied kill as applied", () => {
    const p = selectSdKills([perf("t1", { spend: 9, orders: 0 })], LIVE, CAMPS);
    expect(p.kill[0].applied).toBe(false);   // only a confirmed SUCCESS from Amazon flips this
  });
});
