# RBB: should the engine harvest NEGATIVE keywords?

**Asked by William, 2026-08-08**, after I proposed it: *"no i have not seen that work whats the
research on it rbb"* and *"i have had more success just turning words off"*.

**Answer up front: he is right, and the research supports him. Do not build it.**

---

## 1. Problem

Search terms that spend and never convert. From our own cached `spSearchTerm` reports, the repeat
offenders are `cell phone lanyard` and `holdmate phone lanyard` at roughly $10 per 30-day window
each. **Holdmate is a competitor brand**, so we are paying for their name and getting no sales.

Today the only lever against a losing search term is to let the broad keyword that caught it reach
$4 and be paused. That also stops every good term the same keyword was matching.

Success would look like: less money on terms that never convert, **with no loss of sales**. That
second half is the whole question.

## 2. Industry standard

The literature is genuinely split, which is itself the finding.

**For negatives.** [Ad Badger](https://www.adbadger.com/blog/amazon-ppc-education/negative-keywords-amazon-ppc/),
[SalesDuo](https://salesduo.com/blog/amazon-negative-keywords/) and
[Headline](https://www.headlinema.com/blog/amazon-negative-keywords) all describe search-term-report
review as routine practice, and claim mature accounts carry three to five times more negatives than
positive keywords.

**Against negatives, with actual measurements.**
[m19 ran two experiments](https://www.m19.com/blog/amazon-negative-keywords):

- **285 days**, removing low-performing keywords every 15 days, which is normal seller behaviour.
  ACOS stayed healthy at 17%. **Sales fell by almost half.**
- **One year, multiple accounts**, negating "wasted ad spend" versus optimising the same traffic.
  **35% drop in sales.** Named examples: one ASIN missing EUR 13,500 of sponsored sales in 90 days
  at 26% ACOS, another EUR 5,544 at 9% ACOS, another EUR 7,243 at 11% ACOS.

**Bias to declare:** m19 sells an automated bidding tool, and their recommended alternative is to
buy it. That is a real commercial interest and it should discount their conclusion. It does not
erase the measurements, and note the direction of the ACOS numbers: the accounts got *more
efficient* and *less profitable*. That is the exact trap this business is already in.

Even the pro-negative sources agree on the guardrails: never negate on a handful of clicks, and
prefer ad-group level over campaign level because one bad campaign negative hits every product.

## 3. Codebase and reality

**We cannot do it correctly today even if we wanted to.** `ST_COLS` in
`src/lib/amazon/ad-engine.ts` pulls `searchTerm, campaignId, adGroupId, clicks, cost, sales14d,
purchases14d`. There is **no `keyword` and no `matchType` column**, so a search term cannot be
attributed to the keyword that caught it. Any negative we added would be guesswork about which
broad keyword to attach it to.

**The endpoints do work.** `POST /sp/negativeKeywords/list` returns 200 with 50+ ad-group negatives
already on the account. `POST /sp/campaignNegativeKeywords/list` returns 200 with zero.
`POST /sb/negativeKeywords/list` is a 404 at that path.

**This account's documented failure mode is over-pruning.** 151 profitable keywords were paused or
archived holding **$46,283 of lifetime sales**, walked down one 10% cut at a time by rules that
judged a month (`winners-switched-off`, 2026-08-05). The entire reintroduction job exists to undo
that. Adding a second automated switch-off mechanism amplifies the precise failure that already
cost this business its sales.

**A concrete example of the trap, from our own data.** `holdmate pro retractable phone holder`
converts: 4 orders, 1.3x return. Break-even is 1.92x, so it loses money per sale. A naive
"negate anything under 2x" rule blocks it. But it is a competitor brand term that *demonstrably
sells*, and the right response to a 1.3x converting term is a lower bid, not a permanent block.

**The decisive asymmetry, and it is ours, not the literature's.** Our $4 kill is **reversible**:
it pauses for the month and `ad-engine-reactivate` reconsiders on the 1st against lifetime
evidence. A negative keyword has **no such path**. Nothing in this codebase ever reviews, expires
or removes a negative. It is a permanent block that no job will ever revisit, on an account whose
history is losing money by switching winners off and not noticing for months.

## 4. Options

| | Effort | Impact | Risk |
|---|---|---|---|
| **A.** Automated negative harvesting | Medium (new tables, rule, cron, reactivation path) | Cuts some non-converting spend | **High.** m19's measured 35-50% sales loss, on an account already damaged by over-pruning, with no reversal path |
| **B.** Do nothing new; keep the $4 keyword kill | None | Already working, and bounded at $4 per keyword | Low. Keeps paying for some losing terms until the parent keyword dies |
| **C.** Add `keyword` + `matchType` to the search term report | Tiny (one line, plus a cache re-request) | Visibility: we could finally see WHICH broad keywords catch losing terms, and which convert | Very low |
| **D.** Hand-negate only competitor brand terms that have NEVER converted, William approving each | Small, manual | Removes the clearest waste | Low, because a human checks each one |

## 5. Recommendation

**Do C now. Otherwise B. Do NOT build A.**

C is a one-line change that answers William's original question (*"search terms from broad matches
that convert"*), which we currently cannot answer at all. It adds visibility and takes no action, so
it cannot lose a sale.

**Do not build A**, for three reasons in order of weight:

1. **No reversal path.** Every other destructive rule in this system can be undone by the monthly
   reactivation. A negative cannot, and on this account undoing over-pruning has been the single
   biggest lever we have found.
2. **The measured evidence points the wrong way.** Even discounting m19's commercial bias, both
   experiments show efficiency improving while sales collapse. This business does not need a better
   ACOS. It has been at 1.72x lifetime against a 1.92x break-even for seven years, and the goal is
   to move ~2,000 units, not to look efficient while selling less.
3. **We would be flying blind.** Without `keyword`/`matchType` we cannot attach a negative to the
   right keyword.

D stays available and is worth raising separately, because `holdmate phone lanyard` at ~$10 a
window with zero conversions is hard to defend. That is a handful of hand-checked entries, not an
automated rule, and it needs William's sign-off per term.

## 6. Open questions, trade-offs, rollback

**Trade-off accepted if we do B/C:** we keep paying for some non-converting search terms until the
parent keyword hits $4. Bounded per keyword, unbounded across the account.

**Open question for William:** do you want to hand-negate the competitor brand terms (option D)?
That is the one slice where the evidence against negatives does not really apply, because the term
has never converted at any bid.

**Rollback for C:** revert one line in `ST_COLS`. The cache key changes, so the harvest reports
re-request and take about 10 minutes to rebuild. No account changes, so nothing to undo on Amazon.

**Not researched:** whether Amazon's own "negative targeting recommendations" in the console differ
from the API path. Out of scope for this decision.
