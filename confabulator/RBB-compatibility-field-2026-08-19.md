# RBB — Setting Compatible Cellular Phone Models correctly

**Date:** 2026-08-19
**Asked by:** William, after spotting that the live listing showed only "iPhone SE" under compatible
phones: "please rbb and 6 step to do capability and click the right models".
**Status:** research. One live write already made (`compatible_phone_models`, verified); the picker
field is unwritten and this document decides how.

---

## 1. Problem

**What is wrong.** Two of the four listings advertise compatibility with a single obsolete handset.
Read from Amazon's catalogue:

```
B07Y5GZP1T  Single/Black   compatible_cellular_phone_models = ["apple_iphone_16"]
B097MGPCPC  2-Pack         compatible_cellular_phone_models = ["apple_iphone_se_1st_gen"]
B097MK5VZ4  3-Pack         compatible_cellular_phone_models = ["apple_iphone_se_1st_gen"]
B0BLLJLSDP  Pro            compatible_cellular_phone_models = []   (empty)
```

The iPhone SE 1st generation was discontinued in 2018. A shopper filtering by phone sees the 2-Pack
and 3-Pack matched to a seven-year-old handset and nothing else, and the Pro matched to nothing at
all. This is the field that drives Amazon's compatibility filter, so it is not cosmetic: it decides
whether we appear at all for a shopper who filters by their phone.

**Why it went unnoticed.** There are TWO compatibility fields and they behave differently:

```
compatible_phone_models            free text, 3 entries max, 2200 chars each   -> written today, verified
compatible_cellular_phone_models   controlled vocabulary, 60 entries max       -> never touched by us
```

Today I filled the first and did not check the second. The first is a display string; the second is
the structured, filterable one. That is the actual defect, and it is mine.

**What success looks like.** Each listing carries the set of handsets Megan's weight rule says it
fits, expressed in values Amazon accepts, with Black/2-Pack/3-Pack on the ≤171 g set and Pro on the
>171 g set.

---

## 2. Industry standard

Amazon requires wireless-accessory listings to carry compatible phone model information on the
detail page, on its own stated grounds that it reduces returns and negative reviews
([Seller Central forums](https://sellercentral.amazon.com/seller-forums/discussions/t/f375ccafb46aaba1723c3b2f552518d0)).
It is a first-class structured field, not a nicety.

The general standard being applied here is **controlled vocabulary over free text for anything
machine-readable**. A filter can only work if every seller expresses "iPhone 16" identically, which
is why Amazon holds a closed list and rejects anything outside it. The corresponding discovery
technique is the one used below: when a vendor will not publish its enumeration, read values that
are already live in its own data, because anything the system currently stores is by definition a
value the system accepts.

---

## 3. Codebase and reality

**The API will not take human-readable names, including Amazon's own.** Every variant was refused
with `90244` "select an approved value from the list":

```
"Apple iPhone 16"        REJECTED   <- the value currently live on our own listing
"iPhone 16"              REJECTED
"Apple iPhone 15 Pro"    REJECTED   <- the schema's own documented example
"Samsung Galaxy S22"     REJECTED
```

A field rejecting both its own example and its own stored value is the signal that the wire format
differs from the display format.

**It does. The stored values are snake_case tokens.** Read from the Catalog Items API:

```
apple_iphone_16           renders on the page as "Apple iPhone 16"
apple_iphone_se_1st_gen   renders on the page as "iPhone SE"
```

That is why the earlier probes failed and why the page shows "iPhone SE". A token probe is running
to confirm the pattern generalises (`apple_iphone_15`, `samsung_galaxy_s25`, `google_pixel_5` and so
on) before anything is written.

**The free-text field was written correctly today** and is verified in the catalogue: 18 models on
Black, 2-Pack and 3-Pack, 50 on Pro. The comma-separated shape matches how the pre-existing
catalogue value was formatted, so that write stands.

**Megan's lists are 18 and 50 handsets.** The field allows 60 entries, so both fit with room.

---

## 4. Options

**A. Click each model in the Seller Central Compatibility tab.** What William asked for. It works,
it is the documented path, and the picker only ever offers approved values so mis-entry is
impossible. Cost: 68 clicks across four listings, plus scrolling a long list, done by hand and
repeated whenever Megan revises the set. Nothing is verifiable afterwards except by eye.

**B. Write the snake_case tokens through the API.** Same field, same result, scripted and verifiable
by read-back. Cost: the token for each handset must be correct, and Amazon does not publish the
list, so each one is a guess until validated. Validation is free and applies nothing, so guessing is
cheap and safe.

**C. B for every token that validates, A for the remainder.** Script what is certain, hand-click the
handful that resist.

**D. Leave the free-text field only and accept the filter miss.** Rejected: it leaves two listings
advertising a 2018 handset.

**E. Copy the token set from a competitor's listing.** Rejected on principle even though it is
technically easy. Their compatibility claims are their liability, not evidence about our product,
and our claim is governed by Megan's weight rule.

---

## 5. Recommendation

**C, and validate before writing anything.**

Option B for the bulk, because the API path is repeatable and self-checking. Every token goes
through `mode=VALIDATION_PREVIEW` first, which applies nothing and tells us exactly which values
Amazon accepts, and the result is confirmed by reading the value back from the catalogue rather than
trusting the submission status. That is the same discipline that caught today's description write
being real and today's compatibility write being the wrong field.

Option A only for stragglers. If a handset Megan named has no discoverable token, the picker is the
authority and one manual click settles it.

**What NOT to do.** Do not hand-click all 68 as the first move. It is the slowest path, it produces
no record of what was set, and it has to be redone from scratch every time the list changes. And do
not write tokens without validating each one: a rejected token in a batch fails the whole submission,
so an unvalidated batch of 50 is a coin flip.

**Sequencing note.** The two wrong values matter more than the missing ones. Clearing
`apple_iphone_se_1st_gen` off the 2-Pack and 3-Pack removes an actively misleading claim, and should
go first even if the full set takes longer.

---

## 6. Open questions, trade-offs accepted, rollback

**Open questions.**

1. Does Amazon's vocabulary actually contain Megan's handsets? `apple_iphone_air` and
   `apple_iphone_17` are recent enough that they may not exist as tokens yet. The probe answers this.
2. Can the weight split be expressed at all? If tokens exist for every model, yes, precisely. If
   the vocabulary is coarser than Megan's list, Black and Pro may end up overlapping, and the 171 g
   distinction survives only in the bullets and description.
3. Is 60 entries per listing enough for Pro? Its list is 50, so yes, unless Megan extends it.

**Trade-offs accepted.** Discovering tokens by probing is slower than being handed the list, and the
probe can only confirm what we think to try: a handset nobody guesses a token for looks identical to
one that does not exist. The picker remains the backstop for exactly that case. Writing through the
API also bypasses the UI's own guidance text, so if Amazon attaches category rules to that picker we
would not see them.

**Rollback.** The field is a plain attribute: re-submitting the previous value restores it, and the
previous values are recorded above for all four ASINs. No pricing, inventory or advertising state is
touched by any of this.
