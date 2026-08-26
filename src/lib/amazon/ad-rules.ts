// Shared, pure ad-engine decision rules — William's spec (2026-08-02).
// Written down in full in .agent/ad-engine-rules-2026-08-02.md; this file is its implementation.
// ONE system across Sponsored Products, Sponsored Brands (incl. Video) and Sponsored Display.
//
//   KILL: month-to-date spend >= $4 with nothing to show for it — 0 orders, OR ACOS at/above the
//         52% break-even — is paused for the rest of the month. The 1st-of-month reactivation job
//         brings back any that recovered. A profitable term (ACOS < 52%) is never killed on spend
//         alone, so winners are protected.
//
//   BID:  step ±$0.10 FLAT per run around the 52% pivot. Below the pivot -> raise to buy share;
//         at/above -> lower. Bounded to [FLOOR, CAP], whole cents. No ACOS signal yet and below
//         the kill bar -> hold the bid unchanged.
//
//         CORRECTION 2026-08-13: this line used to read "±10%" and to sit under a header
//         attributing the whole file to William's 2026-08-02 spec. He never asked for a
//         percentage — "i never said percentage" (2026-08-13). The percentage was mine. Both his
//         actual instructions on step size say a flat dime, on 2026-08-07 and again on 08-13.
//
//   HARVEST: a search term that CONVERTS is added as PHRASE + EXACT into the ad group it converted
//         in, then lives under the kill rule. Amazon caps keyword text at 80 chars / 10 words, so
//         an over-long term is shortened to a valid root rather than retried forever (see below).
//
//   REINTRODUCTION: keywords parked at the $0.10 floor come back 10 per run, 4 runs a day = 40/day
//         (William 2026-08-08). Cheapest proven 2x+ winners first, then words that never spent.
//
// Pure functions so they unit-test without the Ads API (whose async report queue is unreliable).
// Each per-ad-product engine feeds in {spend, orders, sales} and applies the verdict via that
// product's own entity endpoints.

export const KILL_SPEND = 4;      // $ month-to-date before the kill bar applies
// 52% = VALIDATED break-even on the Single via SP-API getMyFeesEstimate: $9.49 price - $0.62 COGS
// - $1.42 referral - $2.52 FBA = $4.93 contribution; 4.93/9.49 = 0.519. At or above it we lose money.
// William 2026-08-02 chose the true break-even over a rounded 50%/55%.
export const ACOS_PIVOT = 0.52;
// The line a CONVERTING word is switched off at. Was 1.0 from William 2026-08-13 ("once they're
// below 1x, we got to turn them off"); raised to 1.5 on 2026-08-23: "ROAS below 1.5, we turn it
// off. We can't be having these words crush us ... you can lower the bids, but once it spins and
// it's not [above 1.5], you wait for it to be above two again with the attribution, or you leave
// it off."
//
// Why the old 1.0 was too generous. Between 1.0x and the 2.45x blended break-even a word returns
// cash and still loses money, and the previous rule kept it running on the theory that a bid cut
// could recover it. August measured that theory: at 1.0x, 68 words cleared the $4 bar and burned
// $520 of $727 Sponsored Products spend at an account ROAS of 0.59. The bid cut is still tried
// first via nextBid(); 1.5 is the point at which trying stops.
//
// Kept separate from ACOS_PIVOT, which still steers the direction of the bid step and stays 0.52.
export const KILL_MIN_ROAS = 1.5;
// A FLAT TEN CENTS per run, in BOTH directions. William asked for this on 2026-08-07 ("i asked
// raising by .10 not 10%") and again on 2026-08-13 for the cut: "dont lower 10% just .10 because
// 10% will drop quick and the word might not have that much search in that time".
//
// His reasoning is about evidence, not arithmetic, and it is right. A percentage step is
// proportional to the bid but the EVIDENCE is not: this account takes about 12 clicks a day in
// total, so every bid level needs roughly the same amount of time to prove itself whatever the bid
// happens to be. A 10% cut off $2.50 is 25 cents and blows through two and a half rungs before the
// word has had the searches to show what the last rung did. A flat dime moves at one speed, so
// every level gets the same look.
//
// This matches BID_SEARCH_STEP, which the newer searchStep() has always used. The two paths now
// agree instead of quietly disagreeing.
export const BID_STEP = 0.10;     // FLAT DOLLARS per run, not a percentage
export const BID_FLOOR = 0.10;
export const BID_CAP = 2.50;

// Amazon's HARD limits on Sponsored Products keyword text. Not our policy — the API rejects
// anything longer, so an over-long term must be shortened, never retried as-is.
// https://www.adbadger.com/blog/how-many-keywords-can-you-use-in-amazon-listings-the-complete-guide-for-sellers/
export const KEYWORD_MAX_CHARS = 80;
export const KEYWORD_MAX_WORDS = 10;

// Reintroduction throttles (William 2026-08-02). There is deliberately NO cap on total spend:
// a keyword that is making money should be free to spend. What IS capped is UNPROVEN exposure —
// keywords that have not yet earned a conversion and are burning their $4 of rope.
//
// The pool self-regulates. A keyword leaves the trial pool the moment it either converts (it is
// now proven, and spends without limit under the kill rule) or hits $4 without converting (it is
// killed). Winners and losers both free their slot, so the only thing bounded is how much money
// can be at risk on unproven keywords at any one instant:
// William chose the daily rate as the ONLY gate (2026-08-02), having been shown the alternative:
// no concurrent-in-trial cap. So the number of unproven keywords in flight grows by up to 10/day
// until they start resolving themselves — each one either converts (proven, leaves the pool) or
// hits the $4 kill bar (dead, leaves the pool). Exposure is therefore unbounded in the early
// weeks rather than capped at an instant-in-time figure.
//
// The count is still measured and reported every run (ReintroState.inTrial) so the ramp is
// visible, and `maxInTrial` remains an optional opts field if a ceiling is ever wanted.
export const REINTRO_PER_DAY = 40;             // 4 runs x REINTRO_PER_RUN. Was 10/day; William 2026-08-06 moved to a 6-hourly launch.
export const REINTRO_MAX_ACOS = 0.50;   // William: eligible if never spent, or spent at ACOS < 50%
export const REINTRO_START_BID = 0.25;  // William 2026-08-05: enter LOW, climb only if it fails to spend
export const REINTRO_LIFETIME_ROAS_MIN = 2.0;  // William 2026-08-05: "past 2x roas or more ... need to reset each month"
export const REINTRO_LIFETIME_MIN_ORDERS = 2;  // one order is an anecdote, not a ROAS
export const REINTRO_PER_RUN = 10;             // William 2026-08-06: launch every 6h, ~40/day, all 176 live in ~4.5 days
export const REINTRO_COHORT_DAILY_CAP = 25;    // $/day across the reintroduced cohort. Amazon's budgets do not
                                               // constrain this account (0.3% used), so the ceiling has to be ours.
export const REINTRO_PROTECT_DAYS = 14;        // no automatic bid CUT inside the 14-day attribution window — the
                                               // cut is what walked these words to the floor. The $4 kill still applies.


// Bid ladder (William 2026-08-05, revised same day). A reintroduced keyword enters LOW and gains
// $0.10 EVERY DAY it fails to spend, until it either spends or reaches the $0.85 ceiling.
// William: "keep raising the spend $.10 a day until the keyword spends max of $.85".
// Rationale: a keyword that is not spending is not risking anything, so raising it costs nothing
// and is the only way to find the bid that actually wins an auction. This supersedes the earlier
// 3-days-per-rung / $0.50-top version from the same conversation.
// REVISED 2026-08-08 (William): the step is per RUN, not per day. The job runs every 6h, so a
// floored word reaches the $0.59 market CPC in 5 runs (~30h) instead of 5 days. William: "increase
// their bids ... at $.1 each", "we will get better over time as we review each 6 hours".
//
// THE $0.85 CEILING STANDS. William 2026-08-08: "max bids go to $.85 then notified". An earlier
// pass on this change raised the ceiling to BID_CAP on the reasoning that the $4 kill was bound
// enough; that was wrong and is reverted. $0.85 is a human decision point, not a soft limit — a
// word that has climbed the whole ladder and still will not spend is telling us something the
// rules cannot settle alone, so the engine asks rather than keeps buying.
export const BID_LADDER_STEP = 0.10;   // added per RUN of zero spend
export const LADDER_STEP_DAYS = 0;     // 0 = every run earns the next rung (6-hourly cron)

// THE $0.85 CEILING IS ACCOUNT-WIDE, NOT LADDER-ONLY. William 2026-08-08:
// "after .85 we communicate to confirm you dont go over $.85 per keyword".
//
// It used to bind only the ladder, the path for keywords that will not spend. The ROAS bid search
// ran to BID_CAP instead, which is how `retractable phone holder belt clip` compounded $0.82 ->
// $1.94 in three days off ONE conversion, and how 100 keywords ended up bid above $0.85 with
// several at $2.50. Both paths now stop at the same number.
//
// Behaviour at the line: climb TO $0.85, then stop and ask. A raise that would cross it is not
// silently clamped and retried forever, it is reported so William can decide. Cuts are never
// blocked, because lowering a bid reduces risk and needs no permission.
export const BID_CONFIRM_CEILING = 0.85;
export const BID_LADDER_MAX = BID_CONFIRM_CEILING;   // same line, under the name the ladder reads

/**
 * THE APPROVAL GATES (William 2026-08-13).
 *
 * $0.85 was never meant to be where a keyword stops for good, only where the engine stops deciding
 * alone. William set out the full staircase:
 *
 *   "all the way up to 85 cents ... then you ping me ... you say, hey, these words are at 85 cents,
 *    they have this many impressions, they have this many clicks. Do you want to raise the bid past
 *    85 cents and continue to do another 10 cents every six hours to $1[.85] ... then you'll ping me
 *    after the bids are at $1.85 ... Do you want to raise them to 285"
 *
 * So a silent keyword climbs a dime per run to the next gate, stops, and the engine reports what
 * that money bought — impressions, clicks, spend — so the decision is made on evidence rather than
 * on a bid number. Each gate is $1.00 above the last, which is ten runs, about two and a half days.
 *
 * A gate is only ever crossed by a human. Nothing here raises a keyword past its approved ceiling.
 */
export const LADDER_GATES = [0.85, 1.85, 2.85] as const;

/** The gate a keyword is climbing towards, given the highest one already approved for it. */
export function nextGate(approvedCeiling: number, gates: readonly number[] = LADDER_GATES): number | null {
  const c = Math.round(approvedCeiling * 100);
  for (const g of gates) if (Math.round(g * 100) > c) return g;
  return null;   // past the last gate — the staircase has no more rungs to offer
}

/** The ceiling a keyword may climb to right now. Defaults to the first gate for a keyword nobody
 *  has ruled on yet, which is the $0.85 line that has been in force since 2026-08-08. */
export function activeCeiling(approvedCeiling?: number | null, gates: readonly number[] = LADDER_GATES): number {
  const first = gates[0];
  if (approvedCeiling == null || !Number.isFinite(approvedCeiling)) return first;
  return Math.max(first, approvedCeiling);
}

export interface Perf {
  spend: number;   // month-to-date cost, $
  orders: number;  // attributed units/orders
  sales: number;   // attributed sales, $
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

/** ACOS as a fraction, or null when there is no conversion to measure. */
export function acosOf(p: Perf): number | null {
  return p.orders > 0 && p.sales > 0 ? p.spend / p.sales : null;
}

/**
 * KILL verdict: $4+ month-to-date AND either it never converted, or it converted so badly that the
 * ads cost more than the sales they produced.
 *
 * REVISED 2026-08-13 on William's instruction, and it NARROWS what gets switched off. Recording the
 * change rather than editing the old comment away, because the previous line was also his.
 *
 * The old rule paused anything at or above the 52% break-even ACOS, i.e. below 1.923x ROAS. That is
 * what took `retractable phone tether` PHRASE off the account on 11 August at 1.63x, holding $41.96
 * of the month's $96.41 in sales — the biggest earner in the account, switched off for being
 * unprofitable rather than being made cheaper.
 *
 * William 2026-08-13, in his words:
 *
 *   "once they're below 1x, we got to turn them off"
 *   "if the word stops converting need to lower the bid but yeah a 1.63 we need to attempt to lower
 *    the keyword bid before turning off please"
 *
 * So a word converting at 1.0x or better is NOT killed on spend. It is too expensive, not
 * worthless, and too expensive is a bid problem. The bid rules already own it and already cut it:
 * nextBid() steps it down $0.10 a run above the pivot, searchStep() steps it down $0.10 a run
 * below 2x. This function simply stops overruling them with a pause.
 *
 * The exit still exists, it just runs through the bid now. A word being cut every 6 hours either
 * recovers as the cheaper clicks lift its ROAS, or keeps failing and falls under KILL_MIN_ROAS,
 * where this rule takes it off. William moved that line from 1.0x to 1.5x on 2026-08-23: between
 * 1.0x and 1.5x a word returns cash and still loses money on every unit, and August measured what
 * waiting for the bid cut costs.
 *
 * `orders === 0` is untouched and still an immediate kill: a word with no conversion at all has
 * never proved it can work, so there is no bid at which it is known to be worth buying.
 *
 * ONE BAR, EVERY AD PRODUCT. William 2026-08-26: the 1.5x line has to hold "across all ad
 * categories". Sponsored Products keywords, Sponsored Brands keywords, Sponsored Display targets
 * and the campaign-level sweep all decide here and nowhere else, so there is exactly one place the
 * bar can be read or changed. `killMinRoas` exists for tests and for a caller that must be
 * explicit; no engine passes it, and ad-rules.test.ts asserts each entry point lands on
 * KILL_MIN_ROAS rather than on a number of its own.
 *
 * There is deliberately NO pivot parameter. Until 2026-08-26 this took `_pivot` and every caller
 * threaded ACOS_PIVOT through it, which read as though 52% still steered the kill; it had not since
 * 2026-08-13. A parameter that changes nothing is the same defect this project keeps finding, so it
 * is gone rather than renamed. ACOS_PIVOT still steers the DIRECTION of the bid step in nextBid().
 *
 * NO FLAPPING, still by arithmetic rather than a timer. This kills below 1.5x; REVIVE_MIN_ROAS
 * brings a word back at 2.0x. The 1.5x-2.0x band is dead space owned by the bid rules, so no
 * keyword can be killed and revived by the same numbers.
 */
export function shouldKill(
  p: Perf,
  killSpend = KILL_SPEND,
  killMinRoas = KILL_MIN_ROAS,
): boolean {
  if (p.spend < killSpend) return false;
  if (p.orders <= 0 || p.sales <= 0) return true;   // never converted — no bid rescues that
  return p.sales / p.spend < killMinRoas;           // converted, but under the bar — off
}

/** ±$0.10 flat at the pivot. Below pivot raise, at/above lower; hold if no ACOS signal.
 *  Always returns a whole-cent bid within [floor, cap].
 *
 *  Arithmetic is done in whole CENTS. Comparing dollars as floats is what made $0.10 -> $0.11 read
 *  as "no change" and pinned floored keywords at exactly the floor the rule exists to escape. */
export function nextBid(
  currentBid: number,
  p: Perf,
  opts: { step?: number; pivot?: number; floor?: number; cap?: number } = {},
): number {
  const step = opts.step ?? BID_STEP;
  const pivot = opts.pivot ?? ACOS_PIVOT;
  const floor = opts.floor ?? BID_FLOOR;
  const cap = opts.cap ?? BID_CAP;
  const base = currentBid > 0 ? currentBid : floor;
  const acos = acosOf(p);
  if (acos === null) return round2(clamp(base, floor, cap)); // no signal -> hold
  const stepC = Math.round(step * 100), baseC = Math.round(base * 100);
  const wantC = acos < pivot ? baseC + stepC : baseC - stepC;
  const bidC = Math.max(Math.round(floor * 100), Math.min(Math.round(cap * 100), wantC));
  return bidC / 100;
}

// ---------------------------------------------------------------------------
// EMERGENCY BID CUT (William 2026-08-26)
// ---------------------------------------------------------------------------
//
// "if we're not turning off the keywords, we're lowering the bids by 80%. As soon as they get
//  below 1.5 ROAS or keywords spend $4 without converting."
//
// The gap this closes was measured on 2026-08-26. Two separate leaks, one answer.
//
// LEAK 1, the overlap. 33 of August's 35 kills still had an ENABLED keyword with the SAME TEXT
// somewhere else in the account, and 17 of those matched on match type as well. `holdmate pro
// retractable phone holder` EXACT was paused at 10:20Z while an identical EXACT in another campaign
// kept running and had been re-bid UP by the engine ten hours earlier. The kill judges a keyword
// id; the shopper types a word. Pausing one id does not stop the word, it just moves the spend to a
// sibling that has not personally crossed $4 yet, so no rule reaches it.
//
// LEAK 2, the qualifying word we cannot switch off. A pause into a non-ENABLED campaign comes back
// 207 and changes nothing, and a bar that has not shipped yet cannot fire at all. In both cases the
// word keeps its bid and keeps buying. This half is a BACKSTOP and is expected to be empty on a
// healthy run: the same $4-and-under-1.5x test that earns the cut also earns the pause, so anything
// it catches is something the pause did not manage. The overlap above is where the work is.
//
// WHY A CUT RATHER THAN ANOTHER PAUSE. A pause is the thing we already cannot land in these cases.
// A bid is a different write on a different field, and where the pause is refused for campaign
// state the cut is refused too, which is reported rather than assumed. Where it CAN land, an 80%
// cut takes a $0.85 word to $0.17 and its share of the auction with it.
//
// WHAT IT DELIBERATELY OVERRIDES. This cut ignores BID_COOLDOWN_HOURS, the found-floor memory and
// the 14-day attribution shield, all three of which exist to stop the engine cutting a word that
// might still be working. A word that has taken $4 with no sale, or is converting under 1.5x, is
// not that word. William asked for "immediately" and these three are the only things that could
// make it later.
//
// IT REPEATS. A word still qualifying on the next run is cut again, so a bid walks to the floor in
// two or three runs and stays there until the pause lands or the word recovers. That is the point:
// "save some money on the bids until the keywords are actually turned off." The floor clamp bounds
// it, so this can never produce a bid Amazon rejects.
export const EMERGENCY_CUT = 0.80;

export interface EmergencyCandidate {
  id: string;
  /** display name for the log and the email */
  label: string;
  /** the keyword TEXT, which is what overlaps. Match type is deliberately not part of the key:
   *  a PHRASE copy of a killed EXACT word answers the same shopper query. */
  word: string;
  bid: number | null;
  spend: number; sales: number; orders: number;
  /** false when the entity or its campaign is not ENABLED, so Amazon would answer 207 and
   *  change nothing. Reported rather than silently attempted. */
  writable?: boolean;
}

export interface EmergencyCut {
  id: string; label: string; word: string;
  fromBid: number; toBid: number;
  /** "qualified" = this entity earned the kill itself. "overlap" = a copy of it is being killed. */
  trigger: "qualified" | "overlap";
  reason: string;
}

export interface EmergencyPlan {
  cuts: EmergencyCut[];
  /** wanted a cut but the entity or its campaign is not ENABLED */
  blocked: number;
  /** wanted a cut and is already at or below where the cut would land */
  atFloor: number;
}

/**
 * The words that have earned being switched off this month, whatever their state is right now.
 *
 * Derived from the month's own report rather than from a kill log, deliberately. A word killed on
 * the 12th is PAUSED today, so it contributes no new kill row on the 20th, and a set built from
 * "what did we pause this run" would stop suppressing its live copies the moment the original went
 * quiet. Its month-to-date numbers still satisfy shouldKill, so this set does not forget.
 *
 * State is not consulted at all: this answers "should this word be off", not "is it off".
 */
export function killedWordsThisMonth(
  rows: { text: string; spend: number; sales: number; orders: number }[],
  opts: { killSpend?: number; killMinRoas?: number } = {},
): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (!r.text) continue;
    if (shouldKill({ spend: r.spend, orders: r.orders, sales: r.sales }, opts.killSpend, opts.killMinRoas))
      out.add(overlapKey(r.text));
  }
  return out;
}

/**
 * Does this entity earn the 80% cut on its OWN numbers?
 *
 * IDENTICAL to shouldKill(), and it delegates rather than restating the condition so the two can
 * never drift apart.
 *
 * William 2026-08-26, correcting me: "The 1.5 ROAS only kicks in after $4 has been spent. Until
 * then, the ROAS can fluctuate wildly. You shouldn't lower bids by 80% if the spend is under $4."
 *
 * I had read his two clauses as two independent triggers and dropped the spend floor from the ROAS
 * one, so a word converting at 1.2x on $2 would have been cut. That is wrong for a reason worth
 * keeping: at $2 of spend this account has bought about two clicks, and one $9.49 order either
 * landed or it did not. ROAS at that sample size is a coin toss, not a measurement. $4 is the point
 * at which the number means something, and it governs BOTH clauses.
 *
 * So this function earns its name by what it does NOT do rather than by differing from the kill.
 * Its value is that the cut and the pause are guaranteed to agree about who deserves it.
 */
export function emergencyQualifies(
  p: Perf,
  killSpend = KILL_SPEND,
  killMinRoas = KILL_MIN_ROAS,
): boolean {
  return shouldKill(p, killSpend, killMinRoas);
}

/** Where an 80% cut lands, in whole cents, never below the floor Amazon will accept. */
export function emergencyBid(currentBid: number, floor = BID_FLOOR): number {
  const floorC = Math.round(floor * 100);
  const baseC = Math.max(floorC, Math.round((currentBid > 0 ? currentBid : floor) * 100));
  return Math.max(floorC, Math.round(baseC * (1 - EMERGENCY_CUT))) / 100;
}

/** Normalised overlap key. Amazon matches keyword text case-insensitively and collapses runs of
 *  whitespace, so "Phone  Tether" and "phone tether" are the same word to a shopper. */
export function overlapKey(word: string): string {
  return String(word ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Every ENABLED entity whose bid must be slashed this run, for either reason.
 *
 * PURE. It takes the ids being paused this run and the words already off, and returns the cuts.
 * Nothing here talks to Amazon or to the database, so every branch is unit-testable.
 *
 * `killedNow` are ids the pause is being applied to in THIS run: they are being turned off, so they
 * get no bid write. Two writes on one entity in one run is how a log ends up contradicting itself.
 */
export function emergencyCuts(
  live: EmergencyCandidate[],
  killedNow: Set<string>,
  killedWords: Set<string>,
  opts: { killSpend?: number; killMinRoas?: number; floor?: number } = {},
): EmergencyPlan {
  const floor = opts.floor ?? BID_FLOOR;
  const words = new Set([...killedWords].map(overlapKey));
  const out: EmergencyPlan = { cuts: [], blocked: 0, atFloor: 0 };

  for (const c of live) {
    if (killedNow.has(String(c.id))) continue;            // being switched off; the kill owns it

    const perf: Perf = { spend: c.spend, orders: c.orders, sales: c.sales };
    const qualified = emergencyQualifies(perf, opts.killSpend, opts.killMinRoas);
    const overlaps = words.has(overlapKey(c.word));
    if (!qualified && !overlaps) continue;

    const from = c.bid && c.bid > 0 ? c.bid : floor;
    const to = emergencyBid(from, floor);
    if (to >= from) { out.atFloor++; continue; }           // nothing left to cut
    if (c.writable === false) { out.blocked++; continue; }

    const roas = c.spend > 0 ? c.sales / c.spend : 0;
    out.cuts.push({
      id: String(c.id), label: c.label, word: c.word, fromBid: from, toBid: to,
      trigger: qualified ? "qualified" : "overlap",
      reason: qualified
        ? (c.orders <= 0 || c.sales <= 0
            ? `emergency: $${c.spend.toFixed(2)} spent, no sale, and not being switched off`
            : `emergency: ${roas.toFixed(2)}x on $${c.spend.toFixed(2)}, and not being switched off`)
        : `emergency: overlaps "${c.word}", which is switched off`,
    });
  }
  // Biggest cut first, so a truncated email leads with the most expensive word.
  out.cuts.sort((a, b) => (b.fromBid - b.toBid) - (a.fromBid - a.toBid));
  return out;
}

export type Verdict =
  | { action: "kill" }
  | { action: "bid"; bid: number }
  | { action: "hold" };

/** Single decision for one ENABLED entity: kill first, else a flat ±$0.10 bid step, else hold. */
export function decide(
  currentBid: number,
  p: Perf,
  opts: { killSpend?: number; step?: number; pivot?: number; floor?: number; cap?: number } = {},
): Verdict {
  if (shouldKill(p, opts.killSpend)) return { action: "kill" };
  const bid = nextBid(currentBid, p, opts);
  if (Math.abs(bid - (currentBid || 0)) >= 0.01) return { action: "bid", bid };
  return { action: "hold" };
}

// ---------------------------------------------------------------------------
// Keyword text validity (Amazon's hard limits)
// ---------------------------------------------------------------------------

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);

/**
 * A dash used as a SEPARATOR is rejected by Amazon; a hyphen inside a word is not.
 *
 * Established by live experiment 2026-08-07 on the term the harvest had been resubmitting since
 * Aug 1, logged applied=1 forty times while never existing in the account:
 *
 *   "phone assured retractable phone tether – durable clip-on leash for"  -> PATTERN_NOT_MATCHED
 *   "phone assured retractable phone tether - durable clip-on leash for"  -> PATTERN_NOT_MATCHED
 *   "phone assured retractable phone tether durable clip-on leash for"    -> SUCCESS
 *
 * So it is not the en dash, not the length (66 chars) and not the word count (10, at the cap). It
 * is the free-standing dash token. `clip-on` survives untouched in the accepted form.
 */
const SEPARATOR_DASH = /(^|\s)[-–—]+(\s|$)/g;

/** Amazon's own message is just "Keyword is invalid", so this encodes what it actually rejects. */
export function stripSeparatorDashes(text: string): string {
  let t = (text || "");
  let prev: string;
  do { prev = t; t = t.replace(SEPARATOR_DASH, " "); } while (t !== prev);   // " - - " needs 2 passes
  return t.replace(/\s+/g, " ").trim();
}

/** True when Amazon will accept this keyword text: non-empty, <= 80 chars, <= 10 words, and no
 *  free-standing dash. The dash clause is not cosmetic — it is a hard PATTERN_NOT_MATCHED reject. */
export function isValidKeywordText(text: string, maxChars = KEYWORD_MAX_CHARS, maxWords = KEYWORD_MAX_WORDS): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (SEPARATOR_DASH.test(t)) { SEPARATOR_DASH.lastIndex = 0; return false; }
  SEPARATOR_DASH.lastIndex = 0;
  return t.length <= maxChars && words(t).length <= maxWords;
}

/**
 * Shorten an over-long search term to the longest leading root Amazon will accept, cutting on WORD
 * boundaries so the phrase stays meaningful. Returns null when no valid root exists (e.g. a single
 * 90-character token). Keeps the harvest value instead of dropping the term — see rules doc Rule 3.
 */
export function shortenToValidKeyword(
  text: string,
  maxChars = KEYWORD_MAX_CHARS,
  maxWords = KEYWORD_MAX_WORDS,
): string | null {
  // Separator dashes are removed BEFORE the length/word check, because dropping them can bring an
  // otherwise-fine term back inside the limits rather than truncating meaning off the end.
  const t = stripSeparatorDashes(text || "");
  if (!t) return null;
  if (isValidKeywordText(t, maxChars, maxWords)) return t;
  const w = words(t);
  // Drop trailing words until BOTH limits are satisfied.
  for (let n = Math.min(w.length, maxWords); n >= 1; n--) {
    const cand = w.slice(0, n).join(" ");
    if (cand.length <= maxChars) return cand;
  }
  return null; // even the first word is too long
}

// ---------------------------------------------------------------------------
// Reintroduction (the $0.10 floor trap)
// ---------------------------------------------------------------------------

/** A floored keyword plus whatever history the Ads API window could give us. */
export interface ReintroCandidate {
  keywordId: string;
  keywordText: string;
  matchType: string;
  bid: number;
  /** Spend over the longest available window. 0 means "no data in window" — treated as never-spent. */
  histSpend: number;
  histSales: number;
  histOrders: number;
  /** Lifetime ROAS from our own `kw_lifetime` table, spanning years rather than Amazon's 95-day
   *  window. null when the word has no lifetime record. William 2026-08-06: promote best ROAS first. */
  lifetimeRoas?: number | null;
  /** Lifetime spend behind that ROAS, $. Used to break ties toward the better-evidenced word. */
  lifetimeSpend?: number;
  /** Lifetime sales, $. The ranking key among lifetime winners: they are all profitable by
   *  definition, so prefer the one that has actually produced the most money. */
  lifetimeSales?: number;
  /** Lifetime orders. The evidence bar — a 79x ROAS built on one order and $0.25 of spend is noise. */
  lifetimeOrders?: number;
}

/** Live throttle state, measured fresh each run — never trusted from a cache. */
export interface ReintroState {
  /** Keywords already switched on today by this job. */
  introducedToday: number;
  /** Keywords currently on trial: reintroduced, still under $4 spend, not yet converted. */
  inTrial: number;
  /** Month-to-date spend by the whole reintroduced cohort, $. Reported for visibility; NOT a gate. */
  cohortMonthSpend: number;
  /** Today's spend by the cohort, $. THIS is the gate — the circuit breaker reads it every run. */
  cohortSpendToday?: number;
}

export interface ReintroOpts {
  perDay?: number;
  /** Cap for a SINGLE run. With a 6-hourly cron this is what sets the real pace. */
  perRun?: number;
  /** Halt promotions once the cohort has spent this much today. */
  cohortDailyCap?: number;
  /** A word whose LIFETIME ROAS clears this comes back even if the recent window looks bad, because
   *  the recent window is exactly what the monthly rules broke. William 2026-08-05: "if they
   *  previously over lifetime were above a 2x roas ... these are the keywords that need to reset". */
  lifetimeRoasMin?: number;
  /** Minimum lifetime orders before a lifetime ROAS is treated as evidence at all. Without this the
   *  ranking is led by words with one order on a quarter of a dollar. */
  lifetimeMinOrders?: number;
  /** Permanently dead keywords (deadKey() values). Never reintroduced, whatever the report window says. */
  deadKeys?: Set<string>;
  /** Optional ceiling on concurrent UNPROVEN keywords. Unset by William's choice — 10/day is the
   *  only gate. Left available so a ceiling can be reinstated without a code change. */
  maxInTrial?: number;
  maxAcos?: number;
  startBid?: number;
  floor?: number;
}

export interface ReintroPick { keywordId: string; keywordText: string; matchType: string; fromBid: number; toBid: number; reason: "lifetime" | "proven" | "untested" }

export interface ReintroPlan {
  promote: ReintroPick[];
  /** Why the batch stopped, when it stopped early. */
  blockedBy: ("perDay" | "perRun" | "maxInTrial" | "dailyCap")[];
  eligible: number;
}

/**
 * The candidate pool for a run whose Amazon report is still queued (William 2026-08-08, "we need 40
 * a day not 20"; restated 2026-08-14, "it should be launching 40 a day ... it's every six hours,
 * four times a day").
 *
 * A run that REQUESTS a report window cannot also collect it, and the window is keyed by UTC date,
 * so the run just after midnight always finds a fresh, empty one. That is why production promoted at
 * 06:30, 12:30 and 18:30 but never at 00:30 — thirty a day against the forty the schedule buys.
 *
 * Blocking the launch was the wrong answer, but the safety concern behind it was real: with no
 * window, a keyword that recently spent badly reads as "never spent" and would be promoted as
 * untested. So a missing window NARROWS the pool to the two groups William named rather than
 * stopping it — proven 2x+ winners, and words with no spending record at all. A word holding a
 * lifetime record that FAILS the 2x bar is a known non-winner, not an untested one, so it waits for
 * the next run rather than being laundered into the untested tier.
 */
export function lifetimeOnlyPool(
  candidates: ReintroCandidate[],
  minRoas = REINTRO_LIFETIME_ROAS_MIN,
  minOrders = REINTRO_LIFETIME_MIN_ORDERS,
): ReintroCandidate[] {
  return candidates.filter((c) => {
    const proven = (c.lifetimeRoas ?? null) !== null
      && (c.lifetimeRoas as number) >= minRoas
      && (c.lifetimeOrders ?? 0) >= minOrders;
    return proven || (c.lifetimeSpend ?? 0) === 0;   // 2x+ winner, or no spending record at all
  });
}

/**
 * Pure selector for Rule 4. Picks which floored keywords to switch on THIS run.
 *
 * Eligibility (William 2026-08-02): the keyword never spent, OR it spent at ACOS < 50%, OR its
 * LIFETIME ROAS clears 2x (William 2026-08-05). The lifetime path matters because Amazon's window is
 * only 95 days and the monthly kill/bid rules are what drove these words to the floor in the first
 * place, so recent history is evidence of our own mistake rather than of the keyword.
 * Ordering: lifetime winners first (best ROAS first), then window-proven (lowest ACOS first), then
 * never-spent, so the limited number of trial slots goes to the strongest evidence available.
 * Throttle: the per-day count, and by William's choice that is the only one. No total spend cap
 * (a keyword making money spends freely) and no concurrent-in-trial ceiling unless opts sets one.
 */
export function selectReintroductions(
  candidates: ReintroCandidate[],
  state: ReintroState,
  opts: ReintroOpts = {},
): ReintroPlan {
  const perDay = opts.perDay ?? REINTRO_PER_DAY;
  const maxInTrial = opts.maxInTrial ?? Infinity;   // no ceiling by default (William 2026-08-02)
  const maxAcos = opts.maxAcos ?? REINTRO_MAX_ACOS;
  const startBid = opts.startBid ?? REINTRO_START_BID;
  const floor = opts.floor ?? BID_FLOOR;
  const roasMin = opts.lifetimeRoasMin ?? REINTRO_LIFETIME_ROAS_MIN;
  const minOrders = opts.lifetimeMinOrders ?? REINTRO_LIFETIME_MIN_ORDERS;

  const perRun = opts.perRun ?? REINTRO_PER_RUN;
  const dailyCap = opts.cohortDailyCap ?? REINTRO_COHORT_DAILY_CAP;

  const blocked = new Set<"perDay" | "perRun" | "maxInTrial" | "dailyCap">();

  // Hard stops that apply before we look at any candidate.
  if (state.inTrial >= maxInTrial) blocked.add("maxInTrial");
  if (state.introducedToday >= perDay) blocked.add("perDay");
  // The circuit breaker. Amazon's daily budgets are not a control on this account — $745/day is
  // authorised against ~$2.50/day of real spend — so the only ceiling is the one we enforce.
  if ((state.cohortSpendToday ?? 0) >= dailyCap) blocked.add("dailyCap");

  const dead = opts.deadKeys ?? new Set<string>();

  const eligible: (ReintroCandidate & { acos: number | null; tier: 0 | 1 | 2 })[] = [];
  for (const c of candidates) {
    if (dead.has(deadKey(c.keywordText, c.matchType))) continue;  // tombstoned, never resurrect
    if (c.bid > floor) continue;                       // only rescue keywords stuck AT the floor
    const acos = c.histOrders > 0 && c.histSales > 0 ? c.histSpend / c.histSales : null;
    const lroas = c.lifetimeRoas ?? null;
    // Both bars must clear: profitable AND actually evidenced. A word at 79x on $0.25 and one order
    // outranks a word at 24x on $9.81 and ten orders if you sort on the ratio alone, and the second
    // one is the real asset.
    const lifetimeProven = lroas !== null && lroas >= roasMin && (c.lifetimeOrders ?? 0) >= minOrders;
    if (!lifetimeProven && c.histSpend > 0) {
      // Spent inside the window with no lifetime record to vouch for it: it must have earned its
      // way back on the window alone.
      if (acos === null || acos >= maxAcos) continue;
    }
    eligible.push({ ...c, acos, tier: lifetimeProven ? 0 : acos !== null ? 1 : 2 });
  }

  // Tier 0: lifetime winners, best ROAS first — years of evidence beats a 95-day window, and the
  // window is what the monthly rules corrupted. Tier 1: proven inside the window, lowest ACOS first.
  // Tier 2: never spent. Stable within each group so the same run order is reproducible.
  eligible.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.tier === 0) {
      // LOW SPEND FIRST among the 2x+ winners (William 2026-08-08): "launch key words that are low
      // in spend that 2x roas or higher first". This REVERSES the 2026-08-06 rule, which led on
      // lifetime sales volume. A word returning 2x on $3 of lifetime spend is an unfinished
      // experiment; one returning 2x on $900 has already had its run. The cheap winners are where
      // the untested headroom is, and $4 of rope buys far more new evidence on them.
      const sd = (a.lifetimeSpend ?? 0) - (b.lifetimeSpend ?? 0);
      if (Math.abs(sd) > 1e-9) return sd;
      // Tie on spend: better ratio first.
      const d = (b.lifetimeRoas as number) - (a.lifetimeRoas as number);
      if (Math.abs(d) > 1e-9) return d;
    }
    if (a.tier === 1) return (a.acos as number) - (b.acos as number);
    return a.keywordId.localeCompare(b.keywordId);
  });

  const promote: ReintroPick[] = [];
  // 25% of the account is duplicate records of the same text+match (2026-08-04). Promoting three
  // copies of one word burns three of the ten daily slots and makes the copies bid against each
  // other, so only one copy of a word travels per run.
  const takenWords = new Set<string>();
  let today = state.introducedToday, trial = state.inTrial;
  if (blocked.has("dailyCap")) return { promote, blockedBy: [...blocked], eligible: eligible.length };
  for (const c of eligible) {
    if (promote.length >= perRun) { blocked.add("perRun"); break; }
    if (today >= perDay) { blocked.add("perDay"); break; }
    if (trial >= maxInTrial) { blocked.add("maxInTrial"); break; }
    const wk = deadKey(c.keywordText, c.matchType);
    if (takenWords.has(wk)) continue;
    takenWords.add(wk);
    promote.push({
      keywordId: c.keywordId,
      keywordText: c.keywordText,
      matchType: c.matchType,
      fromBid: c.bid,
      toBid: round2(clamp(startBid, floor, BID_CAP)),
      reason: c.tier === 0 ? "lifetime" : c.tier === 1 ? "proven" : "untested",
    });
    today++; trial++;
  }
  return { promote, blockedBy: [...blocked], eligible: eligible.length };
}


/**
 * Is a reintroduced keyword still inside its protection window?
 *
 * Sales are attributed over 14 days, so a word promoted on Monday cannot be fairly judged until the
 * Monday after next. The cut at the 52% pivot judges month-to-date, sees zero orders because
 * the orders have not been attributed yet, and cuts. Repeat that four times a day and the word is
 * back at the floor inside a week — which is exactly the history in ad_engine_log for
 * `phone tethered`: 0.49 -> 0.94 -> 0.35 over six days.
 *
 * Protection suppresses the CUT only. The $4 kill still applies at full force, so a word that
 * genuinely does not work still stops costing money.
 */
export function isProtected(promotedAt: string, now: number, days = REINTRO_PROTECT_DAYS): boolean {
  const t = Date.parse(promotedAt);
  if (!Number.isFinite(t)) return false;
  return now - t < days * 864e5;
}

// ---------------------------------------------------------------------------
// Bid ladder (Rule 5, William 2026-08-05)
// ---------------------------------------------------------------------------

export interface LadderState {
  /** Current bid, $. */
  bid: number;
  /** Spend accumulated since this keyword last had its bid changed, $. */
  spendSinceStep: number;
  /** Whole days since this keyword last had its bid changed. */
  daysSinceStep: number;
}

/**
 * Next bid for a reintroduced keyword that is failing to spend: current + $0.10 per RUN of zero
 * spend, capped at $0.85. Returns null when no change is due, so callers skip the write entirely.
 *
 * A keyword that HAS spent is deliberately left alone: it is generating data now, so the normal
 * ACOS rule in nextBid() owns it and the $4 kill rule bounds its downside. The ladder exists only
 * to rescue keywords that are enabled but priced too low to win anything.
 */
export function nextLadderBid(
  s: LadderState,
  opts: { stepDays?: number; step?: number; max?: number } = {},
): number | null {
  const stepDays = opts.stepDays ?? LADDER_STEP_DAYS;
  const step = opts.step ?? BID_LADDER_STEP;
  const max = opts.max ?? BID_LADDER_MAX;
  if (s.spendSinceStep > 0) return null;        // it spent, the bid is working, hands off
  if (s.daysSinceStep < stepDays) return null;  // not waited long enough
  if (s.bid >= max - 0.005) return null;        // already at the ceiling
  return round2(Math.min(s.bid + step, max));
}

/**
 * Ladder verdict including the approval gate at the ceiling (William 2026-08-05, reaffirmed 08-08).
 *
 * A keyword that has climbed all the way to $0.85 and STILL will not spend is telling us something
 * the rules cannot decide alone: the word may be worth more than our ceiling, or it may be dead.
 * Rather than silently parking it forever, the engine asks. "escalate" means notify William via
 * Telegram and wait for a human answer; it never raises the bid on its own.
 */
export type LadderVerdict =
  | { action: "raise"; bid: number }
  /** At the ceiling and still not spending: ask William. `wouldBe` is the gate it would climb to
   *  next if he says yes, and `evidence` is what the money has bought so far — he asked to be told
   *  impressions and clicks at each gate, not just the bid. */
  | { action: "escalate"; bid: number; wouldBe?: number | null; evidence?: LadderEvidence }
  | { action: "hold" };

/** What a keyword sitting at a gate has to show for itself. */
export interface LadderEvidence { impressions: number; clicks: number; spend: number }

export function ladderVerdict(
  s: LadderState,
  opts: {
    stepDays?: number; step?: number; max?: number;
    /** The highest gate a human has approved for THIS keyword. Absent = nobody has ruled, so the
     *  $0.85 gate applies, exactly as it has since 2026-08-08. */
    approvedCeiling?: number | null;
    gates?: readonly number[];
    /** What this keyword has bought so far, reported to William when it stops at a gate. */
    evidence?: LadderEvidence;
  } = {},
): LadderVerdict {
  const stepDays = opts.stepDays ?? LADDER_STEP_DAYS;
  const gates = opts.gates ?? LADDER_GATES;
  // An explicit `max` still wins, so every existing caller and test behaves exactly as before.
  const max = opts.max ?? activeCeiling(opts.approvedCeiling, gates);
  if (s.spendSinceStep > 0) return { action: "hold" };        // spending, the ACOS rule owns it
  if (s.daysSinceStep < stepDays) return { action: "hold" };  // still waiting out the rung
  if (s.bid >= max - 0.005) {
    return { action: "escalate", bid: s.bid, wouldBe: nextGate(max, gates), evidence: opts.evidence };
  }
  const next = nextLadderBid(s, { ...opts, max });
  return next === null ? { action: "hold" } : { action: "raise", bid: next };
}

// ---------------------------------------------------------------------------
// Permanent kill list (Rule 6, William 2026-08-05)
// "if spent $4 and have no history we kill the word not to use anymore"
// ---------------------------------------------------------------------------

/**
 * A keyword that burned the full $4 of rope and NEVER converted is dead for good, not just for the
 * month. Recording that permanently is not optional bookkeeping: Amazon only serves ~65-95 days of
 * report history, so a keyword killed in June reads as "never spent" by September, becomes eligible
 * for reintroduction again, and burns another $4. The tombstone is what breaks that cycle.
 *
 * Note the asymmetry with shouldKill(): that pauses for the month at $4 when unprofitable, which
 * includes keywords that DID convert but at a bad ACOS. Those can recover and come back on the 1st.
 * This is narrower and harsher: $4 spent, zero orders, no evidence it can ever convert.
 */
export function isPermanentlyDead(p: Perf, killSpend = KILL_SPEND): boolean {
  return p.spend >= killSpend && p.orders === 0;
}

/** Stable identity for the kill list. Text is lowercased/collapsed so casing cannot resurrect a word. */
export function deadKey(keywordText: string, matchType: string): string {
  return `${(keywordText || "").trim().toLowerCase().replace(/\s+/g, " ")}|${(matchType || "").toUpperCase()}`;
}

/** One calendar month of performance for a single keyword. `month` is "YYYY-MM". */
export interface MonthPerf { month: string; spend: number; orders: number; sales: number }

/** Months required in a row before a former winner is retired for good. */
export const RETIRE_CONSECUTIVE_MONTHS = 3;

/**
 * Retire a keyword permanently after N consecutive months of burning the full $4 with no
 * conversion, regardless of how well it once performed (William 2026-08-05:
 * "if a word has 3 consecutive months of $4 spend no conversion even if in the past was good
 * then cut the word").
 *
 * This is the counterpart to isPermanentlyDead(): that one retires a word that never proved
 * itself, this one retires a word whose proof has gone stale. A past winner earns three months of
 * patience, not indefinite patience.
 *
 * NOTE: Amazon serves only 95 days of report history (verified 2026-08-05 against the API's own
 * "data retention start date" error), which is barely 3 months and shrinks below it the moment a
 * 4th month exists. So this rule REQUIRES locally stored monthly history; it cannot be evaluated
 * from the live API alone.
 */
export function shouldRetirePermanently(
  history: MonthPerf[],
  opts: { months?: number; killSpend?: number } = {},
): boolean {
  const need = opts.months ?? RETIRE_CONSECUTIVE_MONTHS;
  const killSpend = opts.killSpend ?? KILL_SPEND;
  if (need <= 0) return false;
  // Chronological, so "consecutive" means consecutive in calendar order, not insertion order.
  const sorted = [...history].sort((a, b) => a.month.localeCompare(b.month));
  let run = 0;
  let prev: string | null = null;
  for (const m of sorted) {
    const failed = m.spend >= killSpend && m.orders === 0;
    // A gap in the calendar breaks the run: we cannot claim months we have no data for.
    const adjacent = prev === null || isNextMonth(prev, m.month);
    run = failed ? (adjacent ? run + 1 : 1) : 0;
    if (run >= need) return true;
    prev = m.month;
  }
  return false;
}

/** True when `b` is the calendar month immediately following `a`. Both "YYYY-MM". */
export function isNextMonth(a: string, b: string): boolean {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  if (!ay || !am || !by || !bm) return false;
  return by * 12 + bm === ay * 12 + am + 1;
}

// ---------------------------------------------------------------------------
// Bid memory: cooldown + rollback (William 2026-08-07)
//
// "adjusting the bid strategy on keywords that are doing well ... and lowering the bid strategy for
//  keywords that are not, but that are doing worse than they were doing before when we increased
//  the bids."
//
// Until now the engine had NO memory. It read current ACOS, moved the bid, and forgot. Every 6
// hours that is four compounding moves a day with nothing ever checking whether a move worked:
// `retractable phone holder belt clip` climbed $0.82 -> $1.45 in four days, and `phone tethered`
// went 0.49 -> 0.94 -> 0.35 in six. Neither climb was ever evaluated.
//
// Two rules fix it, and the first matters more than the second:
//
//   COOLDOWN — a bid may not change again until its last change has had time to produce evidence.
//   Without this, cause can never be attributed to effect, because the bid moved four more times
//   while the first move was still being measured.
//
//   ROLLBACK — when a RAISE has had its evaluation window and the keyword got WORSE, put the bid
//   back where it was. Not lower: back. The old bid is the only level with evidence behind it.
//
// Sales lag up to 14 days, so the evaluation window is deliberately long. A shorter one reads a
// keyword whose orders simply have not been credited yet as a failure, which is the exact mistake
// that walked these words to the floor.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bid search: hunt the most profitable bid for every word, continuously.
//
// William 2026-08-07: "we raise or lower bids based on performance just like closing out words to
// find the max roas for each word constantly."
//
// Every run, each keyword moves a flat $0.10 toward the bid that keeps it BOTH spending AND above 2x.
// Over a few runs each word settles at the highest bid it can carry while still returning 2x.
//
// ONE CORRECTION, and it is the whole reason this account is where it is:
// maximising ROAS on its own drives every bid to the floor. A $0.10 bid wins only the cheapest
// clicks, so it posts a superb ratio and almost no volume. 1,830 of 2,282 enabled keywords sit at
// exactly $0.10 with the best ratios in the account and no sales. So the target is not the highest
// ratio, it is the HIGHEST BID THAT STILL CLEARS BREAK-EVEN — the most profit, which sits just
// before ROAS starts to fall. Climb while profitable, retreat when not.
// ---------------------------------------------------------------------------

/** Minimum gap between moves on one keyword. Every engine run may act (William: "every 6 hours"). */
export const BID_COOLDOWN_HOURS = 6;
/** How much a bid moves per step: a flat ten cents (William: "i asked raising by .10 not 10%"). */
export const BID_SEARCH_STEP = 0.10;

// THE GENTLE CUT, for a keyword that is ALREADY profitable. William 2026-08-10:
// "keyword returning 3x you lower bid slowly very slow maybe $.02 to $.05 every 6 hours to see if
// you can improve spend and impressions and conversions without sacrificing roi".
//
// Two cents, the SLOW end of the range he gave, on his correction: "you dont know what moves too
// slowly or fast we are testing and rather be cautious to test a profitable keyword slowly then
// move too quick and turn off the spending and lose market share."
//
// The risk is asymmetric and that is the whole argument. Cutting a working word too fast drops it
// out of auctions it was winning, and the traffic does not return just because the bid does. That
// is market share, and it is expensive to re-buy. Cutting too slow only costs time. When the
// evidence cannot tell the two apart, the cheaper mistake is the slow one.
export const BID_SHAVE_STEP = 0.02;

/** Clicks needed before a ROAS reading is trusted. Below this the ratio is noise: the bid still
 *  moves, but always on the cautious step, never the fast one. */
export const SEARCH_MIN_CLICKS = 3;
// The line the whole search steers by (William 2026-08-07: "roas above 2x that's the goal").
// Break-even is 1.92x on real fees ($9.49 - $0.62 COGS - $1.42 referral - $2.52 FBA), so 2x is
// break-even plus a thin margin — deliberately not a target that only a floored bid could hit.
export const TARGET_ROAS = 2.0;

// ---------------------------------------------------------------------------
// THE BLENDED ROAS SIGNAL (William 2026-08-13)
// ---------------------------------------------------------------------------
//
// William: "have a combination of a trailing window and a current window. And that way we don't
// overspend too much. So maybe give a weight to the current window of like 70% and then the
// trailing attribution at 30%."
//
// The shape is his and it is right. The one amendment, from the research in
// confabulator/RBB-bid-signal-window-2026-08-13.md, is that the 70% has to be EARNED.
//
// Blending a noisy recent estimate with a stabler long-run one is empirical Bayes shrinkage, which
// is standard for sparse advertising data (Dynamic Hierarchical Empirical Bayes, arXiv:1809.02213).
// Its central result is that the weight on the recent window should scale with how much evidence
// that window holds, because noisier estimates must be shrunk harder. A FIXED 70% does the opposite:
// it puts 70% of the decision on a single click.
//
// That matters here more than almost anywhere. Live pull 2026-08-01..08-13: 152 clicks in 13 days
// across 2,279 enabled keywords, about 11.7 a day for the whole account. Published practice is that
// a keyword needs 20-30 clicks a DAY to be judged inside two weeks. A 6-hour window on one of our
// keywords holds 0 to 3 clicks, and one $9.49 order takes it from 0.00x to 10x.
//
// So the weight is a function of clicks, tuned so that William's 70/30 is exactly what comes out at
// the volume where a ROAS reading stops being one order wide:
//
//     clicks   weight on the current window
//        0        0%     no evidence — do not move on it
//        1       25%
//        3       50%
//        7       70%     <- his number, at the volume that earns it
//       20       87%
//
// His CADENCE is untouched. The engine still decides every 6 hours. Only the ruler changes.
//
// ROLLBACK: BLEND_K = 0 collapses this to the pure current window (today's behaviour). Passing a
// fixed `weight` collapses it to his literal 70/30. Both are one line, no data migration.
// ---------------------------------------------------------------------------
// SPONSORED DISPLAY MOVES DIFFERENTLY (William 2026-08-13)
// ---------------------------------------------------------------------------
//
//   "Maybe we work with this in increments of five cents since it looks like retargeting is a
//    smaller click system than search words or anything else. So maybe start at 10 and move it to
//    15 and then maybe 20 and see where we're playing around in the 15 to 20 and maybe not change
//    it ... except for once a day. And see if we can get some spend and some ROI at ten cents."
//
// He is reading a real pattern in the lifetime data, not guessing. The SAME audience at different
// bids swings enormously, and always in the same direction:
//
//   views 14d  $0.10 bid ->   122 clicks, 2.41x        views 30d  $0.10 -> 1,664 clicks, 1.16x
//   views 14d  $0.48 bid ->   411 clicks, 0.67x        views 30d  $0.34 ->   721 clicks, 0.47x
//
// Three times the clicks for a quarter of the return. Amazon's own suggested bids on these sit at
// $3.52 to $5.56, and every move toward that suggestion destroyed the economics. So Display is not
// mis-targeted so much as it was bid up, the same disease that killed the keywords.
//
// TWO DIFFERENCES FROM SPONSORED PRODUCTS, both his:
//
// A FIVE CENT STEP, not ten. The whole usable range here is roughly $0.10 to $0.48, and a dime
// crosses a third of it in one move. Five cents gives the search somewhere to land between the bid
// that converts and the bid that only buys clicks.
//
// ONCE A DAY, not every six hours. Retargeting audiences produce far fewer clicks than search, so a
// six-hour window holds almost no evidence. Moving four times a day would be moving on noise, which
// is the same argument that produced the blended-window rule for keywords.
export const SD_BID_STEP = 0.05;
export const SD_BID_COOLDOWN_HOURS = 24;

// WILLIAM 2026-08-14: "start at .05 and see if bids go up and down based on roas, once we spend $4
// turn it off."
//
// Entry drops from $0.10 to $0.05, and Display gets its own FLOOR. The shared BID_FLOOR is $0.10,
// which silently clamped every Display cut and made a five-cent bid unreachable — the search could
// only ever move up. $0.02 is Amazon's own limit, quoted from a live write:
//   "Bid is out of range (must be in [0.02, 1000.0])"
// Probed on a target inside a PAUSED campaign and restored, so nothing serving was disturbed.
//
// Search DIRECTION is unchanged and is the point of the exercise: not spending -> up a nickel,
// spending under 2x -> down a nickel, at or above 2x -> shave. $4 unprofitably -> off for the month.
export const SD_START_BID = 0.05;
export const SD_BID_FLOOR = 0.02;

export const BLEND_K = 3;

// WILLIAM'S DECISION, 2026-08-13: "ok so 30% for 7 days and 70% for now".
//
// He was shown the evidence-weighted alternative above and chose the fixed split. That is his call
// and it is what ships. The evidence weighting stays in the file as `currentWeight`, reachable by
// passing `{ k }` instead of a weight, so switching to it later is one argument.
//
// What the fixed split does NOT do, said plainly because it was measured rather than argued: at one
// click it still puts 70% of the decision on a single order, and a 1-click window showing one
// $9.49 sale reads 10.5x. See the test "the blend ALONE does not save the real keyword". The guard
// that actually stops that is trendVerdict()'s minimum-clicks rule on RAISING, further down. The
// two are independent: this constant sets how the number is computed, that one sets when we are
// allowed to act on it.
export const BLEND_WEIGHT_CURRENT = 0.70;

// The trailing window, in days. William 2026-08-13 set it to 7, matching Amazon's Sponsored
// Products click-attribution window for a 3P Seller Central account — which ours is, confirmed by
// a live /v2/profiles read returning `accountType: seller`. Most of this repo still reads
// `sales14d`, which is the Vendor Central figure; that mismatch is tracked separately.
export const TRAILING_WINDOW_DAYS = 7;

/** How much of the decision the current window has earned, 0..1. */
export function currentWeight(clicksInCurrentWindow: number, k = BLEND_K): number {
  const c = Math.max(0, clicksInCurrentWindow || 0);
  if (k <= 0) return 1;                       // rollback path: trust the current window entirely
  return c / (c + k);
}

/** One ROAS reading over some window. `clicks` is what earns it weight. */
export interface RoasWindow { spend: number; sales: number; clicks: number }

const roasOf = (w: RoasWindow): number | null =>
  w && w.spend > 0 ? w.sales / w.spend : null;

/**
 * The number the direction rule steers by: the current window and the trailing window blended,
 * weighted by the evidence the current window actually holds.
 *
 * Returns null when NEITHER window has spend to measure — there is no signal, and the caller must
 * hold rather than invent one. When only one window has spend, that window is the answer, which is
 * what makes a brand-new keyword behave exactly as the engine does today.
 */
export function blendedRoas(
  current: RoasWindow | null | undefined,
  trailing: RoasWindow | null | undefined,
  opts: { k?: number; weight?: number } = {},
): number | null {
  const rc = current ? roasOf(current) : null;
  const rt = trailing ? roasOf(trailing) : null;
  if (rc === null && rt === null) return null;
  if (rt === null) return rc;                 // nothing to blend with — new keyword
  if (rc === null) return rt;                 // current window bought nothing at all
  // Fixed split by default (William 2026-08-13). Pass `{ k }` to get the evidence-weighted form.
  const w = opts.weight ?? (opts.k !== undefined ? currentWeight(current!.clicks, opts.k) : BLEND_WEIGHT_CURRENT);
  return w * rc + (1 - w) * rt;
}

/** Is the blended signal rising or falling against the last blended reading? "unknown" when we
 *  cannot tell, which the caller must treat as "hold", never as "falling". */
export function roasTrend(
  now: number | null,
  before: number | null | undefined,
): "rising" | "falling" | "unknown" {
  if (now === null || before === null || before === undefined) return "unknown";
  if (Math.abs(now - before) < 1e-9) return "unknown";   // dead flat is not a trend
  return now > before ? "rising" : "falling";
}

/**
 * THE ASYMMETRY, and it was forced by a test that failed rather than by an opinion.
 *
 * Shrinking the weight is not enough on its own. Work the real case: `retractable phone tether`
 * with one click and one $9.49 order in a 6-hour window reads 10.5x, against a trailing 1.63x. Even
 * at 25% weight the blend comes out at 3.86x and still reports "rising" — so a pure weighted blend
 * would STILL have raised the bid on one click, which is the exact move that walked it to $0.89 and
 * got it killed. Raising k does not fix it either: the ratio is too extreme for any positive weight
 * to tame.
 *
 * The fix is not a bigger shrink, it is recognising that the two directions carry different risk:
 *
 *   RAISING  spends more money. It must be EARNED — the current window needs enough clicks to have
 *            a real reading (SEARCH_MIN_CLICKS), otherwise we are buying on a coin flip.
 *   CUTTING  spends less money. It needs no such permission, and trailing evidence alone is enough.
 *
 * That mirrors the asymmetry William already reasoned to himself on 2026-08-10 about step size:
 * moving too fast on a working word loses market share that is expensive to re-buy, moving too slow
 * only costs time. Same logic, applied to whether we may act at all.
 */
export function trendVerdict(
  now: number | null,
  before: number | null | undefined,
  _clicksInCurrentWindow?: number,
  _minClicks = SEARCH_MIN_CLICKS,
): "raise" | "cut" | "hold" {
  const t = roasTrend(now, before);
  if (t === "unknown") return "hold";
  if (t === "falling") return "cut";                              // cutting never needs permission
  // NO MINIMUM-CLICK GATE. William 2026-08-13: "no 3 click min".
  //
  // I had proposed one, and his other rule the same day makes it not merely redundant but WRONG.
  // "only raise bid if word is not spending" means every word eligible for a raise has zero clicks
  // by definition, so a 3-click minimum on raising would block every raise there is and freeze the
  // ladder at the floor — the exact trap 1,660 keywords are already sitting in. The guard against
  // buying on a lucky click is now the spending rule in searchStep, which is a better one because
  // it needs no threshold at all.
  return "raise";
}

export interface BidChange {
  changedAt: string;
  fromBid: number;
  toBid: number;
  /** ROAS over the window BEFORE the change; null when it had no sales then. */
  roasBefore: number | null;
  // What the PREVIOUS bid level actually produced, recorded at the moment of the change. The next
  // run compares its own window against these to answer "did that move make things better or
  // worse". Both windows are one cooldown long (~6h), so they are comparable. Undefined on rows
  // written before 2026-08-10, and the reversal simply does not fire without them rather than
  // guessing from a half-known baseline.
  impressionsBefore?: number;
  clicksBefore?: number;
  salesBefore?: number;
}

/** Performance accumulated SINCE a bid change — the evidence that change produced.
 *  `impressions` is what separates "the bid is too low to enter the auction" from "we are being
 *  shown and nobody clicks", which are different problems with different fixes. */
export interface SinceChange { spend: number; sales: number; orders: number; clicks: number; impressions?: number }

/** Whole days between an ISO timestamp and now. */
export function daysSince(iso: string, nowMs = Date.now()): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (nowMs - t) / 864e5;
}

/** True while a keyword's last bid change is too fresh to act on again. */
export function inCooldown(last: BidChange | null | undefined, nowMs = Date.now(), hours = BID_COOLDOWN_HOURS): boolean {
  if (!last) return false;
  return daysSince(last.changedAt, nowMs) * 24 < hours;
}

export type SearchStep =
  /** restored = this move is the UNDO of a cut that silenced the word. The engine records the
   *  restored bid as that keyword's floor so the search cannot walk it off the same cliff again. */
  | { bid: number; direction: "up" | "down"; reason: string; restored?: true }
  /** escalate = the rule wanted to raise past $0.85 and stopped. wouldBe is the bid it wanted. */
  | { bid: null; reason: string; escalate?: true; wouldBe?: number };

/**
 * One bid step for one keyword.
 *
 * REWRITTEN 2026-08-10 on William's instruction, and it REVERSES the direction this function used
 * to take on a profitable keyword. Recording the reversal rather than quietly editing the old
 * comment, because the previous rule was also his and was correct under a different goal.
 *
 * The old rule (2026-08-07, "you have to spend to max roas"): a word returning 2x or better was
 * RAISED, to buy more of a good thing. That maximises total profit dollars.
 *
 * The new rule (2026-08-10, in his words):
 *
 *   "If the bid isn't getting impressions or clicks, then you have to raise it. If the bid is
 *    getting clicks and hopefully conversions, then you lower the bid and try to find that magical
 *    bid price where you can still get conversions and clicks without completely turning off the
 *    keyword. And then, of course, the big hanger is if it spends $4, you've got to turn it off
 *    for the month."
 *
 * So a profitable word is now SHAVED, not bought up, hunting the cheapest bid that still buys the
 * clicks. That maximises profit per dollar rather than total dollars.
 *
 *   no impressions, no clicks   -> UP   $0.10.  Not in the auction at all. Raising costs nothing,
 *                                              because a bid only charges when it wins a click.
 *   getting clicks, under 2x    -> DOWN $0.10.  Paying too much per sale, so cut at pace.
 *   getting clicks, 2x or over  -> DOWN $0.02.  Works. Shave gently and watch. See BID_SHAVE_STEP.
 *   shown but never clicked     -> HOLD.        Not a bid problem. A bid buys the impression; the
 *                                              image, title and price buy the click. Moving the
 *                                              bid here treats a creative fault as a pricing one.
 *   the last cut killed the clicks -> UNDO, and remember that bid as this word's floor.
 *
 * ONE THING THIS RULE CANNOT DO, said plainly because the instruction hoped for it: lowering a bid
 * never RAISES impressions. The bid is what gets you into the auction, so cutting it can only hold
 * or lose placement. What it wins is a cheaper click. Normally cheaper clicks stretch the budget
 * into more of them, but budget is not this account's constraint ($1,165/day authorised against
 * about $5 spent), so the gain here is margin, not volume. Growth has to come from the ~1,750
 * keywords parked at the $0.10 floor, not from this function.
 *
 * Only the $4 kill switches a keyword off. This never returns "stop".
 */
export function searchStep(
  currentBid: number,
  since: SinceChange | null | undefined,
  last?: BidChange | null,
  opts: {
    step?: number; floor?: number; cap?: number; ceiling?: number; minClicks?: number; target?: number;
    /** the gentle cut for a word that already works (BID_SHAVE_STEP) */
    shave?: number;
    /** the lowest bid this word has been PROVEN to still need; never cut at or below it */
    floorFound?: number | null;
  } = {},
): SearchStep {
  const step = opts.step ?? BID_SEARCH_STEP;
  const shave = opts.shave ?? BID_SHAVE_STEP;
  const floorFound = opts.floorFound ?? null;
  const floor = opts.floor ?? BID_FLOOR;
  const cap = opts.cap ?? BID_CAP;
  const ceiling = opts.ceiling ?? BID_CONFIRM_CEILING;
  const minClicks = opts.minClicks ?? SEARCH_MIN_CLICKS;
  const target = opts.target ?? TARGET_ROAS;
  const base = currentBid > 0 ? currentBid : floor;

  // A FLAT TEN CENTS, not ten percent (William 2026-08-07: "i asked raising by .10 not 10%").
  // The same step the reintroduction ladder uses. A percentage step is worst exactly where it is
  // needed most: 10% of a $0.10 bid is one cent, so a floored keyword would need 19 runs to reach
  // the $0.59 market CPC. A flat dime gets there in five. Arithmetic is in whole cents throughout,
  // because comparing dollars as floats made $0.10 -> $0.11 read as "no change" and pinned every
  // floored keyword at exactly the floor this rule exists to escape.
  // WILLIAM 2026-08-13, and it is absolute: "do not raise bid if the word is spending", "only
  // raise bid if word is not spending".
  //
  // Enforced HERE, inside move(), rather than at each call site, so it covers every path that
  // exists now and every one added later — including the turn-around, which reverses direction and
  // could otherwise raise a spending word without any branch above looking like a "raise".
  //
  // The logic is his and it is sound: a bid only buys ENTRY to the auction. Once a word is spending
  // it is already in, so raising cannot buy anything the word does not already have — it can only
  // pay more for the same click. Raising is therefore a tool for exactly one job, getting a silent
  // word into the auction, and this is the line that keeps it to that job.
  const isSpending = (since?.spend ?? 0) > 0 || (since?.clicks ?? 0) > 0;

  const move = (dir: "up" | "down", reason: string, thisStep: number = step): SearchStep => {
    if (dir === "up" && isSpending) {
      return { bid: null, reason: `${reason} — but it IS spending, and a spending word is never raised` };
    }
    const stepC = Math.round(thisStep * 100), baseC = Math.round(base * 100);
    const floorC = Math.round(floor * 100), capC = Math.round(cap * 100);
    const ceilC = Math.round(ceiling * 100);
    const wantC = dir === "up" ? baseC + stepC : baseC - stepC;

    // THE $0.85 STOP, on the way up only (William 2026-08-08). A keyword already at or above the
    // ceiling does not get raised again by a rule — it gets reported. Cuts fall through untouched,
    // which is what lets a keyword sitting at $1.94 today walk back down without asking.
    if (dir === "up" && baseC >= ceilC) {
      return {
        bid: null,
        reason: `${reason}, but $${(base).toFixed(2)} is already at or past the $${ceiling.toFixed(2)} ceiling — needs your confirmation`,
        escalate: true,
        wouldBe: wantC / 100,
      };
    }
    // Below the ceiling a raise is allowed to land ON it, never through it: $0.80 + $0.10 -> $0.85.
    const upperC = dir === "up" ? Math.min(capC, ceilC) : capC;
    const bidC = Math.max(floorC, Math.min(upperC, wantC));
    if (bidC === baseC) return { bid: null, reason: `${reason} (already at the ${dir === "up" ? "cap" : "floor"})` };
    return { bid: bidC / 100, direction: dir, reason };
  };

  // THE TURN-AROUND, checked before anything else. William 2026-08-10:
  //
  //   "we cut until the keyword doesnt perform as well. Less impressions less sales then we start
  //    to go the other way little by little, itll stop spending way before $.1"
  //
  // So a move that made things worse is not undone to a frozen floor, it REVERSES: the search
  // turns round and steps back the other way, two cents at a time, and keeps hunting. That makes
  // this a hill climb that settles by oscillating a couple of cents around the best bid, rather
  // than one that stops dead at the first bad step.
  //
  // NOTE: a turn-around is a shape William rejected on 2026-08-07 ("no thats not how you max roas
  // you have to spend to max roas"). That rejection was against the OLD goal of maximising total
  // spend at 2x. Under the new goal — the cheapest bid that still converts — he asked for it
  // directly. Recorded so the reversal is not mistaken for drift.
  //
  // "Worse" is his test, not mine: fewer impressions, or fewer sales, than the previous bid level
  // produced. Requires a baseline, so it never fires on the first move of a keyword's life.
  if (last && since && last.impressionsBefore !== undefined) {
    const wasCut = last.toBid < last.fromBid;
    const impNow = since.impressions ?? 0;
    const worse = impNow < (last.impressionsBefore ?? 0) || since.sales < (last.salesBefore ?? 0);
    if (worse) {
      const dir = wasCut ? "up" : "down";
      const what = impNow < (last.impressionsBefore ?? 0)
        ? `impressions fell ${last.impressionsBefore} -> ${impNow}`
        : `sales fell $${(last.salesBefore ?? 0).toFixed(2)} -> $${since.sales.toFixed(2)}`;
      return move(dir, `the ${wasCut ? "cut" : "raise"} to $${last.toBid.toFixed(2)} made it worse (${what}) — turning round little by little`, shave);
    }
  }

  // Never cut below a bid we have already proved this word needs.
  const atFloorFound = floorFound !== null && Math.round(base * 100) <= Math.round(floorFound * 100);

  // NOT IN THE AUCTION. No impressions and no clicks means the bid never won a placement, so there
  // is nothing to judge and nothing at risk. Raise. Note this reads impressions, not spend: a word
  // can be shown thousands of times, spend nothing because nobody clicked, and the old
  // `spend <= 0` test would have called that "not spending" and raised the bid at a creative fault.
  const impressions = since?.impressions ?? 0;
  const clicks = since?.clicks ?? 0;
  if (!since || (impressions === 0 && clicks === 0)) {
    return move("up", "no impressions and no clicks — raising until it enters the auction");
  }

  // SHOWN, NEVER CLICKED. Asked whether a floored word with impressions but no clicks should
  // climb, William 2026-08-10: "yes it climbs if not spending or converting you raise the bid to
  // find the optimal". So it RAISES rather than holding.
  //
  // I had it holding on the argument that a bid buys the impression and the listing buys the
  // click, so a bid move cannot fix a click problem. That reasoning is still true in itself, but
  // it is not the whole picture: at $0.10 a keyword only wins the bottom of the last page, where
  // nobody clicks whatever the listing says. Position is bought with bid, and 1,750 keywords are
  // proof that holding them there teaches us nothing.
  if (clicks === 0) {
    return move("up", `${impressions} impressions and no clicks — raising to find the position that gets one`);
  }

  if (atFloorFound) {
    return { bid: null, reason: `at $${base.toFixed(2)}, the lowest bid this word is known to still work at — holding` };
  }

  // GETTING CLICKS. Every path from here is DOWN, hunting the cheapest bid that still converts.
  // Only the SIZE of the cut varies, and it varies on how confident we are that the word works.
  const roas = since.spend > 0 ? since.sales / since.spend : 0;
  if (clicks < minClicks) {
    return move("down", `${clicks} click${clicks === 1 ? "" : "s"} since the last move, too few to judge ROAS — shaving cautiously`, shave);
  }
  return roas >= target
    ? move("down", `${roas.toFixed(2)}x, at or above ${target}x — works, so shaving gently to find the cheapest bid that still converts`, shave)
    : move("down", `${roas.toFixed(2)}x, below ${target}x — paying too much per sale`);
}

/**
 * The whole bid decision for one keyword: cooldown, then a search step.
 * Returns bid null when nothing should change this run.
 */
export function bidWithMemory(
  currentBid: number,
  _p: Perf,
  last: BidChange | null | undefined,
  since: SinceChange | null | undefined,
  nowMs = Date.now(),
  opts: {
    step?: number; floor?: number; cap?: number; ceiling?: number; hours?: number; minClicks?: number;
    target?: number; shave?: number; floorFound?: number | null;
  } = {},
): { bid: number | null; reason: string; escalate?: true; wouldBe?: number; restored?: true } {
  if (inCooldown(last, nowMs, opts.hours ?? BID_COOLDOWN_HOURS)) {
    return { bid: null, reason: `held: last change was ${(daysSince(last!.changedAt, nowMs) * 24).toFixed(1)}h ago` };
  }
  const v = searchStep(currentBid, since, last, opts);
  return {
    bid: v.bid,
    reason: v.reason,
    escalate: v.bid === null ? v.escalate : undefined,
    wouldBe: v.bid === null ? v.wouldBe : undefined,
    // The engine persists this bid as the keyword's floor so the search cannot re-cut through it.
    restored: v.bid !== null ? v.restored : undefined,
  };
}


// ---------------------------------------------------------------------------
// ONE BID PLANNER FOR ALL THREE AD PRODUCTS (William 2026-08-13)
// ---------------------------------------------------------------------------
//
// "We need the rules to apply to all three different types of campaigns, please."
//
// Until now only Sponsored Products had bid rules. Brands and Display had the $4 kill and nothing
// else, which is why `retractable phone holder belt clip` could walk to $2.50 on one side of the
// account while the other two sides were never touched at all. The kill has been shared since
// 2026-08-08; this is the other half.
//
// The rules themselves were always ad-product-agnostic — searchStep() takes numbers, not keywords.
// What was missing was a planner that any engine can hand its entities to. SP calls it with
// keywords, SB with keywords, SD with targets, and all three get identical arithmetic.
//
// WHAT IT DELIBERATELY DOES NOT DO: invent history. `kw_bid_history` has zero rows, so there is no
// "what did the last bid level produce" to compare against and the turn-around cannot fire. Rather
// than fake a baseline, the planner passes `last: undefined` and searchStep skips that branch by
// design. Every other rule — never raise a spending word, cut $0.10 under 2x, shave $0.02 at or
// above it, stop at the approved gate — works on month-to-date figures alone.

export interface BidCandidate {
  id: string;
  /** display name for logs and Telegram; never used in a decision */
  label: string;
  /** the keyword TEXT, used ONLY by the emergency overlap cut. Absent for entities that have no
   *  text to overlap on, such as a Display audience, which can then only be cut on its own
   *  numbers. Never used by the ordinary bid rules. */
  word?: string;
  bid: number | null;
  spend: number; sales: number; orders: number; clicks: number; impressions?: number;
  /** false when the entity, or the campaign holding it, is not ENABLED. Amazon answers 207 and
   *  changes nothing, so these are reported rather than silently attempted. */
  writable?: boolean;
  /** highest gate a human has approved for this entity; absent means the $0.85 gate applies */
  approvedCeiling?: number | null;
}

export interface BidMove {
  id: string; label: string; fromBid: number; toBid: number;
  direction: "up" | "down"; reason: string;
}
export interface BidEscalation {
  id: string; label: string; bid: number; wouldBe: number | null;
  impressions: number; clicks: number; spend: number; reason: string;
}
export interface BidPlan {
  moves: BidMove[];
  /** at the approved gate and still not spending — William is asked, nothing is raised */
  escalated: BidEscalation[];
  /** decided to change nothing */
  held: number;
  /** wanted a change but the entity or its campaign is not ENABLED */
  blocked: number;
  /** the $4 rule owns these; the planner never bids on something being switched off */
  killing: number;
  /** slashed 80% because a copy of the word is being switched off (William 2026-08-26) */
  emergency: number;
}

/**
 * The whole bid decision for a set of entities, whatever product they belong to.
 *
 * Order matters and is deliberate: the kill is checked FIRST, so a word on its way off the account
 * never also gets a bid write. Two writes on one entity in one run is how a log ends up claiming
 * things that contradict each other.
 */
export function planBids(
  candidates: BidCandidate[],
  opts: {
    defaultBid?: number; killSpend?: number; killMinRoas?: number;
    /** lowercased texts of entities being switched off, so their live copies are cut 80% rather
     *  than left bidding. Omit and the overlap half of the emergency rule simply does not fire. */
    killedWords?: Set<string>;
    /** step size per move. Sponsored Display uses SD_BID_STEP (5c); the others use a flat dime. */
    step?: number;
    /** lowest bid a cut may reach. Display goes to SD_BID_FLOOR ($0.02, Amazon's own limit);
     *  everything else stays on the shared $0.10. Without this the shared floor clamped every
     *  Display cut and a five-cent bid was unreachable. */
    floor?: number;
  } = {},
): BidPlan {
  const defaultBid = opts.defaultBid ?? BID_FLOOR;
  const floor = opts.floor ?? BID_FLOOR;
  const out: BidPlan = { moves: [], escalated: [], held: 0, blocked: 0, killing: 0, emergency: 0 };
  const killedWords = new Set([...(opts.killedWords ?? [])].map(overlapKey));

  for (const c of candidates) {
    const perf: Perf = { spend: c.spend, orders: c.orders, sales: c.sales };
    if (shouldKill(perf, opts.killSpend, opts.killMinRoas)) { out.killing++; continue; }

    // EMERGENCY 80% CUT (William 2026-08-26). Checked BEFORE searchStep, and it overrides the
    // ceiling, the shave and the ordinary dime, because this is not a search for the right bid. It
    // is suppression until the entity can be switched off.
    //
    // OVERLAP ONLY here, deliberately. The other half of the rule, "its own numbers earn the cut",
    // is exactly shouldKill() since William's 2026-08-26 correction, and shouldKill() already
    // returned two lines above. Writing the branch anyway would be a condition that can never be
    // true, which is the same defect as the dead `pivot` parameter this file just lost.
    const emOverlap = !!c.word && killedWords.has(overlapKey(c.word));
    if (emOverlap) {
      const from = c.bid && c.bid > 0 ? c.bid : (opts.defaultBid ?? BID_FLOOR);
      const to = emergencyBid(from, floor);
      if (to < from) {
        if (c.writable === false) { out.blocked++; continue; }
        out.emergency++;
        out.moves.push({
          id: c.id, label: c.label, fromBid: from, toBid: to, direction: "down",
          reason: `emergency: overlaps "${c.word}", which is switched off`,
        });
        continue;
      }
      // Already at or below where the cut would land. Fall through: searchStep may still hold it,
      // and there is nothing here worth a second write.
    }

    const base = c.bid && c.bid > 0 ? c.bid : defaultBid;
    const since: SinceChange = {
      spend: c.spend, sales: c.sales, orders: c.orders,
      clicks: c.clicks, impressions: c.impressions ?? 0,
    };
    const ceiling = activeCeiling(c.approvedCeiling);
    const step = searchStep(base, since, undefined, { ceiling, floor, step: opts.step, shave: opts.step });

    if (step.bid === null) {
      if (step.escalate) {
        out.escalated.push({
          id: c.id, label: c.label, bid: base, wouldBe: nextGate(ceiling),
          impressions: c.impressions ?? 0, clicks: c.clicks, spend: c.spend,
          reason: step.reason,
        });
      } else out.held++;
      continue;
    }
    if (c.writable === false) { out.blocked++; continue; }
    out.moves.push({
      id: c.id, label: c.label, fromBid: base, toBid: step.bid,
      direction: step.direction, reason: step.reason,
    });
  }
  return out;
}
