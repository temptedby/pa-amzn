/**
 * DEAD STAYS DEAD.
 *
 * William 2026-10-06: "we are no longer resetting monthly we are keeping keywords dead unless they
 * convert now not historically we have wasted too much money on ad spend not converting".
 *
 * Two things change together, and both are pinned here.
 *
 * 1. HISTORY NO LONGER REVIVES ANYTHING. Every lifetime record in this account was earned when the
 *    product sold for $19.95. It now sells for $9.49, so the same traffic returns 0.556 of the
 *    recorded figure: a 2.00x record is really 1.11x, under the 1.5x kill bar. Measured 2026-10-06,
 *    the 85 words reopened on 1 October through lifetime evidence returned 0.42x, against an
 *    account running 0.67x. They were the worst money in the account two months running.
 *
 * 2. THE BAR IS CUMULATIVE, NOT MONTHLY. The month-to-date counter reset on the 1st, so 159 of the
 *    196 non-converting words had never once reached $4 in a single month and held $277.81 the bar
 *    could not reach by construction. Tombstones are cumulative and permanent, and the daily sweep
 *    switches off anything tombstoned that is found enabled.
 *
 * What is deliberately NOT changed: a word with no spending record at all is untested, not
 * historically proven, so the 1,160-word release queue still feeds new candidates. Same day:
 * "keep finding new keywords to add from conversions on broad search so we dont run out".
 */
import { describe, it, expect } from "vitest";
import { lifetimeOnlyPool, LIFETIME_EVIDENCE_REVIVES, isPermanentlyDead, KILL_SPEND, type ReintroCandidate } from "./ad-rules";
import { reactivationCandidates } from "./ad-engine";

const cand = (o: Partial<ReintroCandidate>): ReintroCandidate =>
  ({ keywordId: "k", keywordText: "phone tether", matchType: "EXACT", bid: 0.10, ...o } as ReintroCandidate);
const paused = (id: string, text: string, match: string) =>
  ({ keywordId: id, keywordText: text, matchType: match, state: "PAUSED" });

describe("history does not revive a word", () => {
  it("the switch is off", () => {
    expect(LIFETIME_EVIDENCE_REVIVES).toBe(false);
  });

  it("a spectacular lifetime record reopens nothing, by either path", () => {
    const lifetime = new Map([["safety leash phone|BROAD", { roas: 40, spend: 1000, sales: 40000, orders: 500 }]]);
    expect(reactivationCandidates([paused("1", "safety leash phone", "BROAD")], new Map(), lifetime)).toHaveLength(0);
    expect(lifetimeOnlyPool([cand({ lifetimeRoas: 40, lifetimeSpend: 1000, lifetimeOrders: 500 })])).toHaveLength(0);
  });

  it("a word that has NEVER spent is still eligible: untested is not the same as proven", () => {
    expect(lifetimeOnlyPool([cand({ lifetimeSpend: 0 })])).toHaveLength(1);
  });

  it("converting NOW still brings a word back, which is the only door left open", () => {
    const perf = new Map([["2", { cost: 20, sales: 100 }]]);   // recent, 5x, in the trailing window
    const got = reactivationCandidates([paused("2", "retractable keychain", "PHRASE")], perf);
    expect(got).toHaveLength(1);
    expect(got[0].via).toBe("window");
  });
});

describe("the bar is cumulative, so a slow bleed cannot hide under a monthly reset", () => {
  it("$4 spread over a year with no sale is as dead as $4 in a week", () => {
    // 12 months at $0.40 never trips a monthly bar. Cumulatively it is $4.80 and no conversion.
    expect(isPermanentlyDead({ spend: 4.80, orders: 0, sales: 0 })).toBe(true);
    expect(isPermanentlyDead({ spend: KILL_SPEND, orders: 0, sales: 0 })).toBe(true);
  });

  it("still does not retire a word that converted, however badly", () => {
    // The asymmetry survives: attribution can lift a weak converter, it cannot lift a zero.
    expect(isPermanentlyDead({ spend: 6.91, orders: 1, sales: 9.49 })).toBe(false);
  });

  it("still does not retire a word that has not reached the bar at all", () => {
    expect(isPermanentlyDead({ spend: 3.99, orders: 0, sales: 0 })).toBe(false);
  });
});
