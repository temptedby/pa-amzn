# RBB: closing the detection gap on the $4 rule

2026-08-17, third six-step of the day. William: *"Are there any words right now that are over four
dollars that should be stopped? How can we close this gap? Should we be doing reports every hour?"*

Constraint carried forward from earlier today: **do not change the ad engine.**

---

## 1. Problem

### First, a correction to the count

Fifteen keywords have been stopped under the $4 rule. **The engine stopped five of them.** The other
ten were paused by hand in the last three days, seven on 08-16 and three this morning.
`kw_kill_ledger` holds exactly 5 rows, all time.

### The rule is right and it fires late every time

```
15 keywords stopped, total spent at the moment of stopping   $120.54
had each stopped at exactly $4.00                            $ 60.00
overshoot                                                    $ 60.54    (101%)
average keyword died at $8.04 against a $4.00 bar
worst case: cell phone retractable tether (EXACT) at $18.86
```

### But Sunday showed the gap is worse than late firing

Only **3% of Sunday's $102.88** was spent by a keyword already past $4 with zero orders. The six
biggest burners had barely spent at all before that day:

| Keyword | Aug 1-15 | Sunday |
|---|---|---|
| phone assured (BROAD) | **$0.00** | $8.42 |
| anti theft phone holster (BROAD) | **$0.00** | $8.00 |
| retractable phone tether (PHRASE) | **$0.00** | $7.09 |
| smartphone safety leash clip (BROAD) | $1.21 | $7.48 |
| phone tether tab for iphone (PHRASE) | $0.60 | $5.24 |
| phone retractable tether (EXACT) | $2.80 | $4.60 |

Three of them spent nothing for fifteen days and then took $7 to $8 in one.

### So the gap has two halves, and they multiply

1. **Latency.** The engine's spend reading refreshes once a day
   (`ads-reports.ts:60-63` keys the cache on the end date, `:32` allows 30 hours of staleness).
2. **Cadence.** The engine acts every six hours (`vercel.json`, `0 */6 * * *`).

A keyword can therefore travel from $0.00 to $8.42 entirely inside one blind window. Neither half is
sufficient on its own: fixing the cadence to hourly against a once-a-day reading changes nothing, and
fixing the reading without acting more often only means the engine is well-informed four times a day.

### Success looks like

- Any keyword past $4 with no conversion is off **within an hour**, not within a day.
- The account cannot exceed a stated daily dollar figure **regardless** of what any rule concludes.
- The ad engine is not modified.

---

## 2. Industry standard

**Sample faster than the thing you are controlling changes.** This is the Nyquist criterion, and it
is the whole answer to "should we do reports every hour". A control loop sampling once per day cannot
regulate a quantity that moves 100% of its budget in a day. The question is not whether hourly is
nice, it is whether the sample interval is shorter than the time it takes to do the damage. Ours is
not.

**Amazon already sells the answer.** Amazon Marketing Stream exists specifically because the async
report queue is too slow for automated bidding, and it delivers hourly performance data by push
rather than poll. Every serious third-party Amazon bid manager runs on Stream.

**Separate the brake from the throttle.** Nygard's circuit breaker sits outside the component it
protects. A kill-only job that can pause but physically cannot raise a bid is strictly safer than
adding a kill path to an engine that also raises, because the dangerous capability is absent rather
than merely unused.

**Budget is the backstop of last resort.** No sampling rate makes a per-keyword rule able to stop a
keyword with no history. Only arithmetic can.

---

## 3. Codebase and reality

### Measured report latency on this account

From our own `ads_report_jobs`, 113 collected jobs:

```
fastest   1.7 min    (small "reactivate" reports, 8 to 20kb)
median  360.0 min    <- an artifact of OUR 6-hourly polling, NOT Amazon's queue
slowest 491.0 min
sd-engine-mtd        4.9 min
reintro-* family     9.7 to 10.6 min
```

**The median is meaningless as a latency figure.** `collected_at` records when our cron next looked,
not when Amazon finished. The honest read is the floor: small reports land in under two minutes, the
reintroduction family in about ten.

A live measurement of the big one is running now, polling every 8 seconds from the moment of request.
It has passed 25 minutes without completing, so **the month-to-date targeting report is materially
slower than the small ones**, and that number goes in this document as soon as it lands rather than
being estimated here.

### Hourly cron is already proven on this project

`vercel.json` runs `/api/cron/inbox-agent` at `0 * * * *`. Hourly is not a new capability to acquire,
it is a schedule string.

### Amazon's data does move intra-day

Same account, same day, three reads:

```
07:00Z  SP MTD  $320.99
08:00Z  SP MTD  $324.77
08:00Z  SP MTD  $325.62  (campaign level, the same money counted a second way)

phone assured (BROAD):  $6.99 at 07:00Z  ->  $8.42 at 09:00Z
```

So requesting more often does return different numbers. Amazon also restates recent spend **upward**
as it settles, which means a fresh reading is not merely newer, it is systematically less
understated. Both of today's discrepancies ran in the same direction.

### The two non-report sources, both verified today

```
GET  /streams/subscriptions      -> 200  {"subscriptions":[]}   entitled, never switched on
POST /sp/campaigns/budget/usage  -> 200  usageUpdatedTimestamp minutes old, campaign level, spend only
POST /v2/sp/keywords/report      -> 404  the legacy synchronous path is dead for SP
```

### The click arithmetic that decides whether hourly is enough

Sunday's heaviest keyword, `phone assured`, took **7 clicks in the entire day**. The whole account
took 50 clicks. At roughly $0.85 a click:

```
worst keyword, clicks per day        7
worst keyword, clicks per hour     ~0.3
dollars per hour at $0.85/click    ~$0.25
```

**An hourly check would catch a keyword within about one click of the $4 bar.** The overshoot would
fall from $4.04 average (the $8.04 death against a $4 bar) to well under a dollar. This is the single
most decisive number in this document: the traffic is thin enough that hourly is not just better, it
is close to exact.

---

## 4. Options

### A. Move `report-warm` to hourly, and only the reports that change
`vercel.json`: `40 */6` becomes `40 * * * *`, and the spec list is trimmed so the harvest and history
reports (which cover closed date ranges and cannot change) are not re-requested 24 times a day.
Requires the cache key to stop pinning to the end date, which is inside `ads-reports.ts`, not inside
the engine.
**Effort:** small, one cron line plus the key change. **Impact:** every reading the engine takes is at
most an hour old instead of up to thirty. **Trade-off:** 24 requests a day per live spec instead of 4.
On measured latency the month-to-date report may not finish inside an hour, in which case the practical
freshness floor is whatever that measurement turns out to be.

### B. A kill-only watchdog, hourly, outside the engine
A new file and a new cron. Reads the freshest available report, applies **only** `shouldKill` from the
existing `ad-rules.ts`, and issues `state: PAUSED`. It has no bid-writing code at all, so it cannot
raise anything by construction, and it imports nothing from `ad-engine.ts`.
**Effort:** half a day including tests. **Impact:** closes the acting gap from 6 hours to 1. Combined
with A, the overshoot drops from $4.04 average to under a dollar.
**Trade-off:** it is a second writer to the account. That is real and it is why it must be kill-only.

### C. Amazon Marketing Stream
Subscribe to the hourly datasets, land them in `hourly_snapshots` (which already exists with a
`source` column and **zero rows**), and read our own table instead of a report queue.
**Effort:** large. Needs an AWS Firehose or SQS destination, an ingest endpoint and subscription
management. Several days. **Impact:** highest, and it is the only option that removes the queue from
the critical path entirely. **Trade-off:** the biggest build on this page, on a business being wound
down.

### D. Budget caps
From the previous six-step. $1,165 a day is currently authorised.
**Effort:** minutes. **Impact:** the only option that bounds the damage when detection fails anyway.
**Trade-off:** throttles winners sharing a campaign with losers.

### E. Nothing new, budget caps only
**Effort:** minutes. **Impact:** Sunday becomes a $30 day instead of a $102 day, but the same
keywords still burn the whole $30. **Trade-off:** we keep paying the overshoot, just less of it.

---

## 5. Recommendation

**A plus B, with D as the backstop. Not C this week.**

A and B belong together and are close to worthless apart. A without B gives a well-informed engine
that still only acts every six hours. B without A gives an hourly job reading a number from
yesterday. Together they take the average keyword death from $8.04 to under $5, and on the click
arithmetic above that is nearly the theoretical best the $4 rule can do.

B is the piece that needs William's explicit yes, because it adds a second writer to the account. It
is designed to be the smallest possible one: kill-only, no bid code present, reusing the existing
`shouldKill` unchanged so it cannot drift from the rule he specified.

D regardless of A and B, because Sunday proved that three keywords can go from $0.00 to $8.42 with no
history for any rule to judge. Detection cannot solve that. Only a budget can.

C is the right long-term answer and the wrong thing to start now.

### What NOT to do

- **Do not put an hourly kill inside the ad engine.** William's constraint, and it is also the safer
  design: a kill-only job with no bid-writing code cannot raise a bid even by mistake.
- **Do not make every report hourly.** The harvest and reintroduction history reports cover closed
  date ranges. Re-requesting them 24 times a day adds queue load and cannot change an answer.
- **Do not lower the $4 bar to compensate for late detection.** Sunday's 42 sub-$4 keywords showed
  where that leads: the tail just re-forms under the new number.
- **Do not treat hourly as a substitute for the budget cap.** A keyword at $0.00 an hour ago is
  invisible to any threshold rule, however often it runs.
- **Do not trust `collected_at` as a latency measurement.** It records our polling schedule. Anyone
  reading the 360-minute median as Amazon's queue time will reach the wrong conclusion about whether
  hourly is possible.

---

## 6. Open questions, trade-offs accepted, rollback

**Questions for William, in priority order.**

1. Is a **separate kill-only job** acceptable under "don't change the engine"? It touches no engine
   file, but it does pause keywords on the live account.
2. What is the **daily spend ceiling**? Still open from the previous six-step, and it is the item that
   bounds everything else. Revenue is about $53 a day, break-even is 1.92x ROAS, and Sunday's two
   earners needed $4.37 between them.

**Trade-offs accepted.**

- Hourly requests multiply report volume by six for the live specs. Amazon's 425 duplicate response
  makes re-requesting safe and the account is far from any rate limit, but this is untested at hourly
  cadence and should be watched for the first day.
- If the month-to-date report genuinely takes longer than an hour, hourly warming produces a
  continuously-pending queue and the real freshness floor is the report time, not the cron interval.
  That measurement is in flight and it decides whether A is worth doing at all.
- Even at perfect hourly detection, the average keyword still dies somewhere between $4 and $5, never
  at $4.00. The bar is a receipt, not a budget.

**Rollback.**

- A is a cron string and a cache key. Revert the commit.
- B is a new file and a new cron entry. Delete the cron entry and it never runs; the file is inert
  without it. It writes only `PAUSED`, and a paused keyword is re-enabled with one call, so even a
  worst-case misfire is fully reversible and leaves an audit trail in `extendedData.lastUpdateDateTime`.
- D is a number per campaign. Record the current values before changing them and write them back.
