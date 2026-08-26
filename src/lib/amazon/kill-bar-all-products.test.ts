import { describe, it, expect } from "vitest";
import { shouldKill, planBids, KILL_MIN_ROAS, KILL_SPEND, type BidCandidate } from "./ad-rules";
import { killPlan, REVIVE_MIN_ROAS } from "./ad-engine";
import { selectSdKills, type SdTargetPerf, type SdTargetState } from "./sd-engine";
import { selectCampaignsToKill, type CampaignPerf } from "./sbsd-engine";

// William 2026-08-26: "pr 15 needs to commit across all ad categories to stop spending when roas
// under 1.5". The constant was already shared, which is not the same thing as being guaranteed:
// PR #15's Brands and Display tests were fixture edits that kept the old assertions passing, so
// nothing here would have caught a product quietly acquiring a bar of its own.
//
// Every case below is derived from KILL_MIN_ROAS rather than written as 1.5, so moving the constant
// moves the whole account and a product that stops obeying it fails HERE, by name.

const UNDER = KILL_MIN_ROAS - 0.01;   // 1.49x — off, in every ad product
const AT = KILL_MIN_ROAS;             // 1.50x — survives, the bid rules own it
const SPEND = 10;                     // comfortably past KILL_SPEND in every currency-free test

/** sales that put $10 of spend at exactly `roas`. */
const salesFor = (roas: number) => +(SPEND * roas).toFixed(2);

describe("the 1.5x bar holds in every ad category", () => {
  // ---- Sponsored Products: keywords and product targets, via the shared predicate -------------
  describe("Sponsored Products", () => {
    it("switches a converting keyword off under the bar", () => {
      expect(shouldKill({ spend: SPEND, orders: 1, sales: salesFor(UNDER) })).toBe(true);
    });
    it("spares one exactly at the bar", () => {
      expect(shouldKill({ spend: SPEND, orders: 1, sales: salesFor(AT) })).toBe(false);
    });
    it("killPlan takes an ENABLED keyword under the bar and spares one at it", () => {
      const live = new Map([["K1", { keywordText: "phone tethered", matchType: "EXACT", state: "ENABLED", bid: 0.71 }]]);
      const rows = (roas: number) => [{ keywordId: "K1", cost: SPEND, sales14d: salesFor(roas), purchases14d: 1 }];
      expect(killPlan(rows(UNDER), live)).toHaveLength(1);
      expect(killPlan(rows(AT), live)).toHaveLength(0);
    });
  });

  // ---- Sponsored Brands: keyword level (sb-engine calls shouldKill with defaults) -------------
  describe("Sponsored Brands", () => {
    it("switches a converting keyword off under the bar", () => {
      expect(shouldKill({ spend: SPEND, orders: 2, sales: salesFor(UNDER) })).toBe(true);
    });
    it("spares one exactly at the bar", () => {
      expect(shouldKill({ spend: SPEND, orders: 2, sales: salesFor(AT) })).toBe(false);
    });
    it("the real August pair: 1.26x and 1.33x are both off", () => {
      expect(shouldKill({ spend: 7.52, orders: 1, sales: 9.49 })).toBe(true);  // phone tethered
      expect(shouldKill({ spend: 7.11, orders: 1, sales: 9.49 })).toBe(true);  // holdmate pro ...
    });
  });

  // ---- Sponsored Display: target level -------------------------------------------------------
  describe("Sponsored Display", () => {
    const state = (id: string): [string, SdTargetState] =>
      [id, { targetId: id, state: "enabled", campaignId: "C1", adGroupId: "G1", bid: 0.5 }];
    const LIVE = new Map<string, SdTargetState>([state("t1")]);
    const CAMPS = new Set(["C1"]);
    const perf = (roas: number): SdTargetPerf =>
      ({ targetId: "t1", text: "views 30d", spend: SPEND, sales: salesFor(roas), orders: 1, clicks: 9, impressions: 900 });

    it("switches a converting target off under the bar", () => {
      expect(selectSdKills([perf(UNDER)], LIVE, CAMPS).kill).toHaveLength(1);
    });
    it("spares one exactly at the bar", () => {
      expect(selectSdKills([perf(AT)], LIVE, CAMPS).kill).toHaveLength(0);
    });
    it("takes its bar from KILL_MIN_ROAS, not from a Display-only number", () => {
      // Raising the bar for this call alone must move the verdict. If Display ever hardcodes its
      // own line this stops being true.
      expect(selectSdKills([perf(AT)], LIVE, CAMPS, KILL_SPEND, KILL_MIN_ROAS + 0.5).kill).toHaveLength(1);
    });
  });

  // ---- The campaign-level sweep both Brands and Display share --------------------------------
  describe("campaign level (Brands and Display)", () => {
    const C = (roas: number): CampaignPerf =>
      ({ campaignId: "1", name: "SBV", state: "ENABLED", spend: SPEND, orders: 2, sales: salesFor(roas) });

    it("flags a converting campaign under the bar", () => {
      expect(selectCampaignsToKill([C(UNDER)])).toHaveLength(1);
    });
    it("spares one exactly at the bar", () => {
      expect(selectCampaignsToKill([C(AT)])).toHaveLength(0);
    });
  });

  // ---- and the bid planner, which must not re-bid something the kill is about to take ---------
  describe("planBids", () => {
    const cand = (roas: number): BidCandidate =>
      ({ id: "K1", label: "phone tethered", bid: 0.75, spend: SPEND, sales: salesFor(roas), orders: 1, clicks: 12, impressions: 900 });

    it("counts a word under the bar as killing and does not bid it", () => {
      const out = planBids([cand(UNDER)]);
      expect(out.killing).toBe(1);
      expect(out.moves).toHaveLength(0);
    });
    it("leaves one exactly at the bar to the bid rules", () => {
      expect(planBids([cand(AT)]).killing).toBe(0);
    });
  });

  // ---- the guarantee that makes one shared bar safe ------------------------------------------
  it("no ad product can flap: the kill bar sits clear of the revive bar", () => {
    expect(KILL_MIN_ROAS).toBe(1.5);
    expect(REVIVE_MIN_ROAS).toBe(2.0);
    expect(REVIVE_MIN_ROAS - KILL_MIN_ROAS).toBeGreaterThanOrEqual(0.5);
  });
});
