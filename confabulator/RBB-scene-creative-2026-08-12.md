# RBB — put the clip where phones actually get lost, and animate it

Written 2026-08-12 at William's instruction: *"i see phones now attached to reviews doesnt make much
sense maybe phone clips I mean random need ot put them in places they can be used holidays boats
subways taxis in all the areas people lose their phones with animation rbb"*

No build until this is agreed.

---

## 1. Problem

Today's creative is in one of two states and both are weak.

- **Photographed cards** show a person, and we own so few distinguishable people that the
  one-face-one-name rule caps us at six cards.
- **Product-led cards** show the hardware floating on paper with no context at all. William's read is
  correct: a clip next to a quote is *random*. It answers "what is it" and never "where would this
  have saved me".

Neither shows a **place where a phone gets lost**. That is the entire purchase trigger.

**Success looks like:** a set of short animated scenes, each one a real place where phones are lost,
each one showing our actual hardware attached to a real person or bag, and each one carrying a real
verbatim review or a single claim. Enough of them to run for weeks without repeating a location.

---

## 2. Industry standard, cited

**Where phones are actually lost.** The evidence lines up almost exactly with the places William
named, which is worth saying plainly.

- **Rideshare and taxis.** Phone is the **#1 most forgotten item** in Uber's 10th annual Lost & Found
  Index, with **over 1 million** reported. Phones peak on **Saturdays**; the peak window across all
  items is **9pm to midnight**; **St Patrick's Day, Halloween and New Year's Eve** rank highest of any
  days in the year. ([Uber Lost & Found Index](https://www.uber.com/us/en/newsroom/the-2026-uber-lost-found-index/))
- **Public transport.** **35%** of UK respondents who lost or had a phone stolen say it happened on
  public transport, the single most likely location.
  ([Insurance2go Phone Theft Abroad Report 2025](https://www.insurance2go.co.uk/about/news-blog/blog/phone-theft-abroad-report-2025))
- **Transit lost property.** Mobile phones are the most-lost item on public transport, **16,607 of
  68,929** lost-item reports in Dubai's RTA figures.
  ([Gulf News](https://gulfnews.com/uae/transport/mobile-phones-most-lost-items-on-public-transport-1.61373894))
- **Theft volume is rising.** Global smartphone theft reached **45 million incidents**, up 15% year on
  year; UK snatch thefts rose **153%** in a year to 78,000.
  ([Phone Theft Statistics](https://worldmetrics.org/phone-theft-statistics/))
- **Boats.** No hard frequency data exists, but the marine-safety write-ups are consistent about the
  moments: **boarding from the dock, tending fenders, netting a fish, climbing a swim ladder, passing
  gear into a dinghy.** Those are shot-list items, not statistics.
  ([AquaVault boaters guide](https://theaquavault.com/blogs/updates/waterproof-phone-protection-for-boaters))

**Why context imagery rather than product-on-white.** 2025 A+ guidance is consistent: the winning
pages answer *"why this product"* rather than *"what is this product"*, and the recommended image
order puts a **lifestyle context image in slot 2**, immediately after the main image. Reported
conversion lift for a well-built A+ page runs **3-10% typical, 20-30% for the strongest rebuilds.**
([Bluewheel](https://www.bluewheelmedia.com/blog/amazon-a-plus-content-in-2025-how-to-boost-conversions-seo-and-brand-visibility),
[Xena](https://xenaintelligence.com/ae/blog/amazon-a-content-in-2025-the-new-rules-for-higher-conversions),
[Rewarx photography standards](https://www.rewarx.com/blogs/amazon-listing-photography-standards-2026))

The same sources are explicit that the imagery should be **real people, real lighting, real settings**
rather than generated, which bears directly on option D below.

---

## 3. What we actually own, counted

Local library, `assets/source/`: **372 images, 42 videos**. Every shoot, counted:

| shoot | n | context it can honestly serve |
|---|---|---|
| Barcelona (Megan + William) | 167 | city street, café, arches, scooter, fountain |
| Oaxaca (Megan + Lindsay) | 77 | city street, colour walls, cathedral |
| Dec 10 | 27 | street, shoulder bag, denim jacket |
| Cozumel, 9 April | 8 | **open water, dock, phone held out over the sea** |
| Mexico Raw, Dec 2020 | 8 | denim waistband, clip detail, close |
| Feb 1st | 8 | **café table, drinks, phone resting** |
| Feb 22 | 8 | **beach, sea, shoreline** |
| March 6 | 8 | home, sofa, indoors |
| Jan 10th | 4 | **car interior, getting in and out** |
| Smadar DJI | 8 | **aerial, cliffs, open water** |
| studio pack shots | 21 | hardware on white |

**Contexts William named, against what exists:**

```
holidays / travel   OWNED    Cozumel, Feb 22, Smadar, Barcelona, Oaxaca
boats / water       OWNED    Cozumel 8 frames, Smadar 8 aerials
taxis               PARTIAL  Jan 10th is a private car, not a taxi
subways / transit   NONE     zero frames, zero video
festival / crowd    NONE     one 2022 FB ad video, no stills
snow / ski          NONE     appears only inside a composited listing image
```

A Drive sweep across every PA-named image and video (170 files) returns **0 for taxi, 0 for transit,
0 for snow, 0 for bike**. The gap is real, not a search failure. Note also that a global Drive search
for "yacht", "festival" and "holiday" returns hundreds of hits that are **Social Scene** assets, and
those are a different company's photography. They are not available to this project.

**What we know about animating.** Proven on 6 clips at $0.28 each:
- image-to-video from our own frame keeps **our** hardware; text-to-video invents a competitor's
- the cord renders clean when the hardware is **large in frame**, and degrades or vanishes when small
- the model honours mood and small gestures, **not** a specific direction

---

## 4. Options

**A. Animate only what we own.** 5 contexts: open water, beach, car, café, city street.
*Effort:* low, a day. *Cost:* ~$0.28 per 5-second clip, so under $10 for a full set.
*Impact:* covers holidays, boats and travel properly. *Trade-off:* no subway, no taxi, no festival.

**B. Pull the rest of Drive first.** Local holds 372 images; the AMZ1Step tree is far larger and its
files carry generic names, so a keyword sweep cannot see them. *Effort:* a few hours of crawling and
contact-sheeting. *Impact:* unknown, possibly zero, possibly the missing contexts.
*Trade-off:* may find nothing, but it is free and we have been wrong about this library twice.

**C. Composite our real clip into a bought or generated environment, then animate.** Keeps our
geometry because the hardware is a real cutout. *Effort:* high, and compositing that survives motion
is the hard part. *Cost:* stock licensing plus generation. *Trade-off:* looks fake if done badly, and
a subway shot with a pasted-in clip is worse than no subway shot.

**D. Generate whole scenes from text.** *Rejected.* It invents the product, and our own one-star
reviews already accuse our imagery of implying something the product does not do. Adding a
competitor's hardware to that page is the wrong direction.

**E. Shoot the missing contexts.** Truest. A subway, a taxi rank, a festival gate. *Effort:* a day
plus a model. *Cost:* real money against a business we are winding down.

---

## 5. Recommendation

**B, then A. Hold C, reject D and E for now.**

Do the Drive crawl first because it is free and because the operator's library has surprised us twice
already: `drive-images.mjs` reported 98 files when 2,764 existed, and the Barcelona set with our only
male model went unseen until today. Half a day there could close the taxi and transit gap for nothing.

Then animate what we own, in this order, because it follows the loss data rather than our
convenience:

1. **Car interior** (Jan 10th) — phone is the #1 item left in a rideshare, over a million a year
2. **Open water** (Cozumel) — the single most arresting frame we own, and boats have no data but a
   very clear moment
3. **Beach and coast** (Feb 22, Smadar)
4. **Café table** (Feb 1st) — the "set it down and walk away" moment two of our reviewers describe
5. **City street** (Barcelona, Oaxaca) — travel and crowds

**What NOT to do:** do not fake a subway. We have no frames and no honest route to one, and a
composited transit shot is exactly the kind of thing that reads as stock and undoes the trust the
real photography earns.

---

## 6. Open questions, trade-offs, rollback

**Open**
1. Subway and taxi are the two best-evidenced contexts and the two we cannot shoot. Accept the gap,
   or spend on C or E?
2. The Uber data hands us dated hooks: **Saturdays, 9pm to midnight, St Patrick's Day, Halloween, New
   Year's Eve.** Do we want seasonal creative built around those, or evergreen only?
3. Do we publish the specs we already own but have never used, 27-inch stretch, zinc alloy,
   strongest man-made fiber? Competitors publish a load rating; we publish nothing.

**Trade-offs accepted**
- Five contexts instead of eight.
- Animation stays 5 seconds and silent; Kling gives no audio and no directed motion.
- Everything is 2020-21 location photography, so wardrobe and phones read slightly dated.

**Rollback:** every asset is a file in `build/creative/`. Nothing touches the live listing or the ad
account, so rollback is deleting a folder. AI spend is capped by the Social Scene fal balance,
currently $6.57, and every clip is ledgered.
