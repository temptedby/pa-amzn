# Phone compatibility: BLACK vs PRO

Built 2026-08-08 on William's rule: **iPhone 16 weight (170 g) and lighter = BLACK. Everything
heavier = PRO.** William confirmed BLACK works with an iPhone 16 *in a case*, so 170 g is a
conservative spec, not a measured ceiling.

All weights are the bare phone, manufacturer spec. Sources at the bottom.

---

## BLACK — 170 g and under

| Phone | Weight |
|---|---|
| iPhone 12 mini | 133 g |
| iPhone 13 mini | 140 g |
| iPhone SE (3rd gen) | 144 g |
| iPhone 12 | 162 g |
| iPhone 17 Air | 165 g |
| iPhone 16 | 170 g |
| iPhone 15 | 171 g |
| Galaxy S25 | 162 g |
| Galaxy S22 | 167 g |
| Galaxy S23 | 168 g |
| Galaxy S24 | 168 g |
| Pixel 4a | 143 g |
| Pixel 5 | 151 g |
| Pixel 4a 5G | 168 g |

Fourteen models.

### Pixel, specifically

**No modern Pixel qualifies.** Google's line got heavier at the Pixel 6 and never came back:

| Pixel | Weight | |
|---|---|---|
| Pixel 4a | 143 g | BLACK |
| Pixel 5 | 151 g | BLACK |
| Pixel 4a 5G | 168 g | BLACK |
| Pixel 6a | 178 g | PRO |
| Pixel 10a | 180-183 g | PRO |
| Pixel 5a | 183 g | PRO |
| Pixel 9a | 186 g | PRO |
| Pixel 8 | 187 g | PRO |
| Pixel 8a | 188 g | PRO |
| Pixel 7a | 193.5 g | PRO |
| Pixel 9 | 198 g | PRO |
| Pixel 10 | 204 g | PRO |
| Pixel 10 Pro | 207 g | PRO |
| Pixel 9 Pro Fold | 257 g | PRO |
| Pixel 10 Pro Fold | 258 g | PRO |

Only three Pixels from 2020 make the BLACK cut. Everything a Pixel owner is likely to be carrying
today is PRO. Treat **Pixel as a PRO keyword** and do not spend BLACK listing space on it.

### The edge cases, and why they still go to PRO

| Phone | Weight | Over the line by |
|---|---|---|
| iPhone 14 | 172 g | 2 g |
| iPhone 13 | 174 g | 4 g |
| iPhone 17 | 177 g | 7 g |

These are within a screen protector's weight of the line and they are huge installed bases, so the
question was put to William directly. **His answer, 2026-08-08: "nothing heavier than 170g is
safer."** Then, on seeing the sales data: **"iphone 15 at 171g we can add to black."**

So the working line is **171 g**, admitting iPhone 15 and nothing above it. iPhone 14 (172 g) and
iPhone 13 (174 g) are the next two steps up and remain PRO unless William says otherwise.

This is a deliberate trade: fewer BLACK-eligible models in exchange for never having a customer say
the tether was undersized for their phone. With cord load capacity still unconfirmed, erring toward
PRO is the defensible position, and PRO is the higher-value unit anyway.

---

## PRO — over 170 g

**Apple:** iPhone 11 (194), 11 Pro (188), 11 Pro Max (226), 12 Pro (187), 12 Pro Max (226),
13 Pro (203), 13 Pro Max (238), 14 Pro (203), 14 Plus (203), 14 Pro Max (240), 15 Pro (187),
15 Plus (201), 15 Pro Max (221), 16 Plus (199), 16 Pro (199), 16 Pro Max (221), 17 Pro (206),
17 Pro Max (233)

**Samsung:** Galaxy S22+ (195), S22 Ultra (228), S23+ (195), S23 Ultra (233), S24+ (197),
S24 Ultra (233), S25+ (190), S25 Ultra (218), A16 (200), A36 (195), A55 (213)

**Google:** Pixel 6a (178), Pixel 10a (180-183), Pixel 5a (183), Pixel 9a (186), Pixel 8 (187),
Pixel 8a (188), Pixel 7a (193.5), Pixel 9 (198), Pixel 10 (204), Pixel 10 Pro (207),
Pixel 9 Pro Fold (257), Pixel 10 Pro Fold (258)

**OnePlus:** OnePlus 9 (192)

Pattern worth knowing: essentially every current flagship Android is over 170 g. PRO is the default
Android product; BLACK is an Apple-and-small-Samsung product.

---

## Where the model list can actually earn search traffic

William's goal: *"list all the other phones on the pages so amazon can include us in any searches for
these phones."* The mechanism matters, because three of the four obvious places do not do what we
want.

| Surface | Indexed for Amazon search? | Verdict |
|---|---|---|
| **A+ Content** | **No** | Amazon does not index A+ module text. Put the list here for *conversion*, not for search. |
| **Title** | Yes, highest weight | Do NOT load competitor brand names here. Other-brand names in a title are a common suppression trigger. |
| **Bullet points** | Yes | Good home for plain-language compatibility. |
| **Backend search terms** | Yes | **249 bytes, hard.** Exceed it and Amazon silently drops the ENTIRE field, so every keyword stops indexing. |
| **Structured attributes** (Compatible Devices / Compatible Phone Models) | Yes | The correct home for a long model list. No byte squeeze. |

### The 249-byte problem, and the way around it

You cannot fit fifty model names in 249 bytes. But you do not have to. Backend search terms index on
individual **tokens**, not phrases, and Amazon recombines them. So you never need "iphone 15" and
"iphone 14" and "iphone 13" spelled out. You need `iphone` once and each number once.

Roughly 120 bytes covers almost the entire surface above:

```
iphone galaxy pixel oneplus 17 16 15 14 13 12 11 se air pro max plus mini s25 s24 s23 s22 ultra a16 a36 a55 10a 9a 8a
```

Everything else in the field should be *non-model* language a shopper types and the title does not
already contain. Never repeat title or bullet words; they are already indexed and the bytes are
wasted.

### Trademark line
Genuine compatibility statements using other brands' names are permitted ("compatible with",
"fits"). Implying endorsement or affiliation is not, and neither is PopSockets as an endorser.
Keep other-brand names out of the title, use them freely in bullets, attributes and backend.

---

## Approved claim language

William's framing, 2026-08-08: *"can say best used and tested with these models at 170g or less."*
That is the right move, because it is a **usage and weight-class** statement rather than a load
rating, so it does not depend on the unconfirmed cord capacity.

One tightening. We have physically tested an iPhone 16, in a case. We have not bench-tested a Galaxy
S24 or a Pixel 5, so "tested with" applied to a thirteen-model list is broader than what we did.
Ship the claim as a weight class with the tested example named:

> **Best used with phones 170 g (6.0 oz) and under, about the weight of an iPhone 16.**
> Heavier phone? Choose the Pro.

That is true, verifiable against any manufacturer spec page, does the same shopper job, and gives a
one-line reason to trade up to PRO instead of bouncing.

**Do not ship:** "tested with all of the phones below", any "holds X lbs", or any drop-height claim.

---

## Product truth that constrains all of this

**The cord retracts. The phone does not get pulled up.** The tether takes the weight and the slack so
you can guide the phone back to a pocket or bag. No asset may show a phone travelling upward on its
own.

Still unresolved and blocking any strength claim: **cord load capacity is unconfirmed for BLACK and
PRO.** Until we have a number, the split above is a *weight-class* claim, not a *strength* claim, and
nothing may say "holds X lbs."

---

## Sources
- Apple, iPhone 16 tech specs, 170 g: https://www.apple.com/iphone-16/specs/
- iPhone weight comparison, all models: https://iphonescompare.com/iphone-weight-comparison
- Samsung Galaxy S25 / S24 / S23 / S22: Wikipedia and GSMArena model pages
- Pixel 10a, 180 g: https://en.wikipedia.org/wiki/Pixel_10a
- Pixel 9a, 186 g: https://www.gsmarena.com/google_pixel_9a-13478.php
- Backend search terms 249-byte behaviour: https://www.listing-forge.com/blog/amazon-backend-keywords
