# Listing update, ready to apply — 2026-08-15

William 2026-08-15: *"make sure that the phone models are in there, the weights in there, and then
other potential products that we discuss. Earbuds, cell phone cases, sunglasses and sunglasses cases
and other items can be listed in there to use with the clip."* Megan is travelling and has not
applied anything.

Everything below was checked against what is LIVE (SP-API Catalog + Listings) and against Amazon's
own schema for `CELL_PHONE_HOLSTER`, not against the draft in Megan's doc. The doc's "before" text
does not match the live listing.

## What is actually live today

| | BLACK B07Y5GZP1T | PRO B0BLLJLSDP | 2-Pack | 3-Pack |
|---|---|---|---|---|
| title | April, no weight line | April, no weight line | same | same |
| bullets | 5, live | 5, live | - | - |
| backend search terms | **EMPTY** | **EMPTY** | **EMPTY** | **EMPTY** |
| Compatible Phone Models | 8 entries, **6 too heavy** | **none** | none | none |
| Compatible Cellular Phone Models | 1 (`apple_iphone_16`) | **none** | none | none |

All four are BUYABLE / DISCOVERABLE with zero issues. Nothing is suppressed. Nothing has been
written since 2026-04-20.

## The one that is doing damage

The BLACK listing's Compatible Phone Models field advertises six phones that our own 171 g rule says
do not fit it:

```
188 g  iPhone 7 Plus              TOO HEAVY
204 g  iPhone 13 Pro              TOO HEAVY
188 g  iPhone 11 Pro              TOO HEAVY
228 g  Samsung Galaxy S22 Ultra   TOO HEAVY   (33% over the line)
195 g  Samsung Galaxy S22 Plus    TOO HEAVY
199 g  Moto G Power XT2041        TOO HEAVY
163 g  Samsung Galaxy S20         fits
168 g  Samsung Galaxy S22         fits
```

This is the mis-sell behind the returns. NOT_AS_DESCRIBED is the second largest return reason on the
flagship and the buyer comments read *"not strong enough to hold the phone up"* and *"seems better
suited for an ID card and not a heavy cell phone"*. We are telling Galaxy S22 Ultra owners the Black
fits, then they find out it does not.

## Schema facts, from Amazon's own definition

- `item_name` maxLength **200**. Our recorded "75-char cap from 2026-07-27" was wrong for this
  product type, and the live 98-108 char titles confirm it: zero issues.
- `generic_keyword` schema allows 500 chars / 2000 bytes, but Amazon's search-terms POLICY is
  250 bytes. Staying under policy.
- `compatible_phone_models` max **3** unique items, free text or one of eight broad enum values.
  The live 8 entries pre-date the current schema, so a write must send 3 or fewer.
- `compatible_cellular_phone_models` max **60** unique items, from a fixed enum of 14,157 codes.
  This is the right home for the per-model weight-class lists.

## Proposed values

### Titles (all validate: 181 / 174 / 184 / 183 chars, no non-ASCII)

- **BLACK** — Phone Assured Retractable Phone Tether, Anti-Theft Phone Leash for Phone Cases and Grips, Fits Phones 171g and Under, Cell Phone Tether for Travel, Shopping, Hiking and Everyday Use
- **2-Pack** — Phone Assured 2-Pack Retractable Phone Tethers, Anti-Theft Phone Leashes for Phone Cases and Grips, Fits Phones 171g and Under, Cell Phone Tethers for Travel and Everyday Use
- **3-Pack** — Phone Assured 3-Pack Retractable Phone Tethers, Anti-Theft Phone Leashes for Phone Cases and Grips, Fits Phones 171g and Under, Cell Phone Tethers for Families, Travel and Everyday Use
- **PRO** — Phone Assured Pro Retractable Phone Tether, Premium Anti-Theft Phone Leash with Zinc Alloy Clip, Built for Heavier Phones Over 171g, for Phone Cases and Grips, Travel and Everyday Use

### Backend search terms (242 bytes, 42 unique words, zero overlap with the new titles)

```
lanyard strap cord holder safety security drop secure wrist crossbody iphone galaxy pixel 17 16 15
14 13 12 11 se mini plus max ultra s25 s24 s23 a16 earbuds sunglasses case keys wallet badge cruise
concert festival commuting dog walking kids
```

Same string on all four. It now carries the other-items words William asked for: earbuds,
sunglasses, case, keys, wallet, badge.

### Compatible Phone Models (max 3)

- BLACK / 2-Pack / 3-Pack: `iPhone Models`, `Samsung Galaxy Models`, `Google Pixel Models`
- PRO: same three.

### Compatible Cellular Phone Models

**BLACK / 2-Pack / 3-Pack, 16 codes, every one 171 g or under:**
```
apple_iphone_16 apple_iphone_15 apple_iphone_12 apple_iphone_13_mini apple_iphone_12_mini
apple_iphone_se_3rd_gen apple_iphone_se_2nd_gen samsung_galaxy_s25 samsung_galaxy_s24
samsung_galaxy_s23 samsung_galaxy_s23_5g samsung_galaxy_s22 samsung_galaxy_s22_5g
google_pixel_5 google_pixel_4a google_pixel_4a_5g
```

**PRO, 43 codes, every one over 171 g:**
```
apple_iphone_17_pro_max apple_iphone_17_pro apple_iphone_17 apple_iphone_16_pro_max
apple_iphone_16_pro apple_iphone_16_plus apple_iphone_15_pro_max apple_iphone_15_pro
apple_iphone_15_plus apple_iphone_14_pro_max apple_iphone_14_pro apple_iphone_14_plus
apple_iphone_14 apple_iphone_13_pro_max apple_iphone_13_pro apple_iphone_13
apple_iphone_12_pro_max apple_iphone_12_pro apple_iphone_11_pro_max apple_iphone_11_pro
apple_iphone_11 samsung_galaxy_s25_ultra samsung_galaxy_s25_plus samsung_galaxy_s24_ultra
samsung_galaxy_s24_plus samsung_galaxy_s23_ultra samsung_galaxy_s23_plus samsung_galaxy_s22_ultra
samsung_galaxy_s22_plus_5g samsung_galaxy_a55 samsung_galaxy_a36 samsung_galaxy_a16_5g
samsung_galaxy_a06_5g google_pixel_10_pro_fold google_pixel_10_pro google_pixel_10
google_pixel_9_pro_fold google_pixel_9 google_pixel_9a google_pixel_8 google_pixel_8a
google_pixel_7a google_pixel_6a
```

Dropped: **iPhone 17 Air**, which Megan's doc lists under BLACK. Amazon's enum has only iPhone 17,
17 Pro and 17 Pro Max, and I have no verified weight for an Air, so it is out of both the structured
field and the copy.

### Bullets — NEW COPY, not yet approved

The live bullets are decent and were never the PopSockets draft. These are rewrites that add the
weight line, the other items, and the wrap-around mechanism.

**BLACK**

1. **FITS PHONES 171 G (6.0 OZ) AND UNDER, PLEASE CHECK BEFORE YOU BUY** — About the weight of an
   iPhone 16. That includes iPhone 16, iPhone 15, iPhone 12 and 12 mini, iPhone 13 mini, iPhone SE,
   and Galaxy S25, S24, S23 and S22. Carrying something heavier such as an iPhone Pro, Plus or Max, a
   Galaxy Ultra or a recent Pixel? Choose the Phone Assured Pro instead. Works over most cases, grips
   and phone rings.
2. **SLEEK AND DISCREET, NOT A BADGE HOLDER** — Light enough to clip to your waistband, belt loop,
   pocket, purse or bag without adding bulk, and it disappears under a jacket. No adhesive pads to
   peel off your case and nothing stuck to your phone.
3. **CLIPS TO WHAT YOU ALREADY CARRY** — The carabiner has two ends, so you can wrap the cord around
   a rail, bar, stroller, luggage handle or piece of gym equipment and clip it back onto its own
   cord. No hole to cut and nothing to modify.
4. **MORE THAN A PHONE TETHER** — Also secures earbuds and earbud cases, sunglasses and sunglasses
   cases, many of which have a loop or belt clip on the back, plus keys, wallets and ID badges.
5. **CONTROLLED RETRACTION AND A 1-YEAR WARRANTY** — The cord retracts and takes up the slack so you
   can guide your phone back one handed and it never hits the floor. The lighter spring tension is
   deliberate: a spring strong enough to haul a phone back up can pinch a finger. Backed by a 1-year
   warranty direct from Phone Assured.

**PRO** — same five, with bullet 1 reading *"BUILT FOR PHONES OVER 171 G (6.0 OZ)"* and naming every
Pro, Plus, Max, Ultra and Fold, and bullet 2 leading on the zinc alloy clip.

## What we still cannot say

No load or strength number anywhere. The cord capacity has never been measured for either product,
and three competitors publish one. A kitchen scale and ten minutes fixes that.

Never show or write the phone springing back up on its own. The cord retracts, the phone is guided.
Stevo's one-star review is about exactly that misreading.
