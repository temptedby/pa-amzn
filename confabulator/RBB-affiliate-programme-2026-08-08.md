# RBB: affiliate programme, paying partners instead of Amazon Ads

2026-08-08. Research before build. Nothing set up yet.

**William's spec:** *"with paying 50% in ads to AMZN we need to setup affiliate programs and offer
them 40% of revenue to push sales to our amazn page."*

---

## 1. Problem

We pay Amazon roughly **50% of revenue in ads**, and we pay it **per click**, whether or not the
click converts. On a $9.49 product that is close to the entire margin.

| Per unit at $9.49 | |
|---|---|
| Price | $9.49 |
| COGS | -$0.62 |
| Amazon referral fee | -$1.42 |
| FBA | -$2.52 |
| **Contribution before promotion** | **$4.93** |
| Ads at 50% ACOS | -$4.75 |
| **Net after ads** | **$0.19** |

Nineteen cents, on the sales that convert, and nothing back on the ones that do not.

**The structural insight behind William's idea is correct.** Affiliate commission is
**pay-per-sale**. Ads are **pay-per-click**. An affiliate who sends a thousand visitors and sells
nothing costs us zero. That is a materially better risk shape, and it is the real argument here, not
the headline percentage.

Success looks like: units moving toward the ~2,000 on hand ([[pa-goal-sell-through-wind-down]])
at a better net per unit than $0.19, without new fixed cost.

## 2. Industry standard

- **Typical Amazon creator/affiliate commission is 15-25%**, negotiated per partner. 40% is well
  above market.
- Purpose-built platforms exist: **Levanta** (integrates directly with Amazon Attribution and the
  Brand Referral Bonus) and **Archer Affiliates** (2,500+ affiliates, seller sets rate and promo
  codes). Levanta runs **$150-$750/month**, about $120/month billed annually.
- **The BRB / Associates rule, confirmed:** *you can earn either a Brand Referral Bonus or an
  Amazon Associates commission for a single Attribution tag, not both.* The restriction is
  **per tag, not per account** — both programmes can run side by side on different tags. Claiming
  both on one tag risks the bonus being denied, removal from one or both programmes, and in serious
  or repeated cases account termination.

This corrects a note I wrote earlier today ([[attribution-tag-and-brb]]) that read the conflict as
account-level. It is not. That changes the answer from "incompatible" to "compatible if structured
correctly."

## 3. Codebase and account reality

- **Attribution is live and proven.** Advertiser "Phone Assured", id `593385895532730388`. A working
  tag is already in production on the `phoneassured.com` forward, verified by loading it.
- **Brand Referral Bonus is enrolled**, confirmed today by the "You are enrolled!" badge.
- **We can mint tags ourselves.** The "Generate referral tags" button on the BRB page produces a
  tagged URL per campaign, far more reliably than the Attribution campaign form, which drops
  programmatically-entered input.
- **Volume reality:** US is ~296 orders / ~$3,941 in the last 90 days ([[us-only-marketplace-revenue]]),
  so roughly **99 units a month across everything**.

## 4. Options

| # | Approach | Fixed cost | Effort | Trade-off |
|---|---|---|---|---|
| 1 | **Manual programme on our own Attribution tags.** One tag per partner, we read Attribution reporting, we pay from margin. | **$0** | ~3h setup, ~1h/month | No partner discovery. We must find them ourselves. |
| 2 | **Levanta.** | $150-750/mo | ~4h | Real creator marketplace and BRB integration, but see the break-even below. |
| 3 | **Archer Affiliates.** | varies | ~4h | 2,500 affiliate network, promo codes. Same fixed-cost question. |
| 4 | **ShareASale / Impact.** | setup + monthly | ~10h | Built for own-site checkout, not Amazon listings. Wrong tool. |

### The number that decides it

Net per unit after commission, including the ~$0.95 BRB credit:

| Commission | Cost/unit | Net/unit incl. BRB |
|---|---|---|
| 40% (William's proposal) | $3.80 | **$2.08** |
| 30% | $2.85 | $3.03 |
| **25%** | $2.37 | **$3.51** |
| 20% | $1.90 | $3.98 |
| 15% | $1.42 | $4.46 |
| *(ads at 50% ACOS)* | *$4.75* | *$0.19* |

**Every one of these beats ads.** Even 40% returns $2.08 a unit against $0.19. William's instinct is
right by an order of magnitude.

But a paid platform has to clear its own fee before it earns anything:

| Platform | At 25% | At 40% |
|---|---|---|
| $150/month | **43 units/month** | 72 units/month |
| $750/month | 214 units/month | 360 units/month |

At 43 units a month, the cheapest Levanta plan needs a brand-new channel to deliver **43% of our
entire current volume** just to break even. That is a large bet on a business being wound down.

## 5. Recommendation

**Option 1. Manual programme, our own tags, 40% launch commission, zero fixed cost.**

**Rate decided by William, 2026-08-08:** *"nope i want to open at 40% and then we can lower."* I had
recommended 25% on the grounds that market is 15-25% and a rate is hard to walk back. William
overrode that and the reasoning holds up: partner *acquisition* is the binding constraint here, not
partner *cost*. A rate nobody signs up for is worth nothing, and 40% still returns $2.08 a unit
against $0.19 from ads. Recorded, decided, proceeding at 40%.

Structure, and the structure is the important part:

- **We mint the Attribution tag. We claim the BRB. We pay the partner from margin.** The partner
  never uses an Associates link. This keeps us on the right side of the per-tag rule and means the
  ~$0.95 bonus lands with us on every referred sale.
- **One tag per partner**, so attribution is unambiguous and a non-performer can be cut without
  touching anyone else.
- **40%, and call it a LAUNCH rate in writing.** This is the one thing that makes "then we can
  lower" actually work. A commission described as *"40% founding-partner rate through [date]"* can
  step down on schedule without it reading as a cut, because the end was stated up front. An
  open-ended 40% cannot be reduced later without partners treating it as a broken deal and leaving.
  Same number, same appeal, and it keeps the exit William asked for. Put the review date in the
  partner terms from day one.
- **Pay on Amazon-confirmed orders only**, from Attribution reporting, monthly in arrears, after the
  return window. Not on clicks and not on self-reported numbers.
- Revisit Levanta only once affiliate volume alone clears **~72 units/month**, which is the
break-even at 40% on the $150 plan. Then the fee pays for
  itself and the marketplace is worth having.

### What NOT to do, and why

- **Do not leave the 40% open-ended.** The rate is fine; an undated promise is not. Without a stated
  review date the step-down William is planning for becomes a fight.
- **Do not let partners use Amazon Associates links.** Per-tag rule: they take the Associates
  commission and we forfeit the BRB on that same sale. We would be paying twice for one referral.
- **Do not pay a platform fee before the channel exists.** $150/month against ~99 total units/month
  is a real bite out of a wind-down.
- **Do not cut price to fund commission.** We are already the cheapest of ten competitors and the
  worst selling ([[pa-price-is-not-the-problem]]). The commission comes out of the $4.93, not the
  $9.49.

## 6. Open questions, trade-offs, rollback

**Open questions for William:**
1. ~~Rate~~ **Decided: 40% launch rate.**
2. Who are the first partners? A manual programme needs names. Existing customers, phone-accessory
   reviewers, travel and cruise creators?
3. Is the Pro ($10.49) in the programme too, or flagship only to start?

**Trade-offs accepted:** manual means no partner marketplace and about an hour a month of reading
Attribution reports and paying people. At this scale that is cheaper than $150/month and it defers
the platform decision until there is data to make it with.

**Rollback:** stop issuing tags and stop paying. There is no contract, no platform subscription and
no listing change. Existing tags keep working or get retired individually.

## 7. Before anything ships — PROBED 2026-08-08

The gate was: prove with a real call that Attribution reporting returns per-tag data we can pay
against. Result, via `scripts/live-attribution-probe.mjs`:

```
GET  /attribution/advertisers   200   Phone Assured, id 593385895532730388
GET  /attribution/publishers    200
POST /attribution/report        200   groupBy CAMPAIGN / ADGROUP / CREATIVE
```

**Access confirmed, on the ordinary ADS_* credentials, no extra onboarding.** `groupBy: CREATIVE` is
the per-tag view, so one tag per partner gives one row per partner. Exactly the shape the programme
needs.

**Not yet fully proven.** Every report returned `{"reports":[],"count":0}`. Expected: the tag was
created 2026-08-08 and no click has flowed through it. So this is *access confirmed, data not yet
observed*. **Re-run the probe once real traffic exists and confirm a non-zero row before paying any
partner.** Signing partners we cannot measure is the exact failure this section exists to prevent.

Gotcha recorded: `attributedTotal*14d` metrics 400 on `reportType: PERFORMANCE`. Working set is in
the script.
