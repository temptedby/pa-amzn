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

import { harvestCandidates, harvestWindows, parseBulkOutcome, HARVEST_MIN_SPEND, HARVEST_MAX_ACOS, type SearchTermRow } from "./ad-engine";

// H1 fix (confabulator/ad-engine-audit-2026-06-25.md) + Rule 3 of
// .agent/ad-engine-rules-2026-08-02.md: harvest a search term INTO THE AD GROUP IT CONVERTED IN
// (not one global anchor), as soon as it CONVERTS — no spend bar. Amazon's 80-char/10-word keyword
// limit is enforced by shortening an over-long term to its longest valid root.
const NEW_KW_BID = 0.5;
// matchType defaults to BROAD because since 2026-08-08 only broad discoveries are harvested;
// the tests below are about the OTHER conditions, so they all start from an eligible match type.
const row = (o: Partial<SearchTermRow>): SearchTermRow =>
  ({ campaignId: "C1", adGroupId: "A1", cost: 0, sales14d: 0, purchases14d: 0, matchType: "BROAD", ...o });

describe("harvestCandidates — harvest on first conversion, into the source ad group", () => {
  it("harvests a qualifying term as EXACT + PHRASE into its OWN ad group", () => {
    const adds = harvestCandidates([row({ searchTerm: "phone tether clip", cost: 4, sales14d: 12, purchases14d: 1 })], new Set());
    expect(adds.map((a) => a.matchType).sort()).toEqual(["EXACT", "PHRASE"]);
    expect(adds.every((a) => a.campaignId === "C1" && a.adGroupId === "A1")).toBe(true);
    expect(adds.every((a) => a.keywordText === "phone tether clip" && a.bid === NEW_KW_BID && a.state === "ENABLED")).toBe(true);
  });

  it("H1 CORE: the SAME term converting in two ad groups harvests into BOTH, separately", () => {
    const rows = [
      row({ searchTerm: "retractable clip", campaignId: "C1", adGroupId: "A1", cost: 5, sales14d: 20, purchases14d: 2 }),
      row({ searchTerm: "retractable clip", campaignId: "C2", adGroupId: "A2", cost: 6, sales14d: 30, purchases14d: 3 }),
    ];
    const adds = harvestCandidates(rows, new Set());
    expect(adds.filter((a) => a.adGroupId === "A1")).toHaveLength(2);
    expect(adds.filter((a) => a.adGroupId === "A2")).toHaveLength(2);
  });

  it("harvests a cheap term the moment it converts WELL, with no spend bar", () => {
    // 42 cents -> $9.49 is 22.6x. No minimum spend: cheap evidence is still evidence.
    expect(harvestCandidates([row({ searchTerm: "cheap", cost: 0.42, sales14d: 9.49, purchases14d: 1 })], new Set())).toHaveLength(2);
  });

  // William 2026-08-07: converting is not enough, it has to RETURN. Break-even is 1.92x.
  it("REFUSES a converter that does not clear 2x — converting at a loss is still a loss", () => {
    // cost 10, sales 19 -> 1.9x, under break-even. Previously this earned two keywords and $4 of rope.
    expect(harvestCandidates([row({ searchTerm: "pricey", cost: 10, sales14d: 19, purchases14d: 2 })], new Set())).toHaveLength(0);
  });

  it("harvests exactly at the 2x line", () => {
    expect(harvestCandidates([row({ searchTerm: "breakeven", cost: 5, sales14d: 10, purchases14d: 1 })], new Set())).toHaveLength(2);
  });

  it("refuses a hair under the 2x line", () => {
    expect(harvestCandidates([row({ searchTerm: "just under", cost: 5, sales14d: 9.99, purchases14d: 1 })], new Set())).toHaveLength(0);
  });

  it("excludes a term with spend but ZERO conversions", () => {
    expect(harvestCandidates([row({ searchTerm: "noconv", cost: 5, sales14d: 0, purchases14d: 0 })], new Set())).toHaveLength(0);
  });

  it("aggregates the chunked windows: conversions in either chunk qualify the term once", () => {
    const rows = [
      row({ searchTerm: "phone leash", cost: 2.5, sales14d: 0, purchases14d: 0 }),
      row({ searchTerm: "phone leash", cost: 2.0, sales14d: 9.49, purchases14d: 1 }),
    ];
    // $4.50 total against $9.49 -> 2.1x, so it clears the bar on the COMBINED windows, not on one.
    expect(harvestCandidates(rows, new Set())).toHaveLength(2);
  });

  it("LIVE BUG: shortens the 98-char/14-word term instead of retrying it forever", () => {
    const long = "phone assured retractable phone tether – durable clip-on leash for anti-drop & anti-theft security";
    const adds = harvestCandidates([row({ searchTerm: long, cost: 3, sales14d: 9.49, purchases14d: 1 })], new Set());
    expect(adds).toHaveLength(2);
    for (const a of adds) {
      expect(a.keywordText.length).toBeLessThanOrEqual(80);
      expect(a.keywordText.split(/\s+/).length).toBeLessThanOrEqual(10);
      // Word order preserved; the separator dash is stripped, so compare against the normalised form.
      expect(long.replace(/(^|\s)[-–—]+(\s|$)/g, " ").replace(/\s+/g, " ").trim().startsWith(a.keywordText)).toBe(true);
      expect(a.keywordText).not.toMatch(/(^|\s)[-–—]+(\s|$)/);
    }
  });

  it("skips a converting term when no valid root can be formed (one giant token)", () => {
    const monster = "x".repeat(120);
    expect(harvestCandidates([row({ searchTerm: monster, cost: 3, sales14d: 9.49, purchases14d: 1 })], new Set())).toHaveLength(0);
  });

  it("skips a match type already present IN THAT ad group, but still adds the missing one", () => {
    const existing = new Set(["A1|EXACT|phone tether clip"]);
    const adds = harvestCandidates([row({ searchTerm: "phone tether clip", cost: 4, sales14d: 12, purchases14d: 1 })], existing);
    expect(adds.map((a) => a.matchType)).toEqual(["PHRASE"]);
  });

  it("allows harvesting a term into ad group A2 even if it already exists in A1 (per-ad-group dedup)", () => {
    const existing = new Set(["A1|EXACT|clip", "A1|PHRASE|clip"]);
    const adds = harvestCandidates([row({ searchTerm: "clip", campaignId: "C2", adGroupId: "A2", cost: 5, sales14d: 20, purchases14d: 2 })], existing);
    expect(adds).toHaveLength(2);
    expect(adds.every((a) => a.adGroupId === "A2")).toBe(true);
  });

  it("skips ASIN-looking search terms (b0xxxxxxxx)", () => {
    expect(harvestCandidates([row({ searchTerm: "b0abcd1234", cost: 9, sales14d: 50, purchases14d: 4 })], new Set())).toHaveLength(0);
  });

  it("skips rows missing the source ad group (can't know where to harvest)", () => {
    expect(harvestCandidates([{ searchTerm: "orphan", cost: 9, sales14d: 50, purchases14d: 4 } as SearchTermRow], new Set())).toHaveLength(0);
  });

  it("keeps the reactivation constants (now used by the monthly job, not harvest)", () => {
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


import { reactivationCandidates, REACT_WINDOW_DAYS, inMonthRevivals, REVIVE_MIN_ROAS, killPlan, PRICE_RESCALE } from "./ad-engine";

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

// ---------------------------------------------------------------------------
// Per-item write outcomes. Probed live 2026-08-07 against /sp/keywords with one
// valid id and one invalid one: Amazon answered HTTP 207 carrying BOTH a success
// and an error. 207 is inside the 2xx range, so `res.ok` was true — which is
// exactly how a keyword Amazon refused 40 times was logged applied=1 every time.
// ---------------------------------------------------------------------------
describe("parseBulkOutcome", () => {
  const real207 = {
    keywords: {
      success: [{ index: 0, keywordId: "52522040859374" }],
      error: [{
        index: 1,
        errors: [{
          errorType: "entityNotFoundError",
          errorValue: { entityNotFoundError: { entityId: "1", entityType: "KEYWORD", message: "Could not find keyword with id: 1", reason: "ENTITY_NOT_FOUND" } },
        }],
      }],
    },
  };

  it("splits a real 207 into the item that landed and the item that did not", () => {
    const o = parseBulkOutcome(real207, 2);
    expect([...o.succeededIdx]).toEqual([0]);
    expect(o.failed).toHaveLength(1);
    expect(o.failed[0]).toMatchObject({ index: 1, reason: "ENTITY_NOT_FOUND" });
  });

  it("a batch where EVERY item failed is not a success", () => {
    const allFailed = { keywords: { success: [], error: [{ index: 0, errors: [{ errorType: "x", errorValue: { x: { reason: "DUPLICATE_VALUE", message: "m" } } }] }] } };
    const o = parseBulkOutcome(allFailed, 1);
    expect(o.succeededIdx.size).toBe(0);
    expect(o.failed[0].reason).toBe("DUPLICATE_VALUE");
  });

  it("claims nothing from a body it does not recognise — silence is failure, never success", () => {
    for (const body of [null, {}, { something: "else" }, "not json at all"]) {
      expect(parseBulkOutcome(body, 3).succeededIdx.size).toBe(0);
    }
  });

  it("does not credit an index Amazon never mentioned", () => {
    const partial = { keywords: { success: [{ index: 0, keywordId: "1" }] } };
    const o = parseBulkOutcome(partial, 5);
    expect(o.succeededIdx.has(0)).toBe(true);
    expect(o.succeededIdx.has(4)).toBe(false);   // submitted, unacknowledged, therefore not applied
  });
});

// ---------------------------------------------------------------------------
// Monthly reset on LIFETIME evidence (William 2026-08-07: "if the words
// converted in past we refresh at the start of the new month").
//
// Route A on its own is a catch-22: a PAUSED keyword does not spend, so it can
// never build trailing-window evidence, so it can never prove it recovered.
// Measured against the live account the same day: 106 Sponsored Products words
// clear 1.92x lifetime on 2+ orders holding $27,764 of lifetime sales, and the
// window route finds essentially none of them.
// ---------------------------------------------------------------------------
describe("reactivationCandidates — lifetime route", () => {
  const paused = (id = "K1", text = "phone tether", match = "EXACT") =>
    [{ keywordId: id, keywordText: text, matchType: match, state: "PAUSED" }];
  const lt = (roas: number, orders: number, spend = 100) =>
    new Map([["phone tether|EXACT", { roas, spend, sales: spend * roas, orders }]]);

  it("brings back a word with NO recent spend at all, on its lifetime record alone", () => {
    // 4.0x recorded = 2.22x in today's money, comfortably over the rescaled bar. Was 3.1x when the
    // bar was 1.92x; the fixture moved with the bar, the behaviour under test did not.
    const out = reactivationCandidates(paused(), new Map(), lt(4.0, 40));
    expect(out).toHaveLength(1);
    expect(out[0].via).toBe("lifetime");
  });

  // William 2026-08-31: "reactivation bar should never turn on words that never converted only key
  // words that have converted above a 2x roas in the past". Pinned so the bar cannot drift back to
  // the old 1.92x break-even, and so a never-converted word can never return by any route.
  it("never re-enables a word that has never converted, however much it spent", () => {
    const neverSold = new Map([["phone tether|EXACT", { roas: 0, spend: 500, sales: 0, orders: 0 }]]);
    expect(reactivationCandidates(paused(), new Map(), neverSold)).toHaveLength(0);
  });

  // William 2026-08-31 chose the 2x to be read IN TODAY'S MONEY. Lifetime records were earned at
  // $19.95 and the product now sells for $9.49, so the bar on the recorded number is 2 / 0.556 =
  // 3.60x. A 2.00x record is only 1.11x today and would be killed again days after coming back.
  it("holds the lifetime bar at 3.60x, the price-rescaled 2x", () => {
    expect(reactivationCandidates(paused(), new Map(), lt(2.0, 40))).toHaveLength(0);
    expect(reactivationCandidates(paused(), new Map(), lt(3.59, 40))).toHaveLength(0);
    expect(reactivationCandidates(paused(), new Map(), lt(3.6, 40))).toHaveLength(1);
  });

  it("every word it re-enables clears the 1.5x kill bar once rescaled", () => {
    const out = reactivationCandidates(paused(), new Map(), lt(3.6, 40));
    expect(out).toHaveLength(1);
    expect((1 / out[0].acos) * PRICE_RESCALE).toBeGreaterThanOrEqual(1.5);
  });

  // Route A is the trailing-window path. It must refuse a never-converted word too, otherwise the
  // "only words that have converted" rule would have a second door standing open.
  it("route A also refuses a word with spend but no sales", () => {
    const spentNothingBack = new Map([["K1", { cost: 50, sales: 0 }]]);
    expect(reactivationCandidates(paused(), spentNothingBack, new Map())).toHaveLength(0);
  });

  it("leaves it off when lifetime is below break-even", () => {
    expect(reactivationCandidates(paused(), new Map(), lt(1.5, 40))).toHaveLength(0);
  });

  it("leaves it off on a single order, however flattering the ratio", () => {
    // 79x on one order and $0.25 of spend is noise, and led a real preview astray on 2026-08-06.
    expect(reactivationCandidates(paused(), new Map(), lt(79.8, 1, 0.25))).toHaveLength(0);
  });

  it("prefers the recent-recovery route and never double-counts a keyword", () => {
    const out = reactivationCandidates(paused(), perf([["K1", 6, 20]]), lt(3.1, 40));
    expect(out).toHaveLength(1);
    expect(out[0].via).toBe("window");
  });

  it("still never touches a keyword that is already ENABLED", () => {
    const on = [{ keywordId: "K1", keywordText: "phone tether", matchType: "EXACT", state: "ENABLED" }];
    expect(reactivationCandidates(on, new Map(), lt(3.1, 40))).toHaveLength(0);
  });

  it("works with no lifetime table at all — the window route is unaffected", () => {
    expect(reactivationCandidates(paused(), perf([["K1", 6, 20]]))).toHaveLength(1);
    expect(reactivationCandidates(paused(), new Map())).toHaveLength(0);
  });
});

describe("only BROAD discoveries are harvested (William 2026-08-08)", () => {
  // "only way to add new phrase and exact is if they perform as search terms for broad keywords"
  const win = { searchTerm: "anti theft phone strap", cost: 2.24, sales14d: 16.49, purchases14d: 1 };

  it("harvests a converting BROAD search term as EXACT + PHRASE", () => {
    // The real row from the live account, 2026-08-08: 7.4x, found by the broad keyword
    // "hand strap universal phone lanyard clip to belt" — the very keyword the $4 rule killed
    // that morning at 83% ACOS. The keyword loses money; this term inside it returns 7.4x.
    const adds = harvestCandidates([row({ ...win, keyword: "hand strap universal phone lanyard clip to belt" })], new Set());
    expect(adds.map((a) => a.matchType).sort()).toEqual(["EXACT", "PHRASE"]);
    expect(adds.every((a) => a.keywordText === "anti theft phone strap")).toBe(true);
  });

  it("does NOT harvest the same term when a PHRASE keyword found it", () => {
    expect(harvestCandidates([row({ ...win, matchType: "PHRASE" })], new Set())).toHaveLength(0);
  });

  it("does NOT harvest when an EXACT keyword found it", () => {
    expect(harvestCandidates([row({ ...win, matchType: "EXACT" })], new Set())).toHaveLength(0);
  });

  it("does NOT harvest auto-campaign discoveries by default", () => {
    // Auto reports as TARGETING_EXPRESSION_PREDEFINED with keyword text "loose-match", never BROAD.
    // Excluding it is the literal reading of William's rule and remains an open question.
    expect(harvestCandidates([row({ ...win, matchType: "TARGETING_EXPRESSION_PREDEFINED", keyword: "loose-match" })], new Set())).toHaveLength(0);
  });

  it("CAN include auto when asked, without a code change", () => {
    const adds = harvestCandidates([row({ ...win, matchType: "TARGETING_EXPRESSION_PREDEFINED" })], new Set(),
      NEW_KW_BID, { discoveryMatchTypes: ["BROAD", "TARGETING_EXPRESSION", "TARGETING_EXPRESSION_PREDEFINED"] });
    expect(adds).toHaveLength(2);
  });

  it("treats a row with NO match type as ineligible rather than assuming broad", () => {
    // Rows predating the column cannot be shown to be discoveries. Silence is not eligibility.
    expect(harvestCandidates([{ ...row(win), matchType: undefined }], new Set())).toHaveLength(0);
  });

  it("still applies the 2.0x bar to broad discoveries", () => {
    // 1.5x: converted, but below the bar William set and below the 1.92x break-even.
    expect(harvestCandidates([row({ searchTerm: "x", cost: 10, sales14d: 15, purchases14d: 1 })], new Set())).toHaveLength(0);
    expect(harvestCandidates([row({ searchTerm: "x", cost: 10, sales14d: 20, purchases14d: 1 })], new Set())).toHaveLength(2);
  });

  it("does not let a PHRASE row's spend drag a BROAD winner below the bar", () => {
    // Same term, two match types. Only the broad row counts toward the decision.
    const adds = harvestCandidates([
      row({ searchTerm: "shared term", cost: 1, sales14d: 10, purchases14d: 1, matchType: "BROAD" }),
      row({ searchTerm: "shared term", cost: 90, sales14d: 0, purchases14d: 0, matchType: "PHRASE" }),
    ], new Set());
    expect(adds).toHaveLength(2);
  });
});


// William 2026-08-08: "if a word is turned off and the 14 day attribution kicks in for sales dont
// turn it back on that month until that word reaches a 2.0 roas" / "turn it back on the moment the
// attribtion credits it above a 2.0".
import { shouldKill } from "./ad-rules";

describe("inMonthRevivals — the $4 kill undone once attribution lands", () => {
  const MONTH = "2026-08";
  const led = (id = "K1", word = "phone tether", match = "PHRASE", month = MONTH) =>
    [{ keywordId: id, word, matchType: match, month }];
  const live = (state = "PAUSED", id = "K1") => new Map([[id, { state }]]);
  const mtd = (spend: number, sales: number, orders = 1, id = "K1") =>
    new Map([[id, { spend, sales, orders }]]);

  it("brings back the real case: killed at 0 orders, then credited above the revive bar", () => {
    const out = inMonthRevivals(led(), live(), mtd(4.20, 9.49), MONTH);
    expect(out).toHaveLength(1);
    expect(out[0].roas).toBeCloseTo(2.26, 2);
    expect(out[0].word).toBe("phone tether");
  });

  it("leaves it off at the ACTUAL numbers both August kills are sitting on", () => {
    // 1.26x and 1.21x on 2026-08-08. Converting is not the bar, returning 2x is.
    expect(inMonthRevivals(led(), live(), mtd(7.55, 9.49), MONTH)).toHaveLength(0);
    expect(inMonthRevivals(led(), live(), mtd(13.61, 16.49), MONTH)).toHaveLength(0);
  });

  it("holds the line exactly at 2.15", () => {
    expect(inMonthRevivals(led(), live(), mtd(10, 21.49), MONTH)).toHaveLength(0);
    expect(inMonthRevivals(led(), live(), mtd(10, 21.5), MONTH)).toHaveLength(1);
  });

  it("cannot flap: nothing sits in both the kill window and the revival window", () => {
    // shouldKill pauses below the 52% ACOS pivot (1.923x); revival needs 2.0x. The band between
    // them is dead space on purpose, so one set of numbers can never do both.
    for (const roas of [1.93, 1.95, 1.99]) {
      expect(shouldKill({ spend: 10, sales: 10 * roas, orders: 1 })).toBe(false);
      expect(inMonthRevivals(led(), live(), mtd(10, 10 * roas), MONTH)).toHaveLength(0);
    }
  });

  it("ignores a kill from a previous month — that is the monthly reset's job", () => {
    expect(inMonthRevivals(led("K1", "phone tether", "PHRASE", "2026-07"), live(), mtd(4, 20), MONTH)).toHaveLength(0);
  });

  it("never overwrites a keyword William turned back on himself", () => {
    expect(inMonthRevivals(led(), live("ENABLED"), mtd(4, 20), MONTH)).toHaveLength(0);
  });

  it("skips a keyword that is gone from the account entirely", () => {
    expect(inMonthRevivals(led(), new Map(), mtd(4, 20), MONTH)).toHaveLength(0);
  });

  it("will not revive on sales with no order behind them", () => {
    expect(inMonthRevivals(led(), live(), mtd(4, 20, 0), MONTH)).toHaveLength(0);
  });

  it("will not revive a keyword with no month-to-date row at all", () => {
    expect(inMonthRevivals(led(), live(), new Map(), MONTH)).toHaveLength(0);
  });

  it("returns one pick per keyword even if the ledger holds duplicates", () => {
    const dupes = [...led(), ...led()];
    expect(inMonthRevivals(dupes, live(), mtd(4, 20), MONTH)).toHaveLength(1);
  });

  // 2.25x with William's 5% buffer beneath it (2026-08-21). Pinned so it cannot quietly drift.
  it("pins the bar at 2.15", () => {
    expect(REVIVE_MIN_ROAS).toBe(2.15);
  });
});


// William 2026-08-08: "should not be pausing all key words when only 1 spends". Sponsored Brands and
// Sponsored Display already had this pinned; Sponsored Products did not, so the guarantee rested on
// reading a loop. The real shape on the account: 541 groups hold more than one copy of the same
// (text, match type), and 281 of them are legitimately in mixed states.
describe("killPlan — the $4 kill judges a keyword id, never a word", () => {
  const kw = (id: string, text: string, match: string, state = "ENABLED", bid = 0.5) =>
    [id, { keywordText: text, matchType: match, state, bid }] as const;
  const live = (...ks: ReturnType<typeof kw>[]) => new Map(ks.map((k) => [k[0], k[1]]));
  const row = (id: string, cost: number, sales = 0, orders = 0) =>
    ({ keywordId: id, cost, sales14d: sales, purchases14d: orders });

  it("pauses only the copy that spent, leaving its siblings running", () => {
    // The real 2026-08-08 case: three copies of one text, one of them over $4 with nothing to show.
    const byId = live(
      kw("A", "hand strap universal phone lanyard clip to belt", "BROAD"),
      kw("B", "hand strap universal phone lanyard clip to belt", "EXACT"),
      kw("C", "hand strap universal phone lanyard clip to belt", "PHRASE"),
    );
    const out = killPlan([row("A", 6.95), row("B", 0.40), row("C", 0.10)], byId);
    expect(out).toHaveLength(1);
    expect(out[0].keywordId).toBe("A");
  });

  it("pauses two copies when two copies each spent $4 on their own", () => {
    // Independence cuts both ways: this is not "one per word", it is "each on its own evidence".
    const byId = live(kw("A", "phone tether", "PHRASE"), kw("B", "phone tether", "PHRASE"));
    expect(killPlan([row("A", 5), row("B", 6)], byId)).toHaveLength(2);
  });

  it("does not let a sibling's spend push a copy over the $4 line", () => {
    // $3 + $3 = $6 across two copies. Neither copy reaches $4, so neither dies.
    const byId = live(kw("A", "phone tether", "PHRASE"), kw("B", "phone tether", "PHRASE"));
    expect(killPlan([row("A", 3), row("B", 3)], byId)).toHaveLength(0);
  });

  it("ignores a copy that is already paused", () => {
    const byId = live(kw("A", "phone tether", "PHRASE", "PAUSED"));
    expect(killPlan([row("A", 99)], byId)).toHaveLength(0);
  });

  it("ignores a report row for a keyword that is no longer on the account", () => {
    expect(killPlan([row("GONE", 99)], live())).toHaveLength(0);
  });

  it("spares a copy that spent $4 but is still returning 1.5x or better", () => {
    // $4 alone is not the rule, and since 2026-08-13 nor is the 52% pivot. $4 AND under 1x is.
    // A copy between 1x and break-even gets its BID cut by the bid rules, not a pause.
    const byId = live(kw("A", "phone tether", "PHRASE"));
    expect(killPlan([row("A", 5, 20, 2)], byId)).toHaveLength(0);  // 4.0x
    expect(killPlan([row("A", 5, 8, 1)], byId)).toHaveLength(0);   // 1.6x — cut the bid, do not pause
    expect(killPlan([row("A", 5, 7.49, 1)], byId)).toHaveLength(1); // 1.498x — off
    expect(killPlan([row("A", 5, 0, 0)], byId)).toHaveLength(1);   // never converted — off
  });

  it("returns one verdict per id even if the report repeats a row", () => {
    const byId = live(kw("A", "phone tether", "PHRASE"));
    expect(killPlan([row("A", 9), row("A", 9)], byId)).toHaveLength(1);
  });
});
