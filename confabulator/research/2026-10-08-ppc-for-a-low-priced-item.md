# 6-step research: managing an Amazon ad account for a low-priced item

**Date:** 2026-10-08
**Asked by William:** research before we update or build anything. What indicators to watch, how to
find competitors and keywords, how to find winners, how to use overall costs, and specifically how
to make a low-priced item profitable.
**Status:** research only. No code written, no live change made.

---

## 1. Problem

Yesterday (2026-10-07) the account spent **$47.21** and recorded **2 ad orders / $18.98**, a 0.40x
day. October to the 8th: **$354.19 spend, $409.96 revenue, BACOS 86.4%** against William's 40%
target. Over the last 30 days ads cost **$17.17 per ad order** (settled data) against **$3.55** of
contribution per unit, so every ad order loses about **$13.66**.

Success looks like: BACOS at or under 40% without strangling the 192 units of remaining inventory,
which at 4.30 units/day runs out around 2026-11-21.

The specific question underneath: **is this an optimisation problem or a pricing problem?** Every
rule change for two months has been the former. This research tests the latter.

---

## 2. Industry standard

### 2a. The max-CPC formula is unanimous across sources

```
Max CPC  =  Target ACOS  x  Price  x  Conversion Rate
```

and `Break-even ACOS = contribution margin`. ([Clickstera](https://clickstera.com/blog/amazon-ppc-bid-calculator-2026-how-to-set-the-right-bid),
[AdLabs](https://adlabs.app/amazon-ppc-bid-optimization-the-4-essential-formulas-for-optimizing-bids-hitting-your-target-acos/),
[Canopy Management](https://canopymanagement.com/amazon-cpc-what-your-cost-per-click-actually-means/))

Worked example from the sources: a $40 product at 15% CVR targeting 25% ACOS affords
`0.25 x 40 x 0.15 = $1.50` a click.

### 2b. 2026 benchmarks: what normal looks like

Typical Amazon ad account: **32% ACOS, $1.18 CPC, 0.59% CTR, 11.5% CVR**. Sponsored Products
specifically sits at **CTR 0.3-0.7%, CVR 10-18%, ACOS 15-25%**.
([Autron](https://autron.ai/benchmark/amazon-ppc-benchmarks-by-category-2026),
[AdBadger](https://www.adbadger.com/blog/amazon-advertising-stats/),
[Sequence Commerce](https://sequencecommerce.com/amazon-advertising-benchmarks/))

### 2c. TACOS, not ACOS, is the health metric

ACOS is for campaign-level optimisation; TACOS (ad spend over total revenue, paid plus organic) is
the business metric. The cited practitioner runs a 13.5% portfolio TACOS across seven brands, 6.2%
on an established one, 21% at launch. **"Rising TACOS while ad spend scales means advertising is
buying revenue without building organic momentum."** Also: track contribution margin, not ROAS,
because ROAS looks fine while fees, discounts and returns eat the margin.
([ammadk](https://ammadk.com/amazon-ppc-management/))

This is the same quantity as William's BACOS. The external sources call it TACOS.

### 2d. The decision threshold for killing a keyword is 15-25 CLICKS, not a dollar figure

**"If a search term gets 20 clicks with zero conversions, negate it."** Some use 15 (aggressive) or
25 (conservative). And explicitly: *"A 10% conversion rate means it takes an average of 10 clicks to
get a sale. Three clicks without a sale is not enough data for a decision. Below that threshold
you're making decisions based on statistical noise."*
([Jarvio](https://jarvio.io/blog/amazon-negative-keywords), [keywords.am](https://keywords.am/blog/amazon-search-term-report/))

### 2e. Placement multipliers and dynamic bidding compound, in that order

Amazon applies the **placement adjustment first**, then dynamic bidding on the already-adjusted
bid. Dynamic "up and down" raises up to **+100% for top of search** and +50% elsewhere. Worked
example: a $1.00 bid with a 50% placement adjustment becomes $1.50, and up-and-down bidding can
double it to **$3.00**. The explicit best practice: *"if you run high placement adjustments, set
dynamic bidding to down only"*, and start new campaigns at **20-40%** top-of-search, not 50%+.
([Emplicit](https://emplicit.co/amazon-placement-bid-adjustments-explained/),
[Amazon Ads](https://advertising.amazon.com/library/guides/sponsored-products-best-practices),
[Hypeworks](https://hypeworks.io/blog/bid-adjustments-in-amazon-campaigns-2026-guide))

### 2f. Finding competitors and keywords: reverse ASIN

Search your primary keyword, take the **top 3-5 organic non-Amazon results** as your real
competitors, then reverse-ASIN them to get every keyword driving their traffic. Filter to organic
rank 1-20, and bid on terms **where you already rank organically but are not bidding**.
([SellerSprite](https://www.sellersprite.com/en/blog/amazon-reverse-asin-lookup-2026-competitor-keywords),
[Ad Badger](https://www.adbadger.com/blog/amazon-ppc-education/use-reverse-asin-lookups-for-new-amazon-ppc-keyword-research/))

### 2g. ASIN targeting converts better than keywords

**15% conversion on ASIN targeting versus 6% on keyword targeting**, at comparable CPC. Caveat from
the same sources: *competitor* ASIN targeting converts worse than keywords because the shopper is
already looking at something else, while *complementary* ASIN targeting converts like a branded
campaign. ([Jarvio](https://jarvio.io/blog/amazon-product-targeting-ads),
[acosbot](https://acosbot.com/en/blog/amazon-asin-targeting/), [pare.so](https://pare.so/blog/amazon-ppc-product-targeting-category-asin-audience-deep-dive))

### 2h. Low-priced items: Amazon's own internal term for this is CRaP

**"CRaP" = "Can't Realize a Profit."** Amazon applies it to items **priced at $15 or less** whose
fees leave thin or no margin. The documented remedies are **not** bid tuning. They are:

- **Multipacks and bundles**, which spread one FBA fee across several units and raise order value.
  *"A single low-cost item costs too much in fees to make a profit, but if you create a bundle the
  fees drop dramatically and the item magically becomes profitable."* Amazon itself moved a Dash
  button from a $6.99 6-pack to a **$37.20 24-pack**.
- **Don't spend hard on big traffic on a low-AOV item** until the listing converts and the margin
  can take the click cost. Start with the most qualified demand, prove the economics, then expand.
- **Segment by margin tier**, never run a 12%-margin SKU in the same campaign as a 45% one.

([WSJ via Seller Central forums](https://sellercentral.amazon.com/seller-forums/discussions/t/b81cda2f9a6479a4c41e10a54f18b9ec),
[ExpertCPG](https://expertcpg.com/amazon-fba-multipacks-bundles-guide/),
[Eva](https://eva.guru/blog/amazon-product-bundling/), [Selltru](https://selltru.com/blog/amazon-ppc-for-beverage-cpg-brands))

---

## 3. Our codebase and our reality

### 3a. Live prices, read from the Product Pricing API today

```
Single    B07Y5GZP1T   $ 9.49   rank 21,020   1 offer
2-Pack    B097MGPCPC   $13.49   rank 21,908   1 offer
3-Pack    B097MK5VZ4   $16.49   rank 21,908   2 offers
UG-SVG8   B0BLLJLSDP   $10.49   rank 21,023   1 offer
```

Three of our four ASINs are **at or under Amazon's $15 CRaP line**.

### 3b. Our numbers against the benchmarks

```
                  ours            benchmark          verdict
CTR              0.69%        SP 0.3-0.7%        at the TOP of normal
CPC              $0.96        typical $1.18      we pay LESS than average
CVR              7.0% Oct     SP 10-18%          BELOW the range
                 9.09% best   avg 11.5%          still below average
ACOS            ~137%         15-25%             nowhere near
```

**Our advertising is not badly run. It is averagely run on a product that cannot carry average
costs.** That is the finding. CTR says the creative and keyword match are fine. CPC says we are not
being gouged. CVR is the one soft metric, and it is soft, not broken.

Note a correction to our own record: two memories call 9.09% CVR "fine" and "normal". Against the
11.5% average and the 10-18% SP range it is **slightly below normal**, and October's 7.0% is well
below. I had graded it too generously.

### 3c. The max-CPC formula applied to us

Break-even ACOS = contribution margin = $3.55 / $9.49 = **37.4%** (33.7% after the 9.9% refund rate).

```
affordable CPC = 0.374 x $9.49 x CVR

  CVR  7.0%  (October actual)      $0.248
  CVR  9.09% (our best measured)   $0.323
  CVR 11.5%  (industry average)    $0.408
  CVR 15.2%  (best in the whole benchmark table)   $0.539
```

**Even at best-in-class conversion, a $9.49 unit affords 54 cents a click against a market rate of
$1.18.** There is no conversion rate that makes this product advertisable at this price.

Inverted, the same arithmetic is starker. To break even at the $0.96 we actually pay, with 9.09%
conversion, each unit must contribute:

```
$0.96 / 0.0909 = $10.56 of contribution per unit
```

It contributes **$3.55**. We need **3x the contribution per unit**, not a better bid rule.

For reference, ClutchLoop sells the competing product at **$28.99 and moves ~2,000/month**. At a
37% margin that is about **$10.70** of contribution, which is almost exactly the $10.56 the maths
demands. The market price supports advertising. Ours does not.

### 3d. Our kill rule decides in the statistical noise zone

`src/lib/amazon/ad-rules.ts` has `KILL_SPEND = 4` and `KILL_MIN_ROAS = 1.5`. At our $0.96 CPC:

```
$4.00 / $0.96 = 4.2 clicks
```

The industry standard is **15-25 clicks**. We judge at 4. Our own record already found this
empirically ("winners convert on the first click", "$4 buys 3.85 clicks and false-kills 80% of the
time"); the external sources name the threshold and say that below it you are reading noise.

**But we cannot simply adopt 20 clicks.** 20 clicks x $0.96 = **$19.20 to learn one fact**, which is
5.4 units of contribution. The industry threshold assumes you can afford to buy significance. At
$9.49 we cannot. At a $0.32 CPC, 20 clicks costs $5.00 and the standard becomes usable. **So CPC has
to come down before the correct kill rule becomes affordable.** This is the dependency we have had
backwards for two months.

### 3e. Campaign 212260116772958 is the textbook mistake

Live settings read today:

```
1st Phone Assured Campaign 11-16-19   $90/day
   AUTO_FOR_SALES    PLACEMENT_TOP +50%   PLACEMENT_PRODUCT_PAGE +50%
```

Every other enabled campaign has no placement multiplier or +3% to +4%. Per section 2e the
placement adjustment applies first and dynamic bidding doubles it:

```
$0.85 bid  x 1.5 (placement)  x 2.0 (dynamic top-of-search)  =  $2.55 max CPC
```

Yesterday's report shows `tether phone case` taking a single **$2.54** click at an $0.85 bid.
Yesterday that campaign took **$17.81 of $47.21 (38%) at $1.62 a click for zero orders**, while
`ASIN MAN 2` bought a sale for $2.11 at $0.53 a click.

The published best practice is the exact opposite of our configuration: high placement adjustments
should be paired with **down-only** bidding, and new campaigns should start at 20-40%, not 50%.

This was measured on 2026-08-31, raised then, flagged again 09-02, and is unchanged 38 days later.

### 3f. What our own data says about where the cheap conversions are

```
keyword targeting    4%  conversion at $1.05
ASIN targeting      ~10% conversion at $0.56
```

Consistent with section 2g. And 819 of 835 targeting clauses are single-ASIN, while
**category targeting has never been used** in this account despite Amazon's own API recommending
`21209103011 Cell Phone Lanyards & Wrist Straps` for our ASINs.

### 3g. Harvesting is starved, which section 2f says is where winners come from

`src/lib/amazon/ad-engine.ts:286` reads `discoveryMatchTypes ?? ["BROAD"]`, so only broad-discovered
terms can be harvested. Measured on the live 30-day search-term report (706 rows, $1,208.68, 69
orders): the gate **allows 10 and blocks 19** of the 29 terms that converted at 2x or better,
with **$250.27 of sales behind the blocked ones**. PR #8 fixes it and has been open 51 days.

---

## 4. Options

| # | Option | Effort | Expected impact | Trade-offs |
|---|---|---|---|---|
| 1 | **Fix campaign 212260116772958**: drop both +50% multipliers, set dynamic to down-only | 2 API writes, minutes | ~$9/day of the $17.81, immediately. Brings CPC in that campaign toward the $0.80 the others pay | Top-of-search impression share falls. That campaign already converts nothing, so little to lose |
| 2 | **Raise price** on the Single toward the $19.95 it used to be, or push the 3-Pack as the advertised unit | Pricing change, no code | Decisive. At $19.95 affordable CPC roughly doubles to $0.68. Our own August reprice test moved ROAS 0.63x to 1.13x | Rank 21,020 may fall; 45 days of stock left so a demand dip could strand inventory. Contradicts "never discount" only in direction, not in spirit |
| 3 | **Advertise only the 3-Pack and 2-Pack**, stop advertising the $9.49 Single | Campaign-level, ~1 day | Order value $16.49 vs $9.49 is 74% higher, affordable CPC rises with it. Matches the CRaP remedy exactly. Clears inventory 3x faster per order, which suits the wind-down | Only 26 3-Packs in stock, and "one ad per ad group" means new ad groups needed. 3-Pack contribution per *unit of inventory* is lower |
| 4 | **Shift spend from keywords to ASIN and category targeting** | ~1 day | Our own data: 10% conversion at $0.56 vs 4% at $1.05. Category targeting untested here | Category bids can spend fast across thousands of products. Start with three nodes, not nineteen |
| 5 | **Adopt the 20-click kill rule** and merge PR #8 so harvesting feeds it | PRs already written | Correct by the external standard, and stops false-killing winners | Costs $19.20 per decision at today's CPC. **Only affordable after option 1 and/or 2 cut CPC** |
| 6 | **Stop advertising, let organic clear the 192 units** | None | Saves ~$29/day of loss. 60 of 124 orders in 30 days were already organic | Stock takes ~96 days instead of 45. Rank decays. Contradicts William's 09-21 "keep advertising" decision |

---

## 5. Recommendation

**Do option 1 now, then option 3, and treat option 5 as gated behind them.**

**Option 1 first** because it is two API writes against a configuration that every source we found
calls a mistake, it is 38 days overdue, and it costs us nothing to reverse. It is the only change
here with a known dollar value attached and no strategic consequence.

**Then option 3**, advertising the multipack rather than the Single. This is the one move that
attacks the actual constraint. Amazon's own category for our product is "can't realize a profit at
$15 or less", and the documented remedy is to raise order value rather than cut cost. It also fits
the wind-down: a 3-Pack order clears three units.

**Option 5 is correct and currently unaffordable.** The 20-click standard is right, and we cannot
buy it at $0.96 a click. This is the dependency we had backwards: CPC first, then the kill rule.

**What NOT to do:**

- **Do not tune the bid ladder again.** Six weeks of rule changes have moved BACOS from roughly 80%
  to roughly 80%. Section 3b says our CPC is already below the market average. There is no bid rule
  that makes a $3.55 contribution carry a $1.18 market click.
- **Do not adopt the 20-click kill rule yet.** It would roughly quadruple what we pay per decision.
- **Do not discount further.** Memory already records we are the cheapest of ten competitors and the
  worst selling, and section 3c shows why: price is the binding constraint, and it binds downward.
- **Do not add category targeting at scale.** Three nodes, measured, or not at all.

---

## 6. Open questions, trade-offs accepted, rollback

**Open questions for William:**

1. Is a price rise on the table at all, or is $9.49 fixed? The whole of section 3c turns on this.
2. With 26 3-Packs in stock, is it worth building ad groups for them, or is the volume too small?

**Trade-offs accepted:**

- Option 1 gives up top-of-search position on a campaign that converts nothing. Judged cheap.
- Advertising the multipack means fewer orders at higher value. For a wind-down that is good; for
  rank it is neutral at best.

**Rollback:**

- Option 1: both writes are reversible by restoring `PLACEMENT_TOP +50%`,
  `PLACEMENT_PRODUCT_PAGE +50%` and `AUTO_FOR_SALES` on campaign `212260116772958`. Current values
  are recorded above, so rollback needs no fresh read.
- Option 3: pausing the new ad groups restores the status quo. No listing or price change involved.

**Caveat on my own numbers:** 3-Pack contribution is estimated, not measured, because I have no
verified COGS for a 3-pack. The $3.55 Single contribution is from the project's documented table.
Everything else in section 3 is a live API read taken today.
