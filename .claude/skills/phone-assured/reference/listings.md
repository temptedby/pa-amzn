# Listings — titles, bullets, A+, compatibility

## Read the real limits from Amazon, never from a summary

```
node scripts/title-limits.mjs        authoritative limit from the Definitions API
node scripts/listing-title-check.mjs  run candidate titles past Amazon, applies nothing
node scripts/listing-validate.mjs     VALIDATION_PREVIEW — would Amazon accept this?
node scripts/listing-field-probe.mjs  which individual fields will Amazon take from us
node scripts/listing-ownership.mjs    our contribution vs Amazon's shared catalogue
node scripts/listing-status.mjs       is a listing actually suppressed, and why
```

**The title cap is 75 characters** as of 2026-07-27, even though the Definitions API still reports
200. Trust the live rejection, not the schema. Amazon also enforces a twice-per-word rule, which is
what blocks title changes on our ASINs — and "Phone Assured" spends one of the two allowances of
"phone".

**Bullets, description and search terms are writable on all four ASINs.** An earlier conclusion
that we did not own those fields was wrong and was corrected on 2026-08-19. Only titles are
constrained.

Always use VALIDATION_PREVIEW before a real write.

## Compatibility

Two separate fields, and the filterable one takes **snake_case tokens**, rejecting display names
including Amazon's own documented example.

```
node scripts/compat-vocabulary.mjs   discover the APPROVED values
node scripts/compat-tokenize.mjs     display names to tokens, then validate every one
node scripts/compat-apply-full.mjs   write them
```

The 171 gram weight limit splits Black from Pro. No modern Pixel qualifies for Black, and only two
of the world's top ten phones fit it — yet Black still outsells. Do not over-index on the weight
class when advising on copy.

## A+ content

All A+ documents are **EBC/STANDARD, not Premium**, so there is no A+ video module available. All
four documents are the same seven images from a 2023 shoot and have never changed. The copy is
baked into the JPEGs, so changing A+ text means remaking images.

Module 3 is entirely the **discontinued lanyard**. The wristband and necklace were discontinued
2026-08-09 but the lanyard still appears in three A+ modules, one live ASIN and 48 Drive files.
Flag that whenever A+ comes up.

Hebrew-looking alt text is Amazon auto-translation, not a defect.

## Words that earn and words that do not

"Grip" and "PopSocket" earn **$0**. "Discreet", "easy" and "warranty" are conversion words, not
search words — they belong in bullets, not in backend search terms. Do not pad search terms with
conversion language.

## The mechanism, stated correctly

The **cord retracts; the phone is guided back.** Never describe or show a phone being pulled up on
its own — it is false and it fails the creative rules. The clip wraps a bar and clips back to its
own cord, and it has **two ends**; creative should show both.
