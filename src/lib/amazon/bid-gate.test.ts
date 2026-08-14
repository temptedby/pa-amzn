import { describe, it, expect } from "vitest";
import { formatGateAsk } from "./bid-gate";
import type { BidEscalation } from "./ad-rules";

const esc = (o: Partial<BidEscalation>): BidEscalation =>
  ({ id: "1", label: "phone tether", bid: 0.85, wouldBe: 1.85,
     impressions: 1200, clicks: 0, spend: 0, reason: "", ...o });

describe("formatGateAsk — the message William asked to receive", () => {
  it("says what they are at, what the money bought, and names the next number", () => {
    const t = formatGateAsk("SPONSORED_PRODUCTS", [esc({})]);
    expect(t).toMatch(/at \$0\.85 and still not spending/);
    expect(t).toMatch(/1,200 impressions, 0 clicks/);
    expect(t).toMatch(/raise them past \$0\.85, another 10 cents every six hours up to \$1\.85/);
  });

  it("costs the climb out loud, the way he did", () => {
    const t = formatGateAsk("SPONSORED_PRODUCTS", [esc({})]);
    expect(t).toMatch(/10 runs, about 2\.5 days/);   // his own arithmetic, back to him
  });

  it("asks the second question at the second gate", () => {
    const t = formatGateAsk("SPONSORED_PRODUCTS", [esc({ bid: 1.85, wouldBe: 2.85 })]);
    expect(t).toMatch(/at \$1\.85/);
    expect(t).toMatch(/up to \$2\.85/);
  });

  it("does not invent a gate above the last one", () => {
    const t = formatGateAsk("SPONSORED_PRODUCTS", [esc({ bid: 2.85, wouldBe: null })]);
    expect(t).toMatch(/top gate/);
    expect(t).not.toMatch(/up to \$3/);
  });

  it("groups by gate so two landings are two questions, not one muddle", () => {
    const t = formatGateAsk("SPONSORED_PRODUCTS", [esc({ id: "a" }), esc({ id: "b", bid: 1.85, wouldBe: 2.85 })]);
    expect(t.match(/still not spending/g)).toHaveLength(2);
  });

  it("names the ad product, because all three can reach a gate now", () => {
    expect(formatGateAsk("SPONSORED_BRANDS", [esc({})])).toMatch(/Sponsored Brands/);
    expect(formatGateAsk("SPONSORED_DISPLAY", [esc({})])).toMatch(/Sponsored Display/);
  });

  it("truncates a long list instead of blowing the Telegram limit", () => {
    const many = Array.from({ length: 40 }, (_, i) => esc({ id: String(i), label: `word ${i}` }));
    const t = formatGateAsk("SPONSORED_PRODUCTS", many);
    expect(t).toMatch(/and 25 more/);
    expect(t.length).toBeLessThan(4096);
  });

  it("says nothing when there is nothing to ask", () => {
    expect(formatGateAsk("SPONSORED_PRODUCTS", [])).toBe("");
  });
});
