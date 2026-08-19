# Where Megan's copy goes, and the two things that would have failed silently

**Date:** 2026-08-19
**Source:** Google Doc `1LdgeIpStJdMuqv0K00qDmUOoYOZepHWoPie20UQoylM`, tab **Megan Review**, shared
by Megan Mann 2026-08-18.
**Status:** validated against the live Amazon account. **Nothing has been uploaded.** Every probe
below ran with `mode=VALIDATION_PREVIEW`, which asks Amazon whether it would accept a change and
applies nothing.

---

## 1. The headline: we CAN write this copy

An earlier finding on 08-17 said the copy fields on Black, 2-Pack and Pro belong to Amazon's shared
catalogue and only the 3-Pack was ours. **That was wrong**, and it would have stopped this work from
ever shipping. Settled today, field by field, on all four SKUs:

```
                        Single/Black    2-Pack    3-Pack    Pro
bullet_point               VALID        VALID     VALID    VALID
product_description        VALID        VALID     VALID    VALID
generic_keyword            VALID        VALID     VALID    VALID
item_name                  content rule only, not ownership
```

How the wrong answer happened, because it will happen again otherwise. A `GET` on the listing item
returns these four attributes as ABSENT, which reads like "not ours" but only means we have never
supplied a value. And a validation patch carrying an obviously fake title returns error **8541**,
"The Listing data provided is different from what's already in the Amazon catalog", which reads
exactly like a permission refusal. It is not. Submit a plausible title and the error changes to a
content rule. 8541 fires on contradicting the catalogue, not on lacking authority.

---

## 2. Two defects in the current draft, both silent

### 2a. All four titles are REFUSED by Amazon

Not a style opinion. Amazon returned error **100470** on all four:

> You have used the following words more than twice in Title: [phone].

The rule is that no word may appear more than twice in a title. **The brand name "Phone Assured"
spends one of the two allowances**, so a title gets exactly one further use of the word. The current
drafts use it six, six, six and four times.

Proposed replacements, each run past Amazon and returned VALID, keeping the brand first and keeping
`retractable phone tether` intact because it is our single best converting search term at $60 in and
$77 back:

| SKU | Title (validated VALID) | chars |
|---|---|---|
| Single/Black | Phone Assured Retractable Phone Tether, Anti-Theft Lanyard, Safety Leash & Cell Strap for Cases, Clips & Grips, for Travel, Shopping, Concerts & Everyday Use | 157 |
| 2-Pack | Phone Assured 2-Pack Retractable Phone Tethers, Anti-Theft Lanyards, Safety Leashes & Cell Straps for Cases, Clips & Grips, for Travel, Shopping, Hiking & Everyday Use | 167 |
| 3-Pack | Phone Assured 3-Pack Retractable Phone Tethers, Anti-Theft Lanyards, Safety Leashes & Cell Straps for Cases, Clips & Grips, for Families, Travel & Everyday Use | 159 |
| Pro | Phone Assured Pro Retractable Phone Tether, Premium Anti-Theft Lanyard with Zinc Alloy Clip & Strong Synthetic Fiber Cord, Cell Leash for Travel & Everyday Use | 159 |

The change in each case is dropping the repeated word rather than the idea: "Anti-Theft Phone
Lanyard" becomes "Anti-Theft Lanyard", "Cell Phone Leash" becomes "Safety Leash & Cell Strap".
Megan's meaning, ordering and emphasis are unchanged. **These are proposals for Megan, not edits.**

### 2b. Black Clip backend search terms are 6 bytes over, and Amazon drops the WHOLE field

```
Black Clip   255 bytes   OVER BY 6   -> entire field discarded, silently
2-Pack       243 bytes   OK, 6 spare
3-Pack       248 bytes   OK, 1 spare
Pro          242 bytes   OK, 7 spare
```

The cap is 249 bytes and Amazon does not truncate, it discards. Six bytes would have cost all 34
search terms on the flagship with no error shown anywhere.

Smallest fix is to drop the final word `concert`, which lands it at 247. The better fix, for Megan to
judge: Amazon ignores words already in the title, so `phone`, `travel`, `shopping` and `clip` are
being paid for twice. Removing those four frees about 30 bytes for terms that are not in the title.

Note the 3-Pack has 1 byte of headroom. Any future word added there breaks it the same way.

---

## 3. Field-by-field map

Everything below is per SKU. Seller Central path is Inventory, Manage All Inventory, Edit.

| Megan's section | Amazon field | Seller Central tab | Limit | Status |
|---|---|---|---|---|
| Product Title | `item_name` | Product Details | 200 chars | needs the 2a rewrite |
| Bullet Point 1-5 | `bullet_point` (5 values) | Product Details | 500 chars each | all 20 fit, 223-342 |
| Product Description | `product_description` | Product Details | 2000 chars | all 4 fit, 1627-1748 |
| Backend Search Terms | `generic_keyword` | Keywords | **249 BYTES** | Black over, see 2b |
| Compatible Phone Models | compatibility / `model_name` | Compatibility | list | see below |

**On the bullets:** Megan wrote each as an ALL-CAPS headline followed by a sentence. That is the
right shape and it is what the character counts above measure, headline included.

**On Compatible Phone Models:** these are the lists at the end of each of Megan's sections, and they
are the one place her Black-versus-Pro split becomes machine-readable to Amazon. Black, 2-Pack and
3-Pack carry the same 18-model list capped at the 171 g line. Pro carries a 45-model list of Pro,
Plus, Max, Ultra and Pixel. This is exactly the distinction she describes in her message and it
belongs in the structured field, not only in prose.

**Product type:** all four SKUs are `CELL_PHONE_HOLSTER`. Separately from copy, Black sits in the
Holsters browse node at #448 while our own 2-Pack and Pro sit in Lanyards on the same product type.
That is a ranking problem, not a copy problem, and it is tracked separately.

---

## 4. What copy CANNOT carry, and where it goes instead

Three of Megan's strongest ideas cannot live in listing text at all:

- **The dual-ended carabiner looping back onto its own cord.** This is a mechanism, and prose is a
  poor way to explain a mechanism. It belongs in an A+ module and in video.
- **The Black-versus-Pro weight decision.** The compatibility fields make it machine-readable, but
  a shopper decides visually. This is an A+ comparison module.
- **Customer testimonials.** Amazon's rules forbid them in A+ entirely, so these stay social-only.

A+ Content is brand-level and we know it works: the A+ API returns 200 and A+ is published on all
four ASINs. It is also the biggest untouched lever we have, because all eleven A+ documents are the
same seven images from 2023, the copy is baked into the JPEGs so none of it is indexable or
screen-readable, and one module still shows the discontinued lanyard.

**That is the graphics and video work**, and Megan's copy is the script for it.

---

## 5. What happens next, in order

1. Megan reviews the four title rewrites and the search-term trim. Her call, not ours.
2. On William's go, upload bullets, description and search terms for all four SKUs. These are
   validated and ready. Titles wait for step 1.
3. Tell Megan the moment it is uploaded so she can do her manual review, as she asked.
4. Then A+ modules and video, using her copy as the script.

**Nothing in step 2 happens without William saying go.** Live listing copy is production.

---

## Tooling built for this, all read-only

- `scripts/listing-ownership.mjs` — which fields our seller account currently contributes
- `scripts/listing-field-probe.mjs` — per-field VALIDATION_PREVIEW across all four SKUs
- `scripts/listing-title-check.mjs` — run one candidate title past Amazon
