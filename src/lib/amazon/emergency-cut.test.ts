import { describe, it, expect } from "vitest";
import {
  emergencyBid, emergencyQualifies, emergencyCuts, overlapKey, killedWordsThisMonth,
  planBids, shouldKill,
  EMERGENCY_CUT, KILL_MIN_ROAS, KILL_SPEND, BID_FLOOR, SD_BID_FLOOR,
  type EmergencyCandidate, type BidCandidate,
} from "./ad-rules";

// William 2026-08-26:
//   "if we're not turning off the keywords, we're lowering the bids by 80%. As soon as they get
//    below 1.5 ROAS or keywords spend $4 without converting."
//   "This needs to apply to US, Canada, and Mexico and Brazil. Any ad account that we have."
//
// The country half needs no test of its own and deliberately has none: every marketplace runs the
// same runAdEngine() and the same planBids(). What IS tested is that the rule lives in one place,
// so there is nowhere for a country to disagree.

const K = (o: Partial<EmergencyCandidate>): EmergencyCandidate =>
  ({ id: "K1", label: "phone tether", word: "phone tether", bid: 0.85, spend: 0, sales: 0, orders: 0, ...o });

describe("emergencyBid — where an 80% cut lands", () => {
  it("takes 80% off, in whole cents", () => {
    expect(emergencyBid(0.85)).toBe(0.17);
    expect(emergencyBid(1.72)).toBe(0.34);
    expect(emergencyBid(0.50)).toBe(0.10);
  });
  it("never lands below the floor Amazon accepts", () => {
    expect(emergencyBid(0.42)).toBe(BID_FLOOR);   // 8.4c would be refused
    expect(emergencyBid(0.10)).toBe(BID_FLOOR);
  });
  it("uses Display's lower floor when Display asks", () => {
    expect(emergencyBid(0.10, SD_BID_FLOOR)).toBe(0.02);
    expect(emergencyBid(0.02, SD_BID_FLOOR)).toBe(0.02);
  });
  it("is the constant, not a hardcoded 0.8", () => {
    expect(EMERGENCY_CUT).toBe(0.80);
    expect(emergencyBid(1.00)).toBeCloseTo(1.00 * (1 - EMERGENCY_CUT), 2);
  });
});

describe("emergencyQualifies — the two triggers are SEPARATE", () => {
  it("cuts a converting word under 1.5x at ANY spend, with no $4 gate", () => {
    // The correction that mattered. shouldKill() needs $4 on both paths, so this word is invisible
    // to the pause and keeps bidding. William asked for the cut when the ROAS is seen.
    const p = { spend: 2, orders: 1, sales: 2 * (KILL_MIN_ROAS - 0.2) };
    expect(shouldKill(p)).toBe(false);
    expect(emergencyQualifies(p)).toBe(true);
  });
  it("spares a converting word at or above 1.5x", () => {
    expect(emergencyQualifies({ spend: 10, orders: 1, sales: 10 * KILL_MIN_ROAS })).toBe(false);
  });
  it("cuts a word that never converted once it passes $4", () => {
    expect(emergencyQualifies({ spend: KILL_SPEND, orders: 0, sales: 0 })).toBe(true);
  });
  it("leaves an unconverted word alone while it is still inside its $4 trial", () => {
    expect(emergencyQualifies({ spend: KILL_SPEND - 0.01, orders: 0, sales: 0 })).toBe(false);
  });
  it("scales with the marketplace bar, so CAD 5.50 and MXN 68 behave the same way", () => {
    expect(emergencyQualifies({ spend: 5.50, orders: 0, sales: 0 }, 5.50)).toBe(true);
    expect(emergencyQualifies({ spend: 5.49, orders: 0, sales: 0 }, 5.50)).toBe(false);
    expect(emergencyQualifies({ spend: 68, orders: 0, sales: 0 }, 68)).toBe(true);
  });
});

describe("overlapKey", () => {
  it("ignores case and collapsed whitespace, the way a shopper's query does", () => {
    expect(overlapKey("Phone  Tether ")).toBe(overlapKey("phone tether"));
  });
});

describe("emergencyCuts — who gets slashed", () => {
  const none = new Set<string>();

  it("never touches a keyword the kill is switching off this run", () => {
    const out = emergencyCuts([K({ spend: 9, orders: 0 })], new Set(["K1"]), none);
    expect(out.cuts).toHaveLength(0);
  });

  it("cuts a word that qualifies and is NOT being switched off", () => {
    const out = emergencyCuts([K({ spend: 9, orders: 0 })], none, none);
    expect(out.cuts).toHaveLength(1);
    expect(out.cuts[0].trigger).toBe("qualified");
    expect(out.cuts[0].toBid).toBe(0.17);
  });

  it("THE OVERLAP CASE: a healthy copy of a killed word is cut on the word, not on its own numbers", () => {
    // 2026-08-26, live from Amazon. `holdmate pro retractable phone holder` EXACT was paused at
    // 10:20Z at $7.11 and 1.33x. An identical EXACT in another campaign, id 102163422557773, was
    // still ENABLED at $0.78 and had been re-bid UP by the engine at 00:05 the same night.
    const twin = K({ id: "102163422557773", word: "holdmate pro retractable phone holder",
                     bid: 0.78, spend: 2.92, sales: 9.49, orders: 1 });
    expect(emergencyQualifies({ spend: 2.92, orders: 1, sales: 9.49 })).toBe(false);  // 3.25x, fine alone
    const out = emergencyCuts([twin], none, new Set(["holdmate pro retractable phone holder"]));
    expect(out.cuts).toHaveLength(1);
    expect(out.cuts[0].trigger).toBe("overlap");
    expect(out.cuts[0].fromBid).toBe(0.78);
    expect(out.cuts[0].toBid).toBe(0.16);
  });

  it("matches an overlap across match types, because the shopper types the word", () => {
    const out = emergencyCuts([K({ word: "Retractable Phone Tether", bid: 1.72, spend: 0.5, orders: 0 })],
      none, new Set(["retractable phone tether"]));
    expect(out.cuts[0].toBid).toBe(0.34);
  });

  it("leaves a word alone that neither qualifies nor overlaps", () => {
    expect(emergencyCuts([K({ spend: 3, orders: 1, sales: 20 })], none, none).cuts).toHaveLength(0);
  });

  it("counts, rather than writes, a word already at the floor", () => {
    const out = emergencyCuts([K({ bid: 0.10, spend: 9, orders: 0 })], none, none);
    expect(out.cuts).toHaveLength(0);
    expect(out.atFloor).toBe(1);
  });

  it("counts, rather than attempts, a cut Amazon would refuse", () => {
    const out = emergencyCuts([K({ spend: 9, orders: 0, writable: false })], none, none);
    expect(out.cuts).toHaveLength(0);
    expect(out.blocked).toBe(1);
  });

  it("repeats until the floor: suppression lasts until the pause lands", () => {
    let bid = 0.85;
    const seen: number[] = [];
    for (let run = 0; run < 4; run++) {
      const out = emergencyCuts([K({ bid, spend: 9, orders: 0 })], none, none);
      if (!out.cuts.length) break;
      bid = out.cuts[0].toBid; seen.push(bid);
    }
    expect(seen).toEqual([0.17, BID_FLOOR]);   // two runs, then it stops. It cannot go under.
  });

  it("leads with the biggest saving", () => {
    const out = emergencyCuts(
      [K({ id: "small", bid: 0.30, spend: 9 }), K({ id: "big", bid: 2.00, spend: 9 })], none, none);
    expect(out.cuts.map((c) => c.id)).toEqual(["big", "small"]);
  });
});

describe("killedWordsThisMonth — the set does not forget an earlier kill", () => {
  it("includes a word whose month numbers earn a switch-off, whatever its state is now", () => {
    const set = killedWordsThisMonth([{ text: "Cell Phone Lanyard", spend: 5.24, sales: 0, orders: 0 }]);
    expect(set.has(overlapKey("cell phone lanyard"))).toBe(true);
  });
  it("excludes a word that is earning", () => {
    expect(killedWordsThisMonth([{ text: "phone tether", spend: 10, sales: 40, orders: 4 }]).size).toBe(0);
  });
});

describe("planBids — Brands and Display get the same rule", () => {
  const C = (o: Partial<BidCandidate>): BidCandidate =>
    ({ id: "T1", label: "t", word: "phone tether", bid: 0.85, spend: 0, sales: 0, orders: 0, clicks: 0, ...o });

  it("slashes an overlapping entity instead of stepping it a dime", () => {
    const out = planBids([C({ spend: 1, orders: 1, sales: 20 })], { killedWords: new Set(["phone tether"]) });
    expect(out.emergency).toBe(1);
    expect(out.moves[0].toBid).toBe(0.17);
    expect(out.moves[0].direction).toBe("down");
  });

  it("slashes an entity converting under 1.5x that the $4 kill cannot yet touch", () => {
    const out = planBids([C({ spend: 2, orders: 1, sales: 2.5 })]);   // 1.25x on $2
    expect(out.killing).toBe(0);
    expect(out.emergency).toBe(1);
    expect(out.moves[0].toBid).toBe(0.17);
  });

  it("does not slash when no copy is being switched off and its own numbers are fine", () => {
    expect(planBids([C({ spend: 1, orders: 1, sales: 20 })]).emergency).toBe(0);
  });

  it("still lets the kill win: nothing gets a pause and a bid in one run", () => {
    const out = planBids([C({ spend: 9, orders: 0, sales: 0 })], { killedWords: new Set(["phone tether"]) });
    expect(out.killing).toBe(1);
    expect(out.emergency).toBe(0);
    expect(out.moves).toHaveLength(0);
  });

  it("uses Display's own floor when Display passes it", () => {
    const out = planBids([C({ bid: 0.10, spend: 2, orders: 1, sales: 2.5 })], { floor: SD_BID_FLOOR });
    expect(out.moves[0].toBid).toBe(0.02);
  });

  it("reports, rather than attempts, a cut into a campaign that is not ENABLED", () => {
    const out = planBids([C({ spend: 2, orders: 1, sales: 2.5, writable: false })]);
    expect(out.emergency).toBe(0);
    expect(out.blocked).toBe(1);
  });
});
