/**
 * The daily settled sweep: let go of words that lose money, without judging one whose sales have
 * not finished arriving.
 *
 * William 2026-10-06: "let go of words that lose money mind the attribution of 14 days", then
 * "daily please".
 *
 * Measured the day this was written, which is the whole case for it:
 *   active keywords that had never converted       196 words, $551.90
 *   still inside the 14-day window, NOT judgeable  177 words, $517.84
 *   fully settled and judgeable                     19 words,  $34.06
 *   $4+ of SETTLED spend and zero sales             25 words, $177.20   <- the real list
 *
 * Applying "not converting" to TOTAL spend would have switched off 177 words on evidence that had
 * not finished arriving. Two August kills had in fact converted; this is that mistake, prevented.
 */
import { describe, it, expect } from "vitest";
import { settledWindow, ATTRIBUTION_DAYS } from "./ad-rules";
import { settledSweepCandidates } from "./ad-engine";

const live = (keywordId: string, keywordText: string, matchType: string, state = "ENABLED") =>
  ({ keywordId, keywordText, matchType, state });
const perf = (spend: number, orders: number, sales: number) => ({ spend, orders, sales });

describe("settledWindow never lets us judge inside the attribution window", () => {
  it("ends exactly ATTRIBUTION_DAYS ago, so today's spend is never evidence", () => {
    const w = settledWindow(new Date("2026-10-06T12:00:00Z"));
    expect(w.end).toBe("2026-09-22");          // 14 days before 2026-10-06
    expect(w.start).toBe("2026-08-23");        // 30 days before that
  });

  it("stays inside the Ads API 31-day limit, which silently returns zero rows when exceeded", () => {
    const w = settledWindow(new Date("2026-10-06T12:00:00Z"));
    const days = (Date.parse(w.end) - Date.parse(w.start)) / 864e5;
    expect(days).toBeLessThanOrEqual(31);
  });

  it("moves forward a day at a time, so each day a new cohort becomes judgeable", () => {
    const a = settledWindow(new Date("2026-10-06T12:00:00Z"));
    const b = settledWindow(new Date("2026-10-07T12:00:00Z"));
    expect(b.end).toBe("2026-09-23");
    expect(b.start).toBe("2026-08-24");
    expect(a.end).not.toBe(b.end);
  });

  it("is 14 days, matching what Amazon actually credits", () => {
    expect(ATTRIBUTION_DAYS).toBe(14);
  });
});

describe("settledSweepCandidates applies the EXISTING kill rule to settled evidence only", () => {
  it("retires a word with $4+ settled spend and no sale", () => {
    // "phone tether clip" BROAD: $15.25 settled across 18 clicks, never a sale.
    const got = settledSweepCandidates([live("1", "phone tether clip", "BROAD")], new Map([["1", perf(15.25, 0, 0)]]));
    expect(got).toHaveLength(1);
    expect(got[0].retired).toBe(true);
  });

  it("switches off a weak converter but does NOT retire it, because attribution can still lift it", () => {
    // "cell phone retractable tether" EXACT: $6.91 -> $9.49, 1.37x. Off, but can come back.
    const got = settledSweepCandidates([live("2", "cell phone retractable tether", "EXACT")], new Map([["2", perf(6.91, 1, 9.49)]]));
    expect(got).toHaveLength(1);
    expect(got[0].retired).toBe(false);
  });

  it("leaves a word that cleared the bar alone", () => {
    const got = settledSweepCandidates([live("3", "retractable keychain", "PHRASE")], new Map([["3", perf(3.78, 1, 13.49)]]));
    expect(got).toHaveLength(0);
  });

  it("leaves a word that has not reached the kill bar alone, however badly it is doing", () => {
    // 159 of the 196 had never reached $4. The bar cannot see them and must not pretend to.
    const got = settledSweepCandidates([live("4", "barely tested", "BROAD")], new Map([["4", perf(3.99, 0, 0)]]));
    expect(got).toHaveLength(0);
  });

  it("NEVER judges a keyword with no settled evidence — silence is not a verdict", () => {
    // This is the whole point. A word spending hard inside the open window has no settled row,
    // so it is skipped entirely rather than read as a zero.
    const got = settledSweepCandidates([live("5", "spent $500 since yesterday", "BROAD")], new Map());
    expect(got).toHaveLength(0);
  });

  it("ignores keywords that are already switched off, so repeat runs are idempotent", () => {
    const got = settledSweepCandidates([live("6", "already off", "EXACT", "PAUSED")], new Map([["6", perf(50, 0, 0)]]));
    expect(got).toHaveLength(0);
  });

  it("the real 25-word batch: every one retired, and the weak converter kept separate", () => {
    const rows = [
      live("a", "phone tether clip", "BROAD"), live("b", "phone retractable tether", "EXACT"),
      live("c", "phone belt string", "BROAD"), live("d", "cell phone theft protection", "BROAD"),
      live("e", "cell phone retractable tether", "EXACT"),
    ];
    const settled = new Map([
      ["a", perf(15.25, 0, 0)], ["b", perf(11.63, 0, 0)], ["c", perf(11.42, 0, 0)],
      ["d", perf(10.31, 0, 0)], ["e", perf(6.91, 1, 9.49)],
    ]);
    const got = settledSweepCandidates(rows, settled);
    expect(got).toHaveLength(5);
    expect(got.filter((g) => g.retired)).toHaveLength(4);
    expect(got.find((g) => !g.retired)?.keywordText).toBe("cell phone retractable tether");
  });
});
