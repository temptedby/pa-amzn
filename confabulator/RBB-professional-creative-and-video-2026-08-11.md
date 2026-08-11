# RBB: a professional look, updated information, and video

**Date:** 2026-08-11
**Asked by William:** *"i want more professional look and feel with updated information video and graphics rbb"*
**Status:** research complete, nothing built. Six steps per the standing rule.

---

## 1. Problem

Three separate problems arrived in one sentence, and they need separating because they have
different fixes and different costs.

**1a. The assets we built on 08-10 do not read as professional.** William: *"we created some
content yesterday but not clean o professional enough"*. That is a fair verdict and the causes are
specific, not vague. Looking at `build/creative/aplus-v2/01-water.jpg` and `02-product.jpg`:

- **The type is system Helvetica.** No typeface was chosen, so the default was inherited. Every
  competitor A+ uses a set face with a display weight.
- **Labels do not connect to what they label.** In `02-product.jpg` four pills sit stacked at the
  left edge naming RETRACTING REEL, LOCKING CARABINER, QUICK RELEASE CLIP, TETHER TAB while the
  hardware sits at the right. Nothing joins a word to a part. A professional callout uses a leader
  line or a numbered dot on the part itself.
- **The pills are ragged.** Four different widths, left-aligned, so the right edge is accidental.
- **The scrim is a flat rectangle, not a gradient.** In `01-water.jpg` there is a visible hard edge
  at the top of the caption bar. It reads as a subtitle burn-in.
- **No brand mark anywhere**, and no shared grid between modules, so five modules do not read as
  one document.

**1b. The information on the listing is out of date, and one part of it is causing returns.** This
is the more expensive problem and it was not on the list until the research found it.

**1c. Video: we have one, the field has up to seven.** Not zero, which I had assumed. Ours is a
single video; Oaridey (Overall Pick, 1K+ units/month) carries 7.

**Success looks like:** a module set that a stranger would believe came from a design studio, built
on facts that are true in 2026, plus a detail-page video that answers the two objections Amazon's
own review summary says are our biggest.

---

## 2. Industry standard, read directly off Amazon rather than from blogs

All of this was read on 2026-08-11 in a browser, on live listings.

### 2a. The main image: we are the only one with no person and the only one with a badge

Amazon showed our own listing inside a competitor carousel on the Oaridey page, so this is a
like-for-like comparison at the size a shopper actually sees.

| | main image | price | rating | reviews |
|---|---|---|---|---|
| **Phone Assured** | **hardware only + "1-PACK" badge, phone is a gradient render** | $9.49 | 3.8 | 480 |
| Oaridey `B0GLXVT1JT` | hardware left + woman using it, cord visible | $14.44 (-15%) | 4.3 | 136 |
| Retractable Phone Tether | hardware left + woman using it | $13.99 | 5.0 | 1 |
| Magnetic Anti Theft | hardware left + man's hand + bag | $19.99 | 4.5 | 14 |
| Pulpo | blue harness on phone + man holding it | $14.99 | 4.0 | 690 |
| Retractable 37.4" Steel | hardware only, **part labelled in-image** | $11.99 (-20%) | 5.0 | 6 |
| Cell Phone Lanyard (Amazon's Choice) | hardware + phone, parts spread | $11.99 | 4.5 | 87 |

Findings:

- **Five of seven show a person.** We do not.
- **We are the only listing carrying a pack-count badge** in the main image. "1-PACK" is packaging
  language and it occupies the largest single area of our most valuable image.
- **We are the only one whose phone is a stylised gradient render** rather than a photographed
  device.
- Even the two hardware-only competitors **label a part inside the image** ("PHONE TETHER TAB").
- Five of seven run a strike-through list price with a percent badge. We run none.

### 2b. Titles state a number and a material. Ours states neither

```
  Oaridey     ... Retractable Steel Cell Phone Lanyard with Heavy Duty Carabiner and 360 Metal ...
  competitor  ... with Cut-Resistant Steel Cord ...
  competitor  Retractable 37.4" Steel Phone Strap ...
  competitor  ... Strong 31" Retra...
  Pulpo       ... Retractable Dyneema Tether ... Fits Smartphones up to 6.8 Inches ...
  US          Phone Assured Retractable Phone Tether - Durable Clip-On Leash for Anti-Drop & Anti-Theft Security
```

Every competitor names a material (steel, Dyneema) or a measured number (37.4", 31", 6.8 inches).
Ours names neither. "Durable" is the weakest word in the set because it is unfalsifiable.

### 2c. Video, measured on the page

Oaridey carries **7 videos**. One observed on their page runs **0:40** and the player's CC button is
lit, meaning it carries a real caption track, not burned-in text alone.

Amazon's detail-page video spec, as previously verified: 16:9, at least 1280x720, 6 to 45 seconds,
MP4 or MOV, H.264/H.265, AAC audio at 96 kbps or better. Their 0:40 sits just inside the 45 second
limit, which suggests the limit is the design target, not a constraint they are fighting.

### 2d. Amazon now writes the objection for the shopper, in Amazon's voice

The single most important paragraph on our listing is not ours. Amazon generates it from our reviews
and prints it above every review:

> "Durability and retraction are significant concerns, with multiple customers reporting the string
> breaking after weeks of use and the tether stopping to retract. Value for money receives mixed
> reviews, with several customers considering it not worth the price."

Amazon's own sentiment tags, with counts:

```
  Durability      58     <- largest topic, negative
  Retractability  42     <- second largest, negative
  Protection      38
  Quality         36
  Functionality   34
  Secure hold     28
  Ease of use     16
  Value for money 15
```

Amazon's Alexa panel on our page offers shoppers these questions to ask: *"Can it be used with a
phone case?"*, *"Does it come in different lengths?"*, *"Is the clip removable?"*, *"Can it be
attached to a belt loop?"*, **"Is this product durable?"**. Amazon is surfacing the doubt itself.

---

## 3. Codebase and reality

### 3a. Two customers say our IMAGES caused their bad review

This is the finding that changes the priority order. Both are verbatim from the live listing.

**Dean Creech, 2 stars, 2026-03-28, "Phone does not stay retracted":**

> "My first impression when looking at the pictures for this device is that, like for a key clip,
> the clip could hold the phone in a retracted position, under its full weight. But, that is not the
> case. **Looking back at the pictures now they never show the clip fully supporting the weight of
> the phone. But, they are close enough to showing it supporting the weight of the phone that it
> gave me that impression.**"

He is describing our creative, correctly, and docking three stars for it. This is the exact failure
mode already recorded in memory as *the tether does not retract the phone*, now with a customer
quote attached.

**Tyler, 2 stars, Canada, 2025-02-22, "Not as described":**

> "Doesn't come with a lanyard!"

**Our main image shows a lanyard.** The wristband and necklace lines were discontinued (William,
2026-08-09). The image promises an item that is not in the box.

**Noreen Williams, 3 stars, 2026-02-16, titled "Great for ID badges or Earbuds, but NOT for a
Smartphone"** repeats Megan's badge-holder verdict in a customer's own words, in a review title that
every shopper sees.

So: three of the eight reviews Amazon chose to show first are about the creative, not the product.

### 3b. The compatibility field is four years stale

Read live off the detail page:

```
  Compatible Phone Models:
  Moto G Power XT2041, Samsung Galaxy S20, Samsung Galaxy S22, Samsung Galaxy S22 Plus,
  Samsung Galaxy S22 Ultra, iPhone 11 Pro, iPhone 13 Pro, iPhone 7 Plus
```

Eight phones. The newest is the Galaxy S22, released early 2022. **No iPhone 14, 15, 16 or 17. No
current Samsung, no Pixel at all.** This is the structured field Amazon uses to answer "will it fit
my phone", and Pulpo has filled theirs properly. Amazon's own Check Compatibility widget currently
answers "Fits this device: Apple iPhone 16" by inference, with no help from us.

We already did this work: the 171 g BLACK / PRO weight line and the fourteen qualifying models were
established on 2026-08-08. It has never been written to the listing.

### 3c. We are in the wrong category

```
  Phone Assured   Cell Phones & Accessories > Cases, Holsters & Sleeves > Holsters
  Oaridey         Cell Phones & Accessories > Accessories > Lanyards & Wrist Straps
```

We are filed as a **holster**. Amazon's own Alexa panel on our page asks *"Why choose Securisee phone
holsters?"* because that is what the browse node says we are.

Related: `Material: zinc alloy`. The search page's Material filter offers Alloy Steel, Aluminum,
Metal, Nylon, Plastic, Polyester, Stainless Steel. "zinc alloy" matches none of them, so we are
excluded from every material refinement a shopper can click.

### 3d. What we can actually build with, locally

```
  assets/source/                375 files total
    _faces/                     265   people, usable for the gallery work
    _lifestyle/                  74
    Final Pro Clip Images/        8   2023 studio package
    Final Black 1 Clip Images/    8   2023 studio package
    Final EBC/Individual Modules/ 7   the live A+ modules
    Megan Updated Images/         4
    Testimonials/                 1   Paul Arnoldi, 848x480 rotate -90, 72s, audio 65 kbps
    Final Video/                  1   Megan Mann, 1920x1080 h264 24fps, 63.3s, audio 317 kbps
```

Probed with ffprobe today. Both videos fail the 45 second detail-page limit (72s and 63s). The
testimonial also fails the 96 kbps audio floor at 65 kbps and carries a rotation flag rather than
true vertical pixels. **The Megan Mann film is 1920x1080 H.264 with clean audio, so it needs a cut,
not a re-shoot.**

The other ~352 videos and ~1,100 photos are in Drive and have never been downloaded. Only metadata
was crawled on 08-10.

### 3e. Why the current build pipeline produces generated-looking output

`scripts/pacr/build-set-v2.mjs` composites with `sharp` and hand-written SVG strings. That means
every typographic decision is arithmetic I do by hand: I measured pill width as `size * 0.72 + 1`
per character and it still clipped once. There is no line-breaking, no kerning, no baseline grid,
no font loading. `playwright` **1.60.0 is already installed** and already used by seven scripts in
`scripts/`. A headless Chromium screenshot gives a real layout engine for free.

---

## 4. Options

| # | Option | Effort | Impact | Trade-off |
|---|---|---|---|---|
| 1 | Keep sharp/SVG, tune the tokens | 2h | low | Same class of output. The faults in 1a are structural to hand-built SVG, not a tuning problem. |
| 2 | **Render through Playwright/Chromium from HTML+CSS** | 4h | high | Real type, real grid, leader lines in CSS, one stylesheet across A+ and social. Adds a browser to the build. |
| 3 | Send the brief to Megan and buy design | days | high | Best ceiling, but slow, costs money, and the goal is to wind the business down. |
| 4 | Use the 2023 studio package unedited, add nothing | 1h | medium | Already professionally lit. But it carries the discontinued lanyard in 46 of 84 files. |
| 5 | Fix the information first, creative second | 3h | **highest** | Compatibility list, category, material, and the lanyard in the main image are causing returns and 2-star reviews today. Slower to look at. |

For video specifically:

| # | Option | Effort | Impact | Trade-off |
|---|---|---|---|---|
| V1 | Cut the existing Megan Mann film to 45s | 1h | medium | Source is already 1080p with clean audio. Fastest route to a compliant second video. |
| V2 | Build a new 30s film from Drive clips | 4h + download | high | Needs the 352 clips pulled down first. Full control of the first 3 seconds. |
| V3 | Repair and post the Paul Arnoldi testimonial | 2h | medium | Only real named customer we own. But 848x480 is under the 1280x720 floor, so it cannot go on the detail page at all. Social only. |

---

## 5. Recommendation

**Do 5 and 2, in that order, and V1 for video. Do not do 3.**

**First, fix what is generating bad reviews.** Three of the eight reviews Amazon shows first are
about the creative rather than the product, and one names the images explicitly. No amount of
polish helps while the main image shows a lanyard we do not ship and implies a retraction that does
not happen. Specifically:

1. Remove the lanyard from the main image, and remove the "1-PACK" badge.
2. Rebuild the compatibility field from the 08-08 weight research: current iPhones and Samsungs, not
   an S22.
3. Add a module that says plainly what the spring does and does not do, in Dean Creech's terms.
   Bullet 1 already contains this sentence and no shopper reads it, because the picture says
   otherwise.

**Second, move the renderer to Playwright.** Every fault in section 1a is solved by a layout engine:
CSS gives a real type scale, `position: absolute` leader lines from a label to a part, a gradient
scrim in one declaration, equal pill widths from a flex row, and one stylesheet shared across all
five A+ modules so they read as a set. Four hours, and it makes every future asset cheaper.

**Third, cut the Megan Mann film to 45 seconds.** It is already 1920x1080 H.264 with 317 kbps audio,
so it clears every Amazon requirement except length. That is a cut, not a shoot, and it takes us
from one video to two while the Drive download runs in the background.

**What NOT to do:** do not commission new photography, and do not build the AI testimonials asked
for on 08-10. We hold 1,172 unique photos and 352 videos, and Amazon has been removing AI-generated
review content; with Durability and Retractability already our two largest negative topics, a
synthetic testimonial is the worst possible risk. The Paul Arnoldi film is the honest version and it
is real, but at 848x480 it is social-only.

**And do not chase the rating with creative.** 3.8 with 22% at one or two stars is the ceiling on
everything above. Creative can stop us manufacturing new bad reviews, which is worth doing today,
but it cannot lift the existing average.

---

## 6. Open questions, trade-offs accepted, rollback

**Open, and yours to decide:**

1. **The main image is the highest-value change and the riskiest.** Changing it on a listing with
   480 reviews and 8 years of history can move rank in either direction. Recommend building it and
   showing you before anything is written live.
2. The browse node move from Holsters to Lanyards & Wrist Straps is a support case, not an API call.
3. Material "zinc alloy" needs to become a term Amazon's filter recognises, which needs to be true
   of the actual part.
4. The strength number is still unmeasured. Three competitors publish one. A kitchen scale settles
   it and it unblocks PACR 44 and the whole "is it strong enough" objection.

**Trade-offs accepted:** Playwright adds a browser to the creative build, which is slower per asset
than sharp and needs Chromium present. Accepted because correctness of type and layout is the whole
point. Cutting Megan Mann to 45s loses a third of a film we own; accepted because an over-length
video cannot be uploaded at all.

**Rollback:** every asset is written to `build/creative/` and nothing goes live without William
seeing it. The listing fields have a recorded prior state and can be written back. No account write
is part of this plan.

---

# Addendum, same day: three corrections from William, and the DES method

## Correction 1: the main image does not show a lanyard

I claimed it did, in section 3a, on the strength of Tyler's 2-star review plus a loop shape. I then
zoomed the live main image. What is actually there:

```
  the phone, with the cord running from its lower edge
  the reel unit with its carabiner
  a connector piece with a cord loop
  a second reel
```

**No neck lanyard.** The phone clip leads the stack, exactly as William said. Tyler's "Doesn't come
with a lanyard!" is Tyler's expectation, most likely off the word "Leash" in our title or the
Holsters browse node, not a promise our image makes.

What survives from 3a unchanged: Dean Creech's review still says our pictures implied retraction,
and that quote is verified. And the image still carries a "1-PACK" badge as its largest element, a
gradient render instead of a photographed phone, and no person.

## Correction 2: the angle is discreet plus warranty, not durability plus retraction

William: *"instead of durability and retractability, we have those things, but we want to say that we
focus more on being discreet, so it doesn't distract from your personal belongings. And we stand
behind our product, so reliability with our warranty and try to spin that."*

This is the better read and it inverts my section 2d recommendation. Durability and Retractability
are Amazon's two largest negative tags, so leading on them argues on the buyer's doubt, on their
ground. Discreet is a claim only we can make credibly: it is our differentiator per
`discreet-positioning-2026-08-06.md`, no competitor claims it, and it is the one thing the product
genuinely does better than a steel cable. Warranty converts "will it last" from a promise into a
term, which is the only honest answer to a durability doubt.

**So the creative pillars are: discreet, and backed for a year.** Not "strong".

## Correction 3: we own hundreds of videos

My phrasing was wrong. **One video is published on the listing. 352 sit in Drive, uncut and never
downloaded.** The gap is publishing, not owning. William: *"We need to cut and edit them."*

---

## The DES method, read from the source

William: *"learn from the DES agent on how to do graphics and videos. It does a great job for our
social media and for our event pages for Social Scene."*

Read `social-scene/research/graphic-design-playbook.md` (175 lines, a two-month feedback log of
William's own verdicts) plus the video specs and the QA filter spec, and the renderers in
`dynamic-event-suite/scripts/`.

### The diagnosis there is identical to ours

> "Our flyers keep reading as 'a photo with a frame and text.' Everything is stacked in tidy
> symmetric horizontal BANDS, the photo is trapped in a rectangle, there's no layering, no depth, no
> single dominant focal point, no asymmetry. That's decoration, not composition."

That is exactly `01-water.jpg`: photo, scrim band, headline. And the first rule in the log, dated
2026-06-05, is the one we broke:

> "text-on-photo composites, VERDICT: 'you didn't design anything'. RULE: never just overlay text on
> a full-bleed photo."

William reached the same verdict on PA creative on 2026-08-10 that he reached on Social Scene
creative on 2026-06-05. The answer already existed and I did not go and read it.

### The locked recipe, earned over eight rounds of his verdicts

```
  designed background (gradient + depth, NOT flat colour, NOT a flat photo)
    -> midground design layer
      -> real cut-out subject, forward-facing, open-eye smile, waist-up, with a grounding shadow
        -> giant knockout headline interleaved, weaving behind AND in front, clearing ALL faces
          -> readable caption bar on a dark scrim
            -> CTA with real contrast against its neighbours
              -> grain overlay for tactile depth
```

Hard rules from the log, all of which apply to us unchanged:

- **Every graphic must feature real people or the real product.** No pure text-on-background pieces.
- **Text never on a face.** Repeated five times in the log and still violated; it is the single most
  common failure.
- **No dead space.** Empty zones read as "built in Canva".
- **No tiny line-art icons.** Either nothing, or big real elements.
- **Two to three fonts maximum**, one display plus one readable.
- **Template variety is non-negotiable.** Never the same layout twice in a batch.
- **Never reuse a source photo across assets**, enforced by a registry keyed on a fingerprint, and
  register the output design too, not just the input.
- **Dramatic scale contrast** is what reads as designed. One element huge.

### The stack, which is the stack I proposed in section 4 before I read this

`social-scene-flyer-v5.ts`: HTML and CSS to headless Chromium via Playwright, real webfonts,
images inlined as base64 data URIs, grain from an SVG feTurbulence at 6% opacity in overlay blend,
gradient type via `background-clip: text`.

`social-scene-render-wig-video.ts`: **Playwright frames to ffmpeg H.264.** Photos preprocessed
through sharp, CSS-driven animation, 15 fps.

Cut-outs come from `fal-ai/birefnet` over HTTP. `fal.run` is reachable from this machine, but
**PA-AMZN has no FAL key in `.env.local`**. That is the one dependency this plan does not already
hold.

### The QA gate, which is the part worth stealing outright

`graphic-qa-filter-spec.md` makes one move that turns creative review from taste into arithmetic:

> "We render flyers in HTML/CSS so we KNOW the text boxes, logo box, person box, exact colours.
> Emit that manifest alongside the PNG. It converts the flaky CV checks into DETERMINISTIC asserts."

Detect faces on the clean cut-out, then assert the known text zones clear those face boxes. That is
deterministic text-over-face detection. PACR is already a pre-build gate emitting a pass token, so
the manifest slots straight into it.

### Video specs, and where ours must differ

DES masters at **1080x1920, 9:16, H.264, 30 fps, 12 Mbps, AAC 128k, +faststart**, clips of 5 to 15
seconds, hook in the first 1 to 2 seconds, captions always burned because most viewers are muted,
horizontal sources reframed with a blurred fill so a face is never cropped.

**Amazon's detail page is different and needs its own master: 16:9, at least 1280x720, 6 to 45
seconds.** So we produce two, from the same cut:

```
  Amazon detail page   1920x1080  16:9   20-45s   product on screen inside 3s (PACR 46)
  Social               1080x1920   9:16   7-15s   safe zone 900x1400 centred
```

The ffmpeg recipes in the guide are directly reusable, including the blurred-fill reframe and the
caption burn with `MarginV` lifting text clear of the platform UI.

---

## Revised recommendation

1. **Get a FAL key into PA-AMZN** (William's, or copied from DES with his say-so). It is the only
   missing dependency for cut-outs, and cut-outs are the centre of the recipe.
2. **Port the DES renderer**, not the idea of it: HTML and CSS through Playwright, with a build
   manifest emitted for the PACR gate to assert against.
3. **Rebuild the A+ set on the locked recipe**, with discreet and warranty as the two pillars.
4. **Download the Drive video library and cut it**, producing both masters per clip.
5. **Start the registry on day one.** DES learned the reuse rule the expensive way, twice.

Nothing here needs new photography, new footage, or a designer.
