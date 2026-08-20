# RBB — How many phone models should we list?

**Date:** 2026-08-19
**Asked by:** William: "that are less than 171g or the pro to say all the phone models rbb should we
list as many as we can for seo aeo amazon exposure?"
**Status:** research. Nothing written. Companion to `RBB-compatibility-field-2026-08-19.md`.

---

## 1. Problem

Megan's lists are 18 models for Black, 2-Pack and 3-Pack, and 50 for Pro. Amazon's field holds **60
entries per listing**, so Black is using 30% of its capacity. The question is whether to fill it.

Underneath that sits a sharper question the phrasing hides: **listing more models is only free if
every model is genuinely compatible.** Our returns data is the reason the 171 g rule exists at all.
The recurring complaint was that the clip is "not strong enough", which is what happens when a heavy
phone is attached to the standard product. Listing a 200 g handset under Black would manufacture
exactly the return we designed the weight rule to prevent.

So success is not "as many as possible". It is **every model that genuinely fits, and no model that
does not.**

---

## 2. Industry standard

**The premise about SEO needs correcting, and this changes the recommendation.**
`compatible_cellular_phone_models` is a **structured attribute feeding Amazon's compatibility
filter**, not an indexed keyword field. Published guidance is consistent that attributes are the
structured data Amazon uses to organise its catalogue and let shoppers filter to exact criteria,
which is a different mechanism from the keyword indexing that title, item highlights and search
terms feed. Filling it does not make us rank for "iPhone 14 phone tether" as a search phrase. It
makes us survive the left-hand filter when a shopper narrows by their handset.
Sources: [Emplicit on attribute accuracy](https://emplicit.co/amazon-listing-optimization-attribute-accuracy-tips/),
[RepricerExpress 2026 listing guide](https://www.repricerexpress.com/optimise-your-amazon-product-listings/).

That is still valuable, and arguably more valuable than a keyword, because a filter is a hard gate:
fail it and you are not on the page at all, regardless of relevance.

**On accuracy**, Amazon's own stated rationale for requiring compatibility data on wireless
accessories is that it reduces returns and negative reviews. Attribute accuracy guidance is explicit
that these fields should be double-checked and reviewed against category rules. Inaccurate
compatibility is not a grey-area optimisation, it is the failure mode the field exists to prevent.

---

## 3. Codebase and reality

**Capacity.** 60 entries per listing. Currently proposed: Black 18, Pro 48. Black has 42 spare
slots, Pro has 12.

**The vocabulary is finer-grained than Megan's list.** Confirmed by live validation, Amazon accepts
tokens for handsets she did not include, including several that sit comfortably under the line:

```
apple_iphone_se_1st_gen   113 g   -> Black
apple_iphone_7            138 g   -> Black
apple_iphone_8            148 g   -> Black
apple_iphone_x            174 g   -> Pro
apple_iphone_xr           194 g   -> Pro
```

**A gap in the current split, found while probing.** Megan places `samsung_galaxy_s21_ultra`,
`_plus` and `_fe` on Pro, which is right, but the **base Samsung Galaxy S21 is 169 g** and appears
on neither list. It belongs on Black. The same applies to the Galaxy S20 at 163 g. These are not
obscure handsets.

**What the weight rule actually implies.** The line is 171 g. Applied honestly it puts most standard
iPhones, base Galaxy S models and the small Pixels on Black, and every Pro, Plus, Max, Ultra and the
larger Pixels on Pro. That is a clean split with no model on both sides, which is what makes the
cross-sell coherent.

**Where the real limit bites.** Pro has 48 of 60 used. If we extend Pro to every heavy handset, the
A-series Samsungs alone would exhaust it. Black has room; Pro does not.

---

## 4. Options

**A. Fill both lists to 60 with every accepted token.** Maximum filter coverage, and it breaks the
weight rule within a week because there are more than 60 heavy phones. Rejected: it would put heavy
handsets on Black.

**B. Ship Megan's 18 and 48 as they stand.** Safe, accurate, and leaves 42 empty slots on Black
while real handsets that fit go unlisted.

**C. Fill Black up to 60 with every model at or under 171 g, and keep Pro at Megan's 48.** Uses the
headroom where it exists, respects the weight rule, and adds the missing S21 and S20.

**D. As C, plus prioritise Pro's remaining 12 slots by market share** rather than adding
arbitrarily, since Pro cannot hold everything heavy.

**E. Abandon the weight split and mark everything "Universal Fit".** Rejected. It is the enum value
that exists for this, and it is precisely the claim our returns data contradicts. It also erases the
Black-versus-Pro distinction that the entire listing rewrite is built on.

---

## 5. Recommendation

**D.** Fill Black to capacity with genuinely light handsets, keep Pro at Megan's 48 and spend its
last 12 slots on the highest-volume heavy phones rather than whatever comes to hand.

The reasoning is asymmetry of error, the same principle William applied to bid steps on 08-10. A
missing model costs one filter appearance. A wrongly-listed heavy model costs a return, a likely
one-star review mentioning the exact weakness our reviews already mention, and it undermines the
product page's central claim. Those are not comparable costs, so the rule should be conservative at
the boundary: **anything within a few grams of 171 goes to Pro, not Black.**

**What NOT to do.** Do not use "Universal Fit". Do not pad either list with handsets nobody carries
to reach 60; capacity is a ceiling, not a target. And do not treat this as an SEO exercise, because
it is not a keyword field, so padding buys nothing except risk.

**Sequencing.** Ship Megan's validated 18 and 48 first, since they are correct and the two wrong
iPhone SE entries are live right now. Extend Black afterwards as a second pass. Correcting a false
claim outranks adding a true one.

---

## 6. Open questions, trade-offs accepted, rollback

**Open questions.**

1. **Where did 171 g come from, and does it hold for the 2-Pack and 3-Pack?** Those are the same
   clip, so presumably yes, but it has never been stated explicitly and all three currently share
   one list.
2. **Is the boundary tested?** iPhone X at 174 g and Galaxy S21 at 169 g sit either side by a few
   grams. Cord load capacity is still unconfirmed, which was already noted on 08-08 as the reason we
   cannot make a strength claim at all.
3. **Should Pro also carry the light models**, on the argument that a heavier-duty clip works fine
   on a light phone? It would double Pro's filter coverage. It also muddies the cross-sell and
   would exceed 60 entries.

**Trade-offs accepted.** Weights are taken from published manufacturer specifications, not measured
by us, so a handset listed a few grams under the line is trusting the spec sheet. Filling Black to
60 also means more entries to revise whenever Amazon adds handsets, and there is no automated way to
learn that a new token exists; discovery is by probe.

**Rollback.** Plain attribute, re-submittable. Previous values for all four ASINs are recorded in
the companion RBB.
