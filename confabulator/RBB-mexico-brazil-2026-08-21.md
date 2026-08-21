# RBB — a converting listing in Mexico and Brazil

**Asked by William, 2026-08-21:** "can we rbb on how to get a good listing converting on mexico and
brazil?" Follows the Canadian reopening the same day.

Everything measured here is a live API call made on 2026-08-21, not a recollection.

---

## 1. Problem

Neither Mexico nor Brazil can convert today, and in neither case is the reason the copy.

**Brazil cannot take an order at all.** All four listings read `DISCOVERABLE` and never `BUYABLE`.
The Listings API shows an offer with a price; the Pricing API, which is the buyer's view, shows
**no offer of ours visible on any ASIN**. A Brazilian shopper cannot add our product to a cart.

**Mexico is half-listed and mispriced.** The flagship, the ASIN carrying all 480 reviews, has
**no listing in Mexico at all** (`status: NONE`, no offer, while five other sellers compete on that
ASIN). Of the three that do exist, we hold the Buy Box on one.

Success looks like: a buyable offer in both countries, priced so a unit earns what a US unit earns,
and enough evidence within 60 days to say whether either market is worth real work.

---

## 2. Industry standard

**Remote Fulfillment with FBA** is the mechanism we are already on. A US seller with a unified North
America and Brazil account can offer into Canada, Mexico and Brazil out of US inventory, enrolled in
one click, with no stock sent abroad. Delivery is 5-7 days for Canada and Mexico and **16-20 days
for Brazil**. ([sell.amazon.com](https://sell.amazon.com/fulfillment-by-amazon/remote-fulfillment),
[Helium 10](https://www.helium10.com/podcast/amazon-remote-fulfillment-with-fba-program-sell-in-canada-mexico-brazil/))

**Brazilian import tax now favours us.** Under Remessa Conforme the 20% federal import tax on
international e-commerce **under $50 has been scrapped**, though roughly 17% state ICMS still
applies. Above $50 the rate is 60% with a $20 deduction. Every one of our items is well under $50,
so we sit in the favourable band and a multipack must stay there.
([Stamped Nomad](https://www.stampednomad.com/updates/brazil-scraps-20-federal-tax-on-imports-under-50),
[AMZ Shipper](https://amzshipper.com/brazil-import-tax-what-it-means-for-cross-border/))

**Localisation is adaptation, not translation.** The consistent advice is to write for how local
shoppers search rather than translating the US listing word for word; Amazon Mexico's algorithm
leans heavily on backend keywords, which are the field most often left as translated US terms; and
a native speaker who is also an Amazon shopper should validate the copy for anything that reads
foreign. ([YLT](https://ylt-translations.com/listing-ops-translation-localization/),
[Keywords.am](https://keywords.am/blog/amazon-listing-translation/),
[nocnoc](https://nocnocstore.com/resources/how-to-successfully-sell-on-amazon-mexico))

**Social proof carries more weight in Mexico than in the US**, and reviews written in natural
conversational Spanish are reported to be materially more credible than translated ones. Basic A+
Content is credited with up to an 8% sales lift, Premium up to 20%.
([Alibaba insights](https://www.alibaba.com/product-insights/amazon-mexico-2026-top-strategies-for-success.html),
[SalesDuo](https://salesduo.com/blog/amazon-conversion-rate-guide/))

---

## 3. Reality, measured today

### The fee that governs everything

Pulled from real settlement events, because the Canadian work proved `getMyFeesEstimate` understates
Remote Fulfilment by more than half (it returned CAD 3.79 against an actual CAD 8.21).

```
              units   avg price            FBA / unit          referral   net pre-COGS
US                    $  9.49              $2.52                 15.0%
Canada          57    CAD  29.28           CAD  8.21 = $5.96     15.0%    CAD 23.22
Mexico           2    MXN 742.87 = $43.80  MXN 136.84 = $8.07    10.0%    $31.36
Brazil           5    BRL  92.66 = $17.85  BRL  37.00 = $7.13    15.0%    $ 8.05
```

Two findings in that table:

- **Cross-border fulfilment costs $6 to $8 a unit against $2.52 domestically.** On a $9.49 product
  that fee, not the product, is the dominant cost in every export market.
- **Mexico's referral fee is 10%, not the 15% charged in the US, Canada and Brazil.** That is
  worth about 50 cents a unit and makes Mexico structurally the better of the two.

### What that means for price

Solving for the price at which a unit earns what a US unit earns, using the measured fees:

```
                    live now              break-even        US-parity price
BR Single      BRL  49.24 = $ 9.49        BRL 47.33         BRL 77.44 = $14.92
MX Pro         MXN 334.11 = $19.70        MXN 168 approx    MXN 255.40 = $15.06
MX 2-Pack      MXN 742.87 = $43.80        MXN 172 approx    MXN 303.40 = $17.89
```

**Brazil is currently priced at USD 0.32 of contribution per unit.** BRL 49.24 is a straight
currency conversion of the US $9.49, which is the exact mistake the Canadian analysis caught: it
ignores the $7.13 fulfilment fee and lands two percent above break-even. It could not fund a single
click of advertising.

Worth noting Brazil's five real units sold at **BRL 92.66**, not BRL 49.24, and earned $7.43 of
contribution each, half again what a US unit earns. Someone repriced Brazil down to an FX
conversion at some point and turned a profitable listing into a break-even one.

Mexico has the opposite problem: both live listings are priced well **above** parity and earn $8 to
$30 a unit, and sell nothing.

### The listings themselves

```
                    status                 buyer sees          title            bullets/desc/search
MX Single   NONE, no offer at all          5 rival offers      -                -
MX Pro      BUYABLE                        ours, Buy Box       Spanish          ALL EMPTY
MX 2-Pack   BUYABLE                        14 offers, NOT ours Spanish          ALL EMPTY
MX 3-Pack   BUYABLE                        -                   Spanish          ALL EMPTY
BR all 4    DISCOVERABLE only              NOTHING             Portuguese       ALL EMPTY
```

Amazon also flags the Mexican account with `hasSuspendedListings: true`.

The titles are already localised, Spanish on Mexico and Portuguese on Brazil, almost certainly
Amazon's own machine translation. **Bullets, description and backend search terms are completely
empty on every SKU in both countries** — the same gap we closed on the US listings on 08-19 and
have not closed on Canada either.

### Lifetime demand

```
MX   2 orders   MXN 1,485.74     Aug-Sep 2025
BR   2 orders   BRL   463.30     Nov 2025
CA 129 orders   CAD 5,064.58     Sep 2024 - Sep 2025
```

Canada is a proven market. Mexico and Brazil have produced four orders between them, ever.

### Constraints we carry into this

- **One inventory pool.** Everything is `AMAZON_NA`, so Mexico and Brazil draw on the same US stock
  as the US and Canada: 173 Single, 20 Pro, 8 3-Pack, 6 2-Pack fulfillable.
- **No Brazilian advertising profile exists.** Ads profiles are US, CA and MX only. Brazil cannot be
  advertised into at all, whatever we do to the listing.
- **Reviews do not travel.** The 480 reviews are on the US ASIN. A Mexican or Brazilian shopper sees
  that marketplace's own review count, and the research says Mexican buyers lean on social proof
  harder than US buyers do.
- **Brazil's 16-20 day delivery** is a conversion problem on a sub-$20 impulse accessory that no
  amount of copy fixes.
- **Standing goal:** sell through the remaining units and wind the business down. New markets are
  only worth opening if they move units without new investment.

---

## 4. Options

| | What | Effort | Expected | Trade-off |
|---|---|---|---|---|
| **A** | Do nothing. Canada only. | zero | Canada is proven at CAD 390/mo | Leaves two listed markets dead; costs nothing |
| **B** | Make them buyable, nothing else | ~1 day | Answers the only real question: will anyone buy at a sane price | Copy stays empty, so conversion is the floor not the ceiling |
| **C** | B + reprice to measured parity | ~1 day | Brazil goes from $0.32 to $4.93 a unit; Mexico gets a price a shopper will consider | Mexico's per-unit take falls from $8-30 to parity, on a volume bet |
| **D** | C + fill bullets/description/search terms from the US copy, machine-assisted, native check | ~3 days + a native speaker | The 8% A+ style lift, and backend keywords that Mexico's algorithm actually reads | Real money and time against 4 lifetime orders |
| **E** | D + localised imagery, A+, local review generation | weeks | What the research says a converting listing needs | Directly contradicts the wind-down goal |

---

## 5. Recommendation

**Do B, then C. Do not do D or E yet.**

**Brazil first, and only the buyability fix plus the price.** Brazil is the clearer case: it has a
working economic model at BRL 77 that it demonstrated with real orders at BRL 92, and it is
currently sitting at a price that earns 32 cents. Fixing the price is a five-minute change that
triples the contribution of any order that does happen. Fixing buyability is the precondition for
any order at all.

**Mexico second, and start by creating the flagship offer.** The single highest-value action in
Mexico is not copy, it is that the ASIN carrying 480 reviews has no offer while five other sellers
compete on it. Then bring the Pro and 2-Pack down to parity, MXN 255 and MXN 303, which roughly
halves both prices and puts them where a shopper might act.

**Give it 60 days of evidence before spending anything else.** The research's own advice is to
track sessions and conversion for 30 to 60 days before adjusting. We have four orders of history;
we need a real reading before committing a translator or a photographer.

**What NOT to do, and why:**

- **Do not pay for professional translation or new photography yet.** D and E are the textbook
  answer and they are the wrong answer for a business being wound down with 207 fulfillable units.
  Buy the evidence first; it costs a day.
- **Do not advertise Brazil.** There is no advertising profile. Any plan that assumes ad spend in
  Brazil is not executable.
- **Do not price either market by currency conversion.** That is what put Brazil at $0.32. The
  fulfilment fee is $6-8 and does not scale with price, so FX-only pricing is below break-even in
  every export market, exactly as it was in Canada.
- **Do not chase Mexico's 2-Pack Buy Box by price alone.** Fourteen sellers compete on it and we do
  not hold it. Parity pricing may or may not win it, and winning it at a loss is worse than losing it.

---

## 6. Open questions, trade-offs accepted, rollback

**Open questions, none of which I can answer from the API:**

1. **Why is Brazil `DISCOVERABLE` but never `BUYABLE`?** Zero listing issues are reported, the offer
   and price exist, and fulfilment reads `AMAZON_NA`. The likely cause is Remote Fulfillment not
   being enrolled for Brazil specifically, which is a Seller Central setting rather than an API one.
   This is a browser task and it is the single blocking unknown.
2. **Why does the Mexican flagship have no listing, and what is `hasSuspendedListings: true`?**
   Either a suppressed listing or an offer that was deleted. Needs the Seller Central view.
3. **Was the Brazilian reprice from ~BRL 92 to BRL 49 deliberate?** If someone did it on purpose for
   a volume reason, that reasoning should override this document.

**Trade-offs accepted:**

- The fee figures rest on **2 Mexican units and 5 Brazilian units**, both from 2025. That is thin,
  and Amazon may have changed rates since. It is still far better evidence than the fee estimator,
  which we proved wrong by 2x in Canada. First real order in either market re-confirms it.
- Parity pricing in Mexico deliberately gives up $4 to $25 a unit of current margin on the bet that
  volume more than compensates. On two lifetime orders, that bet is close to unfalsifiable today.
- Opening two more countries spreads one thin inventory pool four ways.

**Rollback:** every action recommended here is a listing status or price change through the Listings
API, reversible in minutes and verifiable by read-back. `scripts/canada-apply-prices.mjs` is the
pattern: validate first, write, then confirm from Amazon rather than from the submission status. No
code ships, no money is committed, and nothing here touches the US account.

---

## Scripts written for this

- `scripts/intl-actual-fees.mjs` — settlement-derived fees per marketplace, the table in section 3
- `scripts/canada-price-parity.mjs` — the parity solver, the same method applied to Canada
