# RBB — should we write Mexico and Brazil in the native language?

**Asked by William, 2026-08-21:** "how do we get visible on brazil and mexico and should we write in
the native language rbb". Companion to `RBB-mexico-brazil-2026-08-21.md`, which covers the economics.

---

## 1. Problem

We are about to spend effort on Mexican and Brazilian listing copy and need to know whether it must
be written natively, translated professionally, or left to Amazon.

The question matters because the three answers cost wildly different amounts: Amazon's own
translation is free and already running, a professional agency is real money, and a native Amazon
shopper doing cultural validation is money plus scheduling. Against two markets that have produced
four orders in their history, picking the expensive answer by default would be the mistake.

Success looks like: knowing which fields genuinely need a human who speaks the language, and which
do not, so we spend on the first group only.

---

## 2. Industry standard

**Amazon requires detail pages in the local language and provides a tool to get there.** Build
International Listings machine-translates title, description and bullet points into each target
language at no cost. ([sell.amazon.com](https://sell.amazon.com/blog/amazon-listing-translation),
[Perci](https://www.perci.ai/blog/amazontranslate/))

**The consistent warning is that machine translation translates words, not meaning**, that it can
misrepresent a product's benefits, and that a bad translation can get a listing **suppressed**.
([YLT](https://ylt-translations.com/amazon-listing-translations/),
[Margin Business](https://marginbusiness.com/services/amazon-product-listing-translation/))

**Backend keywords are a separate problem from translation.** They exist purely to tell Amazon's
algorithm which queries a product should appear for, and they determine organic indexing. Mexico's
algorithm is described as leaning heavily on them, and the specific failure named is sellers who
only translate their US backend terms rather than researching how local shoppers actually type.
([Epinium](https://epinium.com/en/blog/amazon-backend-keywords/),
[nocnoc](https://nocnocstore.com/resources/how-to-successfully-sell-on-amazon-mexico))

**Localisation guidance says adapt, not translate**, and that even a professional translation
benefits from a native speaker who is also an Amazon shopper reading it for anything that sounds
foreign. ([YLT](https://ylt-translations.com/listing-ops-translation-localization/),
[Keywords.am](https://keywords.am/blog/amazon-listing-translation/))

---

## 3. Reality, measured today

**Amazon is already translating for us, and has been for a while.**

```
MX Pro   "Phone Assured Pro - Correa de teléfono duradera para nunca perder ni romper un teléfono…"
BR Pro   "Securisee Cordão de telefone Phone Assured Pro - Coleira de telefone durável…"
BR Single "Cordão retrátil Phone Assured – Coleira de…"
```

**We never wrote any of those.** They are Amazon's machine translations of the US title. The same
thing happened to our A+ content, where the Spanish and Hebrew documents came back badged
`GENERATED` and we briefly mistook one for a defect on 2026-08-10.

**So the language is not the gap. The emptiness is.**

```
                   title              bullets   description   search terms
US                 ours               ours      ours          ours
Canada             auto (English)     EMPTY     EMPTY         EMPTY
Mexico             auto (Spanish)     EMPTY     EMPTY         EMPTY
Brazil             auto (Portuguese)  EMPTY     EMPTY         EMPTY
```

Every SKU, all three export markets. There is nothing for Amazon to translate because we have never
supplied bullets, a description or a single backend keyword outside the US.

**Our US keyword evidence does not transfer.** Measured on 2026-08-17 from real order data, the US
terms that earn are `lanyard` (495 orders, $10,096), `clip` (266) and `chain` (165), while `grip`
and `popsocket` earn zero on zero queries. Those are English-language search habits. Nothing in that
table tells us whether a Mexican shopper types `correa`, `cordón`, `cable`, `agarradera` or
`sujetador`, and a machine translating our English keyword list would pick one word and discard the
rest of the search space.

**A relevant constraint from the companion RBB:** Brazil cannot take an order at all today, and
Mexico's flagship has no offer. No amount of copy in any language changes either.

---

## 4. Options

| | What | Cost | Expected | Trade-off |
|---|---|---|---|---|
| **A** | Leave everything empty, English title only | zero | status quo, four orders lifetime | Wastes four indexed fields per SKU in three countries |
| **B** | Fill bullets + description in **English**, let Amazon's translator do the rest | hours | Amazon already does this well enough for titles; costs nothing | Reads slightly foreign; small suppression risk |
| **C** | B, plus **natively researched backend search terms** | 1-2 days | The one field machine translation actively gets wrong, done right | Needs local keyword research, not a translator |
| **D** | Professional agency translation of all copy | agency fee | The textbook answer | Real money against 4 lifetime orders |
| **E** | D plus native-shopper cultural validation, localised imagery, local reviews | weeks + fees | What a genuinely converting local listing looks like | Contradicts the wind-down goal outright |

---

## 5. Recommendation

**Do C. The answer differs by field, and that is the whole finding.**

**Title: leave it.** Amazon already translates it, free, and it is live in Spanish and Portuguese
right now. The leverage is on the *US* title, because that is the source everything else is
generated from. Improving the US title improves all three exports for nothing.

**Bullets and description: write them in English and let Amazon translate.** This is the
counter-intuitive half. Machine translation is weakest on nuance and strongest on plain declarative
sentences, and our US bullets are exactly that: no adhesive, zinc alloy, twelve-month warranty,
fits phones under 171g. Those translate cleanly. Filling four empty fields per SKU at zero cost
captures most of the available value, and the research's own suppression warning applies to bad
translation of florid marketing copy, not to short factual claims.

**Backend search terms: native, researched, and never translated.** This is the one field where the
machine is actively wrong rather than merely clumsy, because it converts one English word into one
Spanish word and throws away the four synonyms a real shopper might use. It is also, per the
research, the field Mexico's algorithm weights most. This is keyword research in Spanish and
Portuguese, not translation, and it is the only part that needs a person.

**What NOT to do, and why:**

- **Do not commission agency translation yet.** It is the right answer for a business that is
  scaling into these markets. We are winding down with 207 fulfillable units and four lifetime
  orders across both countries. Spend the day on C, get 60 days of real conversion data, and let
  that decide whether D is ever worth it.
- **Do not machine-translate the backend keywords.** It looks like the cheap win and it is the one
  place the cheap version produces something worse than leaving the field empty, because it
  occupies the indexed space with words nobody types.
- **Do not write copy for Brazil before it can take an order.** Brazil is `DISCOVERABLE` and never
  `BUYABLE`, and no Brazilian shopper can currently see an offer of ours on any ASIN. Copy for a
  page that cannot sell is work with a guaranteed zero return.
- **Do not translate the US listing's marketing voice.** The US bullets carry conversion language
  (`discreet`, `easy`, `warranty`) that we measured earning zero as *search* terms on 2026-08-17.
  That distinction has to survive translation: those words belong in bullets, not in search terms,
  in any language.

---

## 6. Open questions, trade-offs accepted, rollback

**Open questions:**

1. **Who does the Spanish and Portuguese keyword research?** It is the only part of C that needs a
   human. Megan is the current listing collaborator but there is no indication she works in either
   language. Alternative: Amazon's own search-term reports for the MX profile, which would give real
   local queries rather than guesses, though with almost no traffic history to draw on.
2. **Does Build International Listings need switching on per marketplace?** The titles are already
   translated, which suggests it is on, but I confirmed that by observation rather than by reading a
   setting. Same Seller Central visit as the Brazil buyability question.
3. **Is there a suppression risk in supplying English bullets to a Spanish storefront** if Amazon
   does not translate them promptly? Untested. Mitigation is to do one SKU first and watch it.

**Trade-offs accepted:**

- Option C deliberately ships copy that a native speaker would call slightly stiff. That is a real
  quality cost, taken because the alternative costs money we should not spend until these markets
  show they can convert at all.
- Relying on Amazon's translator means our copy can change without us changing it.
- Doing the keyword research on almost no local traffic history means the first pass is educated
  guessing that must be revisited once real search-term data exists.

**Rollback:** every field here is a listing attribute patch, reversible in minutes and verifiable by
read-back, using the same validate-then-write-then-confirm pattern as
`scripts/canada-apply-prices.mjs`. Nothing here ships code or commits money.

---

## Companion work already validated

`scripts/mx-create-flagship-offer.mjs` — the Mexican flagship offer, validated `VALID` today and not
written. It needs six attributes, the last of which was copied from Canada rather than guessed:

```
purchasable_offer                    MXN 256.60   US-contribution parity
fulfillment_availability             AMAZON_NA
condition_type                       new_new
merchant_suggested_asin              B07Y5GZP1T
batteries_required / included        false
supplier_declared_dg_hz_regulation   not_applicable
```
