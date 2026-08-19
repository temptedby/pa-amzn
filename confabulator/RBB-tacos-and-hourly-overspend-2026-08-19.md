# RBB — TACOS as the governing metric, and an hourly $4 guard across all three ad products

**Date:** 2026-08-19
**Asked by:** William, 2026-08-19: "compare our overall marketing cost to overall sales versus our ad
cost to ad sales ... see how that's growing day to day ... make sure we're checking every hour and
we're not overspending on the four dollars for every category: display, sponsored, and search."
**Status:** research only. Nothing built. Nothing applied to the account.

---

## 1. Problem

Two separate problems arrived in one instruction, and they need separating before either is built.

**Problem A: we are steering on the wrong number.** Every rule in the engine judges a keyword on
ACOS, which is ad spend over ad-attributed sales. That number cannot see organic sales, so it cannot
tell the difference between an ad that bought a sale and an ad that bought a sale we would have got
anyway. It also cannot see whether advertising is lifting the business. William has asked for the
comparison, day by day.

**Problem B: the $4 bar fires after the money is gone, and only every six hours.** The bar is a
month-to-date tombstone, not a budget. Measured on this account:

- `phone retractable tether` BROAD read $0.75 at the 00:07Z snapshot on 08-18 and $4.72 by the next
  run. One six-hour gap, $3.97 spent, no order.
- On 08-16 `phone tether clip` BROAD spent $8.50 in a single day with zero orders.
- Average overshoot when the rule does fire is 101%: it kills at about $8.04, not $4.00.
- 2,238 enabled Sponsored Products keywords, each allowed $4 a month, permits roughly $9,000 a month.
  There is no account-level cap. The monthly cap was dropped on 2026-08-07 when $6.42 against
  $1,165/day authorised made it look irrelevant. It is no longer irrelevant.

Success looks like: (a) a daily TACOS-versus-ACOS series we read every morning, and (b) no keyword,
target or campaign in any of the three products passing $4 unprofitably by more than about an hour's
worth of spend.

---

## 2. Industry standard

**On TACOS.** The published consensus is that the two metrics answer different questions and both
are needed: ACOS measures campaign efficiency and is the right tool for managing bids; TACOS measures
whether advertising is growing the total business and is the right tool for judging strategy.
Benchmarks put a healthy TACOS at 10-15%, with 5-10% for an established product past launch and 1-5%
for a mature product with strong organic rank. The diagnostic that matters for us: a rising ACOS with
a falling TACOS is healthy growth, while ACOS and TACOS rising together means ads are buying volume
that is not compounding into organic rank.

Sources: [Clickstera 2026 benchmarks](https://clickstera.com/blog/amazon-advertising-benchmarks-2026-cpc-ctr-a-co-s-ta-co-s-by-category),
[Daniks.AI TACOS guide](https://daniks.ai/blog/what-is-amazon-tacos-complete-guide),
[Keywords.am TACOS formula and benchmarks](https://keywords.am/blog/amazon-tacos/),
[Trellis Amazon ads benchmarks](https://gotrellis.com/resources/blog/amazon-advertising-benchmarks).

**On real-time spend control.** Amazon's own answer to report latency is Amazon Marketing Stream,
which pushes hourly Sponsored Products and Sponsored Display traffic and conversion data to an
advertiser-owned AWS destination. `sp-traffic` carries hourly impressions, clicks and spend;
`sp-conversion` carries hourly orders, units and sales by attribution window. Initial click data is
available within about 12 hours, and conversion data is revised for up to 60 days after the click.
Sources: [Amazon Ads product page](https://advertising.amazon.com/solutions/products/amazon-marketing-stream),
[Tinuiti](https://tinuiti.com/blog/amazon/amazon-marketing-stream/),
[AWS for Industries](https://aws.amazon.com/blogs/industries/unlock-real-time-advertising-insights-with-amazon-marketing-stream-and-aws).

The broader control principle: a cap enforced after the fact is an audit, not a budget. The standard
shape is a fast cheap tripwire on total exposure plus a slower precise process that decides which
individual thing to switch off.

---

## 3. Codebase and reality

Measured today, not assumed.

**Cron schedule as deployed** (`vercel.json`), all six-hourly except the inbox agent:

```
report-warm             "40 */6"     ad-engine (SP)          "0 */6"
sb-engine               "15 */6"     sd-engine               "45 */6"
ad-engine-reintroduce   "30 */6"     inbox-agent             "0 * * * *"
```

`inbox-agent` proves hourly crons already work on this plan, so cadence is not a platform blocker.

**Where the $4 rule lives.** Sponsored Products judges per keyword id in `killPlan()`; Sponsored
Brands per keyword id; Sponsored Display per target. All three read month-to-date and all three run
only on their six-hourly cron. `maxDuration` on the engine route is 300 seconds.

**What the engine actually did in the last 30 hours** (`ad_engine_log`): 3 Sponsored Products bid
decisions. Runs at 08-18 06:04, 12:07 and 18:05 made zero, and no run row exists for 08-19 00:0x.

**Data sources for spend, all three probed live on 2026-08-17 and re-confirmed today:**

```
POST /v2/sp/keywords/report      404 NOT_FOUND        the v2 shortcut that rescued SB does not exist for SP
GET  /streams/subscriptions      200 {"subscriptions":[]}   entitled, never switched on
POST /sp/campaigns/budget/usage  200, timestamps minutes old
```

`budget/usage` is the only same-hour signal Amazon offers on the credentials we hold. It is campaign
level and spend only: no sales, no keyword breakdown. It cannot pick a keyword to kill. It can tell
us the account is running hot before the report catches up.

**Report queue latency, from Amazon's own `createdAt`/`updatedAt`:** mean 2.6 minutes at 00:00Z and
29.9 minutes at midday. That is the constraint any hourly design has to live with, and it is why the
engine currently waits 90 seconds inline and otherwise falls through to the deferred path.

---

## 4. Options

**A. Hourly cron that re-runs the full engine.** Simplest to describe, wrong in practice: it would
quadruple report volume against a queue that is 30 minutes slow at midday, and it would let the bid
rules move every keyword 24 times a day instead of 4, which is the opposite of the slow-and-cautious
step William asked for on 08-17.

**B. Hourly kill-only watchdog, separate route, deferred report pattern.** A new cron requests the
month-to-date report for each product at :00 and reads the one requested an hour earlier, then does
nothing except pause things past $4 and under 1x. No bid moves, no adds. Roughly one hour of lag
instead of six. Effort: half a day. This is the shape proposed on 08-17 and set aside when the
report turned out to take 31 seconds, a reasoning that the cron-ordering bug then invalidated.

**C. Option B plus a `budget/usage` tripwire.** The same hourly route also reads campaign budget
usage, which is minutes old, and raises an alert or pauses at campaign level when the account crosses
a daily dollar ceiling. Catches the runaway case that a keyword-level rule structurally cannot: the
one where fifty keywords each spend $3.90 in a day. Effort: about a day.

**D. Amazon Marketing Stream.** The correct long-term answer and the one Amazon designed for exactly
this. Needs Firehose or SQS, an ingest endpoint and a data store. Days of work, and this business is
being wound down. Recorded as the right answer we are choosing not to build.

**E. Do nothing to the cadence; cap campaign budgets instead.** The cheapest brake that exists today,
requires no code, and is the one thing that binds regardless of how late the data is. $745/day is
currently authorised across 10 enabled campaigns against a product that can carry roughly $26/day at
break-even. This has been asked and unanswered since 08-18.

---

## 5. Recommendation

**E first, today, then C.**

E first because it is the only control that works while the engine is broken. Every other option
depends on the engine running, and the engine has made 3 decisions in 30 hours. A budget cap does not
care whether the cron fired. It is also instantly reversible.

Then C, because B alone still cannot see the failure mode that actually cost us August: not one
keyword spending $50, but a hundred keywords each spending $4. The budget-usage tripwire is the only
same-hour signal available and it costs one extra API call on a route we are building anyway.

**What NOT to do:** do not build A, and do not lower the $4 bar. The bar is not the problem, the
absence of an account-level ceiling is. Lowering it to $2 would double the number of kill events and
still permit roughly $4,500 a month. Do not build D for this business.

---

## 6. Open questions, trade-offs accepted, rollback

**Open questions for William, in the order they block work:**

1. The daily budget ceiling. What number, account-wide? Break-even arithmetic says about $26/day.
2. Hourly kill-only, or hourly kill plus the budget tripwire? (B or C.)
3. Does the hourly guard pause automatically, or alert and wait? Pausing is the point, but it is the
   first rule that would act on data less than a full attribution window old, and the 08-09 finding
   was that both August kills HAD converted inside that window.

**Trade-offs accepted.** An hourly guard acting on hour-old data will occasionally pause a keyword
whose sale lands later; the in-month revival rule at 2.0x is the existing mitigation. Four times the
report volume, against a queue Amazon lets us re-request safely with a 425. One more cron and one
more thing that can fail silently, which is why the empty-report case must throw rather than read as
"nothing to do", the same lesson as PR #7.

**Rollback.** The budget cap is a number in Seller Central, reversible in a minute. The hourly route
is a new file and one line of `vercel.json`; deleting the cron entry disables it with no effect on
any existing engine.
