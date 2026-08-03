# Listing copy — titles, bullets, backend keywords

Built from 180 days of customer returns comments (`voice-of-customer-2026-08-03.md`) plus product
facts confirmed by William on 2026-08-03. Every line answers a documented reason someone sent the
product back. Nothing here has been written to the live listings.

## Product facts, as confirmed

| Fact | Value | Source |
|---|---|---|
| Cord length | 84 cm actual, **published as 31 in** | William. 84 cm is 33.07 in, so the claim under-promises by ~2 in on purpose, and no buyer can return it as "shorter than expected" |
| Tested load | iPhone 16, **6.00 oz / 170 g** | William, weight per Apple |
| Retraction | Cord retracts into the housing. **The spring will not lift a phone.** | William |
| Why the spring is soft | A spring strong enough to haul a phone up can snap back on a finger or pinch skin | William |
| Purpose of retraction | Discretion. No visible cord hanging off you. | William |
| Attachment | Loop knot threads through a hole in the phone case. Cut one if the case has none. Best at the bottom edge, offset from the charging port. | William |
| QC | Every clip tested in the US before shipping | William |
| Support | 1 year, 2 replacement clips total | William |

## The finding that shaped this

Our own title says **"Retractable Phone Tether."** Customers return it saying *"not strong enough
to hold the phone up/retract"* and *"seems better suited for an ID card and not a heavy cell
phone."*

They are not describing a defect. They are describing our word. "Retractable" made them expect the
phone comes back up on its own. It does not, by design. **Our own keyword is manufacturing the
NOT_AS_DESCRIBED returns**, which is the second-largest return reason on the flagship.

We cannot drop the word, it is what people search. So the copy keeps it in the title for the search
demand and kills the false expectation immediately, in bullet two, reframed as the safety decision
it actually is.

## Titles (Amazon cap 75 characters, effective 2026-07-27)

All four verified under the cap, brand-leading, no banned promotional or warranty wording, no
disallowed characters. Note the current live titles use an en dash, which Amazon disallows
independently of length.

| ASIN | Chars | Title |
|---|---|---|
| Single `57-P4AJ-J4AC` | 72 | `Phone Assured Retractable Phone Tether, 31 in Anti Drop Cell Phone Leash` |
| 2-Pack `CPH-BLCK-2` | 68 | `Phone Assured Retractable Phone Tether 2 Pack, 31 in Anti Drop Leash` |
| 3-Pack `CPH-BLCK-3` | 68 | `Phone Assured Retractable Phone Tether 3 Pack, 31 in Anti Drop Leash` |
| Pro `UG-SVG8-LB0P` | 72 | `Phone Assured Pro Retractable Phone Tether, 31 in Heavy Duty Phone Leash` |

Warranty wording is deliberately absent: Amazon bans "warranty" and "guarantee" in titles outright.
It lives in bullet 5.

## Bullets

Five bullets, one per documented return theme, all inside Amazon's 500-character limit.

**1. 31 INCHES OF REACH** (187 chars) — answers 3 separate returns over length
> Long enough to pull your phone out, take the photo, tap to pay, and drop it back in your pocket
> without ever unclipping. The cord stays attached to you the whole time.

**2. A SOFT SPRING, ON PURPOSE** (367 chars) — answers the single biggest fixable objection
> The cord pulls back into the housing so you are not walking around with a loop of string hanging
> off you. The spring is deliberately gentle. One strong enough to haul a phone back up is also
> strong enough to snap back on a finger or pinch skin, so we do not fit one. Your phone stops
> before it hits the ground and you guide it back by hand.

**3. NEEDS A HOLE IN YOUR CASE** (314 chars) — answers 4 NOT_COMPATIBLE returns
> The loop knot threads through an opening in your phone case. Many cases already have one. If
> yours does not, you can cut a small hole yourself. The easiest spot is the bottom edge, set
> slightly to the side of the charging port so the two do not overlap. Check your case before you
> order.

**4. TESTED WITH A FULL SIZE PHONE** (203 chars) — answers "its not strong enough to hold a phone"
> Tested with an iPhone 16 at 6 oz, so it is built for a normal modern smartphone, not just a
> keycard or a badge reel. Discreet enough that nobody notices you are wearing it.

**5. CHECKED IN THE US, AND BACKED FOR A YEAR** (191 chars) — answers "cord snapped on first use"
> Every clip is tested here before it ships. If anything goes wrong within twelve months, message
> us and we will send a total of two replacement clips.

Bullet 3 will cost some conversion. That is the point. It converts a post-purchase surprise into a
pre-purchase qualification, and a buyer who reads it and leaves was going to return the product and
leave a 2-star review.

## Backend search terms (`generic_keyword`, 250-byte cap, currently EMPTY)

188 of 250 bytes. No brand, no words already in the title, no punctuation, per Amazon's guidance.

```
phone leash cell lanyard strap cord holder anti theft drop safety clip belt pocket travel wrist
neck tether tab crossbody hands free elderly kids boating fishing hiking case hole loop knot
```

## Before any of this goes live

1. **Titles** can be written through the Listings Items API. The write path exists on
   `feat/price-bandit-scaffold` and is double-gated. Untested against this account.
2. **Bullets and description are blocked.** Our seller contribution contains no `bullet_point` or
   `product_description` attribute at all, and brand reads "Securisee". That is task 8, Brand
   Registry, and it is a permissions question rather than a code one.
3. **`generic_keyword` is also absent** from our contribution, so the backend terms may hit the
   same wall as the bullets. Worth testing on one SKU before assuming.

## What outranks all of this

72.5% of 102 returns came back **SELLABLE** and went into inventory, including units returned as
defective and customer-damaged. William confirms returned units are reaching new customers. If
damaged clips are being resold, that drives the 3.8-star rating directly and no copy rewrite
touches it. Task 14.
