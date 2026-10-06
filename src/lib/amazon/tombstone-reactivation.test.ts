/**
 * A word that spent the kill bar and never converted must not come back, and the route it actually
 * comes back through is reactivation, not reintroduction.
 *
 * William 2026-10-06: "remove all words that didnt convert last month and spent $4 to not reactivate
 * this month". Measured the same day: 33 words killed in September spent $61.38 again in October for
 * $0.00 of sales, and 8 of October's 20 kills had already been killed in a previous month. Two of
 * them have now been killed three months running.
 *
 * The tombstone existed and was read by selectReintroductions only. reactivationCandidates route B
 * asks for LIFETIME orders and a 3.60x lifetime ROAS, and every lifetime record in this account was
 * earned at the old $19.95 price, so a word with zero recent conversions still qualifies.
 */
import { describe, it, expect } from "vitest";
import { reactivationCandidates } from "./ad-engine";
import { deadKey } from "./ad-rules";

const paused = (keywordId: string, keywordText: string, matchType: string) =>
  ({ keywordId, keywordText, matchType, state: "PAUSED" });

describe("the tombstone gates reactivation, not just reintroduction", () => {
  // SUPERSEDED IN PART, 2026-10-06. William: "we are no longer resetting monthly we are keeping
  // keywords dead unless they convert now not historically". LIFETIME_EVIDENCE_REVIVES is now
  // false, so route B is off entirely and a lifetime record cannot reopen anything, tombstoned or
  // not. The tombstone gate on route A still matters and is still pinned below.
  it("route B is OFF, so no lifetime record reopens a word at all", () => {
    const kw = paused("1", "safety leash phone", "BROAD");
    const lifetime = new Map([[deadKey("safety leash phone", "BROAD"), { roas: 9.9, spend: 400, sales: 3960, orders: 40 }]]);

    // Before 2026-10-06 this returned 1 candidate, and that is how the same word was revived in
    // three consecutive months. A 9.9x lifetime record earned at $19.95 now buys nothing.
    expect(reactivationCandidates([kw], new Map(), lifetime)).toHaveLength(0);

    const dead = new Set([deadKey("safety leash phone", "BROAD")]);
    expect(reactivationCandidates([kw], new Map(), lifetime, { deadKeys: dead })).toHaveLength(0);
  });

  it("route A does NOT reopen a tombstoned word", () => {
    const kw = paused("2", "iphone leash tether", "BROAD");
    const perf = new Map([["2", { cost: 20, sales: 100 }]]);   // $20 at 0.20 ACOS: a clear route-A pass
    expect(reactivationCandidates([kw], perf)).toHaveLength(1);

    const dead = new Set([deadKey("iphone leash tether", "BROAD")]);
    expect(reactivationCandidates([kw], perf, undefined, { deadKeys: dead })).toHaveLength(0);
  });

  it("route A still works for a word that converted RECENTLY and is not tombstoned", () => {
    // This is the only way back now: convert NOW, in the trailing window, not historically.
    const kw = paused("3", "retractable keychain", "PHRASE");
    const perf = new Map([["3", { cost: 10, sales: 40 }]]);
    expect(reactivationCandidates([kw], perf, undefined, { deadKeys: new Set() })).toHaveLength(1);
  });

  it("the gate is keyed on word AND match type, so one match type dying does not kill the others", () => {
    const broad = paused("4", "phone lanyard retractable", "BROAD");
    const exact = paused("5", "phone lanyard retractable", "EXACT");
    const perf = new Map([["4", { cost: 20, sales: 100 }], ["5", { cost: 20, sales: 100 }]]);
    const dead = new Set([deadKey("phone lanyard retractable", "EXACT")]);
    const got = reactivationCandidates([broad, exact], perf, undefined, { deadKeys: dead });
    expect(got.map((c) => c.matchType)).toEqual(["BROAD"]);
  });

  it("an empty tombstone does not resurrect route B either", () => {
    const kw = paused("6", "phone tether", "PHRASE");
    const lifetime = new Map([[deadKey("phone tether", "PHRASE"), { roas: 4, spend: 40, sales: 160, orders: 4 }]]);
    expect(reactivationCandidates([kw], new Map(), lifetime, { deadKeys: new Set() })).toHaveLength(0);
  });
});
