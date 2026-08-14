# RBB: harvest converting BROAD search terms into EXACT + PHRASE

**William, 2026-08-08:** *"adding exact and phrase match to converting search terms that hit on
broad match is what I am hoping for, any search term over 2.0 roas please"* and *"only way to add
new phrase and exact is if they perform as search terms for broad keywords"*.

**Answer up front: this is sound, it is the industry-standard pattern, and our own data contains a
textbook example of why it matters. Build it. Three parameters need William's call first.**

---

## 1. Problem

Today the harvest adds a converting search term as EXACT + PHRASE regardless of which match type
caught it (`harvestCandidates`, `ad-engine.ts`). That means a term already running as EXACT can be
re-harvested as EXACT, and a term found by a PHRASE keyword gets promoted with no discovery value.

The value is specifically in **broad**: broad is the only match type that surfaces phrasings nobody
typed into a keyword list. Promoting those to EXACT and PHRASE is how a discovery finding becomes a
controlled, separately-biddable keyword.

Success: every search term a BROAD keyword finds that returns 2.0x or better exists as its own
EXACT and PHRASE keyword, so it can be bid on directly instead of only via the broad keyword that
found it.

## 2. Industry standard

The canonical structure is a **three-tier funnel**, described consistently across
[Trellis](https://gotrellis.com/resources/blog/amazon-ppc-keyword-match-type),
[Marketplaice](https://marketplaice.io/en/blog/amazon-keyword-harvesting-anleitung),
[Seller Labs](https://www.sellerlabs.com/blog/amazon-ppc-match-types-explained-broad-vs-phrase-vs-exact/)
and [Karooya](https://www.karooya.com/blog/amazon-ads-match-types-explained-master-exact-phrase-broad-auto-targeting/):

1. **Discovery**: auto and broad campaigns at low bids, built to find search terms.
2. **Validation**: terms that convert move to PHRASE.
3. **Performance**: phrase keywords that keep converting are promoted to EXACT and bid hardest.

Reported result for broad-to-exact harvesting: **23% reduction in ACOS at the same sales volume**.

**Two places William's version deviates, both deliberate and worth naming:**

- The standard promotes **broad → phrase first**, then **phrase → exact** only after the phrase
  keyword proves itself. William wants **both at once**. That is faster and skips a validation step.
  Given this account has been starved of data for months and the $4 kill bounds each new keyword's
  downside, spending two keywords' worth of rope to skip a validation cycle is a reasonable trade.
- The standard pairs harvesting with **negating the term in the source campaign** to stop the broad
  keyword competing with the new exact. William has ruled out negatives, and the
  [2026-08-07 duplicate-keyword RBB](RBB-duplicate-keywords-2026-08-07.md) already disproved the
  premise: **Amazon does not let an advertiser bid against itself.** Only one eligible ad enters any
  given auction, chosen on bid and relevance. Confirmed on this account: of the duplicate groups
  that spent anything, 5 of 5 put all spend on ONE copy and 0 split it. So the double-spend the
  blogs warn about does not apply to us.

The standard also uses **at least 2 orders** as the promotion bar, not one. See section 6.

## 3. Codebase and reality

**The columns work.** Probed live 2026-08-08 against a 30-day window: `keyword`, `matchType` and
`keywordType` are all accepted by `spSearchTerm` and all return data. 54 rows.

```
matchType distribution:
  PHRASE                            26
  BROAD                             12
  EXACT                              9
  TARGETING_EXPRESSION_PREDEFINED    6   <- auto campaigns, keyword reads "loose-match"
  TARGETING_EXPRESSION               1
```

**What the rule would actually harvest, measured, not estimated:**

```
BROAD search terms converting at >=2.0x:   1
  $2.24 -> $16.49   7.4x   1 order
  broad keyword: "hand strap universal phone lanyard clip to belt"
  search term:   "anti theft phone strap"

current rule (ANY match type) would take:  4   (BROAD 1, PHRASE 2, EXACT 1)
```

**The finding that justifies the whole feature.** That broad keyword,
`hand strap universal phone lanyard clip to belt`, is **the exact keyword the engine killed this
morning** at $6.95 by its own reading, $13.61 actual, 83% ACOS, 1 order. The keyword as a whole
loses money and was correctly switched off. But inside it sits a search term returning **7.4x**.

Kill the keyword without harvesting the term and that 7.4x winner disappears with it. That is not a
hypothetical: it happened today, before this rule existed. This is the single strongest argument for
building it, and it comes from our own account rather than a blog.

**What exists already.** `HARVEST_MIN_ROAS = 2` is in place (`ad-engine.ts:42`), and
`harvestCandidates` already requires `o.sales >= HARVEST_MIN_ROAS * o.cost` plus at least one order.
So the 2.0x bar William asked for is **already built**. The only missing piece is the match-type
filter, plus the two report columns that make it knowable.

## 4. Options

| | Effort | Impact | Risk |
|---|---|---|---|
| **A.** Add `keyword`+`matchType` to the report; filter harvest to `matchType === BROAD` | Small: 2 columns, one filter, tests | Exactly what William asked for. Harvest drops 4 → 1 per 30 days | Low. Strictly narrower than today |
| **B.** As A, but include auto campaigns (`TARGETING_EXPRESSION*`) as discovery too | Small + one predicate | Adds the classic discovery source. 6 auto rows exist, 0 converting at 2x today | Low, but it is not what William said |
| **C.** Full three-tier funnel: broad → phrase, then phrase → exact on separate evidence | Large: new state, promotion tracking, second evidence bar | Matches the textbook exactly | Medium. Much more machinery, and slower to act on a starved account |
| **D.** Leave harvest as is (any match type) | None | Keeps harvesting 4 | Re-harvests terms already running as EXACT, which is noise |

## 5. Recommendation

**Build A.** It is precisely what William specified, it is strictly narrower than today's behaviour
so it cannot add risk, and the 2.0x bar it depends on already exists and is tested.

**Do not build C.** The three-tier funnel is correct for an account swimming in data. This one has
54 search term rows in 30 days and one qualifying broad term. Adding a validation tier would mean
that single 7.4x term waits another cycle before becoming an exact keyword, on a business whose
stated goal is to move ~2,000 units and wind down. The $4 kill already provides the validation the
funnel's middle tier exists to provide, and it does it with real money rather than a promotion rule.

## 6. Open questions, trade-offs, rollback

**Three parameters William should decide, because the data makes them live questions rather than
theory:**

1. **Auto campaigns: in or out?** They report as `TARGETING_EXPRESSION_PREDEFINED` with the keyword
   text `loose-match`, not as BROAD. Read literally, "broad keywords" excludes them, so auto
   discoveries would never be harvested. Auto is the other half of the standard discovery tier.
   Six auto rows exist today and none convert at 2x, so this changes nothing this month.
2. **One order or two?** The industry bar is 2 orders. Our own reintroduction job already uses a
   2-order bar, on the reasoning that a 79x built on one order is noise. The single qualifying broad
   term here has **one** order. **A 2-order bar would harvest nothing at all today.**
3. **What bid should a harvested keyword enter at?** Currently `NEW_KW_BID`. The term's own proven
   ROAS is arguably better evidence than a flat default.

**Trade-off accepted:** harvest volume falls from 4 to 1 per 30-day window. That is the point, not a
side effect, but it does mean the discovery loop gets slower before it gets better.

**Trade-off accepted:** without a negative in the source campaign we deviate from the textbook. The
2026-08-07 RBB establishes this is safe on Amazon specifically.

**Rollback:** revert the filter and the two columns. The cache key changes so harvest reports
re-request and rebuild in about 10 minutes. No account changes are made by the report change itself,
so there is nothing to undo on Amazon. Keywords already harvested stay, bounded by the $4 rule.
