import { describe, it, expect } from "vitest";
import { selectCampaignsToKill, type CampaignPerf } from "./sbsd-engine";

const C = (o: Partial<CampaignPerf>): CampaignPerf => ({ campaignId: "1", name: "c", state: "ENABLED", spend: 0, orders: 0, sales: 0, ...o });

describe("selectCampaignsToKill — shared $4 rule at campaign level", () => {
  it("flags an ENABLED SB-Video campaign that burned $4+ with no sale", () => {
    const out = selectCampaignsToKill([C({ name: "SBV", spend: 12, orders: 0, sales: 0 })]);
    expect(out).toHaveLength(1);
    expect(out[0].acos).toBeNull();
  });
  it("flags a campaign over $4 at bad ACOS (>=50%) even with orders", () => {
    expect(selectCampaignsToKill([C({ spend: 8, orders: 2, sales: 10 })])).toHaveLength(1); // 80%
  });
  it("PROTECTS a profitable campaign past $4 (ACOS < 50%)", () => {
    expect(selectCampaignsToKill([C({ spend: 6, orders: 5, sales: 40 })])).toHaveLength(0); // 15%
  });
  it("ignores paused/archived campaigns (case-insensitive; SD lowercases state)", () => {
    expect(selectCampaignsToKill([C({ state: "paused", spend: 20, orders: 0, sales: 0 })])).toHaveLength(0);
    expect(selectCampaignsToKill([C({ state: "ARCHIVED", spend: 20, orders: 0, sales: 0 })])).toHaveLength(0);
  });
  it("does not flag under the $4 bar", () => {
    expect(selectCampaignsToKill([C({ spend: 3.5, orders: 0, sales: 0 })])).toHaveLength(0);
  });
});
