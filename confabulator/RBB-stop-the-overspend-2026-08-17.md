# RBB: stop the overspend without touching the ad engine

2026-08-17. Second six-step of the day. The first one
(`RBB-ad-data-backup-2026-08-17.md`) recommended changes inside the ad engine. William has ruled
that out: *"I don't want to change the engine. I just want to make sure we're not overspending when
we shouldn't."* Everything below respects that constraint. Research only, nothing built.

---

## 1. Problem

Sunday 2026-08-16, Sponsored Products: **$102.88 spent, $19.98 returned, 515% ACOS.**

Fifty keywords spent. Two converted.

```
2 keywords converted:   spent $  4.37   returned $19.98   ACOS 22%   4.6x
48 keywords did not:    spent $ 98.51   returned $ 0.00
```

Of the 48 that returned nothing, **42 spent under $4 each that day**, so no per-keyword $4 rule can
see them. Six were over $4 and all six are now paused.

**What if every day were Sunday.** William's question, answered:

| | Per day | Per 30 days |
|---|---|---|
| Sunday's actual spend (SP+SB+SD) | ~$107 | **$3,210** |
| Current revenue run rate | ~$53 | ~$1,600 |
| **Authorised daily budget** | **$1,165** | **$34,950** |

There is nothing structural between $107 a day and $1,165 a day. The account reached $102 on Sunday
because the budgets permitted it, not because anything decided it was a good idea.

**And the instrument that should have warned him is blind to money.** `ads-digest` runs every day at
13:00 UTC, which is 8am Central, and William reads it with his coffee. It reports heartbeats, kills,
bid changes, keyword adds, rejected writes and report-job states. Searching the whole file for
`spend`, `cost`, `sales`, `acos`, `roas` or `revenue` returns nothing that prints a number. He woke up
to a $102 day because the daily email does not contain a dollar sign.

### Success looks like

1. A **hard daily ceiling** that arithmetic enforces, not a heuristic.
2. William knows **yesterday's spend and sales before 8am**, every day, without asking.
3. Two independent sources agree on spend before money moves.
4. **The ad engine is not modified.**

---

## 2. Industry standard

**The circuit breaker belongs outside the component it protects.** Michael Nygard's *Release It!*
defines the pattern precisely this way: you do not make the failing component smarter, you put a
breaker in front of it that trips on measured harm and opens the circuit. William's instinct to leave
the engine alone and cap the spend is the textbook form of this, not a compromise.

**Budget is the control of last resort.** Every mature ad operation caps at account, portfolio or
campaign level in addition to per-item bid rules, for a structural reason: a bid rule is a heuristic
applied per keyword and can be wrong 2,277 times, while a budget is arithmetic and cannot be
exceeded. Google Ads, Meta and Amazon all ship account-level caps for exactly this failure.

**Alert on the thing that hurts you, not on proxy activity.** Google's SRE Workbook calls this
symptom-based alerting: page on user-visible harm, not on internal component state. Our digest is
pure component state. Spend is the symptom.

**Two-source reconciliation** is standard ad-ops practice: the platform's report on one side, an
independent real-time read on the other, and a stop when they diverge past a tolerance.

---

## 3. Codebase and reality

All figures below are live reads from today.

### Authorised budget, all three products

```
SP   10 ENABLED campaigns    $745.00 / day
SB    2 ENABLED campaigns    $220.00 / day
SD    8 ENABLED campaigns    $200.00 / day
                           ------------------
                            $1,165.00 / day   =  $34,950 / month
```

### Sunday, by campaign

| Campaign | Spend | Sales | ACOS | Keywords spent | Over $4 each |
|---|---|---|---|---|---|
| 1st Phone Assured Campaign 11-16-19 | $65.21 | $9.49 | 687% | 20 | 6 |
| SP Manual | $32.81 | $10.49 | 313% | 25 | **0** |
| Phone String High SV Ranking | $3.39 | $0.00 | no sales | 3 | 0 |
| SP Branded Manual | $1.47 | $0.00 | no sales | 2 | 0 |

Note where the two earners live: `iphone tether strap (PHRASE)` is the single order inside the 2019
campaign, and `phone theft proof strap (BROAD)` is the single order inside SP Manual. **Both winners
sit in the two worst campaigns.** That is the central constraint on any budget cut.

### The digest is blind to money

`vercel.json` schedules `/api/cron/ads-digest` at `0 13 * * *`. The route sends by Telegram with an
email fallback to `alertRecipient()`. `ads-digest.ts` builds `DigestStats`: `runs24h`,
`runsWithActions24h`, `lastRunAt`, `kills/bids/adds` at 24h and 7d, `rejected24h`, `reintroToday`,
`reintroCohort`, `reports[]`, `staleReports`, and the same per ad product. **No spend field exists on
the interface.** Line 85 even writes "a red flag if spend is rising" without ever printing spend.

### The `alerts` table has not been written since April

```
4 rows, all type=low_stock, last sent_at 2026-04-21 13:12:09
```

### Portfolios cannot be reached from the API

```
GET /portfolios/extended -> HTTP 403
```

A 403 is a missing permission, not an empty list, so **I cannot tell from the API whether portfolios
exist, and I certainly cannot create or cap one.** A portfolio budget cap would have to be set by
hand in Seller Central. (Correcting my own probe script, which printed "no portfolios exist" on a
403. That was wrong.)

### The real-time endpoint works

`POST /sp/campaigns/budget/usage` returns per-campaign spend for the current Amazon account day with
`usageUpdatedTimestamp` minutes old, no report queue. Verified twice today.

---

## 4. Options

None of these touch `ad-engine.ts`, `ad-rules.ts`, `sb-engine.ts` or `sd-engine.ts`.

### A. Cut campaign daily budgets to the affordable number
Set each enabled campaign's `budget.budget` to a real number instead of a legacy one.
**Effort:** minutes, a campaign setting. **Impact:** the only option that makes a $102 day
arithmetically impossible. **Trade-off:** the two earners live inside the two worst campaigns, so a
cut throttles them along with the losers, unless the losers are paused first. The pause work already
in flight is what makes this safe.

### B. Put money in the digest that already sends
Add spend, sales, orders, ACOS and ROAS for yesterday and month to date, per ad product, to
`DigestStats` and `formatAdsDigest`.
**Effort:** small, an hour or two, and it changes no decision logic anywhere.
**Impact:** directly answers "I'm not waking up in the morning and finding out we spent a hundred
bucks and made twenty". The delivery path is built, tested and firing daily. It is blind, not broken.
**Trade-off:** it reports, it does not prevent. On its own, Sunday still happens, William just knows
by 8am instead of by accident.

### C. A spend watchdog cron, outside the engine
A new job, hourly, that reads `/sp/campaigns/budget/usage`, sums the day, and pauses campaigns when
the account crosses a dollar limit. Its own file, its own cron, no engine import.
**Effort:** half a day. **Impact:** catches an overspend inside the hour rather than at the end of the
day, and it is the only option that reacts within a day.
**Trade-off:** it writes to the account, so it needs the same care as the engine. Campaign level only.

### D. A portfolio budget cap, set by hand in Seller Central
Amazon enforces a monthly or recurring cap across grouped campaigns and stops serving at it.
**Effort:** minutes of William's time, zero code. **Impact:** a ceiling enforced by Amazon rather than
by us, which is strictly stronger than anything we can build. **Trade-off:** the API 403s, so it
cannot be automated, verified or alerted on from here. It is a manual control we cannot see.

### E. A reconciliation alert
Compare the engine's cached report against the real-time budget usage and email when they diverge
past a tolerance.
**Effort:** small on top of C. **Impact:** this is the "double checking" and "multiple resources"
William asked for, made concrete. It would have caught the $43 blind spot this morning by itself.
**Trade-off:** an alert, not a brake.

---

## 5. Recommendation

**A and B today. Then D, then C with E folded in.**

**A first** because it is the only one that changes what is possible rather than what is known. Every
other option on this list still permits a $1,165 day; A does not. It takes minutes and it is a
number, so it is also the most reversible thing here.

**B in the same sitting** because the delivery path already exists and fires every morning at 8am
Central. This is not building a monitor, it is un-blinding one. It is the smallest amount of work on
this page with the largest effect on William never being surprised again.

**D next** because a cap Amazon enforces beats a cap we enforce, and it costs William minutes. Accept
that we cannot see it from here.

**C and E last** because they are the only items that add a new writer to the account, and they are
worth much less once A has capped the downside. Build them when the urgent part is done, not before.

### What NOT to do

- **Do not change the ad engine.** William's call, and it is the correct one on the evidence.
  `shouldKill` is exactly his spec and has been right every time it has been checked. Three
  investigations in three days have all ended at the data or the budget, never at the rule.
- **Do not solve this with another per-keyword threshold.** Sunday proved the limit of that approach:
  42 keywords, $57.68, every one of them under $4. Lowering the bar to $2 just moves the tail.
- **Do not pause the two worst campaigns outright.** They contain both of Sunday's earners. Pause the
  losing keywords inside them and cut the budget; do not swing at the campaign.
- **Do not treat the digest as a brake.** It reports. Option A is the brake.
- **Do not cut the Branded Manual budget hard.** At 69% ACOS it is the closest thing on the account to
  working, and it is our own brand name.

---

## 6. Open questions, trade-offs accepted, rollback

**The one question for William.** What is the daily spend ceiling? For reference: revenue is running
about $53 a day, break-even on ads is 1.92x ROAS, and Sunday's two earners together needed $4.37.
A ceiling anywhere from $15 to $40 a day is defensible and it is his number to set, not mine.

**Trade-offs accepted.**

- A throttles the winners along with the losers while they share a campaign. Mitigated by pausing the
  losers first, which is in flight, but not eliminated.
- B tells William about a bad day after it has happened. That is a real limitation and it is still
  worth more than anything else per hour of work, because right now he finds out by accident.
- D is invisible to us. We will not be able to alert on it or confirm it stayed set.
- None of this makes a kill faster than the money leaving. A keyword that spends $3.99 with nothing
  back is still a keyword that spent $3.99.

**Rollback.**

- A is a number per campaign. Write the old numbers back. Recording the current values before
  changing them is part of the change.
- B is additive text in an email. Reverting the commit is the rollback, and it cannot affect a bid.
- C is a new file and a new cron entry. Remove the cron entry and it is inert.
- D is a Seller Central setting William can remove himself.

**Not covered here.** The report-staleness fix from the first six-step, which is now parked because
its two changes are inside the engine. That leaves the engine acting on a once-a-day reading. Option A
is what makes that survivable rather than expensive, and the trade is explicit: we accept a blind
engine and cap what blindness can cost.
