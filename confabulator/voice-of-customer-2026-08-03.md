# Voice of the customer → title and description copy

William 2026-08-03: "review the feedback and come up with titles and descriptions from the reviews."
This replaces the first title draft, whose keyword basis came from `ad_engine_log` (what we bid on)
rather than from what customers actually say.

Source: FBA Customer Returns report (`GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA`), trailing 180
days, pulled live 2026-08-03. Read-only. 102 returns with buyer comments attached.

## What customers actually complain about

Flagship B07Y5GZP1T, 66 returns: UNWANTED_ITEM (27), **NOT_AS_DESCRIBED (18)**, DEFECTIVE (8).
2-Pack B097MGPCPC, 21 returns: DEFECTIVE (7), UNWANTED_ITEM (4), NOT_AS_DESCRIBED (4).
Disposition across all: 72.5% came back SELLABLE, 26.5% CUSTOMER_DAMAGED, 1% DEFECTIVE.

UNWANTED_ITEM is mostly "changed my mind" and is not addressable by copy. **NOT_AS_DESCRIBED is,
and it is the second-largest reason on the flagship.** Reading the actual comments, it resolves to
four specific factual gaps, in order of frequency:

### 1. LENGTH — the single most repeated complaint
- "Not as Expected | Unsuitable length | Length"
- "the leght is not correct | the descrption is correct"
- "String shorter than expected"

Three separate buyers returned the product over cord length. The listing does not state a length
anywhere.

### 2. PHONE CASE COMPATIBILITY
- "It doesn't work with my phone with my phone case. I can't get the loop through it"
- "It's not fit with softcover"
- plus NOT_COMPATIBLE as a reason code, 4 returns

The attachment method is not described, so buyers with thick or soft cases discover the problem
after purchase.

### 3. LOAD CAPACITY — customers do not believe it will hold a phone
- "Its not strong enough to hold a phone"
- "was not strong enough to hold the phone up/retract. **Seems better suited for an ID card and not
  a heavy cell phone**"
- "The cord snapped on the first use"
- "Phone holder loop broke off"

That second quote is the most valuable sentence in the dataset. The product is being mentally
filed as a badge reel, not a phone tether. That is a positioning problem, and it is fixable in
copy only if we can state a real weight rating.

### 4. MATERIAL and RELEASE MECHANISM
- "Material not as expected"
- "Not easy to unhook when you don't want to use the retractable option"

## What this means for the copy

The top three complaints are all about **facts the listing does not state**: cord length, case
compatibility, and how much weight it holds. That is precisely why NOT_AS_DESCRIBED ranks second.
Customers are not saying the product is bad, they are saying it was not what they pictured.

So the highest-value copy change is not a better adjective. It is stating three numbers.

Once we have them, the pattern for both title and bullets is: lead with the spec that kills the
objection, because "holds up to X oz" and "extends to Y inches" answer the exact reason people are
sending it back.

## Blocked on

Two measurements only William can supply. They have been parked since June and they gate this
work, the A+ content, and the CS reply templates simultaneously:

1. **Cord length** — retracted and fully extended.
2. **Load capacity** — the phone weight it reliably holds.

A third, cheap to determine: **which case types the loop fits** (thin, thick, soft, MagSafe).

Without these, any copy we write is guessing about the exact facts customers are returning the
product over, which is how the listing got here.

## Not used, and why

Amazon's SP-API does not expose review text to sellers. Voice of the Customer and review analytics
sit behind Brand Registry, which is unresolved (brand reads "Securisee", task 8). The 480 reviews
on the flagship would be a second corpus and are readable from the live product page if we want
them, but the returns comments are already unambiguous about the four themes above, and they carry
something reviews do not: they are attached to a buyer who wanted their money back.
