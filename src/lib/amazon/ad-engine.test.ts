import { describe, it, expect } from "vitest";
import { clampBidStep } from "./ad-engine";

// C1 regression (confabulator/ad-engine-audit-2026-06-25.md): the ±25%/run cap was breached by
// cent-rounding because round() ran AFTER the clamp. 22/80 logged rebids exceeded 25%. clampBidStep
// rounds the band edges inward so the final whole-cent bid never violates the cap.

const FLOOR = 0.1, CAP = 2.5, MAX_STEP = 0.25;

describe("clampBidStep — C1 cap-rounding fix", () => {
  it("never lets a small-bid INCREASE exceed +25% (the 0.10->0.13 / +30% case)", () => {
    const out = clampBidStep(0.1, 0.13);
    expect(out).toBeLessThanOrEqual(0.12);              // 0.10 * 1.25 = 0.125 -> floor 0.12
    expect((out - 0.1) / 0.1).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it("never lets a small-bid DECREASE exceed -25% (the 0.30->0.22 / -26.7% case)", () => {
    const out = clampBidStep(0.3, 0.22);
    expect(out).toBeGreaterThanOrEqual(0.23);            // 0.30 * 0.75 = 0.225 -> ceil 0.23
    expect((0.3 - out) / 0.3).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it("fixes the 0.11->0.14 / +27.3% case", () => {
    const out = clampBidStep(0.11, 0.14);
    expect(out).toBeLessThanOrEqual(0.13);              // 0.11 * 1.25 = 0.1375 -> floor 0.13
    expect((out - 0.11) / 0.11).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it("passes a raw target through unchanged when it sits inside the band", () => {
    expect(clampBidStep(1.0, 1.1)).toBe(1.1);            // +10%, within ±25%, whole cents
  });

  it("respects the global FLOOR and CAP", () => {
    expect(clampBidStep(0.1, 0.05)).toBeGreaterThanOrEqual(FLOOR); // can't go below $0.10
    expect(clampBidStep(2.5, 5.0)).toBeLessThanOrEqual(CAP);       // can't exceed $2.50
  });

  it("always returns whole cents", () => {
    for (let b = 0.1; b <= 2.5; b = +(b + 0.07).toFixed(2)) {
      const out = clampBidStep(b, b * 1.4);
      expect(+(out * 100).toFixed(6) % 1).toBe(0);
    }
  });

  it("PROPERTY: across the bid range, no clamped result ever breaches ±25%/run", () => {
    const cases: number[] = [];
    for (let b = 0.1; b <= 2.5; b = +(b + 0.01).toFixed(2)) cases.push(b);
    for (const base of cases) {
      for (const factor of [0.3, 0.5, 0.7, 0.76, 0.9, 1.1, 1.24, 1.5, 3]) {
        const out = clampBidStep(base, base * factor);
        const moved = Math.abs(out - base) / base;
        // inward rounding guarantees a STRICT cap: result stays inside [base*0.75, base*1.25]
        expect(moved).toBeLessThanOrEqual(MAX_STEP + 1e-9);
        expect(out).toBeGreaterThanOrEqual(FLOOR - 1e-9);
        expect(out).toBeLessThanOrEqual(CAP + 1e-9);
      }
    }
  });
});

import { harvestCandidates, harvestWindows, HARVEST_MIN_SPEND, HARVEST_MAX_ACOS, type SearchTermRow } from "./ad-engine";

// H1 fix (confabulator/ad-engine-audit-2026-06-25.md + .agent/ad-engine-harvest-rule.md):
// harvest a converting search term INTO THE AD GROUP IT CONVERTED IN (not one global anchor),
// qualifying on William's rule: cost >= $4 AND ACOS <= 50% (ROAS >= 2x == sales >= 2*cost).
const NEW_KW_BID = 0.5;
const row = (o: Partial<SearchTermRow>): SearchTermRow => ({ campaignId: "C1", adGroupId: "A1", cost: 0, sales14d: 0, ...o });

describe("harvestCandidates — H1 harvest into source ad group + $4/50%-ACOS rule", () => {
  it("harvests a qualifying term as EXACT + PHRASE into its OWN ad group", () => {
    const adds = harvestCandidates([row({ searchTerm: "phone tether clip", cost: 4, sales14d: 12 })], new Set());
    expect(adds.map((a) => a.matchType).sort()).toEqual(["EXACT", "PHRASE"]);
    expect(adds.every((a) => a.campaignId === "C1" && a.adGroupId === "A1")).toBe(true);
    expect(adds.every((a) => a.keywordText === "phone tether clip" && a.bid === NEW_KW_BID && a.state === "ENABLED")).toBe(true);
  });

  it("H1 CORE: the SAME term converting in two ad groups harvests into BOTH, separately", () => {
    const rows = [
      row({ searchTerm: "retractable clip", campaignId: "C1", adGroupId: "A1", cost: 5, sales14d: 20 }),
      row({ searchTerm: "retractable clip", campaignId: "C2", adGroupId: "A2", cost: 6, sales14d: 30 }),
    ];
    const adds = harvestCandidates(rows, new Set());
    expect(adds.filter((a) => a.adGroupId === "A1")).toHaveLength(2);
    expect(adds.filter((a) => a.adGroupId === "A2")).toHaveLength(2);
  });

  it("excludes a term below the $4 spend bar", () => {
    expect(harvestCandidates([row({ searchTerm: "cheap", cost: 3.99, sales14d: 100 })], new Set())).toHaveLength(0);
  });

  it("excludes a term with ACOS > 50% even at high spend (sales < 2*cost)", () => {
    // cost 10, sales 19 -> ACOS 52.6% > 50% -> not a winner
    expect(harvestCandidates([row({ searchTerm: "bleeder", cost: 10, sales14d: 19 })], new Set())).toHaveLength(0);
  });

  it("includes the exact 50%-ACOS boundary (sales == 2*cost)", () => {
    expect(harvestCandidates([row({ searchTerm: "edge", cost: 4, sales14d: 8 })], new Set())).toHaveLength(2);
  });

  it("excludes $4-spend term with ZERO sales (infinite ACOS)", () => {
    expect(harvestCandidates([row({ searchTerm: "noconv", cost: 5, sales14d: 0 })], new Set())).toHaveLength(0);
  });

  it("aggregates the chunked 60d windows: two sub-$4 rows of the same term+ad group sum to qualify", () => {
    const rows = [
      row({ searchTerm: "phone leash", cost: 2.5, sales14d: 8 }),
      row({ searchTerm: "phone leash", cost: 2.0, sales14d: 7 }),
    ]; // summed: cost 4.5 >= 4, sales 15, ACOS 30%
    expect(harvestCandidates(rows, new Set())).toHaveLength(2);
  });

  it("skips a match type already present IN THAT ad group, but still adds the missing one", () => {
    const existing = new Set(["A1|EXACT|phone tether clip"]);
    const adds = harvestCandidates([row({ searchTerm: "phone tether clip", cost: 4, sales14d: 12 })], existing);
    expect(adds.map((a) => a.matchType)).toEqual(["PHRASE"]);
  });

  it("allows harvesting a term into ad group A2 even if it already exists in A1 (per-ad-group dedup)", () => {
    const existing = new Set(["A1|EXACT|clip", "A1|PHRASE|clip"]);
    const adds = harvestCandidates([row({ searchTerm: "clip", campaignId: "C2", adGroupId: "A2", cost: 5, sales14d: 20 })], existing);
    expect(adds).toHaveLength(2);
    expect(adds.every((a) => a.adGroupId === "A2")).toBe(true);
  });

  it("skips ASIN-looking search terms (b0xxxxxxxx)", () => {
    expect(harvestCandidates([row({ searchTerm: "b0abcd1234", cost: 9, sales14d: 50 })], new Set())).toHaveLength(0);
  });

  it("skips rows missing the source ad group (can't know where to harvest)", () => {
    expect(harvestCandidates([{ searchTerm: "orphan", cost: 9, sales14d: 50 } as SearchTermRow], new Set())).toHaveLength(0);
  });

  it("uses the configured rule constants", () => {
    expect(HARVEST_MIN_SPEND).toBe(4);
    expect(HARVEST_MAX_ACOS).toBe(0.5);
  });
});

describe("harvestWindows — chunked <=31d trailing windows", () => {
  const NOW = Date.parse("2026-06-26T00:00:00Z");
  it("splits 60 days into two non-overlapping <=31d chunks", () => {
    const w = harvestWindows(60, NOW);
    expect(w).toHaveLength(2);
    expect(w[0]).toEqual(["2026-05-27", "2026-06-26"]); // [now-30, now]
    expect(w[1]).toEqual(["2026-04-27", "2026-05-26"]); // [now-60, now-31]
  });
  it("returns a single window for 30 days", () => {
    expect(harvestWindows(30, NOW)).toHaveLength(1);
  });
});


import { reactivationCandidates, REACT_WINDOW_DAYS } from "./ad-engine";

// Monthly reactivation (ad-engine-harvest-rule.md step 4, William 2026-06-26): re-enable a PAUSED
// keyword whose trailing 65d recovered to the same winner bar as harvest (cost >= $4 AND ACOS <= 50%).
const pk = (o: Partial<{ keywordId: string; keywordText: string; matchType: string; state: string }>) =>
  ({ keywordId: "K1", keywordText: "phone clip", matchType: "EXACT", state: "PAUSED", ...o });
const perf = (entries: [string, number, number][]) =>
  new Map(entries.map(([id, cost, sales]) => [id, { cost, sales }]));

describe("reactivationCandidates — monthly re-enable of recovered paused keywords", () => {
  it("re-enables a PAUSED keyword that recovered to >=$4 spend AND ACOS<=50%", () => {
    const out = reactivationCandidates([pk({})], perf([["K1", 6, 20]])); // ACOS 30%
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ keywordId: "K1", matchType: "EXACT", cost: 6, acos: 0.3 });
  });

  it("never reactivates an ENABLED keyword (only PAUSED are considered)", () => {
    expect(reactivationCandidates([pk({ state: "ENABLED" })], perf([["K1", 9, 50]]))).toHaveLength(0);
  });

  it("skips a paused keyword below the $4 spend bar", () => {
    expect(reactivationCandidates([pk({})], perf([["K1", 3.99, 100]]))).toHaveLength(0);
  });

  it("skips a paused keyword whose trailing ACOS is still > 50% (sales < 2*cost)", () => {
    // cost 10, sales 19 -> ACOS 52.6% -> stays paused
    expect(reactivationCandidates([pk({})], perf([["K1", 10, 19]]))).toHaveLength(0);
  });

  it("includes the exact 50%-ACOS boundary (sales == 2*cost)", () => {
    expect(reactivationCandidates([pk({})], perf([["K1", 4, 8]]))).toHaveLength(1);
  });

  it("skips a paused keyword with zero sales (infinite ACOS)", () => {
    expect(reactivationCandidates([pk({})], perf([["K1", 5, 0]]))).toHaveLength(0);
  });

  it("skips a paused keyword with NO recent performance data (nothing proves recovery)", () => {
    expect(reactivationCandidates([pk({ keywordId: "K9" })], perf([["K1", 9, 50]]))).toHaveLength(0);
  });

  it("uses a 65-day trailing window split into <=31d report chunks", () => {
    expect(REACT_WINDOW_DAYS).toBe(65);
    expect(harvestWindows(REACT_WINDOW_DAYS, Date.parse("2026-06-26T00:00:00Z")).length).toBeGreaterThanOrEqual(3);
  });
});
