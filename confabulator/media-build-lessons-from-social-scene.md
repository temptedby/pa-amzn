# Building video and graphics: lessons carried over from Social Scene

Written 2026-08-11 for the PA-AMZN context, at William's request: "create a memory document for
PA-AMZN to read and get better at editing videos and graphics, what you have learned and how you
build yours."

This is not theory. Every rule below is here because a specific build failed in a specific way,
usually in front of William, and the failure is named so the rule is believable. Social Scene ships
4 social posts plus a nightcap plus 3 YouTube and 3 TikTok cuts every single day, so these were
earned across a few hundred renders.

Amazon media is not identical to social media, and where the difference matters I say so. The
craft failures are the same everywhere.

---

## 1. The single biggest lesson: build the frame to the footage, not the footage to the frame

**The failure.** Three slates were rejected in one day, nine rebuilds across five hours, on notes
that all sounded different: "faces are cut off", "the square box is very small", "still chopping
off this guy's face", "we shouldn't start a clip like this". They were one bug. The entire 2023
source library is **1080x1080 square**, and every builder was fitting a square source into a
landscape or 9:16 frame. Biasing the crop just moved *which* part of the head got sliced.

**The fix, and it is structural.** Size the media band FROM the source aspect and centre it in
whatever space is left. Never crop the subject to fill a frame. If the aspect does not fill the
canvas, the *design* carries the remainder: a headline, a numeral hero, a text panel, a quote block.

**For Amazon specifically.** Main listing images have a hard requirement of a pure white background
(RGB 255,255,255) with the product at ~85% of the frame. That is a **contain-and-pad** problem, not
a crop problem, and it is exactly the same discipline. A product shot cropped to fill will clip the
product and fail Amazon's own image checks. Pad to the required aspect, never crop into the subject.

```python
# The pattern. scale=decrease then pad, never scale=increase then crop.
# decrease + pad  -> nothing is ever cut, you get bars you can fill with design
# increase + crop -> fills the frame and slices whatever is at the edges
vf = "scale=w=1600:h=1600:force_original_aspect_ratio=decrease," \
     "pad=1600:1600:(ow-iw)/2:(oh-ih)/2:white"
```

---

## 2. A green automated check is not a pass. Look at the pixels.

This one cost the most credibility, twice.

**Failure A.** I reported 60 Google Ads graphics "all clean" from an audit that measured DOM boxes.
William opened the browser and immediately found multiple cut-off heads. A head sliced by an
`object-fit: cover` crop is a **pixel** problem and is completely invisible to a layout audit.

**Failure B.** After building a face-safety scanner, it PASSED all 17 candidate frames including
ones with sliced heads. Why: **a face cut at the top is not detected as a face at all**, so the
detector reports "fewer faces than the source" rather than "cropped face". A gate that is blind to
the defect it exists for is worse than no gate, because it manufactures confidence.

**The rule.** Extract the actual frame, open the actual file, look at it. For anything going to a
customer, render a contact sheet and look at it before shipping. Automated checks catch regressions;
they do not certify quality.

---

## 3. Frame 0 IS the thumbnail. Treat it as a publishing surface.

On Instagram, TikTok and YouTube, `t=0` becomes the grid thumbnail. We shipped a black first frame
more than once, and once shipped a nightcap whose first frame was a still from that same day's 11am
post, so the recap read as the same post published twice.

**Two things that actually go wrong:**

1. **Input vs output seeking.** `ffmpeg -i in.mp4 -ss 5` decodes from zero and can leave a black or
   duplicated first frame. Use **output seeking plus a timestamp reset**:
   ```bash
   ffmpeg -ss 5 -i in.mp4 -t 9 -vf "setpts=PTS-STARTPTS" -af "asetpts=PTS-STARTPTS" out.mp4
   ```
2. **Nobody checks it.** Measure it, do not assume:
   ```bash
   ffmpeg -v error -ss 0 -i out.mp4 -frames:v 1 t0.jpg
   # then assert mean brightness > ~25; black is < 10
   ```

For Amazon video, the poster frame is what shows in the listing carousel before play. Same rule.

---

## 4. Contact sheet BEFORE you build. This is the single biggest time saver.

**Measured on one day.** The 11am post took FOUR rebuild cycles: a back-of-head thumbnail, a head
clipped by the crop, an old end card, then the dissolve out of that end card. Every one was
discovered only *after* rendering, because I picked time windows from three or four sampled frames
and guessed the gaps.

The 1pm post the same day took **ONE render**, because I built a dense contact sheet every 2.5
seconds first and chose windows I had actually seen.

**Four to one.** Sampling is cheap, rendering is 10 to 60 seconds a go. Sample densely, label each
tile with its timestamp, assemble into a grid, and LOOK at it before cutting anything.

```python
# label the tile with its timecode or the sheet is useless for picking in/out points
d.text((4, 3), f"{t}s", fill=(255, 220, 60), font=font)
```

---

## 5. Old branding is pixels, so no metadata field can warn you

Every clip in one library carried a dead domain burned along the bottom and an old logo top-left,
through the whole body, not just the intro card. None of that is visible in any catalog field, any
tag, any filename. The same sweep turned up a burned-in typo, a burned-in subtitle that must never
post, and background signage for brands we no longer work with.

**For Amazon this is sharper, because it is a compliance issue, not just taste.** Amazon main images
prohibit text, logos, watermarks, badges, borders and inset imagery. A stock photo or a supplier
asset with a watermark or a competitor's mark in the corner is a listing suppression, not a style
note. Crop it out or pick a different asset. Never rely on a filename to tell you what is in a frame.

**Crop beats banner** when you can afford the pixels. A banner has to be fully opaque and tall
enough; at ~5% translucency the old text bleeds through and reads as a mistake.

---

## 6. Verify the artifact, never the filename

I placed what I believed was a product bottle cutout next to another product. William: *"why do you
have a QR code for [brand A] in Binny's with a bottle from [brand B]?"* The file was a photograph of
a shelf QR code. I had selected it by its filename and never looked at the pixels. An audit of that
directory found 5 of 40 files were QR codes rather than products.

**A filename is a claim made by whoever saved the file. The pixels are the fact.** For Amazon, where
the image IS the product page, this is non-negotiable.

---

## 7. Audio: measure it, and do not trust "no sound"

Two separate lessons collided here.

- **Target −16 to −19 dB mean.** Bare room ambience measures around −22 dB, which is genuinely
  inaudible on a phone. Verify: `ffmpeg -i out.mp4 -af volumedetect -f null /dev/null`
- **"No sound" was a stale browser cache.** The file carried audio at −18.3 dB the whole time. I had
  rebuilt it under the same filename and Chrome served the cached copy. I nearly re-encoded a file
  that was already correct.

Also: a builder silently carried `-an` and stripped audio from a **testimonial**, where audible
speech is the entire point. Check that audio survived every processing step, not just the first.

---

## 8. Cache-bust every review URL

Republishing a review page to the same path serves the reviewer a stale build. This wasted William's
time repeatedly, and once had him approving a two-hour-old render.

```python
v = int(os.path.getmtime(video))     # or just int(time.time())
src = f"{name}.mp4?v={v}"
```

---

## 9. Composite with ffmpeg. Do not reach for AI video where there is type or a face.

AI image-to-video warps text and faces. Our motion engine deliberately composites layers instead,
which is why product labels stay crisp and readable.

**The structural trick worth stealing:** keep the build **layered, not flattened**. If the
illustrated background lives as its own transparent PNG behind the product and below the type, you
can animate that one layer per frame without touching a single product pixel or letter. Render the
static base once, overlay the moving element. Cheap, safe, and the static hero and the animated cut
come from the same build so they always match.

---

## 10. Text safety is automatic or it does not happen

Every text element auto-fits and word-wraps to stay inside the safe box. Measure the glyph bounding
box and shrink or wrap until it fits; **hard-fail the render on overflow**. A clipped word reads as
broken and amateur, exactly like a cut face.

Two real misses this prevents: a word running onto the product, and a rule line cutting through a
date. Both shipped because the layout was checked by eye rather than measured.

Also: never place text or a heavy gradient on a face or on the hero product. Compose on thirds, or
use a **solid side panel** for the text and put the photo in the other side. A solid panel guarantees
text is never over the subject, with no object-position guesswork.

---

## 11. Hard framing rules that keep coming back

- **Faces whole.** No face clipped by the frame edge, ever. Group shots get contained, not cropped.
- **Never cut feet.** Only two acceptable framings: full body with a little floor beneath, or a
  deliberate crop at or above the waist. Banned is the in-between, anywhere from the knee down. This
  is a **crop rule, not a source rule**: a photo whose feet are fine at 3:2 loses them the moment it
  is fitted to 9:16, so the check runs *after* the reframe on the rendered file.
- **Rotation metadata lies.** Sources reported 848x480 but carried `rotation=-90`, so they DISPLAYED
  vertical. The first build pillarboxed into black bars. Read the rotation flag, not just w/h.

---

## 12. Environment traps that cost real time

- **Use the project's venv interpreter explicitly.** `.venv/bin/python`, never bare `python3`. A
  `ModuleNotFoundError` from a project script means the wrong interpreter, not a broken machine. I
  once blamed a Homebrew upgrade for "wiping the build chain"; the venv was fine.
- **Not every ffmpeg build has every filter.** This machine's ffmpeg has **no `drawtext`**. Label
  frames in PIL instead of assuming the filter exists. Check before building a pipeline on it.
- **Shell globs abort silently.** A zsh glob that matches nothing can kill the rest of the command
  without an obvious error, which made a check look like it passed.

---

## 13. How a build actually goes, start to finish

1. **Source** from the indexed library, filtered by flags. Check what actually shipped recently,
   from the real build records, not a "last used" column.
2. **Contact sheet** the candidates densely and LOOK. Pick in/out points you have seen.
3. **Clean the source**: trim dead frames, crop old branding and watermarks, fix rotation.
4. **Build** with the one real builder. Search for it before writing another one.
5. **Verify on the rendered file**: t0 not black, faces whole, feet not cut, text inside the safe
   box, audio level in band, correct dimensions.
6. **Review page** with a cache-busted URL showing every surface at its real size, together.
7. **Ship.** Refine after. Never rebuild a finished asset to chase a small improvement.

---

## 14. The meta-lesson, and the expensive one

Across three separate days the same pattern cost the most time, and it was not tooling:

- **I rebuilt the same asset five times** because I judged quality by eye after each attempt instead
  of settling the layout constraint first. One geometry fix resolved six separate "cut face" reports.
- **I wrote three renderers before checking whether the right one already existed.** It did.
  Inventory what exists before building anything new.
- **Four of five rebuilds on one post were MY objections, not William's.** He had already said he did
  not care about the thing I was fixing. Ship the slot, raise the concern in one line, let him decide.

Reuse beats rebuild. Settle the structural constraint before iterating on taste. And a concern is a
sentence, not a silent rebuild.

---

## Amazon-specific notes worth keeping separate

These do not come from Social Scene and should be verified against current Amazon policy before you
rely on them, because Amazon's requirements change and I have not re-checked them today:

- Main image: pure white background, product ~85% of frame, no text/logo/watermark/border/inset.
- Secondary images and A+ content allow text and lifestyle shots, which is where the design craft
  above actually gets to work.
- Video poster frame behaves like a thumbnail; treat it as a publishing surface.
- Mobile is the majority of views, so legibility at thumbnail scale beats detail at full size.

Related, in this repo: `confabulator/amazon-image-compliance.md`,
`confabulator/IMAGE-STRATEGY-2026-08-08.md`, `confabulator/PACR-phone-assured-creative-rules.md`,
and the builders in `scripts/build-graphics*.mjs`.
