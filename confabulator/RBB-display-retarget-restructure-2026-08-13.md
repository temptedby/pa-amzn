# RBB — Restructuring Sponsored Display around a 7-day viewer

**2026-08-13.** Written before building, on William's instruction: *"rbb maybe restructure for 7days"*.

---

## 1. Problem

Sponsored Display has spent **$5,251 and returned $4,128 over its whole life. 0.79x.** It has never
had an engine watching it: `ad_engine_log` holds 340 rows and every one is Sponsored Products.
`sd-engine.ts` does not exist on `origin/main` and there is no sd-engine cron in production.

Retargeting specifically is **$3,591 -> $2,501, 0.70x**, and William's read is blunt and correct:
it has never worked.

Success looks like a Display account where every enabled audience is above the 1.0x kill line, and
where the thing we spend most on is the thing that converts best rather than the thing that happens
to have the biggest audience.

---

## 2. Industry standard

**Retargeting should be the best-performing thing in the account, by a wide margin.** Published
benchmarks put retargeting campaigns at **4:1 to 8:1 ROAS**, against prospecting. Ours is 0.70x.
That gap is not a tuning problem. Something structural is wrong.

**Recency is the primary lever, and 7 days is the recognised bright line.** Guidance is explicit
that *"recent visitors within 7 days typically demonstrate higher intent than older prospects"*, and
that layering recency windows separates active prospects from lapsed ones. A shopper who viewed
yesterday and one who purchased six months ago are different people and should not share a campaign.

**Excluding past converters is standard practice, and we do the opposite.** Optimisation guidance
lists *"excluding shoppers who have already converted"* as a core step. We run three separate
purchases-remarketing audiences and have spent $556 on them.

**The lookback windows Amazon actually offers**, which bounds what we can build:

```
views remarketing        7, 14, 30, 60, 90 days
purchases remarketing    7, 14, 30, 60, 90, 180, 365 days
```

So **7-day views is available**. It is the shortest window Amazon exposes and we have never run it.

No minimum spend is required for Sponsored Display, and no documented minimum audience size was
found in this research. Audience size remains the main open risk, see section 6.

---

## 3. Codebase and reality

Lifetime, from `ad_entity_lifetime`, deduplicated by audience family and lookback:

| audience | lookback | spend | sales | orders | ROAS |
|---|---|---|---|---|---|
| views | 14d | $307 | $423 | 17 | **1.38x** |
| views | 30d | $1,794 | $1,281 | 57 | 0.71x |
| views | 60d | $934 | $535 | 31 | 0.57x |
| purchases | 90d | $9 | $0 | 0 | **0.00x** |
| purchases | 180d | $216 | $74 | 5 | 0.34x |
| purchases | 365d | $331 | $188 | 10 | 0.57x |

**The two families run in opposite directions, and that is the finding.**

```
VIEWS      shorter is better    60d 0.57x -> 30d 0.71x -> 14d 1.38x
PURCHASES  LONGER is better     90d 0.00x -> 180d 0.34x -> 365d 0.57x
```

Both are consistent with the product. A phone tether is one per phone and it lasts, so a fresh
viewer is close to buying while a recent buyer has no reason to buy again. The 90-day buyers
audience returning **zero orders on $9.29** is the cleanest signal in the table.

**Where the money went is the second finding.** 76% of all retargeting spend ($2,728 of $3,591)
went into views 30d and 60d, the two worst-performing viewer windows. The one window above 1x got
8.5% of the budget.

Competitor ASIN targeting, by contrast, contains the account's best entities: `B07ZSDFY85` at 2.18x
on 18 orders, `B07PNZTWW4` at 2.88x, `B00JTKOPY4` at 2.36x. **Two of those three are no longer on
the account at all.**

---

## 4. Options

| # | Option | Effort | Expected | Trade-off |
|---|---|---|---|---|
| A | **Pause everything below 1x, change nothing else** | Minutes | Stops a 0.70x bleed. No upside | Leaves Display as one audience at 1.38x; does not test the hypothesis |
| B | **A, plus add views 7d** | Low | The curve points at 2x+ | 7d audience may be too small to serve on our traffic |
| C | **A + B, plus rebuild the two dead competitor targets** | Medium | Those are the only proven 2x+ entities we have ever had | Recreated targets lose their history and restart cold |
| D | **Full restructure: one campaign per recency tier, message matched to tier** | High | Matches published best practice | Weeks of learning on an account that cannot currently be watched |

---

## 5. Recommendation

**Option C, sequenced, and not before the engine is live.**

1. **Pause every audience below 1.0x.** views 30d, views 60d, purchases 90d, purchases 180d,
   purchases 365d. That is William's own kill line applied to Display for the first time, and it
   retires $3,284 of lifetime spend that returned $2,078.
2. **Keep views 14d and shave the bid** rather than pausing it. At 1.38x it is above 1x and below
   break-even, which by William's 2026-08-13 rule is a bid problem, not a dead audience.
3. **Add views 7d as a single controlled change**, so that when the number moves we know what moved
   it.
4. **Recreate `B07ZSDFY85` and `B07PNZTWW4` as competitor targets.** These are the best entities
   Display has ever had and they are simply gone.

**What NOT to do, and why.** Do not retest purchases remarketing at short lookbacks. 90-day buyers
produced zero orders and the product is a one-per-phone durable; that is a structural mismatch, not
an optimisation. And do not attempt Option D yet: a full recency-tiered restructure on an account
with no engine, no kill rule and no bid rules is how $5,251 became $4,128 in the first place.

**Sequencing matters more than the content here.** Every step above should follow the merge of
PR #2, which is what puts the $4 kill and the bid rules onto Display. Turning on new audiences
before then is repeating the mistake this document exists to fix.

---

## 6. Open questions, trade-offs, rollback

**Open, and the main risk to Option B:** will a 7-day views audience be large enough to serve? No
documented minimum was found. The likely failure mode is silence rather than a bad ROAS, so it must
be judged on impressions first and only then on conversion. If it does not serve within a week, the
answer is that our detail-page traffic is too thin for 7 days, not that the hypothesis was wrong.

**Trade-off accepted:** recreated competitor targets start with no history, so they will look like
new entities to any rule keyed on lifetime performance and will need protecting from the $4 kill
during their first fortnight.

**A number worth keeping in view:** published retargeting benchmarks are 4:1 to 8:1. Even a
successful 7-day test landing at 2x would be a quarter of what this channel is supposed to deliver.
That suggests the ceiling here is set by detail-page traffic and by the creative, not by the
audience settings.

**Rollback:** every step is a state change on an existing entity, reversible in one API call.
Nothing here creates a campaign or a budget. The two recreated targets can be paused and left in
place.
