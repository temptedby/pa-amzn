# Amazon Image Compliance Rules (HARD RULES — every graphic must pass)

Purpose: never produce an image that violates Amazon policy and risks the account. The content generator codes against this checklist; nothing ships that fails it.

## MAIN image (slot 1) — strictest
- Pure **white background**, RGB 255,255,255.
- **Real product only**, fills **≥85%** of the frame. No props/accessories not included in the purchase.
- **NO text, logos, watermarks, badges, borders, graphics, or insets** of any kind.
- ≥1000px longest side (target 1600-2000px), 1:1, JPEG, sRGB.
- No mannequin parts for non-apparel; no multiple-product collages.

## SECONDARY images (slots 2-7) — text/lifestyle allowed, but:
- **No price, discount, shipping, or promo callouts** ("sale", "% off", "free shipping", "deal", "lowest price", "$"). Prohibited on images.
- **No Amazon IP or badges**: no Amazon logo, no "Amazon's Choice", "Best Seller", "#1", "Prime", star-rating graphics, or anything mimicking an Amazon badge.
- **No reviews/testimonials presented as Amazon reviews**; no fabricated star ratings.
- **No external contact / off-Amazon routing**: no URLs, QR codes, phone numbers, emails, social handles, or "visit our website".
- **No time-sensitive or urgency claims** ("limited time", "today only", "act now").
- **No unsubstantiated superlatives or guarantees** ("best", "#1", "guaranteed", "100% effective", "doctor recommended", "FDA approved", medical/health/safety claims) unless literally true + substantiable.
- **No competitor names or disparagement.**
- Warranty/feature claims allowed if literally true: "1-year warranty" and "free replacement clip" are real product features → OK to state plainly (no badge styling that mimics Amazon).
- Text must be legible on mobile (min ~24px equivalent); no profanity, no offensive/violent imagery.

## A+ Content / Brand Story images
- Same content rules as secondary. Additionally: no warranty/guarantee language that conflicts with Amazon's return policy, no pricing, no contact info, no claims Amazon could read as medical.
- Use only owned or licensed imagery (our Drive assets / our own AI-generated). No stock we don't have rights to, no third-party logos.

## Video (listing / Sponsored Brands)
- Same claim rules. No price/promo, no off-Amazon URLs/contact, no Amazon badges, no competitor callouts. Captions for muted autoplay are fine.

## Title (≤75 chars from 2026-07-27)
- No promo/price words, no all-caps gimmicks, no emojis/special chars, no subjective claims ("best", "amazing"), no seller name unless it's the brand. Brand + product + key attributes only.

## Hard-coded enforcement
The generator carries a BANNED-content linter: rejects any overlay text matching `/(\$|%|sale|discount|free shipping|best ?seller|amazon'?s choice|#1|guarantee|prime|today only|limited time|FDA|doctor|cure|100%)/i`, blocks logos/badges on the main image, and verifies white-bg + 85% fill on the main image before export. A graphic that trips the linter is not produced.

## Sources
Amazon product image requirements + listing/title policies (Seller Central image guidelines, restricted claims, prohibited promotional text on images).
