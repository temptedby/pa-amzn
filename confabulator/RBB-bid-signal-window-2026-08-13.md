# RBB — What window should the bid engine judge ROAS on?

**2026-08-13.** Written before building, on William's instruction: *"maybe do some research on this
RBB six-step process and see what you think."*

His proposal: blend a current window and a trailing attribution window, weighted **70% current /
30% trailing**, so the engine reacts fast enough not to overspend.

---

## 1. Problem

Every 6 hours the engine must answer one question per keyword: **is this word's ROAS rising or
falling, and which way do I move the bid?** William's rule is raise while rising, cut $0.10 every
6 hours once falling.

The engine currently answers it from `SinceChange` — spend, sales, clicks and impressions
accumulated since that keyword's last bid change, which the 6-hour cooldown makes a ~6-hour window
(`ad-rules.ts` `BID_COOLDOWN_HOURS = 6`, consumed in `searchStep`).

Two things make that window a bad instrument here, and both are measured, not assumed:

**It is too thin.** Live pull, 2026-08-01 to 08-13: **152 clicks in 13 days across the entire
account**, 11.7/day spread over 2,279 enabled keywords. A single keyword's 6-hour window typically
holds **0 to 3 clicks**. One $9.49 order moves a keyword from 0.00x to 10x. The engine would be
reading a coin flip and calling it a trend.

**It is biased downward, not just noisy.** Amazon attributes a sale to the click that caused it,
days later. A window that has only just closed has its clicks but not yet its sales, so *every*
freshly-measured window looks worse than it will turn out to be. "Declining" is what a healthy
keyword looks like by default.

That is not theoretical. It is the documented history of the single best word in the account:

```
retractable phone tether PHRASE   $0.55 -> $0.89 over four runs, RAISED while it converted
                                  landed at 1.63x, then KILLED on 08-11 for being under break-even
```

Raised into unprofitability on short-window readings, then killed for being unprofitable. It holds
$41.96 of August's $96.41 in sales and it is switched off right now.

**Success looks like:** a signal that moves quickly when there is real evidence, and refuses to move
when there is not, without needing a human to tell the two apart.

---

## 2. Industry standard

**Lookback must scale with volume, and ours is the low-volume case.** Amalyze's guidance on the
lookback period is explicit that high-volume "hero" products can afford 14-30 day windows because
they reach significance quickly, while **low-volume or niche products need 90-180 day windows to
prevent erratic bidding** — and that *"if you don't define your lookback period with precision, you
aren't optimizing for efficiency; you are optimizing for the noise of the last few days."*

**The volume bar we do not clear.** Published practice is that a keyword needs roughly **20-30 clicks
a day** to produce meaningful data inside two weeks. The whole account takes 11.7.

**Reacting faster than the data resolves is a named failure mode.** Ad Badger's write-up of common
Amazon PPC mistakes calls it *"layering noise on top of noise"* and warns you end up *"chasing your
own tail by reacting to fluctuations that are partially a result of your own recent interventions"* —
a precise description of the $0.55 -> $0.89 -> killed sequence above.

**Conversion data lags clicks by 24-72 hours**, which makes same-day ROAS unreliable on its own
terms; and attributed sales keep growing well after the click — in the top 5% of campaigns,
attributed sales grew **at least 18.75% between day 1 and day 17** of the same reporting period.

**There is a formal name for what William proposed.** Blending a noisy recent estimate with a
stabler long-run one is **empirical Bayes shrinkage**, standard in online-advertising conversion
modelling (see Dynamic Hierarchical Empirical Bayes, arXiv:1809.02213, built specifically for
sparse advertising data). Its central result is the part worth taking: the method **shrinks noisier
estimates more aggressively** — the weight on the recent window is a function of how much evidence
that window actually contains, not a constant.

So William's instinct is the right one and it has a literature. The single amendment the literature
makes is that 70/30 should be what the blend becomes *when the current window has earned it*.

---

## 3. Codebase and reality

| Fact | Where | Value |
|---|---|---|
| Bid decisions read a ~6h window | `ad-rules.ts` `searchStep(currentBid, since, last)` | `SinceChange` since last change |
| Cooldown that defines the window | `ad-rules.ts` `BID_COOLDOWN_HOURS` | 6 |
| Clicks available to judge on | live spTargeting pull, 08-01..08-13 | **152 clicks / 13 days** |
| Enabled keywords sharing them | live `/sp/keywords/list` | **2,279** |
| Turn-around baseline rows | `kw_bid_history` | **0 rows** |
| Per-keyword daily history | `kw_daily` | stale since **2026-08-05** |
| Account type | live `/v2/profiles` | `accountType: seller` (3P) |
| Attribution columns the API accepts | live probe | `sales1d/7d/14d/30d` all accepted |

Two of these are load-bearing and easy to miss:

**`kw_bid_history` has zero rows.** The turn-around rule — the one that reverses a move that made
things worse — is written, tested, and *cannot fire at all today*, because it refuses to act without
a baseline and no baseline has ever been recorded. Whatever window we choose, the history has to
start being written or none of this runs.

**We are a 3P seller account.** Published guidance is that Sponsored Products uses a **7-day**
click-attribution window for Seller Central, and 14 days for Vendor Central. Every rule in this repo
reads `sales14d` and `REINTRO_PROTECT_DAYS` is set to 14. If the real window is 7 days, our
protection period is twice as long as it needs to be and we are being slower than necessary.
**Measured separately, on a fully settled July period, rather than assumed.**

---

## 4. Options

| # | Option | Effort | Impact | Trade-off |
|---|---|---|---|---|
| A | **Fixed 70/30** exactly as proposed | Low | Better than pure 6h | 70% weight on a 1-click window still lets one order swing the bid. Does not solve the problem at our volume, only softens it |
| B | **Evidence-weighted blend.** weight on current = `clicks / (clicks + k)` | Medium | Behaves as 70/30 when the window is busy, near-zero when it is empty | One constant to explain. Slower on brand-new keywords with no trailing history |
| C | **Trailing window only** (my earlier proposal) | Low | Safest | Ignores William's overspend concern entirely; too slow to stop a bad word |
| D | **Fixed 70/30 with a minimum-clicks gate** — use the current window only if it has >= 3 clicks, else fall back to trailing | Low | Most of B's benefit | A cliff edge at 3 clicks: 2 clicks counts for nothing, 3 counts for 70% |

---

## 5. Recommendation

**Option B**, tuned so that it *is* William's 70/30 at the volume he is picturing, and automatically
becomes cautious at the volume we actually have.

```
  weight_current = clicks_in_current_window / (clicks_in_current_window + 3)

  clicks   weight on current window
     0       0%      no evidence, do not move on it
     1      25%
     3      50%
     7      70%      <- William's number, at the volume that earns it
    20      87%
```

`k = 3` is chosen so the 70/30 split lands at 7 clicks, which is the point where a ROAS reading
stops being one order wide.

Blended ROAS is then `w * roas_current + (1 - w) * roas_trailing`, and the direction rule William
specified runs on top of that number unchanged: rising -> raise, falling -> cut $0.10 every 6 hours.
**His cadence is untouched.** The engine still acts every 6 hours. Only the ruler changes.

**What NOT to do, and why.** Do not ship fixed 70/30 (Option A). At 1 click in the window it puts 70%
of the decision on a single coin flip, which is the exact mechanism that walked `retractable phone
tether` to $0.89 and got it killed. It would look like it was following the instruction while
reproducing the failure the instruction exists to prevent.

Do not ship Option C either, even though it is the safest. William's overspend concern is real and a
pure trailing window is too slow to stop a word that has genuinely turned.

---

## 6. Open questions, trade-offs, rollback

**ANSWERED 2026-08-13, and the answer is stronger than the question.** Measured on a fully settled
period, 01-15 July, 110 keyword rows, $50.08 of spend:

```
  sales1d   $48.96      purchases1d   4
  sales7d   $48.96      purchases7d   4
  sales14d  $48.96      purchases14d  4
  sales30d  $48.96
```

Identical at every horizon. **Every sale this account made in that period was attributed within one
day of the click.** Not 14 days, not 7 — one. If a single order had landed on day 2, `sales7d` would
exceed `sales1d`, and it does not.

Two consequences, and one correction I owe:

1. **`REINTRO_PROTECT_DAYS = 14` is roughly fourteen times longer than the evidence supports.** It
   exists to stop the engine cutting a keyword before its sales have landed. Its sales land the same
   day.

2. **The correction:** earlier today I argued a short window "always reads low on sales" because
   "sales land up to 14 days after the click". That is not true on this account. I conflated two
   different things — the ATTRIBUTION window (how long after a click a sale still counts, which is
   effectively 1 day here) and REPORT AVAILABILITY (how long before Amazon will show it to us, which
   published sources put at 24-72 hours and which we have separately watched be slow all morning).
   The attribution half of my argument for a longer ruler is weaker than I said.

   **The noise half is untouched and is the real argument**: 152 clicks in 13 days across 2,279
   keywords. A 6-hour window is thin because there is nothing in it, not because its sales are
   still in flight.

**Sample-size caveat, stated rather than buried:** 4 orders. That is unambiguous as far as it goes —
4 of 4 landed day one — but it is 4. Worth re-measuring on August once the month settles.

**Still open:** every rule in the repo reads `sales14d`, the Vendor Central figure. On the evidence
above the column choice makes no difference to the numbers, but the 14-day WAITS built on top of it
are costing real time.

**Open:** `kw_bid_history` has no writer producing rows. Until it does, neither the turn-around rule
nor any trailing-window comparison has anything to read. This is the actual blocker and it is bigger
than the choice of window.

**Trade-offs accepted.** A brand-new keyword with no trailing history gets `w = 1` and behaves
exactly as the current engine does, because there is nothing to blend with. Slower reaction on very
quiet keywords, which is the intended behaviour rather than a cost.

**Rollback.** `k` is a single constant. Setting `k = 0` makes the weight 1 and collapses this to the
current pure-current-window behaviour. Pinning the weight to 0.7 collapses it to William's literal
Option A. Both are one-line reversions with no data migration.

---

## Sources

- Amalyze, *The PPC Lookback Period: How Far Back Your Bid Optimizer Should Really Look* — https://amalyze.com/resources/sponsored-success/ppc-lookback-period
- Ad Badger, *You're Optimizing Too Much: 3 Amazon PPC Habits to Quit Today* — https://www.adbadger.com/blog/amazon-ppc-optimization-mistakes/
- Optmyzr, *Why Your Amazon Ads Report Is Lying to You* — https://www.optmyzr.com/blog/amazon-ads-reporting-delays/
- Openbridge, *Amazon Advertising Attribution, Definitions, and Timing* — https://docs.openbridge.com/en/articles/4208366-amazon-advertising-attribution-definitions-and-timing
- Intentwise, *Explained: How does Amazon attribute ad sales?* — https://www.intentwise.com/blog/ad-performance-optimization/explained-how-does-amazon-attribute-ad-sales/
- *Dynamic Hierarchical Empirical Bayes: A Predictive Model Applied to Online Advertising*, arXiv:1809.02213 — https://arxiv.org/pdf/1809.02213
- Threecolts, *A beginner's guide to Amazon PPC that actually works* — https://www.threecolts.com/blog/amazon-ppc-guide/
