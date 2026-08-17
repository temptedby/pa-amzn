# RBB: the ad engine is steering on data it cannot trust

2026-08-17. Written after William found two errors in the morning review, both of which were real.
Research only. No code changed, no bid touched, no keyword paused.

---

## 1. Problem

Two separate data faults, both proven today, both mine.

### 1a. The days were shifted by a timezone

The all-orders report returns `purchase-date` as UTC (`2026-08-16T21:37:19+00:00`). My script sliced
the first ten characters off that string, which buckets by UTC. Amazon reports a US seller's day in
Pacific. Every order after 5pm Pacific therefore landed on the following day in my report.

| Aug 2026 | UTC, what I reported | Pacific, what Seller Central shows |
|---|---|---|
| Fri 14 | 3u $40.47 | 2u $26.98 |
| **Sat 15** | 4u $42.96 | **10u $117.90** |
| **Sun 16** | 8u $93.92 | **3u $29.47** |

William: "the best day was Saturday, Sunday didn't sell shit." Correct on both. Saturday was the
best day of the month by a wide margin and Sunday was the second worst. The month total is
unaffected (77 units either way) because the shift moves units between days, not in or out, which
is exactly why it survived every check that looked at totals.

### 1b. I led with one ad product and called it the account

I reported **0.60x**. That is Sponsored Products alone. The account:

| | Spend | Sales | ROAS |
|---|---|---|---|
| Sponsored Products | $320.99 | $191.82 | 0.60x |
| Sponsored Brands | $126.05 | $156.86 | 1.24x |
| Sponsored Display | $10.63 | $0.00 | 0.00x |
| **Account** | **$457.67** | **$348.68** | **0.76x** |

William: "sales is not at 0.6 ROAS, we've definitely generated close to 300 in sales." Correct.
$348.68. The account is still under the 1.92x break-even, so the conclusion does not change, but the
number I put in the headline was wrong and it was wrong in the direction that makes ads look worse
than they are.

### What success looks like

1. A day is a Pacific day everywhere, in every script and every table.
2. The engine never raises a bid on a keyword whose spend it cannot currently see.
3. Spend and sales reconcile against two independent sources before any money moves.

---

## 2. Industry standard

**A control loop must not act on its set point while its feedback signal is absent.** This is the
first rule of closed-loop control and it is what both of our engines are breaking right now. Google's
SRE Workbook states the monitoring form of it directly: a stale or ambiguous signal is more dangerous
than no signal, because the system keeps acting with full confidence. The standard remedy is a
freshness deadline on the input, past which the controller holds instead of acting.

Worth noting because it is the same week: DES's V4.1 pricing engine has the identical defect,
raising prices on tiers with zero sales because band-hover reads the target and not the feedback.
Same class, two businesses, found the same way, by an independent script watching the engine rather
than by the engine's own logs.

**Amazon's own answer to report latency is Amazon Marketing Stream**, an hourly push of performance
data to an AWS destination, published specifically because the async report queue is too slow for
automated bidding. Every serious third-party bid manager on Amazon runs on Stream, not on report
polling.

**Two-source reconciliation is normal ad-ops practice**: the platform's own report on one side, an
independent ledger on the other, and a stop if they disagree beyond a tolerance. We have one source
and no tolerance check.

---

## 3. Codebase and reality

Every line below was read today, and every API result was a live call.

### The cache key only changes at UTC midnight

`src/lib/amazon/ads-reports.ts:60-63`

```ts
export function reportKey(s: ReportSpec): string {
  return [s.purpose, s.adProduct, s.reportTypeId, s.startDate, s.endDate,
    s.groupBy.join("+"), s.columns.slice().sort().join("+")].join("|");
}
```

The only field that moves during a day is `endDate`, and it moves once, at UTC midnight. All four
daily engine runs therefore resolve to the same row in `ads_report_jobs`.

### And cached rows are served as fresh for thirty hours

`src/lib/amazon/ads-reports.ts:32` and `:131-135`

```ts
export const DATA_STALE_HOURS = 30;
...
if (existing?.status === "COMPLETED" && existing.collectedAt && existing.rowsJson) {
  if (isFreshData(existing.collectedAt, nowIso)) {
    return { state: "ready", rows: JSON.parse(existing.rowsJson) as T[], ... };
  }
}
```

A 30-hour freshness bar on a key that turns over every 24 hours means the cache can never expire
inside a day. It is not that the guard failed. There is no window in which it can fire.

### The proof is in our own table

`kw_perf_snapshot` records what the engine saw on every run. Three identical readings a day:

```
2026-08-17T06:04Z   272 kw   spend $277.56   sales $181.33   17 ord
2026-08-16T18:02Z   232 kw   spend $199.91   sales $147.86   14 ord
2026-08-16T12:02Z   232 kw   spend $199.91   sales $147.86   14 ord
2026-08-16T06:01Z   232 kw   spend $199.91   sales $147.86   14 ord
2026-08-15T18:02Z   207 kw   spend $155.91   sales $124.88   12 ord
2026-08-15T12:01Z   207 kw   spend $155.91   sales $124.88   12 ord
2026-08-15T06:01Z   207 kw   spend $155.91   sales $124.88   12 ord
```

Against the live account at 07:00Z today: **$320.99 spend, 18 orders.** The engine's most recent
reading is $43 and one order behind.

### What that costs, per keyword

| Keyword | Engine saw | Actually spent | Orders |
|---|---|---|---|
| anti theft phone holster (BROAD) | $2.41 | $8.00 | 0 |
| retractable phone tether (PHRASE) | $3.01 | $7.09 | 0 |
| phone assured (BROAD) | $1.64 | $6.99 | 0 |

All three under the $4 bar in the data the engine holds, all three well past it in reality, all three
still ENABLED and spending now.

### The accelerator, which is the worse half

The 06:04Z run made **85 bid changes: 68 raises, 17 cuts, 18 of them landing on the $0.85 ceiling.
Every row logged `acos=0`. Zero kills.** A keyword absent from a stale report reads as "has not
spent, so it is not in the auction, so raise it." William's words: putting more spend behind losing
words is doubling up on our faults. That is mechanically what happened.

### report-warm runs five hours early, not twenty minutes

`vercel.json` schedules `report-warm` at `40 */6` and the engines at `0`, `15`, `30`, `45` of the
same `*/6`. So warm fires at 00:40 and the next engine is at 06:00. Its own header
(`report-warm.ts:12-20`) says it is meant to run "~20 minutes ahead of the engine slots" and draws
the ordering as `:40` then `:00`. The schedule reads correctly only if you assume `:40` and `:00`
are in the same hour. They are 5 hours 20 minutes apart.

### The backup tables exist and are empty

| Table | Rows | State |
|---|---|---|
| `hourly_snapshots` | **0** | designed with a `source` column, never written |
| `search_terms` | **0** | never written |
| `keywords` | **0** | never written |
| `campaigns` | **0** | never written |
| `bid_changes` | **0** | superseded by `kw_bid_history`, dead |
| `kw_daily` | 4,433 | last day **2026-08-05**, manual CSV only |
| `kw_state_snapshot` | 3,458 | frozen at **2026-08-05** |
| `kw_lifetime` | 2,292 | frozen at **2026-08-06** |
| `campaign_lifetime` | 50 | frozen at **2026-08-05** |
| `sb_daily` | 1,298 | current to 08-16 but **missing Aug 8 through 12** |
| `kw_perf_snapshot` | 1,787 | current, but records the stale reading, not the truth |

`hourly_snapshots` is the point. Someone designed exactly the backup William is asking for, including
a `source` column to distinguish where a number came from, and it has never held a single row.

`sb_daily` is the one writer that works, and it still lost five consecutive days, because the SB
engine ingests only today and yesterday and nothing ever backfills a gap.

### Three live API probes, run today

```
POST /v2/sp/keywords/report        -> 404 NOT_FOUND "Method Not Found"
GET  /streams/subscriptions        -> 200 {"subscriptions":[]}
POST /sp/campaigns/budget/usage    -> 200, 10 campaigns, timestamps within minutes
```

1. **The legacy v2 Sponsored Products report is dead.** Amazon sunset it. The v2 path that rescued
   Sponsored Brands is not available for Sponsored Products, so that shortcut is closed.
2. **Amazon Marketing Stream is reachable on our existing credentials and we have zero
   subscriptions.** The 200 means the account is entitled. Nobody has ever turned it on.
3. **`/sp/campaigns/budget/usage` is a real-time endpoint and it works.** Live result at 07:00Z:

```
212260116772958  budget $90   used 36.2% = $32.61  asOf 2026-08-17T06:47:00Z
212881454178968  budget $250  used  0.3% = $ 0.85  asOf 2026-08-17T07:06:17Z
28008323784512   budget $100  used  0.7% = $ 0.73  asOf 2026-08-17T03:26:25Z
324534995037875  budget $60   used  2.8% = $ 1.70  asOf 2026-08-17T04:19:25Z
```

Timestamps minutes old, no queue, no report. This is spend only, at campaign level, with no sales
and no keyword breakdown. It cannot decide which keyword to kill. It can absolutely tell the engine
that its report is lying before the engine raises 68 bids.

---

## 4. Options

### A. Put the run hour in the cache key and drop the freshness bar
Change `reportKey` to include the run slot, and `DATA_STALE_HOURS` from 30 to about 7.
**Effort:** small, under an hour. **Impact:** each of the four daily runs gets its own reading,
roughly 20 to 40 minutes old instead of up to 30 hours.
**Trade-off:** four times the report requests against a queue that takes 9 to 15 minutes, so the
warm job has to be re-timed with it or every run goes back to having no data at all.

### B. Use budget usage as a brake on the accelerator
Before any raise, call `/sp/campaigns/budget/usage`. If a campaign's real-time spend materially
exceeds what the report attributes to it, hold every raise in that campaign and act only on cuts and
kills.
**Effort:** small to medium, half a day. **Impact:** this is the specific fix for the 68 raises. It
does not need the report to be fresh, it needs the report to be *checkable*.
**Trade-off:** campaign level only, so it stops a whole campaign raising rather than one keyword.
Conservative in the right direction.

### C. Amazon Marketing Stream
Subscribe to the hourly performance datasets, land them in `hourly_snapshots`, and let the engine
read our own table instead of a report.
**Effort:** large. It needs an AWS destination (Firehose or SQS), an ingest endpoint, and the
subscription lifecycle. Several days, and it is the only option here that adds infrastructure.
**Impact:** highest. Hourly truth, backfillable, and it is what Amazon built for this exact problem.
**Trade-off:** the biggest change, on a business we are winding down.

### D. Build `sp_daily` the way `sb_daily` was built
Request the v3 report with `timeUnit: DAILY` instead of `SUMMARY`, and upsert per keyword per day
into a table, with a backfill sweep for gaps.
**Effort:** medium, a day. **Impact:** month-to-date becomes a `SUM()` over rows we own rather than a
single report we re-fetch, and a missed cron costs one day instead of the month. It also fixes the
Aug 8-12 style hole in `sb_daily`, which the same backfill can cover.
**Trade-off:** still built on the same slow queue, so it improves durability and history but not
latency.

### E. Stop the accelerator, change nothing else
One guard: never raise a bid on a keyword with zero recorded impressions in the current reading.
No data is not evidence that a keyword is dormant.
**Effort:** minutes. **Impact:** stops the specific harm today. **Trade-off:** the engine still kills
late, it just stops making the problem worse.

---

## 5. Recommendation

**Do E now, then A plus B together, then D. Research C but do not start it this week.**

E first because the engine runs again at 12:00Z and will otherwise make another 60 to 80 raises on
the same blind reading. It is the smallest possible change that stops money moving in the wrong
direction, and it is exactly what William named.

A and B belong in one change because either alone is a trap. A on its own quadruples the report load
and, without re-timing `report-warm`, leaves every run with a pending report and no data. B on its
own leaves the reading stale but makes the engine honest about it. Together the engine gets fresh
data most runs and refuses to accelerate on the runs where it does not.

D next because it is what makes the account auditable. Every "why did it do that" question this month
has been answered by digging a JSON blob out of `ads_report_jobs`. A table of days would have
answered them in a query, and would have caught the Aug 8-12 hole in `sb_daily` the day it opened.

**What NOT to do.**

- **Do not raise `DATA_STALE_HOURS`, and do not add more report requests as the fix.** More requests
  against a 9 to 15 minute queue produces more pending reports, not fresher data. The camp-level
  report I requested for this document has been building for over twenty minutes.
- **Do not treat budget usage as a sales signal.** It is spend only. Using it to judge performance
  would replace one wrong number with another.
- **Do not rewrite the engine or the rules.** `shouldKill` in `ad-rules.ts` is exactly William's
  spec and has been correct every time it has been checked. Three investigations in three days have
  ended at the data. The rule is not the problem and changing it would break something that works.
- **Do not fix the timezone in one script.** It has to be one shared helper or it will drift back.

---

## 6. Open questions, trade-offs accepted, rollback

**Open questions for William.**

1. Is Marketing Stream worth standing up on a business we are selling through and winding down? It
   is the right answer technically and it is days of work on an asset with a finite life.
2. The account has no spend cap. That was dropped on 2026-08-07 when the account was spending $6.42
   a day. It is now spending $50 a day at 0.76x. Should a cap come back, and at what number?

**Trade-offs accepted.**

- Option B is campaign level, so it will hold raises on keywords that did not deserve holding. On an
  account running at 0.76x, holding a raise costs far less than making one.
- Option A quadruples report requests. Amazon's 425 duplicate response makes re-requesting safe, and
  the account is nowhere near a rate limit.
- Nothing here makes the kill faster than $4. A perfect real-time reading still catches a keyword at
  $4.01, not before. The per-keyword bar is a receipt, not a budget, and that is a separate decision.

**Rollback.**

- E and B are guards. Removing the guard restores current behaviour exactly.
- A is two constants and a string. Reverting the commit is the rollback.
- D is additive, a new table and a new writer. Nothing reads it until the engine is pointed at it,
  so it can be built and verified for days before it changes a single decision.

**Not covered here, deliberately.** The $4 bar itself, the 151 unanswered ceiling gates, and whether
`phone assured` should be bid on in Sponsored Products at all when it is our own brand name.
