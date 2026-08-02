# DES v4 Smart Pricing → PA-AMZN: what maps, what does not

RBB study, read-only. William 2026-08-02: "the v4 on smart pricing for DES, we should see how we
can apply to PA-AMZN for title updates, changes in price, visible inventory and descriptions."

Method: read the actual DES source rather than working from memory, and confirm each Amazon-side
claim with a live API call (CBC). Nothing here is inferred from what a system "should" do.

## 1. What DES v4 actually is

Source: `~/projects/dynamic-event-suite/src/lib/pricing/v4/` — 2,086 lines across 9 modules, with
`engine.ts` a **pure function** (no DB, no API calls) and `cron.ts` doing all I/O. That separation
is the single most reusable idea here and PA-AMZN's ad engine already follows it.

Pipeline, in strict order (`engine.ts:12-21`):

1. **SAFETY** — extend expirations, replenish addons, hide sold-out
2. **VISIBILITY** — rotate which tickets are shown
3. **PRICING** — 60/20/20 blend, constrained by range and tier
4. **INVENTORY** — pick a visible inventory level
5. **NAMING** — rotate a prefix on the event title, a suffix on the ticket name
6. **ADDONS** — price lock, refund insurance

Invariants enforced after every step (`engine.ts:23-31`): never outside [min,max], never above the
effective max until an unlock trigger, no move over 50% per cycle, rank hierarchy preserved,
sold-out hidden, static tickets never touched, no new tickets ever created.

**The pricing blend** (`pricing.ts:1-12, 32-62`):
- **60% custom phase model** — EXPLORE when there are no sales in 7 days (random across the whole
  legal range), HONE at 1-9 sales (±20% around the last converting price), MOMENTUM at 10+.
- **20% Gallego-van Ryzin** — pace-based scarcity against an expected booking curve.
- **20% Thompson Sampling** — conversion-weighted exploration.

**Visible inventory** (`inventory.ts`): shows a randomly chosen level from a legal range, narrowing
once sell-through passes 67%. It is a scarcity display drawn from real remaining stock.

**Naming** (`title-format.ts`, `naming.ts`): a phase-driven prefix pool (launch, early value, social
proof, time pressure, scarcity, final) rotated onto the title.

## 2. The four levers, mapped

### PRICE — maps well, and is the strongest borrow

Confirmed live: the price field is
`purchasable_offer[0].our_price[0].schedule[0].value_with_tax` (currently 9.49 on the Single,
10.49 on the Pro). That is exactly what the unmerged `listings.ts` write path already targets.

Also surfaced by the same pull, and worth its own look: the Single carries a historical
`discounted_price` schedule of **$14.95** running 2023-03-01 to 2023-06-30. The product has sold at
a materially higher price before.

**What to borrow:** the phase model, not the blend. PA-AMZN already has two price bandits built and
unmerged (UCB1 on `feat/price-experiment-bandit-2026-06-30`, Thompson on `feat/price-bandit-scaffold`),
and both are pure exploitation once they have data. Neither has DES's **EXPLORE phase**, which is
what you actually need when a price point has no recent sales, and at 84 units a month across 4
ASINs that is most of the time. HONE's "±20% around the last converting price" is also directly
applicable and cheap.

**What NOT to borrow:** Gallego-van Ryzin. It prices against a booking curve toward a fixed event
date with perishable inventory. An Amazon listing has neither a deadline nor perishability, so the
scarcity term has no meaning here.

### VISIBLE INVENTORY — does NOT map. Confirmed, not assumed.

Live `fulfillment_availability` on both ASINs checked:

```
[{"fulfillment_channel_code":"AMAZON_US2MX_RAFN"},
 {"fulfillment_channel_code":"AMAZON_US2CA_RAFN"},
 {"fulfillment_channel_code":"AMAZON_NA"},
 {"fulfillment_channel_code":"DEFAULT","quantity":0}]
```

Every unit is Amazon-fulfilled. The only settable quantity is the `DEFAULT` merchant channel, which
is 0. Under FBA the displayed availability is whatever is physically in the fulfillment centre, so
there is no field to write a scarcity level into. `max_order_quantity` is null on both and caps
per-order units anyway, which is not the same lever.

**Conclusion: skip it.** It would require moving to merchant-fulfilled, which trades Prime badge and
conversion for a scarcity display. That is a bad trade at $9.49.

### TITLE UPDATES — rotation does NOT map, testing does

Three independent reasons prefix rotation is wrong on Amazon:

1. **Policy.** This repo's own `confabulator/amazon-image-compliance.md` already codifies the rule
   against urgency and superlative text. DES's pools are exactly that: "Selling Fast", "Last
   Chance", "Prices Going Up". On an Amazon title that is a suppression risk, not a conversion win.
2. **No room.** Amazon's 75-character cap took effect 2026-07-27. All four titles are currently
   98-108 characters and already over. There is no budget for a rotating prefix.
3. **SEO churn.** An event title is a display string. An Amazon title is the primary indexed field.
   Rotating it churns the ranking signal we are trying to rebuild.

**What maps instead:** the phase idea applied to *keyword* choice rather than urgency words, plus
real A/B testing through Amazon's Manage Your Experiments. The title compliance linter and the
keyword-prioritised candidate generator are already built and unmerged.

### DESCRIPTIONS — maps as an experiment, currently gated

Confirmed live: the seller's listing contribution holds only offer, logistics and image attributes.
`bullet_point`, `product_description` and `generic_keyword` are all absent from our contribution,
while the catalog itself carries 5 bullets and a description. Brand on all four ASINs reads
**"Securisee"**, not Phone Assured.

So description rotation is not a code problem, it is a Brand Registry problem (task 8). Once
resolved, the DES-shaped approach is: variant pools plus a measured winner, run through Manage Your
Experiments rather than blind rotation, because Amazon gives a real split test and DES has to
simulate one.

## 3. Recommendation

Ranked by value per unit of effort, and stated as a proposal, not a decision:

1. **Add DES's EXPLORE/HONE phases to PA's existing price bandit,** then pick ONE of the two
   unmerged implementations and delete the other. This is the only lever of the four that both maps
   cleanly and is already 90% built.
2. **Reuse the v4 architecture, not its rules:** pure decision function, I/O in the cron, invariants
   asserted after every step. PA's ad engine already works this way, so the pricing engine should
   match it.
3. **Skip visible inventory entirely** while we remain FBA.
4. **Titles: ship the 75-character rewrite first** (already overdue), then test variants. Do not
   rotate.
5. **Descriptions: unblock Brand Registry first.** No code is worth writing until that is answered.

## 4. Open questions

- Which of the two existing price bandits do we keep?
- The Pro breaks even at 37% ACOS but the ad engine targets 52% globally, so Pro ad sales lose money
  per unit. Does the pricing work fix that by raising the Pro price, or does the ad engine need
  per-ASIN targets? Probably both, and they interact.
- The $14.95 historical price on the Single is the single most interesting untested data point we
  have. Worth pulling that period's unit volume before designing the price ladder.

## 5. Two-companies rule

Method and architecture reused from DES. No Social Scene or DES data, audiences, or credentials
cross over. PA-AMZN gets its own module under `src/lib/amazon/`.
