import { describe, it, expect } from "vitest";
import { selectCampaignsToKill, type CampaignPerf } from "./sbsd-engine";

const C = (o: Partial<CampaignPerf>): CampaignPerf => ({ campaignId: "1", name: "c", state: "ENABLED", spend: 0, orders: 0, sales: 0, ...o });

describe("selectCampaignsToKill — shared $4 rule at campaign level", () => {
  it("flags an ENABLED SB-Video campaign that burned $4+ with no sale", () => {
    const out = selectCampaignsToKill([C({ name: "SBV", spend: 12, orders: 0, sales: 0 })]);
    expect(out).toHaveLength(1);
    expect(out[0].acos).toBeNull();
  });
  // William 2026-08-13 moved the converting-campaign line from break-even down to 1x, across all
  // three ad products because this is deliberately ONE system. A campaign between 1x and
  // break-even is too expensive, not worthless, and too expensive is a bid problem.
  it("flags a campaign over $4 that returns LESS than 1x", () => {
    expect(selectCampaignsToKill([C({ spend: 8, orders: 2, sales: 7.9 })])).toHaveLength(1); // 0.99x
  });
  it("SPARES a campaign over $4 between 1.5x and break-even", () => {
    expect(selectCampaignsToKill([C({ spend: 8, orders: 2, sales: 13 })])).toHaveLength(0); // 1.63x
  });
  it("PROTECTS a profitable campaign past $4", () => {
    expect(selectCampaignsToKill([C({ spend: 6, orders: 5, sales: 40 })])).toHaveLength(0); // 6.7x
  });
  it("ignores paused/archived campaigns (case-insensitive; SD lowercases state)", () => {
    expect(selectCampaignsToKill([C({ state: "paused", spend: 20, orders: 0, sales: 0 })])).toHaveLength(0);
    expect(selectCampaignsToKill([C({ state: "ARCHIVED", spend: 20, orders: 0, sales: 0 })])).toHaveLength(0);
  });
  it("does not flag under the $4 bar", () => {
    expect(selectCampaignsToKill([C({ spend: 3.5, orders: 0, sales: 0 })])).toHaveLength(0);
  });
});
