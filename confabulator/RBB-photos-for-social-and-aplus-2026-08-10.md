# RBB: making our photography work for A+ content, social and video

2026-08-10. William: *"research how we can make these photos good for social and A+ content"*,
then *"and video too"*.

Research before build, per the standing rule. Nothing has been produced from this document yet.

---

## 1. Problem

We own 1,172 unique photos and 352 unique videos and the listing uses almost none of them. The
question is not whether the material is good enough. It is which frame belongs on which surface,
because the three destinations want three incompatible shapes:

| Surface | Wants |
|---|---|
| Amazon A+ | wide landscape, 970 x 600 (1.617:1) |
| Amazon detail page video | 16:9 landscape, 6 to 45 seconds |
| Instagram / TikTok | 9:16 vertical, 1080 x 1920 |

Success looks like a rule anyone can apply without asking: given a frame, which surface is it for,
and does it need a crop or a reshoot.

## 2. Industry standard

**Amazon A+ content.** Standard modules run 970 x 600 for the full-width header, 970 x 300 for
banners, 300 x 300 and 135 x 135 for grids and quadrants. JPEG or PNG. Standard A+ caps at about
2 MB per image; Premium A+ allows up to 5 MB and larger assets. Premium adds a video module at
1280 x 720 minimum and a Brand Story hero at 1464 x 625.

**A conflict in the sources, resolved.** One guide says "minimum 300 dpi", another says "save at
72 DPI". Both are noise. DPI is a metadata field describing intended print size; it has no effect
on how a browser renders an image. Only pixel dimensions matter. Ignore any advice framed in DPI.

**Amazon video.** Detail page video is 16:9, at least 1280 x 720 with 1920 x 1080 recommended,
6 to 45 seconds with 15 to 30 preferred. A+ video allows 15 to 60 seconds and requires Brand
Registry, which we have. MP4 or MOV, under about 500 MB, H.264 or H.265, 1 Mbps or higher, at
23.976/24/25/29.97/30 fps. Audio AAC, PCM or MP3 at **96 kbps minimum**, 44.1 or 48 kHz. No
watermark, and no logo in the first 5 seconds.

**Social.** Both TikTok and Meta Reels want 1080 x 1920, 9:16. The platforms differ on where their
own interface covers the frame:

- Instagram / Facebook Reels: safe zone 1010 x 1280, meaning 220 px clear at the top and 420 px at
  the bottom.
- TikTok: roughly 900 x 1400 centred, at least 370 px above the bottom edge and 180 px in from the
  right, because the engagement icons sit on the right rail.

Taking the stricter of each gives one safe box that works on both: **keep everything that matters
inside the middle 900 x 1280 of the 1080 x 1920 frame.** Build once, post twice.

**Our own rules on top.** PACR 46 requires the product on screen within 3 seconds. PACR 47 requires
burned-in captions, because most browsing is muted.

## 3. Reality, measured on our own files

338 photos measured directly, not sampled from filenames.

```
ASPECT RATIOS AS SHOT               RESOLUTION
  9:16 tall       194  57%            long edge  p50 6000   max 6016
  3:2 landscape    82  24%            short edge p50 4000
  4:5 portrait     56  17%            min long edge 1600
  other             6   2%
```

**Resolution is not a constraint anywhere.** At a median of 6000 x 4000, 24 megapixels, every photo
clears every target: 100% survive the A+ 970 x 600 crop, 100% survive Instagram feed at 1080 x 1350,
98% survive a full 1080 x 1920 vertical.

**Shape is the constraint, and it is severe.** Surviving a crop is not the same as surviving it
well:

```
  3:2 DSLR 6000x4000    -> A+ module 970x600   keeps  93% of the frame
  3:2 DSLR 6000x4000    -> IG feed 4:5         keeps  53%
  3:2 DSLR 6000x4000    -> Reel 9:16           keeps  38%
  9:16 phone 1080x1920  -> Reel 9:16           keeps 100%
  9:16 phone 1080x1920  -> A+ module 970x600   keeps  35%
```

A landscape frame forced into a Reel throws away 62% of the picture, and with it most of the
context that made the shot worth taking. The reverse is just as bad.

**The two finished videos, probed rather than assumed.**

```
  Paul Arnoldi testimonial   848x480 stored, rotation -90, so it DISPLAYS 480x848 vertical
                             72s, h264, 1.53 Mbps, audio AAC 65 kbps
  Megan Mann brand film      1920x1080, 24 fps, 63s, 19.8 Mbps, audio AAC 317 kbps, 159 MB
```

Three problems that a spec sheet alone would not have surfaced:

1. **The testimonial is rotated, not vertical.** The frame is stored landscape with a -90 rotation
   flag. Any ffmpeg edit that does not honour that flag outputs it on its side. This is the single
   most common way phone footage gets ruined in an automated pipeline.
2. **Its audio is 65 kbps, below Amazon's 96 kbps floor.** Re-encoding audio cannot add information
   that was never captured, but it does clear the stated minimum, and the source is speech at
   44.1 kHz so the loss is not audible.
3. **Both videos are too long for the detail page.** 72s and 63s against a 45 second limit. The
   Megan film is also over the 60 second A+ ceiling. Neither can be posted as-is anywhere on
   Amazon; both need a cut, not a re-encode.

At 480 x 848 the testimonial is also well under the 1080 x 1920 social standard. It is still the
most valuable video we own, because it is a real named customer and PACR 48 forbids synthesising a
replacement.

## 4. Options

**A. Crop everything to every format from the best frames.** One hero set, mechanically resized into
A+, feed and vertical. Cheapest. Produces the 38% crops above, so the vertical output is weak
exactly where social matters most.

**B. Route by source shape.** Landscape frames go to A+ and the detail page; tall frames go to
social. No frame is forced into a shape it was not composed for. Costs nothing extra, because we
already hold 194 tall and 82 landscape.

**C. Rebuild vertical frames from 24MP landscape originals.** At 6000 x 4000, a 9:16 crop still
yields 2250 x 4000, comfortably above 1080 x 1920. So a vertical crop is technically lossless in
resolution terms even though it loses framing. Useful as a fallback for a subject we only have in
landscape.

**D. Reshoot for vertical.** Highest quality, and unnecessary: we already have more usable tall
frames than we have slots.

**E. Extend the frame with generative fill to change aspect ratio.** Rejected. PACR 2 and 6 allow AI
to edit our own photography but not to invent product or scene content, and an outpainted background
around a product shot is invented content on an Amazon surface.

## 5. Recommendation

**Option B, with C as the named fallback.** The rule is one line and needs no judgement:

> Landscape frames go to A+ and detail page video. Tall frames go to social. Only when a subject
> exists solely in landscape do we crop it to vertical, and then we check the result rather than
> trusting the crop.

That check is not a formality. Building the peace-of-mind gallery today, two automatic crops failed
silently: anchoring to the top cut a subject's forehead off, and sharp's "most interesting region"
strategy locked onto a red dress and removed her eyes. **Automatic salience cropping is not safe on
faces.** Every crop through a face gets looked at.

Three concrete builds follow from this, in order of value:

1. **A+ modules from the 82 landscape frames.** 3:2 into 970 x 600 keeps 93% of the picture, so this
   is nearly a native fit. This also replaces modules 1 and 3, which currently sell the
   discontinued lanyard.
2. **A vertical social set from the 194 tall frames**, composed inside the 900 x 1280 safe box so one
   render serves Reels and TikTok.
3. **A 30 second detail page cut**, product on screen inside 3 seconds, burned-in captions, audio
   re-encoded to clear 96 kbps. Sources: the 11 installation clips at 1920 x 1080 and the Megan
   film.

**What NOT to do, and why.** Do not mass-produce vertical social assets by cropping the Barcelona
DSLR shoot. It is our best photography and 9:16 keeps 38% of it. Do not post either existing video
to Amazon unedited; both breach the length limit. Do not fix the testimonial's audio by upscaling
the bitrate and calling it improved, because re-encoding cannot restore what was never recorded.

## 6. Open questions, trade-offs, rollback

- **Trade-off accepted:** routing by source shape means some strong subjects will never appear on
  social, because they only exist in landscape. Option C covers the ones worth rescuing.
- **Trade-off accepted:** the 900 x 1280 safe box is the intersection of two platforms, so it is
  tighter than either needs alone. One render for both is worth the lost margin.
- **CLOSED 2026-08-10, by live API call.** We have **Standard A+ only**. Every one of our 11 A+
  documents returns `contentType: EBC` with `badgeSet: STANDARD`; not one carries PREMIUM. William
  confirmed we hold A+ with a registered trademark, and that is exactly what Brand Registry grants:
  Standard. Premium is a separate eligibility test we have not passed.

  Consequences, and they bind the build:
  - image ceiling is **2 MB**, not 5 MB
  - **no A+ video module.** Video has to go on the product detail page, not into A+
  - **no 1464 x 625 Brand Story hero**
  - the five module types we actually use are STANDARD_HEADER_IMAGE_TEXT, STANDARD_THREE_IMAGE_TEXT,
    STANDARD_IMAGE_TEXT_OVERLAY, STANDARD_COMPANY_LOGO and STANDARD_PRODUCT_DESCRIPTION

- **CORRECTION, same call.** Earlier today I recorded that the A+ alt text is Hebrew on a US listing
  and has been for two years, and I wrote that into Megan's document. **That was wrong.** The en-US
  document carries 7 alt texts and all 7 are English. The Hebrew (he-IL) and Spanish (es-US)
  documents are Amazon's own machine translations, flagged `GENERATED`, which Amazon serves to
  shoppers browsing amazon.com in those languages. That is normal, not a defect.

  What IS true, and is the smaller real problem: our English alt text is keyword stubs rather than
  descriptions. The live values include "Phone Tether", "sec" and "S". That is poor for screen
  readers and wastes the field, but it is a quality fix, not a broken listing.
- **Open:** the 59 raw Mexico clips and 11 installation clips have never been probed. Drive did not
  parse their dimensions, so orientation and rotation flags are unknown until each is downloaded.
  Given the testimonial's rotation flag, assume nothing about them.
- **Rollback:** everything here is additive. Assets are built into build/creative, which is
  gitignored, and nothing reaches a live listing without being uploaded by hand.

## Sources

- Amazon A+ module dimensions and file limits: teamzlab A+ content image guide, 2026
- Amazon A+ general requirements: soona, SellerSprite, greenonion, 2026
- Amazon video specs: The Sparkhouse, Emplicit, Goat Consulting, 2026
- Reels and TikTok safe zones: Ignite Social Media, House of Marketers, Kreatli, 2026
- Our own files: ffprobe and sharp, measured 2026-08-10
