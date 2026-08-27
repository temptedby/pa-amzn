# Content — graphics, video, blogs

## The build order is locked, and skipping it wastes a day

1. **Inventory what exists.** Do not generate anything before you know what is already shot.
2. **Build a contact sheet.** Look at the actual images.
3. **One renderer.** Not three half-finished ones.
4. **Look at the pixels.** Open the output before showing it.

```
node scripts/drive-inventory.mjs   every video and image in the Drive folders
node scripts/drive-images.mjs      images with IDs and dimensions
node scripts/content-gallery.mjs   HTML gallery from content-registry.json
node scripts/build-graphics.mjs    compliant secondary images
node scripts/build-hero.mjs        main image options on pure white
```

## What we actually own

The **AMZ1Step 2023 shoot** is the real library: 2,453 Phone Assured files, a full Amazon package
with RAW. `drive-images.mjs` sees only 98 of them, so a search that comes back thin is a tooling
limit, not an empty cupboard.

`content-registry.json` points at `/tmp` for all nine tracked assets, so they are gone and the
approval gallery renders empty. Fix the paths before trusting that registry.

**Paul Arnoldi's testimonial is the only customer-filmed video we own.** Native vertical 480x848, a
real named person. That makes it FTC-safe in a way an AI-generated testimonial is not. Treat it as
a scarce asset.

## Hard technical limits

**ffmpeg here has no `drawtext` and no `subtitles` filter.** Composite captions as images. Never
propose a text filter; it will fail.

## The creative rules

`confabulator/CREATIVE-BUILD-PROCESS.md` and the PACR rules are a **42-rule pre-build gate**, not a
review checklist. No asset ships without the real product visible.

`confabulator/IMAGE-STRATEGY-2026-08-08.md` is the basis for all graphics, video and testimonials:
six shopper questions answered in swipe order.

The two things that most often make a draft unusable: showing the phone retracting on its own
(false), and showing only one end of the clip (it has two).

## Showing work

Open Finder and the browser when creative is ready. **Do not just send a link** — William wants to
see the pixels.

## Blogs and written content

```
node scripts/drive-blogs.mjs         article-style docs worth repurposing
confabulator/content-calendar.md     the plan
confabulator/content-strategy.md     positioning
confabulator/amazon-content-playbook.md
```

Given the wind-down goal, weigh any content proposal against whether it moves the ~280 units on
hand. Long-horizon SEO content usually fails that test; say so rather than building it.

## External traffic

The Brand Referral Bonus is a **per-tag** rule, not per-account. UTMs track nothing on Amazon.
`phoneassured.com` 301s to the tagged listing with the tag intact. Attribution has recorded clicks
but no purchases, so the affiliate pay gate is only half cleared.
