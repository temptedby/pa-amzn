# RBB — Can we A/B test the listing copy, and does Amazon allow Megan's per-listing model split?

**Date:** 2026-08-19
**Asked by:** William: "doc updated for A/B testing please ... amazon allows this rbb"
**Trigger:** Megan restructured tab 2 into Option A / Option B titles plus an Item Highlight per
listing, on 2026-08-19.
**Status:** research only. Nothing uploaded. All title checks are live VALIDATION_PREVIEW
submissions against the real account, which apply nothing.

---

## 1. Problem

Megan has written two title options per listing and asked that we A/B test them. Two questions
have to be answered before that is a plan rather than an intention:

1. **Are the eight titles publishable at all?** A test needs both arms to be legal.
2. **Do we have the traffic to learn anything?** An A/B test that cannot reach significance is not
   a test, it is two months of half our shoppers seeing the worse version.

A third question rides along, from William's "amazon allows this": is Megan's approach of giving
Black and Pro **different compatible phone model lists**, and pointing shoppers from one to the
other in the copy, permitted.

---

## 2. Industry standard

**Amazon's own tool is Manage Your Experiments (MYE).** Three gates: Brand Registry enrolment,
sufficient ASIN traffic, and publishing rights on the content being tested. It splits traffic 50/50
between two versions of ONE element, runs 4 to 10 weeks, and declares a winner at 95% statistical
significance. Testable elements are the main image, title, bullet points, A+ Content, brand story
and product video. The commonly published floor is **at least 1,000 views per variant**, and the
guidance is explicit that low-volume SKUs will not qualify because they cannot reach significance
in a reasonable window.

Sources: [Amalytix MYE guide](https://www.amalytix.com/en/glossary/manage-your-experiments-mye/),
[Velocity Sellers 2026](https://www.velocitysellers.com/2026/06/04/amazon-manage-your-experiments-ab-testing-2026/),
[Keywords.am A/B testing guide](https://keywords.am/blog/amazon-ab-testing-guide/),
[Seller Sprite](https://www.sellersprite.com/en/blog/AB-Testing-Your-Amazon-Listing-Manage-Experiments-Guide).

**On compatibility data**, Amazon requires wireless accessory listings to carry compatible phone
model information on the detail page, on the stated grounds that it reduces returns and negative
reviews. It is a supported structured field, not a workaround.
Source: [Seller Central forums, ASIN compatibility](https://sellercentral.amazon.com/seller-forums/discussions/t/f375ccafb46aaba1723c3b2f552518d0).

**On statistical power**, the standard result is that required sample scales with the inverse
square of the effect you want to detect. Halving the effect size quadruples the traffic needed.
That is the arithmetic that decides this question, not opinion.

---

## 3. Codebase and reality

### 3a. Three of the eight titles are refused

All eight now fit 75 characters, which Megan fixed. But the twice-per-word rule still bites, and
**"Phone Assured" spends one of the two allowances for "phone"**:

```
                    chars   repeats     Amazon verdict
Black    Option A     72    phone x3    INVALID 100470
Black    Option B     73    none        VALID
2-Pack   Option A     73    phone x3    INVALID 100470
2-Pack   Option B     66    none        VALID
3-Pack   Option A     73    phone x3    INVALID 100470
3-Pack   Option B     67    none        VALID
Pro      Option A     70    none        VALID
Pro      Option B     70    none        VALID
```

**This matters more than it looks.** On Black, 2-Pack and 3-Pack one arm of the test is
unpublishable, so there is no test to run on three of the four listings until it is fixed.

One word fixes each, and all three then validate:

```
VALID 71  Phone Assured Retractable Phone Tether, Anti-Theft Cell Lanyard & Leash
VALID 72  Phone Assured 2-Pack Retractable Phone Tethers, Anti-Theft Cell Lanyards
VALID 72  Phone Assured 3-Pack Retractable Phone Tethers, Anti-Theft Cell Lanyards
```

The four Item Highlights all fit: 104, 115, 110 and 112 against the 125 cap.

### 3b. We cannot measure our own traffic, and that is a finding

`GET_SALES_AND_TRAFFIC_REPORT` returned **403 Unauthorized** again today, the same as on 08-03. The
app role is still ungranted, so sessions and page views are not readable from here. Any traffic
number below is derived, and is labelled as such.

**Derivation, from data we do hold.** Over 01 to 18 August: 550 measured ad clicks (516 Sponsored
Products, 34 Sponsored Display), $420.62 of ad-attributed sales against $1,022.59 total, so ads
carried 41% of sales and organic 59%. Scaling clicks by that ratio puts organic sessions near 790,
for roughly **1,340 sessions across all four ASINs in 18 days, about 2,230 a month.** Black is the
flagship and plausibly 55-65% of it, so **roughly 1,300 sessions a month.**

### 3c. What that traffic can and cannot detect

Baseline conversion on those figures is 85 orders / 1,340 sessions, about 6.3%. Required sample per
arm, 95% confidence and 80% power:

```
effect to detect        per arm      both arms    months on Black
+50% relative CVR         ~950         ~1,900        ~1.5   feasible
+30% relative CVR       ~2,600         ~5,200        ~4.0   over the 10-week cap
+20% relative CVR       ~5,900        ~11,900        ~9.0   impossible
```

**A title-versus-title test is the wrong thing to spend this on.** Two competently written titles
do not differ by 50% in conversion. The only changes plausibly that large are the main image or a
full A+ rebuild, which is also where our biggest known deficit sits: all eleven A+ documents are the
same seven 2023 images.

### 3d. Megan's model split is allowed, and is the strongest thing in her draft

Confirmed in the live schema. All four SKUs are `CELL_PHONE_HOLSTER`, and Megan's lists go into the
supported compatibility field: 18 models on Black, 2-Pack and 3-Pack capped at the 171 g line, and
50 on Pro covering Pro, Plus, Max, Ultra and Pixel. Amazon asks for exactly this on wireless
accessories. Pointing from Black to Pro in the description is ordinary own-brand cross-referencing
by product name, not an ASIN code, so it does not touch the ASIN-creation policy. Nothing here is a
grey area.

---

## 4. Options

**A. Run MYE on the titles now.** Blocked on three listings until the Option A fix lands, and even
then can only prove a 50%+ effect. Two months for a near-certain "no significant difference".

**B. Fix the three titles, ship one version everywhere, do not test titles.** Cheapest, gets
Megan's work live this week, keeps the experiment slot free.

**C. Fix and ship, then spend the one experiment on the main image or A+.** Same as B, plus the
test goes where an effect large enough to measure might actually exist.

**D. Wait for the Sales and Traffic role to be granted, then decide on measured traffic.** Correct
in principle. The role has been ungranted since at least 03 August with no movement.

**E. Do not use MYE at all; judge by before-and-after.** Rejected. August already shows why: ad
spend tripled and units moved 1.26x, so period-over-period comparison on this account is dominated
by whatever advertising did that week.

---

## 5. Recommendation

**C.** Fix the three Option A titles, publish, and hold the experiment slot for the main image or
A+ Content rather than spending it on two similar titles.

On which title version to publish, the structure has changed the answer. Now that Item Highlights
carries 125 characters and is indexed equally with the title, the two fields should do different
jobs: **title carries the search phrases, highlights carries the benefit and use-case language.**
Megan's Option A is the search-dense one and her Item Highlights are already written in benefit
language, so A-plus-highlights is the coherent pairing. That is a recommendation, not a decision;
the wording is Megan's call.

**What NOT to do:** do not run a title A/B test as the first experiment, and do not report an MYE
result as meaningful if it closes below 95%.

---

## 6. Open questions, trade-offs accepted, rollback

**Open questions.**
1. Is MYE actually visible and eligible for our ASINs? Seller Central states this per ASIN and it
   takes a minute to check. It needs William logged in and has not been looked at.
2. Does `item_highlights` exist in the Seller Central UI? The API says it does not exist on our
   product type: probing it returns warning `90000900`, "does not belong ... we are ignoring the
   value", which is a **silent discard, not an error**. Amazon usually ships the UI before the API
   schema, so the UI may already have it.
3. Which title version ships, A or B. Megan's call.

**Trade-offs accepted.** The traffic figure is derived from ad-attributed share, not measured, and
could be wrong by a wide margin in either direction; the 403 is the reason and it is named rather
than smoothed over. Shipping one title without testing means we will not know if the other was
better, which is the honest cost of not having the traffic to find out.

**Rollback.** Listing copy is reversible: the previous values are recorded and can be re-submitted.
An MYE experiment can be stopped early from Seller Central at any point.
