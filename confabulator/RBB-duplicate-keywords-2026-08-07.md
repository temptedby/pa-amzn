# RBB — the same keyword in multiple ads: what Amazon actually does

2026-08-07. Requested by William: *"I also wanted us to rbb what amazon says about the same
key words in multiple ads."*

---

## 1. Problem

This account holds **3,460 Sponsored Products keywords, of which ~25% are redundant copies** —
541 duplicated (text, match type) pairs. `phone tether` exists 18 times. Copies of one word carry
wildly different bids: $0.10 / $0.20 / $0.33 / $0.50 / $1.04.

Two questions have been answered by assumption rather than evidence, and money has moved on both:

- **Do our own copies bid against each other and inflate our CPC?**
- **Does spend SPREAD across copies** (so no single copy reaches the $4 kill line while the word
  bleeds), **or CONCENTRATE in one** (so the $4 rule works per keyword exactly as written)?

Success looks like: a sourced answer to both, and a clear statement of what it means for the rule
William has now fixed — *"unless the keyword spends $4 we don't turn it off, every keyword stands
on its own."*

---

## 2. Industry standard / what the platform says

**Amazon's stated position: you do not bid against yourself.** Only one of your eligible ads enters
any given auction. Amazon selects which one on a combination of **bid and relevance**, not bid
alone, and runs an **enhanced second-price auction** — you pay a cent above the next competing
bidder, not your own bid.

That position is consistent across the seller-facing sources, and it is quoted back by sellers on
Amazon's own forums. What is NOT available is a crisp first-party help-page statement covering ad
groups *within* one campaign: the Seller Forums thread asking exactly that question drew one
anecdotal reply from another seller and no Amazon answer. **Treat the cross-campaign claim as
Amazon's stated behaviour, and the within-campaign case as unconfirmed by Amazon.**

The agencies agree on the mechanism and disagree on the consequence:

| Claim | Source | Verdict |
|---|---|---|
| Only one of your ads enters an auction; no self-bidding | Amazon, via seller forums; Sermondo; Enso | consistent |
| Which copy serves depends on bid AND relevance | Feedvisor, PPC Ninja | consistent |
| Duplicates raise CPC | FlyRank, Scalea2z | **contradicted** by the mechanism above |
| Duplicates fragment data and confuse attribution | Ad Badger, Skai, Sellermetrics | consistent, and testable |

Ad Badger, notably, cites no Amazon source at all — its claims are its own experience.

Since the sources conflict, the claim was tested against our own account rather than picked.

---

## 3. Codebase / reality — measured on this account

Month-to-date Sponsored Products spend per keyword id, joined to live keyword state. Of 3,460
keywords, **260 ENABLED groups share a (text, match type), covering 605 enabled keywords.**

Of the duplicate groups that spent anything this month:

```
  5 groups had ALL spend land on ONE copy
  0 groups had spend split across more than one copy
```

```
  retractable cell phone lanyard  PHRASE      cell phone lanyard tab  PHRASE
      bid $0.50   spent $0.50                     bid $0.50   spent $0.92
      bid $0.10   spent $0.00                     bid $0.37   spent $0.00
      bid $0.10   spent $0.00

  phone tether anti theft  PHRASE             phone tether anti theft  EXACT
      bid $0.50   spent $1.47                     bid $0.50   spent $0.50
      bid $0.10   spent $0.00                     bid $0.10   spent $0.00
```

**In every case the highest-bid copy took 100% of the spend and the rest took nothing.** That is
exactly what "only one ad enters the auction" predicts, and it is the opposite of the "spend spreads
thinly across copies" story.

**Sample-size caveat, stated plainly:** August is 7 days old and Sponsored Products has spent
$13.16 in total, so only 5 duplicate groups had any spend to analyse. The direction is unambiguous
and matches Amazon's stated mechanism, but 5 groups is directional evidence, not proof. It should be
re-run at month end.

Corroborating evidence already on file: a bid change written on 2026-08-04 reached one copy of
`phone assured retractable phone tether` while its seven siblings stayed at $0.02 / $0.57 / $0.60 /
$0.97 / $1.21 / $1.48. The copies are genuinely independent entities.

---

## 4. Options

| # | Option | Effort | Impact | Trade-off |
|---|---|---|---|---|
| A | **Leave duplicates alone; judge every keyword on its own $4** | none, already built | Rule fires correctly, because spend concentrates rather than spreading | Killing the serving copy promotes the next-highest; a word with 5 enabled copies can burn up to ~$20 before all copies are off |
| B | Deduplicate: keep one copy per (text, match type), archive the rest | ~1 day, 341 archives | One clean entity per word; reporting stops fragmenting | Destroys per-copy history; irreversible-ish; touches 605 live keywords at once |
| C | Negative-keyword the duplicates out of the losing ad groups | ~1 day | Amazon's own documented remedy for overlap | Adds 541 negatives to maintain; easy to get wrong |
| D | Sum spend across copies and kill them together | already built, then reverted | Word dies at $4 total | **Rejected by William, twice.** Also unnecessary given §3 |

---

## 5. Recommendation

**Option A. Do nothing about the duplicates for now, and keep the per-keyword $4 rule exactly as
William specified.**

The reason is §3, not preference. The concern that justified summing spend across copies — that
each copy stays under $4 forever while the word bleeds — **is not what this account does.** Spend
concentrates on one copy, so that copy reaches $4 on its own and the rule fires on its own. The
mechanism William asked for is the mechanism that works.

**What NOT to do, and why:**

- **Do not deduplicate right now.** It is a 605-keyword change to fix a problem that has not been
  shown to cost money, at a moment when the priority is proving the engine runs correctly for six
  hours unattended. Deduplication is a real cleanup and it can wait for evidence from a full month.
- **Do not add negative keywords.** Amazon's remedy for overlap it says does not cost you anything.
- **Do not resurrect summing.** Asked and answered.

**The one real cost of Option A, stated honestly:** when the serving copy is killed, the
next-highest copy inherits the traffic and gets its own $4 of rope. A word with 5 enabled copies can
therefore lose up to ~$20 before every copy is off, in $4 steps, over weeks. That is the price of
"every keyword stands on its own" and it is bounded and visible.

---

## 6. Open questions, trade-offs accepted, rollback

**Open**

1. Does the within-campaign, across-ad-group case behave the same as cross-campaign? Amazon has not
   said, and our data cannot separate the two yet.
2. Re-run §3 at month end, when there is more than $13.16 of spend to analyse.
3. Is the ~$20-per-word staircase acceptable, or should a word whose copy was just killed have its
   siblings' bids held down rather than paused? That is a separate decision, not taken here.

**Accepted**

- Reporting stays fragmented across copies. Per-word totals require aggregating in our own tools
  (`word-spend.mjs` already does), even though the RULE stays per keyword.
- 25% of the keyword count is redundant. It costs storage and clarity, not, on this evidence, money.

**Rollback**

Nothing was changed by this research. It is a decision to leave the account as it is.

---

## Sources

- Amazon Ads help, *Understand ad groups* — https://advertising.amazon.com/help/GKPA6T8WW3AYKV4Q
- Amazon Seller Forums, *Do the same keywords in different ad groups within the same campaign compete
  against themselves?* — https://sellercentral.amazon.com/forums/t/do-the-same-keywords-in-different-ad-groups-within-the-same-campaign-compete-against-themselves/416490
- Sermondo, *Amazon PPC Keyword Cannibalization: Am I Bidding Against Me?* — https://sermondo.com/amazon-ppc-keyword-cannibalization/
- Enso Brands, *What is Amazon PPC? How the Amazon PPC Auction Works* — https://ensobrands.com/what-is-amazon-ppc-how-the-amazon-ppc-auction-works/
- Feedvisor, *Amazon Sponsored Products Bids* — https://feedvisor.com/university/amazon-sponsored-products-default-suggested-and-maximum-bids/
- PPC Ninja, *How Amazon's Ad Algorithm Works* — https://www.ppcninja.com/blog/amazon-algorithm.html
- Ad Badger, *Keyword Cannibalization in Amazon PPC* — https://www.adbadger.com/blog/keyword-cannibalization-and-placement-in-amazon-ppc/ (cites no Amazon source)
- FlyRank, *Using the Same Keywords in Multiple Amazon PPC Campaigns* — https://flyrank.zendesk.com/hc/en-us/articles/26281738199954-Using-the-Same-Keywords-in-Multiple-Amazon-PPC-Campaigns-Impacts-and-Strategies
- Skai, *Keyword Cannibalization Report for Amazon* — https://skai.io/blog/keyword-cannabilization-report/
