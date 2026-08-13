import { describe, it, expect } from "vitest";
import { productionOf, didItHelp, type EpochProduction } from "./bid-ledger";

const row = (o: Record<string, unknown>) => ({
  entity_id: "k1", ad_product: "SPONSORED_PRODUCTS", label: "phone tether", month: "2026-08",
  bid: 0.5, from_bid: 0.6, direction: "down", reason: "under 2x",
  opened_at: "2026-08-01T00:00:00.000Z", closed_at: "2026-08-03T00:00:00.000Z",
  last_seen_at: "2026-08-03T00:00:00.000Z",
  open_spend: 0, open_sales: 0, open_orders: 0, open_clicks: 0, open_impressions: 0,
  last_spend: 0, last_sales: 0, last_orders: 0, last_clicks: 0, last_impressions: 0,
  ...o,
});

const prod = (o: Partial<EpochProduction>): EpochProduction => ({
  entityId: "k1", adProduct: "SPONSORED_PRODUCTS", label: "w", month: "2026-08",
  bid: 0.5, fromBid: null, direction: null, reason: null,
  openedAt: "2026-08-01T00:00:00.000Z", closedAt: null, hours: 24,
  spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, roas: null, ...o,
});

describe("productionOf — an epoch produced the DIFFERENCE, not the running total", () => {
  it("subtracts the counters it opened with", () => {
    // The month was already at $20/$40 when this bid took over; it then ran to $25/$60.
    const p = productionOf(row({
      open_spend: 20, open_sales: 40, open_orders: 4, open_clicks: 50, open_impressions: 2000,
      last_spend: 25, last_sales: 60, last_orders: 6, last_clicks: 62, last_impressions: 2600,
    }));
    expect(p.spend).toBe(5);
    expect(p.sales).toBe(20);
    expect(p.orders).toBe(2);
    expect(p.clicks).toBe(12);
    expect(p.impressions).toBe(600);
    expect(p.roas).toBe(4);
  });

  it("an epoch that produced nothing reads as nothing, not as a loss", () => {
    const p = productionOf(row({ open_spend: 9, last_spend: 9, open_sales: 9, last_sales: 9 }));
    expect(p.spend).toBe(0);
    expect(p.roas).toBeNull();
  });

  it("measures how long the bid was actually in force", () => {
    expect(productionOf(row({})).hours).toBe(48);
  });

  it("an epoch still open is measured to its last observation", () => {
    const p = productionOf(row({ closed_at: null, last_seen_at: "2026-08-02T00:00:00.000Z" }));
    expect(p.closedAt).toBeNull();
    expect(p.hours).toBe(24);
  });
});

describe("didItHelp — the question William actually asked", () => {
  it("'we lowered the bid and ROAS got 30% better' is exactly what it reports", () => {
    const before = prod({ bid: 0.60, spend: 10, sales: 20, clicks: 12, roas: 2.0 });
    const after  = prod({ bid: 0.50, spend: 8,  sales: 20.8, clicks: 11, roas: 2.6 });
    const v = didItHelp(before, after);
    expect(v.verdict).toBe("helped");
    expect(v.note).toMatch(/lowering \$0\.60 -> \$0\.50/);
    expect(v.note).toMatch(/\+30%/);
  });

  it("'we lowered it and the word stopped firing' is not scored as a win", () => {
    const before = prod({ bid: 0.60, spend: 10, sales: 20, clicks: 12, roas: 2.0 });
    const after  = prod({ bid: 0.40, spend: 0.4, sales: 0, clicks: 0, roas: null });
    expect(didItHelp(before, after).verdict).toBe("too early");
  });

  it("'we raised it and it still did not convert' reads as hurt, not as noise", () => {
    const before = prod({ bid: 0.40, spend: 6, sales: 18, clicks: 9, roas: 3.0 });
    const after  = prod({ bid: 0.60, spend: 9, sales: 9, clicks: 10, roas: 1.0 });
    const v = didItHelp(before, after);
    expect(v.verdict).toBe("hurt");
    expect(v.note).toMatch(/raising/);
  });

  it("refuses to judge a level nobody clicked — the failure this ledger exists to stop", () => {
    const before = prod({ bid: 0.50, spend: 4, sales: 9.49, clicks: 5, roas: 2.37 });
    const after  = prod({ bid: 0.40, spend: 0, sales: 0, clicks: 0, roas: null });
    expect(didItHelp(before, after).verdict).toBe("too early");
  });

  it("a move within 5% is honestly reported as no change", () => {
    const before = prod({ bid: 0.50, spend: 10, sales: 20, clicks: 12, roas: 2.0 });
    const after  = prod({ bid: 0.48, spend: 10, sales: 20.4, clicks: 12, roas: 2.04 });
    expect(didItHelp(before, after).verdict).toBe("no change");
  });
});
