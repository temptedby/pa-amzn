# Countries — where we sell, and where we might

## Live today

```
US   profile 527401661118587   USD   Phone Assured   the entire revenue
CA   profile 2269012516456949  CAD   Securisee       311 keywords, 1 order ever
MX   profile 2243911174683279  MXN   Securisee       listings live, ADVERTISING PAUSED
BR   no advertising profile exists at all
```

**Brazil has no ad account.** You could not spend there if you tried. Everything Brazil received was
listing copy and pricing, which costs nothing to hold. Do not propose pausing Brazilian ads.

All three live marketplaces run the same engine and the same rules, hourly, each at its own
currency's bar.

## Every threshold is per currency. This is the most common mistake.

```
                 kill bar     a "$4" bid cap becomes
  US (USD)          4.00              4.00
  Canada (CAD)      5.50              5.50
  Mexico (MXN)     68.00             68.00
```

A Mexican keyword bid at 14.02 is **70 cents**, not a breach of a $4 rule. Comparing a bare 4 to a
peso figure has produced false alarms. Always resolve the bar through `killSpendFor(currency)`.

## The export economics, which decide everything

```
            price      contribution   break-even ROAS   cross-border FBA
  US        $9.49         $3.55           2.67x            $2.52
  Canada    CAD 18.72     $3.59           3.78x            $5.96
  Mexico    MXN 289       $3.53           4.28x            $8.07
```

Best ROAS ever measured across 108 proven words is **2.90x**. Canada needs 3.78x, Mexico 4.28x.
**Neither export market can be won on advertising at current prices.** Canada's reprice from
CAD 29.28 to 18.72 achieved contribution parity with the US exactly as designed, and in doing so
moved its break-even from 2.10x to 3.78x. Parity with a thin margin inherits the thin margin.

The cause is Remote Fulfilment: every export unit ships from a US warehouse while competitors hold
local stock. Structural, not a bidding problem.

## Tools

```
node scripts/intl-orders.mjs         orders by marketplace, ORGANIC vs ad-attributed (slow)
node scripts/intl-daily-spend.mjs    real spend and sales per profile for a day
node scripts/buyable-matrix.mjs      can a shopper in each country actually buy each SKU
node scripts/intl-health.mjs         why a campaign is not serving (servingStatus)
node scripts/intl-price-parity.mjs   price any marketplace at US contribution parity
node scripts/shelf-scan.mjs          what the local shelf actually charges
node scripts/ca-price-breakeven.mjs  Canadian contribution at any price, settlement data
node scripts/mx-price-scenarios.mjs  the same for Mexico
node scripts/intl-actual-fees.mjs    what Amazon really charged on MX and BR orders
```

## Mexico is a live experiment, not a dead market

Advertising paused 2026-08-26. **Listings deliberately left live and holding the Buy Box.** The
question: does Mexico sell anything on its own? Decide end of September from `intl-orders.mjs`.
Do not restart Mexican ads before that answer exists.

The Mexican listing fee is **not separable** — the Americas plan is one regional subscription
covering all four countries. "Cancel the Mexico fee" is not a thing that exists; that was claimed
once and was wrong.

## Canada

Offline roughly a year to 2025-09-30, so any window covering that period measures the suspension,
not demand. 129 orders and CAD 5,064 in its live period. 100 proven US winners seeded 2026-08-26.

Open and unanswered: **raise the Canadian price, or pause its advertising like Mexico.** CAD 24.00
fixes break-even but exceeds what MoKo charges for two clips.

## Expansion — evaluate in this order, stop at the first failure

1. **Is there an advertising profile?** `GET /v2/profiles`. No profile, no spend, no question.
2. **Can a shopper actually buy it?** `buyable-matrix.mjs`. A campaign pointed at ASINs with no
   local offer or no Buy Box cannot serve. Canada sat in exactly that state for months while
   looking live.
3. **What does a unit net?** Settlement data only. `getMyFeesEstimate` has been wrong for every
   export market because Remote Fulfilment replaces the domestic fee.
4. **What is break-even ROAS?** Price divided by contribution, compared against 2.90x. Above it,
   advertising cannot win at any bid.
5. **What does the local shelf charge?** `shelf-scan.mjs`. If parity pricing puts us above local
   competition, the market is closed to us.
6. **Only then** language, copy and creative.

Given the wind-down goal, a new marketplace needs an unusually strong answer at step 4 to justify
opening. The honest default is no.
