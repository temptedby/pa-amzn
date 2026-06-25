# Ad-Engine Strategy Audit — 2026-06-25 (READ-ONLY)

**Author:** Bear (autonomous). **Scope:** prove the ad strategy works + find bugs. **Account changed:** NONE.
**Evidence:** `ad_engine_log` (80 rows, Turso) + live Ads API v3 pulls (campaigns, 3,438 keywords, spTargeting + spSearchTerm 30d reports). All figures below are pulled, not assumed.

---

## TL;DR verdict
The **bid-convergence path is executing as designed and is healthy** — correct direction, floor/cap respected, idempotent per-run, clean since the 0.30->0.50 target change on 2026-06-22 (0 wrong-direction moves post-22 of 52 checked). **The harvest path is structurally limited (a real bug for "all campaigns" coverage), and the cap has a minor rounding breach.** The engine has done **80 rebids, 0 kills, 0 harvests** since 2026-06-18 — and after replicating the rules against live data, **the 0 kills and 0 harvests are currently CORRECT (nothing qualifies right now), not a broken path.** Two real defects + two coverage gaps below.

---

## 1. Keyword-harvesting coverage — VERDICT: does NOT cover all campaigns (by design)
- Account has **33 SP campaigns (10 ENABLED, 21 paused, 2 archived)**, **3,438 keywords (2,277 ENABLED)** across **19 campaigns with enabled keywords**.
- The engine's harvest writes **every** new keyword to a **single anchor ad group** — the *first* enabled EXACT/PHRASE keyword it finds (ad-engine.ts:86, :117). Right now that anchor is "mobile phone leash" (campaign 212260116772958, adGroup 254674058751981).
- **Consequence:** even when harvest fires, 18 of 19 campaigns can NEVER receive a harvested keyword, regardless of which campaign the converting search term came from. -> **BUG H1 (structural).**
- **Why 0 adds in the log is still currently correct:** the 30d spSearchTerm report returned **64 rows / 55 distinct terms / 8 converting (>0 orders)**. All 8 converting terms (x2 match types = 16 candidates) are **already keywords** -> `have` set blocks them (ad-engine.ts:116). So would-harvest **= 0 today**. The harvest math is right; there is simply nothing new to add — partly because traffic has collapsed (55 distinct search terms in 30d is very thin for 2,277 enabled keywords, consistent with the ~90% sales drop).

## 2. Full action audit since launch (2026-06-18 -> 2026-06-25)
| Action | Count | Notes |
|---|---|---|
| **rebid** | 80 | 3 runs/day (00:0x / 06:0x / 18:0x); 1-6 keywords/run |
| **kill** (pause) | 0 | would-kill replayed on live data **= 0** (no enabled kw >=\$4 spend & 0 orders/30d) — rule simply hasn't triggered |
| **add** (harvest) | 0 | would-harvest **= 0** today (all converting terms already keywords) |

Per-keyword rebid history (start->current bid):
- `cell phone lanyard` — 24 touches, \$0.37 -> \$0.76
- `holdmate pro retractable phone holder` — 9 touches, \$0.37 -> \$1.06
- `retractable phone lanyard tether` — 9 touches, \$0.11 -> \$0.86
- `phone tethered` — 15 touches, \$0.50 -> \$0.63
- `retractable phone holders` — 13 touches, \$0.36 -> \$0.11 (correctly bid DOWN)
- `retractable cord for phone` — 7 touches, \$0.53 -> \$0.11 (bid DOWN, then dropped out of report)
- `cell phone case tether` — 3 touches, \$0.53 -> \$0.22

Only **7 distinct keywords** have ever been touched, because only keywords that BOTH convert (orders>0 & sales>0) AND surface in the 30d spTargeting report are eligible to rebid (ad-engine.ts:97). The report returned **152 targeting rows; 115 matched enabled keywords with perf** — i.e. **only ~5% of the 2,277 enabled keywords have any 30d performance data**.

## 3. Bug hunt (log cross-checked vs live API state)
- **BUG C1 — ±25%/run cap is breached by cent-rounding. 22 of 80 rebids exceeded 25%.** `round()` is applied *after* the clamp (ad-engine.ts:101), so rounding to whole cents pushes small bids past the cap: `0.10->0.13` (+30%), `0.30->0.22` (-26.7%), `0.11->0.14` (+27.3%). Always small-bid keywords; magnitude is cents. **Severity: low**, but it violates the stated invariant. Fix: re-clamp to [lo,hi] after rounding, or round toward the interior of the band.
- **RISK R1 — cross-run ratchet (not a per-run bug, but aggressive).** The header comment says "NOT compounding"; that's only true *within* a run. Across 3 runs/day at up to ±25% each, bids escalate fast: `retractable phone lanyard tether` \$0.11->\$0.86 (~8x) and `holdmate pro` \$0.37->\$1.06 (~3x) in ~3 days. With `TARGET_ACOS = 0.50` during the sales drop, any converting term is bid up quickly. Consider a per-**day** cap or 1 run/day.
- **COVERAGE G1 — sub-\$4 wasted spend is never acted on.** A keyword with, say, \$1-\$3.99 spend and 0 orders is neither killed (below \$4) nor rebid (needs orders>0). It silently bleeds budget until it crosses \$4. And a keyword that loses all impressions vanishes from the report and **freezes at its last bid** (no decay).
- **Idempotency: PASS (with one benign note).** No duplicate (action, keyword, run_at) writes except "cell phone lanyard" appearing twice in several runs — that's **two distinct keywordIds** with the same text (different campaign/match type), each correctly rebid once. Re-running a window produces the same *direction*; the ratchet (R1) is cross-run, not a re-write.
- **Floor/cap bounds: PASS.** No `to_bid` < \$0.10 or > \$2.50 in 80 rebids.
- **Direction logic: PASS (post-target-change).** 0 wrong-direction of 52 rebids since 2026-06-22. The 17 "wrong-direction" rows on 06-18/06-19 were CORRECT under the then-active 0.30 target (e.g. ACOS 36% > 30% -> lower); they only look wrong if you retroactively apply the 0.50 target. **Not a bug.**
- **DB ad tables empty is NOT the cause.** `campaigns/keywords/search_terms = 0` in Turso, but the engine reads **live** from the Ads API every run (ad-engine.ts:79,91,109) and writes `ad_engine_log` (80 rows). The empty sync tables don't affect engine behavior — corroborates the earlier correction in `research-discipline.md`.

## 4. Verdict & recommended fixes (PROPOSE ONLY — do not apply live without William)
**Is the strategy executing as designed? YES for bidding; PARTIALLY for harvesting.** The convergence engine is doing exactly what it should on the keywords it can see; the gaps are (a) harvest reaches only one campaign and (b) coverage is thin because most enabled keywords get no traffic.

Recommended fixes, by priority:
1. **H1 — harvest to the source campaign's ad group**, not one global anchor. Group the spSearchTerm report by `campaign`/`adGroup` (or look up each term's origin) and add the new keyword into the campaign it converted in. Restores "all campaigns" coverage. *Effort: medium.*
2. **C1 — fix the cap-rounding breach.** Clamp after rounding: `target = Math.max(lo, Math.min(hi, round(...)))`, or round toward the band interior. *Effort: trivial.*
3. **G1 — add a low-spend bleed rule** (e.g. lower bid when spend >= \$1 and 0 orders, below the \$4 kill line) and a stale/zero-impression decay. *Effort: medium.*
4. **R1 — reconsider cadence vs. step.** A per-day ±25% cap (or 1 run/day) prevents 3x/day ratcheting, especially at the 0.50 recovery target. *Effort: low.*
5. **Docs — correct the "NOT compounding" comment** (ad-engine.ts:9) to "capped per run; ratchets across runs."

**What NOT to do:** do not "fix" the 0 kills / 0 harvests — they are correct given current data. Do not lower the kill threshold reactively; G1 (a graduated low-spend rule) is the right lever.

---
*Method note (research discipline): every count above is from a live API pull or a `ad_engine_log` query run 2026-06-25; replication scripts were temporary and removed; nothing in the live account was modified.*
