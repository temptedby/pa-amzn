import { describe, it, expect } from "vitest";
import {
  shouldKill, nextBid, decide, acosOf, ACOS_PIVOT,
  isValidKeywordText, shortenToValidKeyword, KEYWORD_MAX_CHARS, KEYWORD_MAX_WORDS,
  selectReintroductions, REINTRO_PER_DAY, REINTRO_MAX_IN_TRIAL, KILL_SPEND,
  type ReintroCandidate, type ReintroState,
} from "./ad-rules";

// William's spec (2026-08-02), written up in .agent/ad-engine-rules-2026-08-02.md:
// $4 MTD + bad ACOS -> kill for the month; ±10% bid step at the 52% break-even pivot;
// harvest respects Amazon's 80-char/10-word keyword limit; reintroduction is triple-throttled.

describe("shouldKill — $4 MTD + not profitable", () => {
  it("does not kill below the $4 bar even with 0 orders", () => {
    expect(shouldKill({ spend: 3.99, orders: 0, sales: 0 })).toBe(false);
  });
  it("kills at $4 with 0 orders", () => {
    expect(shouldKill({ spend: 4, orders: 0, sales: 0 })).toBe(true);
  });
  it("kills at $4+ when ACOS is at/above the 52% pivot even WITH orders", () => {
    expect(shouldKill({ spend: 5, orders: 2, sales: 8 })).toBe(true);    // 62.5% ACOS
    expect(shouldKill({ spend: 5.2, orders: 2, sales: 10 })).toBe(true); // exactly 52%
  });
  it("PROTECTS a profitable keyword past $4 (ACOS < 52% keeps running)", () => {
    expect(shouldKill({ spend: 4.5, orders: 3, sales: 20 })).toBe(false); // 22.5% ACOS
    expect(shouldKill({ spend: 5.1, orders: 2, sales: 10 })).toBe(false); // 51% — just profitable
  });
});

describe("nextBid — ±10% at the 52% pivot", () => {
  it("raises +10% when ACOS is below 52%", () => {
    expect(nextBid(1.0, { spend: 2, orders: 2, sales: 10 })).toBe(1.1);  // 20% ACOS
    expect(nextBid(1.0, { spend: 5.1, orders: 1, sales: 10 })).toBe(1.1); // 51% — still profitable
  });
  it("lowers -10% when ACOS is at/above 52%", () => {
    expect(nextBid(1.0, { spend: 6, orders: 1, sales: 10 })).toBe(0.9);   // 60% ACOS
    expect(nextBid(1.0, { spend: 5.2, orders: 1, sales: 10 })).toBe(0.9); // exactly 52% -> lower
  });
  it("holds when there is no ACOS signal (0 sales)", () => {
    expect(nextBid(0.5, { spend: 1, orders: 0, sales: 0 })).toBe(0.5);
  });
  it("clamps to the [0.10, 2.50] band and returns whole cents", () => {
    expect(nextBid(2.5, { spend: 1, orders: 1, sales: 10 })).toBe(2.5);
    expect(nextBid(0.1, { spend: 6, orders: 1, sales: 10 })).toBe(0.1);
    expect(nextBid(0.37, { spend: 1, orders: 1, sales: 10 })).toBe(0.41);
  });
  it("treats a zero/absent current bid as the floor", () => {
    expect(nextBid(0, { spend: 1, orders: 1, sales: 10 })).toBe(0.11);
  });
});

describe("decide — kill first, else ±10%, else hold", () => {
  it("kills over bidding", () => {
    expect(decide(1.0, { spend: 5, orders: 0, sales: 0 })).toEqual({ action: "kill" });
  });
  it("bids when profitable and under the kill bar", () => {
    expect(decide(1.0, { spend: 2, orders: 2, sales: 10 })).toEqual({ action: "bid", bid: 1.1 });
  });
  it("holds when no signal", () => {
    expect(decide(0.5, { spend: 1, orders: 0, sales: 0 })).toEqual({ action: "hold" });
  });
});

describe("acosOf", () => {
  it("is null without conversion", () => expect(acosOf({ spend: 3, orders: 0, sales: 0 })).toBeNull());
  it("is spend/sales with conversion", () => expect(acosOf({ spend: 3, orders: 1, sales: 6 })).toBe(0.5));
  it("pivot constant is the validated 52% break-even", () => expect(ACOS_PIVOT).toBe(0.52));
});

// --- Amazon's hard keyword limits (80 chars / 10 words) ---------------------------------

describe("isValidKeywordText", () => {
  it("accepts a normal keyword", () => expect(isValidKeywordText("retractable phone tether")).toBe(true));
  it("rejects empty/whitespace", () => {
    expect(isValidKeywordText("")).toBe(false);
    expect(isValidKeywordText("   ")).toBe(false);
  });
  it("rejects over 80 characters", () => {
    expect(isValidKeywordText("a".repeat(KEYWORD_MAX_CHARS))).toBe(true);
    expect(isValidKeywordText("a".repeat(KEYWORD_MAX_CHARS + 1))).toBe(false);
  });
  it("rejects over 10 words even when short", () => {
    expect(isValidKeywordText(Array(KEYWORD_MAX_WORDS).fill("ab").join(" "))).toBe(true);
    expect(isValidKeywordText(Array(KEYWORD_MAX_WORDS + 1).fill("ab").join(" "))).toBe(false);
  });
  it("rejects the exact live-bug term (98 chars, 14 words)", () => {
    const t = "phone assured retractable phone tether – durable clip-on leash for anti-drop & anti-theft security";
    expect(t.length).toBeGreaterThan(KEYWORD_MAX_CHARS);
    expect(isValidKeywordText(t)).toBe(false);
  });
});

describe("shortenToValidKeyword", () => {
  it("returns a valid term unchanged", () => {
    expect(shortenToValidKeyword("retractable phone tether")).toBe("retractable phone tether");
  });
  it("shortens the live-bug term to a usable root on a word boundary", () => {
    const t = "phone assured retractable phone tether – durable clip-on leash for anti-drop & anti-theft security";
    const s = shortenToValidKeyword(t);
    expect(s).not.toBeNull();
    expect(isValidKeywordText(s as string)).toBe(true);
    expect(t.startsWith(s as string)).toBe(true);          // it is a leading root, not a reshuffle
    expect((s as string).endsWith(" ")).toBe(false);        // clean word boundary
  });
  it("obeys the 10-word cap even when the text is short", () => {
    const t = Array(14).fill("ab").join(" ");               // 41 chars, 14 words
    const s = shortenToValidKeyword(t) as string;
    expect(s.split(/\s+/).length).toBe(KEYWORD_MAX_WORDS);
  });
  it("returns null when even the first word is too long", () => {
    expect(shortenToValidKeyword("x".repeat(KEYWORD_MAX_CHARS + 5))).toBeNull();
  });
  it("returns null for empty input", () => expect(shortenToValidKeyword("  ")).toBeNull());
  it("never returns something Amazon would reject (sweep)", () => {
    for (let words = 1; words <= 20; words++) {
      for (const wordLen of [1, 5, 12, 30]) {
        const t = Array(words).fill("z".repeat(wordLen)).join(" ");
        const s = shortenToValidKeyword(t);
        if (s !== null) expect(isValidKeywordText(s)).toBe(true);
      }
    }
  });
});

// --- Reintroduction throttles (the $0.10 floor trap) -----------------------------------

const cand = (o: Partial<ReintroCandidate> & { keywordId: string }): ReintroCandidate => ({
  keywordText: "kw " + o.keywordId, matchType: "EXACT", bid: 0.10,
  histSpend: 0, histSales: 0, histOrders: 0, ...o,
});
const fresh: ReintroState = { introducedToday: 0, inTrial: 0, cohortMonthSpend: 0 };

describe("selectReintroductions", () => {
  it("promotes at most REINTRO_PER_DAY in one run", () => {
    const cands = Array.from({ length: 50 }, (_, i) => cand({ keywordId: String(i).padStart(3, "0") }));
    const plan = selectReintroductions(cands, fresh);
    expect(plan.promote).toHaveLength(REINTRO_PER_DAY);
    expect(plan.blockedBy).toContain("perDay");
  });

  it("counts what was already introduced today", () => {
    const cands = Array.from({ length: 50 }, (_, i) => cand({ keywordId: String(i).padStart(3, "0") }));
    const plan = selectReintroductions(cands, { ...fresh, introducedToday: REINTRO_PER_DAY - 3 });
    expect(plan.promote).toHaveLength(3);
  });

  it("stops dead at the concurrent-in-trial cap", () => {
    const cands = Array.from({ length: 50 }, (_, i) => cand({ keywordId: String(i).padStart(3, "0") }));
    const plan = selectReintroductions(cands, { ...fresh, inTrial: REINTRO_MAX_IN_TRIAL });
    expect(plan.promote).toHaveLength(0);
    expect(plan.blockedBy).toContain("maxInTrial");
  });

  it("does NOT cap on total spend — a profitable cohort keeps expanding (William 2026-08-02)", () => {
    const cands = Array.from({ length: 50 }, (_, i) => cand({ keywordId: String(i).padStart(3, "0") }));
    const plan = selectReintroductions(cands, { ...fresh, cohortMonthSpend: 10_000 });
    expect(plan.promote).toHaveLength(REINTRO_PER_DAY);   // spend is reported, never a gate
    expect(plan.blockedBy).toEqual(["perDay"]);
  });

  it("excludes a keyword that spent at ACOS >= 50%", () => {
    const plan = selectReintroductions([
      cand({ keywordId: "bad", histSpend: 6, histSales: 10, histOrders: 1 }),   // 60%
      cand({ keywordId: "edge", histSpend: 5, histSales: 10, histOrders: 1 }),  // exactly 50%
    ], fresh);
    expect(plan.promote).toHaveLength(0);
    expect(plan.eligible).toBe(0);
  });

  it("excludes a keyword that spent with NO conversion at all", () => {
    const plan = selectReintroductions([cand({ keywordId: "dud", histSpend: 3, histSales: 0, histOrders: 0 })], fresh);
    expect(plan.promote).toHaveLength(0);
  });

  it("includes never-spent keywords and proven ones, proven first by best ACOS", () => {
    const plan = selectReintroductions([
      cand({ keywordId: "untested" }),
      cand({ keywordId: "ok", histSpend: 4, histSales: 10, histOrders: 1 }),    // 40%
      cand({ keywordId: "great", histSpend: 1, histSales: 10, histOrders: 1 }), // 10%
    ], fresh);
    expect(plan.promote.map((p) => p.keywordId)).toEqual(["great", "ok", "untested"]);
    expect(plan.promote.map((p) => p.reason)).toEqual(["proven", "proven", "untested"]);
  });

  it("only rescues keywords sitting AT the floor", () => {
    const plan = selectReintroductions([cand({ keywordId: "alive", bid: 0.45 })], fresh);
    expect(plan.promote).toHaveLength(0);
  });

  it("raises the bid off the floor to something that can win a click", () => {
    const plan = selectReintroductions([cand({ keywordId: "a" })], fresh);
    expect(plan.promote[0].fromBid).toBe(0.10);
    expect(plan.promote[0].toBid).toBeGreaterThan(0.10);
    expect(plan.promote[0].toBid).toBeLessThanOrEqual(2.50);
  });

  it("worst-case open exposure stays bounded: in-trial cap x $4 kill bar", () => {
    // Simulate 30 consecutive daily runs against 2,000 floored keywords and assert the
    // in-trial population never exceeds the cap — William's "no 1000 keywords x $4" guard.
    const cands = Array.from({ length: 2000 }, (_, i) => cand({ keywordId: String(i).padStart(4, "0") }));
    let trial = 0, promotedTotal = 0;
    for (let day = 0; day < 30; day++) {
      const plan = selectReintroductions(cands, { introducedToday: 0, inTrial: trial, cohortMonthSpend: 0 });
      trial += plan.promote.length;
      promotedTotal += plan.promote.length;
      expect(trial).toBeLessThanOrEqual(REINTRO_MAX_IN_TRIAL);
    }
    expect(promotedTotal).toBeLessThanOrEqual(REINTRO_MAX_IN_TRIAL);
    expect(trial * KILL_SPEND).toBeLessThanOrEqual(REINTRO_MAX_IN_TRIAL * KILL_SPEND); // <= $160 at risk
  });

  it("a converting keyword frees its trial slot, so winners make room for more", () => {
    // 40 on trial -> blocked. Once 10 of them convert they leave the pool and the next run flows.
    const cands = Array.from({ length: 50 }, (_, i) => cand({ keywordId: String(i).padStart(3, "0") }));
    expect(selectReintroductions(cands, { ...fresh, inTrial: REINTRO_MAX_IN_TRIAL }).promote).toHaveLength(0);
    const after = selectReintroductions(cands, { ...fresh, inTrial: REINTRO_MAX_IN_TRIAL - 10 });
    expect(after.promote).toHaveLength(10);
  });
});
