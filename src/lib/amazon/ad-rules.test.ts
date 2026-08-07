import { describe, it, expect } from "vitest";
import {
  shouldKill, nextBid, decide, acosOf, ACOS_PIVOT,
  isValidKeywordText, shortenToValidKeyword, KEYWORD_MAX_CHARS, KEYWORD_MAX_WORDS,
  selectReintroductions, REINTRO_PER_DAY, REINTRO_PER_RUN, REINTRO_COHORT_DAILY_CAP,
  isProtected, KILL_SPEND,
  nextLadderBid, ladderVerdict, REINTRO_START_BID, BID_LADDER_MAX, BID_LADDER_STEP,
  isPermanentlyDead, deadKey, shouldRetirePermanently, isNextMonth, type MonthPerf,
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

describe("pace and safety rails (William 2026-08-06)", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) =>
    cand({ keywordId: String(i).padStart(3, "0"), keywordText: "word " + i,
           lifetimeRoas: 3, lifetimeSpend: 100, lifetimeSales: 300 + n - i, lifetimeOrders: 20 }));

  it("promotes at most REINTRO_PER_RUN in a single run", () => {
    const plan = selectReintroductions(many(60), fresh);
    expect(plan.promote).toHaveLength(REINTRO_PER_RUN);
    expect(plan.blockedBy).toContain("perRun");
  });

  it("still honours the per-DAY cap across runs, so 4 runs cannot exceed it", () => {
    // Three runs have already filled 30 of the day's slots.
    const plan = selectReintroductions(many(60), { ...fresh, introducedToday: REINTRO_PER_DAY - 3 });
    expect(plan.promote).toHaveLength(3);
    expect(plan.blockedBy).toContain("perDay");
  });

  it("halts entirely once the cohort has spent the daily cap", () => {
    const plan = selectReintroductions(many(60), { ...fresh, cohortSpendToday: REINTRO_COHORT_DAILY_CAP });
    expect(plan.promote).toHaveLength(0);
    expect(plan.blockedBy).toContain("dailyCap");
  });

  it("keeps promoting while the cohort is under the cap", () => {
    const plan = selectReintroductions(many(60), { ...fresh, cohortSpendToday: REINTRO_COHORT_DAILY_CAP - 0.01 });
    expect(plan.promote).toHaveLength(REINTRO_PER_RUN);
    expect(plan.blockedBy).not.toContain("dailyCap");
  });

  it("protects a freshly promoted word for the whole 14-day attribution window", () => {
    const now = Date.parse("2026-08-20T00:00:00Z");
    expect(isProtected("2026-08-19T00:00:00Z", now)).toBe(true);   // 1 day old
    expect(isProtected("2026-08-07T00:00:00Z", now)).toBe(true);   // 13 days old
    expect(isProtected("2026-08-05T00:00:00Z", now)).toBe(false);  // 15 days old, fair game
    expect(isProtected("not a date", now)).toBe(false);            // unparseable never protects
  });
});

describe("selectReintroductions — lifetime ROAS ranking (William 2026-08-06)", () => {
  it("rescues a word whose recent window looks bad but whose LIFETIME ROAS clears 2x", () => {
    // This is the exact shape of the 151 switched-off winners: the monthly rules starved them, so
    // the 95-day window shows spend at a terrible ACOS while the lifetime record is 2.3x.
    const c = cand({ keywordId: "001", histSpend: 10, histSales: 2, histOrders: 1, lifetimeRoas: 2.34, lifetimeSpend: 900, lifetimeSales: 2106, lifetimeOrders: 60 });
    expect(selectReintroductions([c], fresh).promote).toHaveLength(1);
    // ...and without the lifetime record the same word is correctly refused.
    const bare = cand({ keywordId: "001", histSpend: 10, histSales: 2, histOrders: 1 });
    expect(selectReintroductions([bare], fresh).promote).toHaveLength(0);
  });

  it("does not rescue a word whose lifetime ROAS is under the 2x bar", () => {
    const c = cand({ keywordId: "001", histSpend: 10, histSales: 2, histOrders: 1, lifetimeRoas: 1.7, lifetimeSpend: 900, lifetimeSales: 1530, lifetimeOrders: 60 });
    expect(selectReintroductions([c], fresh).promote).toHaveLength(0);
  });

  it("orders lifetime winners first, best ROAS first, ahead of window-proven and untested", () => {
    const plan = selectReintroductions([
      cand({ keywordId: "untested" }),
      cand({ keywordId: "windowproven", histSpend: 10, histSales: 100, histOrders: 4 }),  // 10% ACOS
      cand({ keywordId: "lifetime-2x", lifetimeRoas: 2.1, lifetimeSpend: 500, lifetimeSales: 1050, lifetimeOrders: 30 }),
      cand({ keywordId: "lifetime-4x", lifetimeRoas: 3.95, lifetimeSpend: 500, lifetimeSales: 1975, lifetimeOrders: 30 }),
    ], fresh);
    expect(plan.promote.map((p) => p.keywordId)).toEqual(["lifetime-4x", "lifetime-2x", "windowproven", "untested"]);
    expect(plan.promote[0].reason).toBe("lifetime");
    expect(plan.promote[2].reason).toBe("proven");
    expect(plan.promote[3].reason).toBe("untested");
  });

  it("breaks a ROAS tie toward the word that produced more money", () => {
    const plan = selectReintroductions([
      cand({ keywordId: "thin", lifetimeRoas: 2.5, lifetimeSpend: 12, lifetimeSales: 30, lifetimeOrders: 3 }),
      cand({ keywordId: "thick", lifetimeRoas: 2.5, lifetimeSpend: 4000, lifetimeSales: 10000, lifetimeOrders: 400 }),
    ], fresh);
    expect(plan.promote.map((p) => p.keywordId)).toEqual(["thick", "thin"]);
  });

  it("never resurrects a tombstoned word, however good its lifetime ROAS", () => {
    const c = cand({ keywordId: "001", keywordText: "phone tether", matchType: "PHRASE", lifetimeRoas: 9.9, lifetimeSpend: 5000, lifetimeSales: 49500, lifetimeOrders: 500 });
    const plan = selectReintroductions([c], fresh, { deadKeys: new Set(["phone tether|PHRASE"]) });
    expect(plan.promote).toHaveLength(0);
  });

  it("does not treat a huge ROAS built on one order as evidence", () => {
    // Real row from kw_lifetime: 79.8x, but that is $19.95 of sales on $0.25 and a single order.
    const noise = cand({ keywordId: "noise", histSpend: 5, histSales: 1, histOrders: 1, lifetimeRoas: 79.8, lifetimeSpend: 0.25, lifetimeSales: 19.95, lifetimeOrders: 1 });
    expect(selectReintroductions([noise], fresh).promote).toHaveLength(0);
  });

  it("ranks the word that produced the most money first, not the biggest ratio", () => {
    const plan = selectReintroductions([
      cand({ keywordId: "ratio", lifetimeRoas: 61.7, lifetimeSpend: 0.42, lifetimeSales: 25.90, lifetimeOrders: 2 }),
      cand({ keywordId: "money", lifetimeRoas: 24.4, lifetimeSpend: 9.81, lifetimeSales: 239.40, lifetimeOrders: 10 }),
    ], fresh);
    expect(plan.promote.map((p) => p.keywordId)).toEqual(["money", "ratio"]);
  });

  it("promotes only one copy of a duplicated word per run", () => {
    // "retractable smartphone safety leash" PHRASE exists three times in the live account.
    const copies = ["a", "b", "c"].map((id) =>
      cand({ keywordId: id, keywordText: "retractable smartphone safety leash", matchType: "PHRASE",
             lifetimeRoas: 24.4, lifetimeSpend: 9.81, lifetimeSales: 239.40, lifetimeOrders: 10 }));
    const other = cand({ keywordId: "z", keywordText: "smartphone safety leash", matchType: "PHRASE",
                         lifetimeRoas: 27.4, lifetimeSpend: 2.66, lifetimeSales: 72.80, lifetimeOrders: 4 });
    const plan = selectReintroductions([...copies, other], fresh);
    expect(plan.promote).toHaveLength(2);
    expect(plan.promote.map((p) => p.keywordText)).toEqual([
      "retractable smartphone safety leash", "smartphone safety leash",
    ]);
  });

  it("still respects the per-run gate when lifetime winners are plentiful", () => {
    const cands = Array.from({ length: 40 }, (_, i) =>
      cand({ keywordId: String(i).padStart(3, "0"), lifetimeRoas: 2 + i / 100, lifetimeSpend: 100, lifetimeSales: 200 + i, lifetimeOrders: 20 }));
    const plan = selectReintroductions(cands, fresh);
    expect(plan.promote).toHaveLength(REINTRO_PER_RUN);
    expect(plan.promote.every((p) => p.reason === "lifetime")).toBe(true);
  });
});

describe("selectReintroductions", () => {
  it("promotes at most REINTRO_PER_RUN in one run", () => {
    const cands = Array.from({ length: 50 }, (_, i) => cand({ keywordId: String(i).padStart(3, "0") }));
    const plan = selectReintroductions(cands, fresh);
    expect(plan.promote).toHaveLength(REINTRO_PER_RUN);
    expect(plan.blockedBy).toContain("perRun");
  });

  it("counts what was already introduced today", () => {
    const cands = Array.from({ length: 50 }, (_, i) => cand({ keywordId: String(i).padStart(3, "0") }));
    const plan = selectReintroductions(cands, { ...fresh, introducedToday: REINTRO_PER_DAY - 3 });
    expect(plan.promote).toHaveLength(3);
    expect(plan.blockedBy).toContain("perDay");
  });

  it("does NOT stop on how many are already in flight (William 2026-08-02)", () => {
    const cands = Array.from({ length: 50 }, (_, i) => cand({ keywordId: String(i).padStart(3, "0") }));
    const plan = selectReintroductions(cands, { ...fresh, inTrial: 500 });
    expect(plan.promote).toHaveLength(REINTRO_PER_RUN);
    expect(plan.blockedBy).toEqual(["perRun"]);
  });

  it("still honours an explicit maxInTrial when one is passed (ceiling available, just not default)", () => {
    const cands = Array.from({ length: 50 }, (_, i) => cand({ keywordId: String(i).padStart(3, "0") }));
    const plan = selectReintroductions(cands, { ...fresh, inTrial: 25 }, { maxInTrial: 25 });
    expect(plan.promote).toHaveLength(0);
    expect(plan.blockedBy).toContain("maxInTrial");
  });

  it("does NOT cap on total spend — a profitable cohort keeps expanding (William 2026-08-02)", () => {
    const cands = Array.from({ length: 50 }, (_, i) => cand({ keywordId: String(i).padStart(3, "0") }));
    const plan = selectReintroductions(cands, { ...fresh, cohortMonthSpend: 10_000 });
    expect(plan.promote).toHaveLength(REINTRO_PER_RUN);   // month-to-date spend is reported, never a gate
    expect(plan.blockedBy).toEqual(["perRun"]);
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

  it("ramps at exactly REINTRO_PER_RUN a run and nothing else holds it back", () => {
    // 30 consecutive daily runs against 2,000 floored keywords. With no in-trial ceiling the
    // unproven population grows by the daily quota until keywords resolve themselves — that is
    // William's chosen trade-off, asserted here so a future change to it is deliberate.
    const cands = Array.from({ length: 2000 }, (_, i) => cand({ keywordId: String(i).padStart(4, "0") }));
    let trial = 0;
    for (let day = 0; day < 30; day++) {
      const plan = selectReintroductions(cands, { introducedToday: 0, inTrial: trial, cohortMonthSpend: 0 });
      expect(plan.promote).toHaveLength(REINTRO_PER_RUN);
      trial += plan.promote.length;
    }
    expect(trial).toBe(30 * REINTRO_PER_RUN);
    expect(trial * KILL_SPEND).toBe(30 * REINTRO_PER_RUN * KILL_SPEND); // exposure grows, uncapped
  });

  it("a converting keyword frees its slot when a ceiling IS configured", () => {
    const cands = Array.from({ length: 50 }, (_, i) => cand({ keywordId: String(i).padStart(3, "0") }));
    expect(selectReintroductions(cands, { ...fresh, inTrial: 40 }, { maxInTrial: 40 }).promote).toHaveLength(0);
    expect(selectReintroductions(cands, { ...fresh, inTrial: 30 }, { maxInTrial: 40 }).promote).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// Bid ladder (William 2026-08-05): enter at $0.25, +$0.10 per day of ZERO spend, ceiling $0.85.
// "keep raising the spend $.10 a day until the keyword spends max of $.85"
// ---------------------------------------------------------------------------

describe("nextLadderBid — climb $0.10/day until it spends, cap $0.85", () => {
  it("enters at the low end, not $0.50", () => {
    expect(REINTRO_START_BID).toBe(0.25);
  });
  it("steps $0.25 -> $0.35 after a full day of zero spend", () => {
    expect(nextLadderBid({ bid: 0.25, spendSinceStep: 0, daysSinceStep: 1 })).toBe(0.35);
  });
  it("holds when the day is not yet complete", () => {
    expect(nextLadderBid({ bid: 0.25, spendSinceStep: 0, daysSinceStep: 0 })).toBeNull();
  });
  it("holds the moment the keyword spends anything, however small", () => {
    expect(nextLadderBid({ bid: 0.25, spendSinceStep: 0.01, daysSinceStep: 9 })).toBeNull();
  });
  it("stops at the $0.85 ceiling instead of overshooting", () => {
    expect(nextLadderBid({ bid: 0.75, spendSinceStep: 0, daysSinceStep: 1 })).toBe(0.85);
    expect(nextLadderBid({ bid: 0.85, spendSinceStep: 0, daysSinceStep: 30 })).toBeNull();
  });
  it("climbs 0.25 to 0.85 in exactly six daily steps", () => {
    const seen: number[] = [];
    let bid = REINTRO_START_BID;
    for (let d = 0; d < 20; d++) {
      const next = nextLadderBid({ bid, spendSinceStep: 0, daysSinceStep: 1 });
      if (next === null) break;
      bid = next; seen.push(next);
    }
    expect(seen).toEqual([0.35, 0.45, 0.55, 0.65, 0.75, 0.85]);
  });
  it("never exceeds the ceiling even with an absurd wait", () => {
    expect(nextLadderBid({ bid: 0.8, spendSinceStep: 0, daysSinceStep: 365 })).toBe(0.85);
  });
});

describe("ladderVerdict — $0.85 is an approval gate, not a dead end", () => {
  it("raises while below the ceiling", () => {
    expect(ladderVerdict({ bid: 0.45, spendSinceStep: 0, daysSinceStep: 1 }))
      .toEqual({ action: "raise", bid: 0.55 });
  });
  it("escalates at the ceiling when it still will not spend", () => {
    expect(ladderVerdict({ bid: 0.85, spendSinceStep: 0, daysSinceStep: 1 }))
      .toEqual({ action: "escalate", bid: 0.85 });
  });
  it("NEVER raises past the ceiling on its own", () => {
    const v = ladderVerdict({ bid: 0.85, spendSinceStep: 0, daysSinceStep: 99 });
    expect(v.action).toBe("escalate");
    expect("bid" in v ? v.bid : 0).toBeLessThanOrEqual(BID_LADDER_MAX);
  });
  it("holds at the ceiling once it starts spending, no notification", () => {
    expect(ladderVerdict({ bid: 0.85, spendSinceStep: 0.4, daysSinceStep: 5 }))
      .toEqual({ action: "hold" });
  });
  it("does not escalate before the waiting period elapses", () => {
    expect(ladderVerdict({ bid: 0.85, spendSinceStep: 0, daysSinceStep: 0 }))
      .toEqual({ action: "hold" });
  });
});

describe("permanent kill list — $4 spent with zero orders is dead for good", () => {
  it("tombstones $4 spent with no orders", () => {
    expect(isPermanentlyDead({ spend: 4, orders: 0, sales: 0 })).toBe(true);
  });
  it("does NOT tombstone a converter with a bad ACOS (it can recover on the 1st)", () => {
    expect(isPermanentlyDead({ spend: 10, orders: 1, sales: 5 })).toBe(false);
  });
  it("does NOT tombstone below the $4 bar", () => {
    expect(isPermanentlyDead({ spend: 3.99, orders: 0, sales: 0 })).toBe(false);
  });
  it("deadKey ignores casing and whitespace so a word cannot sneak back", () => {
    expect(deadKey("  Phone   Tether ", "exact")).toBe(deadKey("phone tether", "EXACT"));
  });
  it("treats different match types as different words", () => {
    expect(deadKey("phone tether", "EXACT")).not.toBe(deadKey("phone tether", "PHRASE"));
  });
  it("reintroduction skips a tombstoned keyword even when its history has aged out", () => {
    const agedOut: ReintroCandidate = {
      keywordId: "k1", keywordText: "Phone Tether", matchType: "EXACT",
      bid: 0.10, histSpend: 0, histSales: 0, histOrders: 0,   // looks never-spent: window rolled off
    };
    const state: ReintroState = { introducedToday: 0, inTrial: 0, cohortMonthSpend: 0 };
    expect(selectReintroductions([agedOut], state).promote).toHaveLength(1);
    const dead = new Set([deadKey("phone tether", "EXACT")]);
    expect(selectReintroductions([agedOut], state, { deadKeys: dead }).promote).toHaveLength(0);
  });
});

describe("shouldRetirePermanently — 3 consecutive dead months cuts a former winner", () => {
  const dead = (month: string): MonthPerf => ({ month, spend: 4.5, orders: 0, sales: 0 });
  const won = (month: string): MonthPerf => ({ month, spend: 10, orders: 4, sales: 40 });

  it("retires after 3 consecutive dead months", () => {
    expect(shouldRetirePermanently([dead("2026-05"), dead("2026-06"), dead("2026-07")])).toBe(true);
  });
  it("retires a proven past winner once it goes 3 months dead", () => {
    expect(shouldRetirePermanently([won("2026-04"), dead("2026-05"), dead("2026-06"), dead("2026-07")])).toBe(true);
  });
  it("does not retire on 2 dead months", () => {
    expect(shouldRetirePermanently([dead("2026-06"), dead("2026-07")])).toBe(false);
  });
  it("a single conversion resets the run", () => {
    expect(shouldRetirePermanently([dead("2026-04"), dead("2026-05"), won("2026-06"), dead("2026-07")])).toBe(false);
  });
  it("does not count months that spent less than $4 as dead", () => {
    expect(shouldRetirePermanently([dead("2026-05"), { month: "2026-06", spend: 1, orders: 0, sales: 0 }, dead("2026-07")])).toBe(false);
  });
  it("a calendar gap breaks the run — we cannot claim months we have no data for", () => {
    expect(shouldRetirePermanently([dead("2026-01"), dead("2026-02"), dead("2026-07")])).toBe(false);
  });
  it("handles out-of-order input by sorting chronologically", () => {
    expect(shouldRetirePermanently([dead("2026-07"), dead("2026-05"), dead("2026-06")])).toBe(true);
  });
  it("spans a year boundary correctly", () => {
    expect(shouldRetirePermanently([dead("2025-11"), dead("2025-12"), dead("2026-01")])).toBe(true);
    expect(isNextMonth("2025-12", "2026-01")).toBe(true);
    expect(isNextMonth("2025-12", "2026-02")).toBe(false);
  });
});
