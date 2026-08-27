# Money — what we spend, what we earn, what it costs

## Pick the right tool for the question

| Question | Tool | Speed |
|---|---|---|
| What are we spending **right now**? | `node scripts/budget-usage.mjs` | instant |
| The month, day by day, per ad product | `node scripts/audit-spend.mjs` | 15-40 min |
| Are we actually making money? | `node scripts/business-pnl.mjs --ad=<measured>` | fast |
| Ad spend against TOTAL sales | `node scripts/tacos.mjs` | slow |
| Which orders came in? | `node scripts/orders-recent.mjs` | fast, no queue |
| Every dollar, every campaign, right now | `node scripts/spend-snapshot.mjs` | medium |
| How much spend produced nothing? | `node scripts/waste.mjs` | medium |
| Split by ad product | `node scripts/ad-product-split.mjs` | slow |
| Did organic sales fall when we cut ads? | `node scripts/organic-vs-adspend.mjs` | slow |

`budget-usage.mjs` is the one people forget. It returns **same-hour spend for all three countries
and all three ad products instantly**, because it reads budget consumption rather than a report. It
is campaign level, so it cannot name a keyword, but for "are we bleeding right now" it is the
answer and it never waits in a queue.

## The report queue, and why it governs the design

Amazon builds targeting reports asynchronously. Measured on this account:

```
requested at 00:00 UTC     ~11 min typical, 40 worst
requested at 12:00 UTC     ~39 min
requested at 18:00 UTC     ~37 min
```

**Asking for less data does not make it faster.** Measured head to head on 2026-08-27: a 27-day
report built in 9.1 minutes, a 1-day report in 10.0. The queue is fixed cost. Do not propose
shorter date ranges as a latency fix; it has been tested and it does not work.

Amazon **rejects a duplicate request** with a 425 rather than queuing it, so retrying harder is not
an option either.

The only real fix for keyword-level latency is **Amazon Marketing Stream**, a push feed covering
Products, Brands, Display and DSP down to keyword and search term, 30-90 min. This account is
entitled (`GET /streams/subscriptions` returns 200) and has never subscribed. It delivers into an
AWS account we own via SQS or Firehose.

## Report freshness traps

The report cache key ends with the **end date**, so every request within one calendar day reuses
one key. And **00:06 UTC is 17:06 Pacific the previous day** — Amazon's ad accounting runs Pacific,
so a run at midnight UTC judges a day with seven hours still to go.

Sales keep landing for **14 days** after the click. A cumulative ROAS is trustworthy; a single
recent day's ROAS always understates. Never call a fresh day's figure final, and never present a
partial-day reading as a day.

## Cost truth

Costs come from **settlement data**, never from `getMyFeesEstimate`, which has been wrong for every
export market because Remote Fulfilment replaces the domestic fee with a cross-border one.

```
node scripts/canada-actual-fees.mjs    what Amazon really charged per Canadian unit
node scripts/intl-actual-fees.mjs      the same for Mexico and Brazil
node scripts/fees.mjs                  referral + FBA via the API (US only, treat as estimate)
```

All-in unit cost is **$2.00**. `business-pnl.mjs` refuses to run without a measured `--ad=` figure,
because it once carried a hardcoded ad-spend constant that went four days stale and reported the
month as $100 better than it was.

## Two traps that produced wrong numbers

**`purchase-date` is UTC.** Slicing it to ten characters moves every evening sale to the next day
and reverses Saturday against Sunday. The month total agrees either way, which is why it hid.

**The all-orders report ignores the marketplace filter.** It returns US data whatever you ask for.
Read the `sales-channel` column, never the request.

## Where the money actually goes

As of late August: about **60% of the month's ad spend sits on keywords that never converted**, and
roughly a fifth of spend sits below the $4 bar where no rule can reach it. The single largest
recoverable loss measured was **$267.46 spent past an already-crossed bar, 92% of it inside the
qualifying day** — a latency problem, not a judgement problem.

Sponsored Brands has consistently returned better than Sponsored Products while receiving a
fraction of the money. Always split by ad product before concluding anything about "the account".
