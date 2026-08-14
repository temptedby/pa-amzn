# The creative build process

Written 2026-08-11 at William's instruction ("yes save this process"). This is the order of
operations for building any graphic or video for Phone Assured. It exists because every step below
was paid for with a specific failure, and the failure is named so the step is believable later.

Companion docs: `media-build-lessons-from-social-scene.md` (the craft, from the Social Scene agent),
`social-media-build-system-reference.md` (their system), `PACR-phone-assured-creative-rules.md`
(the rules), `RBB-professional-creative-and-video-2026-08-11.md` (why the pipeline is what it is).

---

## The order. Do not reorder it.

### 1. Inventory before building
Search for an existing builder before writing one. This repo had **nine** graphics builders on
2026-08-11 and five of them were written the previous day, on top of four that already existed.
`ls scripts/build-*.mjs scripts/pacr/build-*.mjs` takes two seconds.

### 2. Settle the structural constraint before touching taste
Six separate "cut face" complaints in the Social Scene history were **one geometry bug**. Ours was
the same shape: the 2023 studio library is **2500x2500 square** and A+ modules are 970x600
landscape. No amount of crop-tuning fixes that. The fix is structural and it is rule 3.

### 3. Size the media band FROM the source aspect. Never crop into a subject.
```js
const b = band(car, { h: 600 });   // 0.54 aspect source -> a 324px wide band, zero crop
```
The design carries whatever space is left. `scale=decrease` then pad, never `increase` then crop.
Cover is only allowed when the slot aspect and the source aspect are within a few percent, and only
after looking at the result.

### 4. Contact sheet BEFORE you choose anything
`node scripts/pacr/contact-sheet.mjs <srcDir> <out.jpg> [cols] [max]`, and for video extract a frame
every 2.5s first. This is the highest-leverage step in the whole process.

It found, in one pass over a video whose filename and metadata said nothing: a product lineup card
listing two **discontinued** products, a **"STRETCHES UP TO 27 INCHES"** card that is the Pro spec on
a Black listing, a **"CHOOSE OPTION WITH LANYARD"** card, and a model **wearing a neck lanyard**.
Old branding is pixels. No catalog field will ever warn you.

### 5. One renderer: HTML and CSS through headless Chromium
`scripts/pacr/render.mjs`. Not sharp with hand-written SVG. A layout engine gives real type, real
wrapping, leader lines, gradients and a grid for free; hand-computed SVG gives you arithmetic and
clipped words. Type is **Avenir Next**, longhand properties only.

> Never the `font:` shorthand. Chromium rejects the whole declaration if the family list contains
> `-apple-system`, dropping the size and the family together. The first build came out in 16px Times
> and every automated check passed.

### 6. The gate asserts, and each one exists because of a real defect
| Assert | Level | The failure that created it |
|---|---|---|
| text overflows its box (width strict) | **refuse** | a 46px headline at 1.06 leading overran its box |
| content runs off the CANVAS | **refuse** | module 05's two columns missed fitting by 2px, stacked, and the fourth answer fell off the bottom while every element still fit its own box |
| a text box intersects a face box | **refuse** | the most-repeated failure in the Social Scene log |
| output path under `/tmp` | **refuse** | nine approved assets were lost to a reboot; the registry still points at them |
| over the A+ 2 MB cap | step quality down, then refuse | Amazon rejects it outright |
| dead space over 34% | warn | "clean" and "empty" are not the same thing |

Every asset also writes a `.manifest.json` beside it holding every text box, face box and media box,
so review becomes arithmetic rather than taste.

### 7. Look at the pixels. A green check is not a pass.
This is not advice, it is the process. Read the rendered file back every single time.

Proven twice on the day this was written. The gate passed a render that was **entirely the wrong
typeface**, and passed module 05 **with a quarter of its content off the canvas**. No assert catches
a wrong font, and no per-element assert catches a container overflow until you write it. Both were
found by opening the image.

### 8. Verify a rendered VIDEO on the file, not on the command
```
  duration inside 6-45s (Amazon detail page) or 5-15s (social)
  dimensions and aspect exact
  audio bitrate >= 96 kbps
  frame 0 mean brightness > 25          <- frame 0 IS the carousel thumbnail
```
Use output seeking with a PTS reset (`-ss` before `-i`, plus `setpts=PTS-STARTPTS`) or you get a
black or duplicated first frame.

**This machine's ffmpeg (8.1.1) has NO `drawtext` and NO `subtitles` filter.** Captions must be
composited as image overlays. Check before building a pipeline on a filter.

### 9. Two masters, because the surfaces differ
```
  Amazon detail page   1920x1080  16:9   6-45s    product on screen inside 3s
  Social               1080x1920   9:16  5-15s    safe zone 900x1400 centred
```
A 16:9 source going to 9:16 gets a **blurred fill**, never a letterbox and never a crop.

### 10. Deliver by opening it, not by linking it
`open <dir>` in Finder **and** a browser tab on the review page. A link in a transcript is homework.
Video especially: a hosted review page can only show a poster frame.

---

## Content rules specific to this product

- **A+ may not quote customer reviews.** Social proof has to be warranty, longevity or fact.
- **Never claim strength or a load rating.** We have no measured number and three competitors publish
  one. William killed the "WEIGHT OF ANY PHONE" graphic on 2026-08-10.
- **Never show the phone retracting on its own.** The cord retracts, the phone is guided back. A
  2-star review names our own pictures as the reason for the misunderstanding.
- **The lanyard and wristband are discontinued.** They still appear in A+ modules, one live ASIN,
  48 Drive files and the source video.
- **Evergreen means** no price, no pack count, no date, no seasonal reference, no offer.
- Pillars, William 2026-08-11: **discreet**, and **backed for a year**. Not durability, not strength.

## The meta-lesson
Reuse beats rebuild. Settle the constraint before iterating on taste. Ship the slot and raise a
concern in one sentence rather than rebuilding on your own objection. And the operator's knowledge
is part of the inventory: when William says a thing is possible, the prior is that it is and you
have not found it yet. That was true of Drive write access today.
