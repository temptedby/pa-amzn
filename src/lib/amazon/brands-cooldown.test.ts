import { describe, it, expect } from "vitest";
import {
  planBids, BID_COOLDOWN_HOURS, BID_SEARCH_STEP, BID_CONFIRM_CEILING,
  type BidCandidate, type BidChange,
} from "./ad-rules";

// THE BUG THIS FILE PINS.
//
// planBids() is the one planner Sponsored Brands and Sponsored Display run on, and it used to call
// searchStep() with `last: undefined` hard-coded. inCooldown(undefined) is always false, so the
// hourly cron re-judged every entity 24 times a day. For an entity that is getting clicks every
// branch of searchStep points DOWN, so the result was a one-way ratchet: `phone retractable holder`
// returned 2.28x on 7 orders and was walked from a working bid to $0.10, two cents at a time.
//
// Measured on 2026-08-28 across 2,789 bid epochs: 0 of 75 judgeable moves improved ROAS, 9 made it
// worse. These tests fail against the old behaviour.

const HOUR = 3.6e6;
const NOW = Date.parse("2026-08-28T12:00:00.000Z");

const changeAt = (hoursAgo: number, over: Partial<BidChange> = {}): BidChange => ({
  changedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
  fromBid: 0.25, toBid: 0.35, roasBefore: null, ...over,
});

/** A word that is getting clicks and converting well: every un-cooled path shaves it DOWN. */
const converter = (over: Partial<BidCandidate> = {}): BidCandidate => ({
  id: "K1", label: "phone retractable holder (PHRASE)", bid: 0.35,
  spend: 42.10, sales: 95.92, orders: 7, clicks: 47, impressions: 27401,
  writable: true, ...over,
});

describe("planBids honours the cooldown on Brands and Display", () => {
  it("does not touch an entity whose last change is fresher than the cooldown", () => {
    const out = planBids([converter({ last: changeAt(1) })], { nowMs: NOW });
    expect(out.moves).toHaveLength(0);
    expect(out.heldByCooldown).toBe(1);
    expect(out.held).toBe(0);          // counted apart from an ordinary no-opinion hold
  });

  it("acts again once the cooldown has elapsed", () => {
    const out = planBids([converter({ last: changeAt(BID_COOLDOWN_HOURS + 1) })], { nowMs: NOW });
    expect(out.heldByCooldown).toBe(0);
    expect(out.moves.length + out.held).toBe(1);
  });

  it("the boundary belongs to the cooldown: exactly one hour short still holds", () => {
    const held = planBids([converter({ last: changeAt(BID_COOLDOWN_HOURS - 1) })], { nowMs: NOW });
    expect(held.heldByCooldown).toBe(1);
  });

  it("no history means no cooldown, so a first run is never blocked", () => {
    const out = planBids([converter({ last: null })], { nowMs: NOW });
    expect(out.heldByCooldown).toBe(0);
  });

  it("a caller may set its own cooldown, as Display does with 24h", () => {
    const c = converter({ last: changeAt(8) });
    expect(planBids([c], { nowMs: NOW }).heldByCooldown).toBe(0);                      // 6h default: free
    expect(planBids([c], { nowMs: NOW, cooldownHours: 24 }).heldByCooldown).toBe(1);   // 24h: held
  });

  it("THE RATCHET: 24 hourly runs used to move a converter 24 times; now it moves at most 4", () => {
    // Replays the real cron. Every hour the engine re-reads the same month-to-date figures.
    let bid = 0.85;
    let last: BidChange | null = null;
    let moves = 0;
    for (let h = 0; h < 24; h++) {
      const nowMs = NOW + h * HOUR;
      const plan = planBids([converter({ bid, last })], { nowMs });
      if (plan.moves.length) {
        const mv = plan.moves[0];
        last = { changedAt: new Date(nowMs).toISOString(), fromBid: mv.fromBid, toBid: mv.toBid, roasBefore: null };
        bid = mv.toBid;
        moves++;
      }
    }
    expect(moves).toBeLessThanOrEqual(24 / BID_COOLDOWN_HOURS);
    expect(bid).toBeGreaterThan(0.10);   // it can no longer reach the floor in a single day
  });

  it("the kill still runs before the cooldown, so a dead word is never merely held", () => {
    const dead = converter({ spend: 9.50, sales: 0, orders: 0, last: changeAt(1) });
    const out = planBids([dead], { nowMs: NOW });
    expect(out.killing).toBe(1);
    expect(out.heldByCooldown).toBe(0);
  });
});

describe("the rule William stated on 2026-08-28", () => {
  // "We should only be growing them by 10 cents every six hours" ... "capability to grow to 85 cents"
  it("climbs a dime at a time, no faster than every six hours, and stops at $0.85", () => {
    // A word with impressions and no clicks: the one shape that raises.
    const idle = (bid: number, last: BidChange | null): BidCandidate => ({
      id: "K2", label: "iphone clip (PHRASE)", bid,
      spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 500, writable: true, last,
    });
    let bid = 0.35, last: BidChange | null = null;
    const seen: number[] = [];
    for (let h = 0; h < 72; h++) {
      const nowMs = NOW + h * HOUR;
      const plan = planBids([idle(bid, last)], { nowMs });
      if (!plan.moves.length) continue;
      const mv = plan.moves[0];
      expect(mv.direction).toBe("up");
      expect(Math.round((mv.toBid - mv.fromBid) * 100)).toBe(Math.round(BID_SEARCH_STEP * 100));
      last = { changedAt: new Date(nowMs).toISOString(), fromBid: mv.fromBid, toBid: mv.toBid, roasBefore: null };
      bid = mv.toBid;
      seen.push(bid);
    }
    expect(seen).toEqual([0.45, 0.55, 0.65, 0.75, 0.85]);
    expect(bid).toBe(BID_CONFIRM_CEILING);
  });

  it("at the ceiling it asks rather than raising", () => {
    const out = planBids([{
      id: "K3", label: "at the gate", bid: BID_CONFIRM_CEILING,
      spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 900, writable: true, last: null,
    }], { nowMs: NOW });
    expect(out.moves).toHaveLength(0);
    expect(out.escalated).toHaveLength(1);
  });
});
