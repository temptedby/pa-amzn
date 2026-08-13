import { describe, it, expect } from "vitest";
import {
  shouldKill, nextBid, decide, acosOf, ACOS_PIVOT,
  isValidKeywordText, shortenToValidKeyword, stripSeparatorDashes, KEYWORD_MAX_CHARS, KEYWORD_MAX_WORDS,
  selectReintroductions, REINTRO_PER_DAY, REINTRO_PER_RUN, REINTRO_COHORT_DAILY_CAP,
  isProtected, KILL_SPEND,
  nextLadderBid, ladderVerdict, REINTRO_START_BID, BID_LADDER_MAX, BID_LADDER_STEP,
  LADDER_GATES, nextGate, activeCeiling,
  isPermanentlyDead, deadKey, shouldRetirePermanently, isNextMonth, type MonthPerf,
  inCooldown, searchStep, bidWithMemory, daysSince, BID_COOLDOWN_HOURS, BID_FLOOR, BID_CAP, BID_CONFIRM_CEILING, TARGET_ROAS,
  type BidChange, type SinceChange,
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
  // William 2026-08-13 moved this line from the 1.923x break-even down to 1.0x: "once they're
  // below 1x, we got to turn them off", and "at a 1.63 we need to attempt to lower the keyword
  // bid before turning off". Between 1x and break-even the word is now the bid rules' problem.
  it("kills at $4+ when a CONVERTING keyword returns less than 1x", () => {
    expect(shouldKill({ spend: 5, orders: 2, sales: 4.99 })).toBe(true);  // 1.00x on 4.99/5 -> under
    expect(shouldKill({ spend: 10, orders: 1, sales: 9.49 })).toBe(true); // 0.95x, the real
                                                                         // `anti theft phone strap`
  });
  it("does NOT kill a keyword between 1x and break-even — it gets its bid cut instead", () => {
    // The three words the old rule took off the account on 11 August. All are above 1x.
    expect(shouldKill({ spend: 25.81, orders: 4, sales: 41.96 })).toBe(false); // 1.63x
    expect(shouldKill({ spend: 7.55, orders: 1, sales: 9.49 })).toBe(false);   // 1.26x
    expect(shouldKill({ spend: 9.02, orders: 1, sales: 9.49 })).toBe(false);   // 1.05x
  });
  it("kills exactly at the 1x line, not a cent below it", () => {
    expect(shouldKill({ spend: 10, orders: 1, sales: 10 })).toBe(false);  // exactly 1.00x survives
    expect(shouldKill({ spend: 10, orders: 1, sales: 9.99 })).toBe(true); // a cent under dies
  });
  it("still kills at $4 with 0 orders however the sales field reads", () => {
    expect(shouldKill({ spend: 4, orders: 0, sales: 0 })).toBe(true);
    expect(shouldKill({ spend: 4, orders: 0, sales: 50 })).toBe(true); // no order = never proved
  });
  it("PROTECTS a profitable keyword past $4", () => {
    expect(shouldKill({ spend: 4.5, orders: 3, sales: 20 })).toBe(false); // 4.4x
    expect(shouldKill({ spend: 5.1, orders: 2, sales: 10 })).toBe(false); // 1.96x
  });
  // The no-flapping guarantee, restated for the new line. Killing needs < 1.0x, reviving needs
  // 2.0x, so nothing can be killed and revived by the same numbers. The band is now WIDER.
  it("cannot flap: nothing is both killable and revivable", () => {
    for (const roas of [1.0, 1.25, 1.5, 1.63, 1.75, 1.92, 1.99]) {
      expect(shouldKill({ spend: 10, orders: 1, sales: 10 * roas })).toBe(false);
      expect(roas >= 2.0).toBe(false);
    }
  });
});

describe("nextBid — a flat ±$0.10 at the 52% pivot", () => {
  it("raises +10% when ACOS is below 52%", () => {
    expect(nextBid(1.0, { spend: 2, orders: 2, sales: 10 })).toBe(1.1);  // 20% ACOS, +$0.10
    expect(nextBid(1.0, { spend: 5.1, orders: 1, sales: 10 })).toBe(1.1); // 51% — still profitable
  });
  it("cuts a HIGH bid by a dime, not by a proportion (William 2026-08-13)", () => {
    // The whole point of his correction: 10% off $2.50 is 25 cents and skips three rungs before
    // the word has had the searches to show what the last rung did.
    expect(nextBid(2.5, { spend: 6, orders: 1, sales: 10 })).toBe(2.4);
    expect(nextBid(0.89, { spend: 6, orders: 1, sales: 10 })).toBe(0.79);
  });
  it("lowers -$0.10 when ACOS is at/above 52%", () => {
    expect(nextBid(1.0, { spend: 6, orders: 1, sales: 10 })).toBe(0.9);   // 60% ACOS, -$0.10
    expect(nextBid(1.0, { spend: 5.2, orders: 1, sales: 10 })).toBe(0.9); // exactly 52% -> lower
  });
  it("holds when there is no ACOS signal (0 sales)", () => {
    expect(nextBid(0.5, { spend: 1, orders: 0, sales: 0 })).toBe(0.5);
  });
  it("clamps to the [0.10, 2.50] band and returns whole cents", () => {
    expect(nextBid(2.5, { spend: 1, orders: 1, sales: 10 })).toBe(2.5);
    expect(nextBid(0.1, { spend: 6, orders: 1, sales: 10 })).toBe(0.1);
    expect(nextBid(0.37, { spend: 1, orders: 1, sales: 10 })).toBe(0.47); // flat dime, not 10%
  });
  it("treats a zero/absent current bid as the floor", () => {
    expect(nextBid(0, { spend: 1, orders: 1, sales: 10 })).toBe(0.2); // floor $0.10 + a dime
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
    const s = shortenToValidKeyword(t) as string;
    expect(s).not.toBeNull();
    expect(isValidKeywordText(s)).toBe(true);
    // A leading root, not a reshuffle — but the separator dash is dropped first, so compare against
    // the normalised term rather than the raw one. Word ORDER is what must be preserved.
    expect(stripSeparatorDashes(t).startsWith(s)).toBe(true);
    expect(s.endsWith(" ")).toBe(false);                    // clean word boundary
    expect(s).not.toMatch(/(^|\s)[-–—]+(\s|$)/);            // and carries no free-standing dash
  });

  // Live experiment 2026-08-07: the SAME term is refused with a dash and accepted without one, so
  // the dash is the whole reason the harvest resubmitted it 40 times. These pin that down.
  it("treats a free-standing dash as invalid, whatever kind of dash it is", () => {
    for (const d of ["-", "–", "—"]) {
      expect(isValidKeywordText(`phone tether ${d} durable leash`)).toBe(false);
    }
  });
  it("leaves a hyphen INSIDE a word alone — `clip-on` is accepted by Amazon", () => {
    expect(isValidKeywordText("durable clip-on leash")).toBe(true);
    expect(stripSeparatorDashes("durable clip-on leash")).toBe("durable clip-on leash");
  });
  it("removes the separator and closes the gap", () => {
    expect(stripSeparatorDashes("phone assured retractable phone tether – durable clip-on leash for"))
      .toBe("phone assured retractable phone tether durable clip-on leash for");
  });
  it("handles a run of separators without leaving one behind", () => {
    expect(stripSeparatorDashes("a - - b")).toBe("a b");
    expect(stripSeparatorDashes("- lead and trail -")).toBe("lead and trail");
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

  it("ranks the CHEAPEST proven winner first (William 2026-08-08)", () => {
    // Reversed from 2026-08-06, which led on lifetime sales volume. Both words return 2.5x; the one
    // that has only ever been given $12 is the unfinished experiment, so it goes first.
    const plan = selectReintroductions([
      cand({ keywordId: "thick", lifetimeRoas: 2.5, lifetimeSpend: 4000, lifetimeSales: 10000, lifetimeOrders: 400 }),
      cand({ keywordId: "thin", lifetimeRoas: 2.5, lifetimeSpend: 12, lifetimeSales: 30, lifetimeOrders: 3 }),
    ], fresh);
    expect(plan.promote.map((p) => p.keywordId)).toEqual(["thin", "thick"]);
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

  it("ranks by how little the word has been given, not by how much it produced", () => {
    // Both are real kw_lifetime rows. The 2-order evidence bar has already screened out noise, so
    // among survivors the $0.42 word is the one we know least about and is launched first.
    const plan = selectReintroductions([
      cand({ keywordId: "money", lifetimeRoas: 24.4, lifetimeSpend: 9.81, lifetimeSales: 239.40, lifetimeOrders: 10 }),
      cand({ keywordId: "ratio", lifetimeRoas: 61.7, lifetimeSpend: 0.42, lifetimeSales: 25.90, lifetimeOrders: 2 }),
    ], fresh);
    expect(plan.promote.map((p) => p.keywordId)).toEqual(["ratio", "money"]);
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
    // Cheapest-first ordering puts the $2.66 word ahead of the $9.81 one; the point of the test is
    // that only ONE of the three duplicate copies travels.
    expect(plan.promote.map((p) => p.keywordText)).toEqual([
      "smartphone safety leash", "retractable smartphone safety leash",
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
  it("steps EVERY RUN, not once a day (William 2026-08-08)", () => {
    // The cron is 6-hourly, so a run is the unit. Waiting a whole calendar day per dime is what
    // left 1,810 words at the floor: at one step a day a $0.10 word needs five days to reach the
    // $0.59 market CPC, against ~30 hours at one step a run.
    expect(nextLadderBid({ bid: 0.25, spendSinceStep: 0, daysSinceStep: 0 })).toBe(0.35);
  });
  it("holds the moment the keyword spends anything, however small", () => {
    expect(nextLadderBid({ bid: 0.25, spendSinceStep: 0.01, daysSinceStep: 9 })).toBeNull();
  });
  it("stops at the $0.85 ceiling instead of overshooting (William 2026-08-08: max bids go to $.85)", () => {
    expect(nextLadderBid({ bid: 0.75, spendSinceStep: 0, daysSinceStep: 1 })).toBe(0.85);
    expect(nextLadderBid({ bid: 0.85, spendSinceStep: 0, daysSinceStep: 30 })).toBeNull();
  });
  it("never exceeds the ceiling even with an absurd wait", () => {
    expect(nextLadderBid({ bid: 0.8, spendSinceStep: 0, daysSinceStep: 365 })).toBe(0.85);
  });
  it("climbs 0.25 to 0.85 in six dime steps — one per RUN, not one per day", () => {
    const seen: number[] = [];
    let bid = REINTRO_START_BID;
    for (let run = 0; run < 200; run++) {
      const next = nextLadderBid({ bid, spendSinceStep: 0, daysSinceStep: 0 });
      if (next === null) break;
      bid = next; seen.push(next);
    }
    expect(seen).toEqual([0.35, 0.45, 0.55, 0.65, 0.75, 0.85]);
  });
});

describe("LADDER_GATES — the $0.85 / $1.85 / $2.85 staircase (William 2026-08-13)", () => {
  it("offers the next gate up, and nothing past the last one", () => {
    expect(nextGate(0.85)).toBe(1.85);
    expect(nextGate(1.85)).toBe(2.85);
    expect(nextGate(2.85)).toBeNull();
  });
  it("a keyword nobody has ruled on climbs to $0.85 and no further", () => {
    expect(activeCeiling(null)).toBe(0.85);
    expect(activeCeiling(undefined)).toBe(0.85);
    const v = ladderVerdict({ bid: 0.85, spendSinceStep: 0, daysSinceStep: 1 });
    expect(v).toMatchObject({ action: "escalate", bid: 0.85, wouldBe: 1.85 });
  });
  it("once $1.85 is approved it keeps climbing a dime a run, then stops there", () => {
    // mid-climb: still below the approved ceiling, so it raises
    expect(ladderVerdict({ bid: 0.85, spendSinceStep: 0, daysSinceStep: 1 }, { approvedCeiling: 1.85 }))
      .toEqual({ action: "raise", bid: 0.95 });
    expect(ladderVerdict({ bid: 1.75, spendSinceStep: 0, daysSinceStep: 1 }, { approvedCeiling: 1.85 }))
      .toEqual({ action: "raise", bid: 1.85 });
    // at the new gate: stops and asks again, naming $2.85
    expect(ladderVerdict({ bid: 1.85, spendSinceStep: 0, daysSinceStep: 1 }, { approvedCeiling: 1.85 }))
      .toMatchObject({ action: "escalate", bid: 1.85, wouldBe: 2.85 });
  });
  it("ten runs between gates, which is the two and a half days William costed", () => {
    let bid = 0.85, runs = 0;
    while (runs < 50) {
      const v = ladderVerdict({ bid, spendSinceStep: 0, daysSinceStep: 1 }, { approvedCeiling: 1.85 });
      if (v.action !== "raise") break;
      bid = v.bid; runs++;
    }
    expect(bid).toBe(1.85);
    expect(runs).toBe(10);           // 10 runs x 6h = 60h = 2.5 days
  });
  it("carries the impressions and clicks William asked to see at the gate", () => {
    const v = ladderVerdict({ bid: 0.85, spendSinceStep: 0, daysSinceStep: 1 },
      { evidence: { impressions: 412, clicks: 0, spend: 0 } });
    expect(v).toMatchObject({ action: "escalate", evidence: { impressions: 412, clicks: 0 } });
  });
  it("a keyword that IS spending is never escalated, whatever its bid", () => {
    expect(ladderVerdict({ bid: 2.85, spendSinceStep: 0.4, daysSinceStep: 9 }, { approvedCeiling: 2.85 }))
      .toEqual({ action: "hold" });
  });
});

describe("ladderVerdict — $0.85 is an approval gate, not a dead end", () => {
  it("raises while below the ceiling", () => {
    expect(ladderVerdict({ bid: 0.45, spendSinceStep: 0, daysSinceStep: 1 }))
      .toEqual({ action: "raise", bid: 0.55 });
  });
  it("escalates at the ceiling when it still will not spend", () => {
    expect(ladderVerdict({ bid: 0.85, spendSinceStep: 0, daysSinceStep: 1 }))
      .toMatchObject({ action: "escalate", bid: 0.85 });
  });
  it("NEVER raises past the ceiling on its own", () => {
    const v = ladderVerdict({ bid: 0.85, spendSinceStep: 0, daysSinceStep: 99 });
    expect(v.action).toBe("escalate");
    expect("bid" in v ? v.bid : 0).toBeLessThanOrEqual(BID_LADDER_MAX);
  });
  it("holds the moment it starts spending — the $4 kill takes over from here", () => {
    expect(ladderVerdict({ bid: 0.85, spendSinceStep: 0.4, daysSinceStep: 5 }))
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

// ---------------------------------------------------------------------------
// Bid memory (William 2026-08-07). The engine had none: it read current ACOS,
// moved 10%, forgot, and did it again 6 hours later. Four compounding moves a
// day, none ever evaluated. Live evidence it was broken:
//   retractable phone holder belt clip   $0.82 -> $1.45 in 4 days
//   phone tethered                       0.49 -> 0.94 -> 0.35 in 6 days
// ---------------------------------------------------------------------------
describe("searchStep — find the cheapest bid that still works (William 2026-08-10)", () => {
  // "If the bid isn't getting impressions or clicks, then you have to raise it. If the bid is
  //  getting clicks and hopefully conversions, then you lower the bid and try to find that magical
  //  bid price where you can still get conversions and clicks without completely turning off the
  //  keyword."
  //
  // This REVERSES the 2026-08-07 rule, which raised anything at 2x or better. Both rules are
  // William's; they optimise different things. These tests pin the new one.
  const ev = (spend: number, sales: number, clicks = 10, orders = 1, impressions = 500): SinceChange =>
    ({ spend, sales, clicks, orders, impressions });
  const silent: SinceChange = { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };

  it("SHAVES a profitable word by two cents — 3x means hunt for a cheaper bid, not a bigger one", () => {
    const v = searchStep(0.50, ev(10, 30));
    expect(v.bid).toBe(0.48);
    if (v.bid !== null) expect(v.direction).toBe("down");
  });

  it("cuts a word under 2x by the full ten cents — it is paying too much per sale", () => {
    const v = searchStep(0.50, ev(10, 15));                    // 1.5x
    expect(v.bid).toBe(0.40);
    if (v.bid !== null) expect(v.direction).toBe("down");
  });

  it("treats exactly 2x as working, so it shaves gently rather than cutting hard", () => {
    const v = searchStep(0.50, ev(10, 20));
    expect(v.bid).toBe(0.48);
  });

  it("a hair under 2x gets the fast cut, not the gentle one", () => {
    const v = searchStep(0.50, ev(10, 19.9));
    expect(v.bid).toBe(0.40);
  });

  // The asymmetry is the point (William: "rather be cautious to test a profitable keyword slowly
  // then move too quick and turn off the spending and lose market share").
  it("never cuts a working word faster than a failing one", () => {
    const working = searchStep(1.00, ev(10, 30));              // 3x
    const failing = searchStep(1.00, ev(10, 5));               // 0.5x
    expect(working.bid).toBe(0.98);
    expect(failing.bid).toBe(0.90);
    if (working.bid !== null && failing.bid !== null) {
      expect(1.00 - working.bid).toBeLessThan(1.00 - failing.bid);
    }
  });

  it("RAISES a keyword with no impressions and no clicks — it is not in the auction at all", () => {
    const v = searchStep(0.10, silent);
    expect(v.bid).toBe(0.20);
    if (v.bid !== null) expect(v.direction).toBe("up");
  });

  // William 2026-08-10: "yes it climbs if not spending or converting you raise the bid to find the
  // optimal". At $0.10 a keyword wins only the positions nobody clicks, so silence there is a
  // position problem, and position is bought with bid.
  it("CLIMBS a keyword that is shown and never clicked — position is bought with bid", () => {
    const v = searchStep(0.50, { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 4000 });
    expect(v.bid).toBe(0.60);
    if (v.bid !== null) expect(v.direction).toBe("up");
  });

  it("clears the $0.59 market CPC in five runs, not nineteen", () => {
    let bid = 0.10, runs = 0;
    for (; runs < 25; runs++) {
      const v = searchStep(bid, silent);
      if (v.bid === null) break;
      bid = v.bid;
      if (bid > 0.59) break;
    }
    expect(bid).toBeGreaterThan(0.59);
    expect(runs).toBeLessThanOrEqual(5);
  });

  it("cuts cautiously when there are too few clicks to trust the ratio", () => {
    // 2 clicks cannot tell 3x from 0.3x, so it takes the cheap-mistake step.
    expect(searchStep(0.50, ev(3, 0, 2)).bid).toBe(0.48);
  });

  it("respects the floor, and the cap no longer binds because nothing profitable climbs", () => {
    expect(searchStep(BID_FLOOR, ev(10, 5)).bid).toBeNull();    // already at $0.10, cannot go lower
    expect(searchStep(BID_CAP, ev(10, 50)).bid).toBe(2.48);     // 5x at the cap: shaved, not held
  });

  // THE TURN-AROUND. William 2026-08-10: "we cut until the keyword doesnt perform as well. Less
  // impressions less sales then we start to go the other way little by little". This is what stops
  // a working keyword walking to the $0.10 floor, so it gets the sharpest tests in the file.
  describe("the turn-around — reversing a move that made things worse", () => {
    // A cut from $0.50 to $0.48, taken when the $0.50 level was producing 300 impressions and $30.
    const cut: BidChange = {
      changedAt: "2026-08-01T00:00:00.000Z", fromBid: 0.50, toBid: 0.48, roasBefore: 3,
      impressionsBefore: 300, clicksBefore: 10, salesBefore: 30,
    };

    // SUPERSEDED 2026-08-13. These two used to assert the turn-around climbing back up while the
    // word was still spending. William: "do not raise bid if the word is spending", "only raise
    // bid if word is not spending". His newer rule wins, and it is deliberately absolute — the
    // guard sits inside move() precisely so the turn-around cannot route around it. What the
    // turn-around still does is reverse a cut on a word that has gone SILENT, which is the case it
    // was written for on 08-10 ("less impressions less sales then we start to go the other way").
    it("will NOT climb back while the word is still spending", () => {
      const v = searchStep(0.48, { spend: 3, sales: 30, orders: 1, clicks: 8, impressions: 120 }, cut);
      expect(v.bid).toBeNull();
      expect(v.reason).toMatch(/never raised/);
    });

    it("will NOT climb back on lost sales either, while it is still spending", () => {
      const v = searchStep(0.48, { spend: 3, sales: 9.49, orders: 1, clicks: 8, impressions: 400 }, cut);
      expect(v.bid).toBeNull();
      expect(v.reason).toMatch(/never raised/);
    });

    it("DOES turn round once the cut has silenced the word — the case it was built for", () => {
      const v = searchStep(0.48, { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 }, cut);
      expect(v.bid).toBe(0.50);
      if (v.bid !== null) expect(v.direction).toBe("up");
      expect(v.reason).toMatch(/turning round little by little/);
    });

    it("keeps cutting while the cut is NOT hurting — better on both counts", () => {
      const v = searchStep(0.48, { spend: 3, sales: 40, orders: 2, clicks: 12, impressions: 350 }, cut);
      expect(v.bid).toBe(0.46);
      if (v.bid !== null) expect(v.direction).toBe("down");
    });

    it("turns a RAISE round too — the reversal is symmetric", () => {
      const raise: BidChange = {
        changedAt: "2026-08-01T00:00:00.000Z", fromBid: 0.40, toBid: 0.50, roasBefore: 3,
        impressionsBefore: 300, clicksBefore: 10, salesBefore: 30,
      };
      const v = searchStep(0.50, { spend: 5, sales: 12, orders: 1, clicks: 9, impressions: 250 }, raise);
      expect(v.bid).toBe(0.48);
      if (v.bid !== null) expect(v.direction).toBe("down");
    });

    it("does not fire without a baseline, so a keyword's first move is never second-guessed", () => {
      const noBaseline: BidChange = { changedAt: "2026-08-01T00:00:00.000Z", fromBid: 0.50, toBid: 0.48, roasBefore: 3 };
      const v = searchStep(0.48, { spend: 3, sales: 0, orders: 0, clicks: 1, impressions: 1 }, noBaseline);
      expect(v.bid).toBe(0.46);          // falls through to the ordinary cautious shave
    });

    // The settling behaviour William described: it oscillates a couple of cents around the best
    // bid rather than stopping dead, and it does that WELL above the $0.10 floor.
    it("settles by oscillating around the optimum instead of walking to the floor", () => {
      // Truth: this word needs $0.44 to hold its impressions. Below that they collapse.
      const impsAt = (bid: number) => (bid >= 0.44 ? 300 : 50);
      const salesAt = (bid: number) => (bid >= 0.44 ? 30 : 5);
      let bid = 0.60;
      let last: BidChange | null = null;
      const seen: number[] = [];
      for (let run = 0; run < 60; run++) {
        const since: SinceChange = { spend: 3, sales: salesAt(bid), orders: 1, clicks: 8, impressions: impsAt(bid) };
        const v = searchStep(bid, since, last);
        if (v.bid === null) break;
        last = {
          changedAt: "2026-08-01T00:00:00.000Z", fromBid: bid, toBid: v.bid, roasBefore: 3,
          impressionsBefore: impsAt(bid), clicksBefore: 8, salesBefore: salesAt(bid),
        };
        bid = v.bid;
        if (run > 40) seen.push(bid);
      }
      // It never gets anywhere near the floor, which is the whole point.
      for (const b of seen) expect(b).toBeGreaterThan(0.35);
      expect(Math.max(...seen) - Math.min(...seen)).toBeLessThanOrEqual(0.06);
    });

    it("holds at a bid already proven to be the word's floor, instead of cutting through it again", () => {
      const v = searchStep(0.50, ev(10, 30), null, { floorFound: 0.50 });
      expect(v.bid).toBeNull();
      expect(v.reason).toMatch(/known to still work at/);
    });
  });

  // Stated out loud because it is the risk the turn-around exists to remove: with NO baseline to
  // judge by — a keyword whose history predates 2026-08-10 — every path still points down, and the
  // word walks to the $0.10 floor where 1,750 others are stuck. The turn-around fires from the
  // second move onward, so this is a one-move exposure, not a permanent one.
  it("without any baseline to judge by, a working word would walk to the floor", () => {
    let bid = 0.85;
    for (let run = 0; run < 200; run++) {
      const v = searchStep(bid, ev(10, 30));     // no `last`, so no baseline, so no turn-around
      if (v.bid === null) break;
      bid = v.bid;
    }
    expect(bid).toBe(BID_FLOOR);
  });
});

// William 2026-08-08: "after .85 we communicate to confirm you dont go over $.85 per keyword".
// NOTE 2026-08-10: after the direction reversal, the ONLY path that can reach this ceiling is a
// word with no impressions and no clicks climbing the ladder. Profitable words never ask to go up
// any more, so the escalation fires far less often than it did. These tests were rewritten to use
// silent evidence for exactly that reason.
describe("the $0.85 ceiling — the engine asks instead of buying", () => {
  const ev = (spend: number, sales: number, clicks = 10, orders = 1, impressions = 500): SinceChange =>
    ({ spend, sales, clicks, orders, impressions });
  const silent: SinceChange = { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };

  it("climbs onto the ceiling but never through it", () => {
    const v = searchStep(0.80, silent);
    expect(v.bid).toBe(BID_CONFIRM_CEILING);   // $0.80 + $0.10 lands ON $0.85, not at $0.90
  });

  it("stops and escalates once it is sitting at $0.85", () => {
    const v = searchStep(BID_CONFIRM_CEILING, silent);
    expect(v.bid).toBeNull();
    if (v.bid === null) {
      expect(v.escalate).toBe(true);
      expect(v.wouldBe).toBeCloseTo(0.95, 2);   // what it WANTED, so William can judge the ask
    }
  });

  it("escalates rather than raising a silent keyword already above the line", () => {
    // The live account has 109 enabled keywords above $0.85 today, several at $2.50.
    const v = searchStep(1.94, silent);
    expect(v.bid).toBeNull();
    if (v.bid === null) expect(v.escalate).toBe(true);
  });

  it("a PROFITABLE keyword above the line is cut, not escalated — the new rule never asks to raise it", () => {
    const v = searchStep(1.94, ev(10, 100));     // 10x, as good as a keyword ever looks
    expect(v.bid).toBe(1.92);
    if (v.bid !== null) expect(v.direction).toBe("down");
  });

  it("still CUTS a keyword above the line without asking — lowering risk needs no permission", () => {
    const v = searchStep(1.94, ev(10, 5));       // 0.5x, badly underwater
    expect(v.bid).toBe(1.84);
    if (v.bid !== null) expect(v.direction).toBe("down");
  });

  it("never escalates on the way down", () => {
    const v = searchStep(0.85, ev(10, 5));
    expect(v.bid).toBe(0.75);
  });

  it("carries the escalation through bidWithMemory, which is what the engine calls", () => {
    const r = bidWithMemory(BID_CONFIRM_CEILING, { spend: 0, sales: 0, orders: 0 }, null,
      { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });
    expect(r.bid).toBeNull();
    expect(r.escalate).toBe(true);
  });

  it("does not mistake a cooldown hold for an escalation", () => {
    const justMoved: BidChange = { changedAt: new Date(Date.now() - 3600e3).toISOString(), fromBid: 0.75, toBid: 0.85, roasBefore: 3 };
    const r = bidWithMemory(BID_CONFIRM_CEILING, { spend: 10, sales: 100, orders: 5 }, justMoved,
      { spend: 10, sales: 100, orders: 5, clicks: 20 });
    expect(r.bid).toBeNull();
    expect(r.escalate).toBeUndefined();
  });

  it("a floored keyword still has a clear run to the ceiling", () => {
    let bid = BID_FLOOR, runs = 0;
    for (; runs < 25; runs++) {
      const v = searchStep(bid, { spend: 0, sales: 0, orders: 0, clicks: 0 });
      if (v.bid === null) break;
      bid = v.bid;
    }
    expect(bid).toBe(BID_CONFIRM_CEILING);   // $0.10 -> $0.85, then it asks
    expect(runs).toBeLessThanOrEqual(8);
  });
});

describe("bidWithMemory — cooldown then search", () => {
  it("holds a bid that moved an hour ago", () => {
    const justMoved: BidChange = { changedAt: new Date(Date.now() - 3600e3).toISOString(), fromBid: 0.5, toBid: 0.55, roasBefore: 3 };
    expect(bidWithMemory(0.55, { spend: 1, sales: 20, orders: 2 }, justMoved, { spend: 10, sales: 40, orders: 2, clicks: 20 }).bid).toBeNull();
  });
  it("acts once the 6-hour window has passed, so every engine run may move a bid", () => {
    const older: BidChange = { changedAt: new Date(Date.now() - 7 * 3600e3).toISOString(), fromBid: 0.5, toBid: 0.55, roasBefore: 3 };
    expect(bidWithMemory(0.55, { spend: 1, sales: 20, orders: 2 }, older, { spend: 10, sales: 40, orders: 2, clicks: 20 }).bid).not.toBeNull();
  });
  it("never blocks a keyword with no history", () => {
    expect(inCooldown(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The blended ROAS signal (William 2026-08-13), per RBB-bid-signal-window-2026-08-13.md
// ---------------------------------------------------------------------------
import { blendedRoas, currentWeight, roasTrend, trendVerdict, BLEND_K,
  BLEND_WEIGHT_CURRENT, TRAILING_WINDOW_DAYS } from "./ad-rules";

describe("currentWeight — William's 70/30, earned rather than assumed", () => {
  it("gives the current window nothing when it holds no clicks", () => {
    expect(currentWeight(0)).toBe(0);
  });
  it("lands on his 70% at 7 clicks, the volume that earns it", () => {
    expect(currentWeight(7)).toBeCloseTo(0.7, 10);
  });
  it("shrinks a one-click window hard, which is the whole point", () => {
    expect(currentWeight(1)).toBeCloseTo(0.25, 10);
    expect(currentWeight(3)).toBeCloseTo(0.5, 10);
    expect(currentWeight(20)).toBeCloseTo(0.87, 2);
  });
  it("rises monotonically with evidence and never reaches certainty", () => {
    let prev = -1;
    for (const c of [0, 1, 2, 3, 7, 20, 100, 1000]) {
      const w = currentWeight(c);
      expect(w).toBeGreaterThan(prev);
      expect(w).toBeLessThan(1);
      prev = w;
    }
  });
  it("ROLLBACK: k=0 collapses to today's pure current-window behaviour", () => {
    expect(currentWeight(0, 0)).toBe(1);
    expect(currentWeight(99, 0)).toBe(1);
  });
});

describe("blendedRoas", () => {
  const W = (spend: number, sales: number, clicks: number) => ({ spend, sales, clicks });

  it("a single lucky order in a 1-click window barely moves the blend", () => {
    // current says 10x off one click; trailing 13 days says 1.2x. The old engine would have
    // raised the bid on the 10x. The blend reads close to the trailing truth.
    const b = blendedRoas(W(0.95, 9.49, 1), W(25.81, 30.97, 60), { k: BLEND_K })!;
    expect(b).toBeGreaterThan(1.2);
    expect(b).toBeLessThan(4.0);
  });

  it("a busy current window is trusted, which is what William asked for", () => {
    const b = blendedRoas(W(10, 30, 20), W(100, 100, 200), { k: BLEND_K })!;
    expect(b).toBeGreaterThan(2.5);   // 87% of the way to 3.0x
  });

  it("a new keyword with no trailing history behaves exactly as the engine does today", () => {
    expect(blendedRoas(W(5, 15, 4), null)).toBe(3);
  });

  it("no spend anywhere is no signal, never a falling one", () => {
    expect(blendedRoas(W(0, 0, 0), W(0, 0, 0))).toBeNull();
    expect(roasTrend(null, 2)).toBe("unknown");
  });

  it("literal 70/30 is still available as a one-field override", () => {
    const b = blendedRoas(W(10, 40, 1), W(10, 10, 1), { weight: 0.7 })!;
    expect(b).toBeCloseTo(0.7 * 4 + 0.3 * 1, 10);
  });

  it("the blend ALONE does not save the real keyword — measured, not assumed", () => {
    // retractable phone tether PHRASE. One click, one $9.49 order in a 6h window reads 10.5x
    // against a trailing 1.63x. Even shrunk to 25% weight the blend is 3.86x and still "rising".
    // This is why trendVerdict exists: weighting is necessary and NOT sufficient.
    const b = blendedRoas(W(0.9, 9.49, 1), W(25.81, 41.96, 60), { k: BLEND_K })!;
    expect(b).toBeGreaterThan(3);
    expect(roasTrend(b, 1.63)).toBe("rising");
    // ...and this is the rule that actually refuses the raise — it is spending:
    const rr = searchStep(0.89, { spend: 0.9, sales: 9.49, orders: 1, clicks: 1, impressions: 40 });
    if (rr.bid !== null) expect(rr.direction).not.toBe("up");
  });
});

describe("roasTrend", () => {
  it("dead flat is not a trend", () => expect(roasTrend(2, 2)).toBe("unknown"));
  it("reads direction when there is one", () => {
    expect(roasTrend(2.5, 2)).toBe("rising");
    expect(roasTrend(1.5, 2)).toBe("falling");
  });
  it("BLEND_K is the documented 3", () => expect(BLEND_K).toBe(3));
});


describe("trendVerdict — no click minimum (William 2026-08-13: \"no 3 click min\")", () => {
  it("reads a rising signal as rising however thin the window", () => {
    for (const clicks of [0, 1, 2, 3, 50]) expect(trendVerdict(5, 2, clicks)).toBe("raise");
  });
  it("the guard against a lucky click is the spending rule, not a click count", () => {
    // searchStep is where that raise is actually refused, if the word is spending.
    const r = searchStep(0.5, { spend: 0.9, sales: 9.49, orders: 1, clicks: 1, impressions: 40 });
    if (r.bid !== null) expect(r.direction).not.toBe("up");
  });
  it("cuts on a falling signal however thin the window, because cutting spends less", () => {
    for (const clicks of [0, 1, 2, 3, 50]) expect(trendVerdict(1.2, 2, clicks)).toBe("cut");
  });
  it("holds when there is no signal at all", () => {
    expect(trendVerdict(null, 2, 99)).toBe("hold");
    expect(trendVerdict(2, null, 99)).toBe("hold");
    expect(trendVerdict(2, 2, 99)).toBe("hold");
  });
});


describe("the shipped split — William 2026-08-13: 30% for 7 days, 70% for now", () => {
  const W = (spend: number, sales: number, clicks: number) => ({ spend, sales, clicks });

  it("is a fixed 70/30 by default, not evidence-weighted", () => {
    expect(BLEND_WEIGHT_CURRENT).toBe(0.70);
    const b = blendedRoas(W(10, 40, 1), W(10, 10, 1))!;   // 4.0x current, 1.0x trailing
    expect(b).toBeCloseTo(0.7 * 4 + 0.3 * 1, 10);         // = 3.1, regardless of the 1 click
  });

  it("the trailing window is the 7 days he set", () => {
    expect(TRAILING_WINDOW_DAYS).toBe(7);
  });

  it("evidence weighting is still one argument away", () => {
    const fixed = blendedRoas(W(10, 40, 1), W(10, 10, 1))!;
    const shrunk = blendedRoas(W(10, 40, 1), W(10, 10, 1), { k: BLEND_K })!;
    expect(shrunk).toBeLessThan(fixed);                   // 25% weight vs 70%
  });

  it("one lucky click still reads high — and the SPENDING rule is what refuses it", () => {
    const b = blendedRoas(W(0.9, 9.49, 1), W(25.81, 41.96, 60))!;
    expect(b).toBeGreaterThan(1.63);                 // the number says "rising"
    expect(trendVerdict(b, 1.63, 1)).toBe("raise");  // and the trend agrees
    // ...but the word is spending, so no raise reaches the account:
    const r = searchStep(0.89, { spend: 0.9, sales: 9.49, orders: 1, clicks: 1, impressions: 40 });
    if (r.bid !== null) expect(r.direction).not.toBe("up");
  });

  it("cutting still needs no permission, which is what stops overspend", () => {
    const b = blendedRoas(W(10, 5, 2), W(100, 120, 200))!;  // current 0.5x drags the blend down
    expect(trendVerdict(b, 1.20, 2)).toBe("cut");
  });
});

describe("a spending word is NEVER raised (William 2026-08-13)", () => {
  const since = (o: Partial<SinceChange>): SinceChange =>
    ({ spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, ...o });

  it("a word with clicks was never on a raise path anyway — it is cut", () => {
    const r = searchStep(0.40, since({ spend: 0.55, clicks: 2, impressions: 90 }));
    expect(r.bid).not.toBeNull();
    if (r.bid !== null) expect(r.direction).toBe("down");
  });

  it("still raises a genuinely silent word — that is the one job raising has", () => {
    const r = searchStep(0.40, since({ spend: 0, clicks: 0, impressions: 0 }));
    expect(r).toMatchObject({ bid: 0.5, direction: "up" });
  });

  it("a word shown but never clicked is not spending, so it may still climb", () => {
    const r = searchStep(0.40, since({ spend: 0, clicks: 0, impressions: 900 }));
    expect(r).toMatchObject({ direction: "up" });
  });

  it("the TURN-AROUND cannot sneak a raise past the rule on a spending word", () => {
    // A cut that made things worse would normally reverse upward. It may not, if the word spends.
    const last = { changedAt: "2026-08-12T00:00:00Z", fromBid: 0.6, toBid: 0.5, roasBefore: 2,
                   impressionsBefore: 500, clicksBefore: 8, salesBefore: 19 };
    const r = searchStep(0.5, since({ spend: 1.2, clicks: 3, impressions: 200, sales: 0 }), last);
    expect(r.bid).toBeNull();
    expect(r.reason).toMatch(/never raised/);
  });

  it("but the turn-around still reverses upward when the word HAS gone silent", () => {
    const last = { changedAt: "2026-08-12T00:00:00Z", fromBid: 0.6, toBid: 0.5, roasBefore: 2,
                   impressionsBefore: 500, clicksBefore: 8, salesBefore: 19 };
    const r = searchStep(0.5, since({ spend: 0, clicks: 0, impressions: 0, sales: 0 }), last);
    expect(r).toMatchObject({ direction: "up" });
  });

  it("cutting a spending word is untouched — only the up direction is barred", () => {
    const r = searchStep(0.60, since({ spend: 4, sales: 2, clicks: 6, impressions: 300 }));
    expect(r).toMatchObject({ direction: "down" });
  });
});

// ---------------------------------------------------------------------------
// planBids — one bid planner for Products, Brands and Display (William 2026-08-13)
// ---------------------------------------------------------------------------
import { planBids, SD_BID_STEP, SD_BID_COOLDOWN_HOURS, SD_START_BID, type BidCandidate } from "./ad-rules";

const bidCand = (o: Partial<BidCandidate>): BidCandidate =>
  ({ id: "1", label: "w", bid: 0.5, spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, ...o });

describe("planBids", () => {
  it("raises a silent entity — the one job raising has", () => {
    const p = planBids([bidCand({ bid: 0.4, spend: 0, clicks: 0, impressions: 0 })]);
    expect(p.moves).toHaveLength(1);
    expect(p.moves[0]).toMatchObject({ toBid: 0.5, direction: "up" });
  });

  it("never raises a spending entity, on any product", () => {
    const p = planBids([bidCand({ bid: 0.4, spend: 2, sales: 8, orders: 1, clicks: 5, impressions: 300 })]);
    expect(p.moves.every((m) => m.direction === "down")).toBe(true);
  });

  it("cuts a dime under 2x and shaves two cents at or above it", () => {
    const under = planBids([bidCand({ bid: 0.6, spend: 4, sales: 4, orders: 1, clicks: 6, impressions: 300 })]);
    expect(under.moves[0]).toMatchObject({ toBid: 0.5, direction: "down" });
    const over = planBids([bidCand({ bid: 0.6, spend: 4, sales: 12, orders: 2, clicks: 6, impressions: 300 })]);
    expect(over.moves[0]).toMatchObject({ toBid: 0.58, direction: "down" });
  });

  it("never bids on something the $4 rule is switching off — no double write", () => {
    // $5 spent, nothing back: shouldKill takes it. The planner must not also move its bid.
    const p = planBids([bidCand({ bid: 0.6, spend: 5, sales: 0, orders: 0, clicks: 9, impressions: 400 })]);
    expect(p.moves).toHaveLength(0);
    expect(p.killing).toBe(1);
  });

  it("still bids on a word above 1x that the kill now spares", () => {
    // 1.26x — killed under the old rule, kept and CUT under William's 08-13 line.
    const p = planBids([bidCand({ bid: 0.6, spend: 7.55, sales: 9.49, orders: 1, clicks: 9, impressions: 400 })]);
    expect(p.killing).toBe(0);
    expect(p.moves[0]).toMatchObject({ direction: "down" });
  });

  it("reports an unwritable entity instead of attempting it", () => {
    const p = planBids([bidCand({ bid: 0.4, spend: 0, clicks: 0, writable: false })]);
    expect(p.moves).toHaveLength(0);
    expect(p.blocked).toBe(1);
  });

  it("escalates at the approved gate with the evidence William asked for", () => {
    const p = planBids([bidCand({ bid: 0.85, spend: 0, clicks: 0, impressions: 1200 })]);
    expect(p.moves).toHaveLength(0);
    expect(p.escalated[0]).toMatchObject({ bid: 0.85, wouldBe: 1.85, impressions: 1200, clicks: 0 });
  });

  it("keeps climbing past $0.85 once that entity has an approved ceiling", () => {
    const p = planBids([bidCand({ bid: 0.85, spend: 0, clicks: 0, approvedCeiling: 1.85 })]);
    expect(p.moves[0]).toMatchObject({ toBid: 0.95, direction: "up" });
  });

  it("ONE SYSTEM: identical numbers give an identical verdict whatever product they came from", () => {
    const shape = { bid: 0.6, spend: 4, sales: 4, orders: 1, clicks: 6, impressions: 300 };
    const sp = planBids([bidCand({ ...shape, id: "sp", label: "keyword" })]);
    const sb = planBids([bidCand({ ...shape, id: "sb", label: "sb keyword" })]);
    const sd = planBids([bidCand({ ...shape, id: "sd", label: "sd target" })]);
    expect(sp.moves[0].toBid).toBe(sb.moves[0].toBid);
    expect(sb.moves[0].toBid).toBe(sd.moves[0].toBid);
  });
});

describe("Sponsored Display steps in 5c, once a day (William 2026-08-13)", () => {
  const c = (o: Partial<BidCandidate>): BidCandidate =>
    ({ id: "1", label: "views 7d", bid: 0.10, spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, ...o });

  it("the constants are the ones he specified", () => {
    expect(SD_BID_STEP).toBe(0.05);
    expect(SD_BID_COOLDOWN_HOURS).toBe(24);
    expect(SD_START_BID).toBe(0.10);
  });

  it("a silent Display audience climbs a NICKEL, not a dime", () => {
    const p = planBids([c({ bid: 0.10 })], { step: SD_BID_STEP });
    expect(p.moves[0]).toMatchObject({ fromBid: 0.10, toBid: 0.15, direction: "up" });
  });

  it("walks his ladder: 10 -> 15 -> 20", () => {
    let bid = 0.10; const seen = [bid];
    for (let i = 0; i < 2; i++) {
      const p = planBids([c({ bid })], { step: SD_BID_STEP });
      bid = p.moves[0].toBid; seen.push(bid);
    }
    expect(seen).toEqual([0.10, 0.15, 0.20]);
  });

  it("a spending Display audience is still never raised", () => {
    const p = planBids([c({ bid: 0.10, spend: 2, sales: 5, orders: 1, clicks: 8, impressions: 400 })],
      { step: SD_BID_STEP });
    expect(p.moves.every((m) => m.direction === "down")).toBe(true);
  });

  it("cuts in nickels too, so the search can settle between 15c and 20c", () => {
    // 1.5x: above the 1x kill line so it survives, below 2x so it is cut at pace.
    const p = planBids([c({ bid: 0.20, spend: 4, sales: 6, orders: 1, clicks: 9, impressions: 500 })],
      { step: SD_BID_STEP });
    expect(p.moves[0]).toMatchObject({ toBid: 0.15, direction: "down" });
  });

  it("and a Display audience under 1x is killed, not nudged", () => {
    // The case that caught my own test out: $4 back $2 is 0.50x, which is a kill, not a bid move.
    const p = planBids([c({ bid: 0.20, spend: 4, sales: 2, orders: 1, clicks: 9, impressions: 500 })],
      { step: SD_BID_STEP });
    expect(p.moves).toHaveLength(0);
    expect(p.killing).toBe(1);
  });

  it("Products is untouched and still moves a dime", () => {
    const p = planBids([c({ bid: 0.10 })]);          // no step override
    expect(p.moves[0]).toMatchObject({ toBid: 0.20 });
  });

  it("still stops at the $0.85 gate, and Display will never get near it at a nickel a day", () => {
    const p = planBids([c({ bid: 0.85 })], { step: SD_BID_STEP });
    expect(p.moves).toHaveLength(0);
    expect(p.escalated[0]).toMatchObject({ bid: 0.85, wouldBe: 1.85 });
  });
});
