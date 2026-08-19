# RBB — Extending the $4 rule and the engine to Canada

**Date:** 2026-08-19
**Asked by:** William: "need to run on canada as well to make sure nothing spends over $4", then "rbb", "6 step".
**Status:** research only. Nothing built, nothing merged. The read-only Canadian $4 check is running
separately and is not part of this proposal.

---

## 1. Problem

**What is wrong.** The ad engine cannot see Canada. `ADS_PROFILE_ID` is a single environment value
pinned to the US profile `527401661118587`, and every rule written this month reads it. Meanwhile
Canada has **one Sponsored Products campaign, ENABLED, on CAD 100/day, created 2021-12-16**, which
has never been switched off and has never been governed. No $4 kill, no bid rules, no presence in
any digest William reads. This is the same shape as the Sponsored Brands and Display leak found on
05 August, and the same shape as `phone security` taking $49.20 while invisible on 07 August.

**What success looks like.** No keyword in any marketplace can pass CAD/USD 4 unprofitably without
being paused, and the fact of Canadian spend appears in the daily digest whether or not anything
breaches.

**The specifics that make this non-trivial.** Two are worth stating up front because they change the
answer:

- **Canadian prices are not US prices.** CAD 29.28 against USD 9.49 on the Single, up to CAD 67.39
  against USD 16.49 on the 3-Pack: roughly 2.2x to 3.0x the US price in real terms, on
  `AMAZON_NA` remote fulfilment out of US stock.
- **A flat 4 therefore means something different per marketplace.** USD 4 on a USD 9.49 product is
  42% of one unit's revenue. CAD 4 on a CAD 29.28 product is 14%. The identical rule is three times
  stricter in Canada, which is the safe direction but is not the same rule.

---

## 2. Industry standard

Amazon's Advertising API is explicitly profile-scoped: `Amazon-Advertising-API-Scope` carries one
profile per request, each profile has its own `countryCode` and `currencyCode`, and `/v2/profiles`
is the documented way to enumerate them. Our account returns three: US (USD, "Phone Assured"),
CA (CAD, "Securisee") and MX (MXN, "Securisee"). A multi-marketplace advertiser is expected to
iterate profiles, not to hold one.

The corresponding data-modelling standard is ordinary: **an identifier is only unique within its
scope, so the scope belongs in the key.** Amazon keyword IDs are unique per profile, not globally.
Storing them without a profile column is the classic multi-tenant key collision, and the standard
remedy is a composite key rather than a hope that IDs never overlap.

On thresholds, the general practice for spend controls across currencies is to express the bar in
the local currency of the marketplace, and to set it from that marketplace's unit economics rather
than converting a number chosen for another market. A bar is a statement about how much of a
product's margin you are willing to spend to learn something, and margin is per marketplace.

---

## 3. Codebase and reality

Measured today, not assumed.

**The profile is a single value, read in one place.**

```
src/lib/amazon/ads-api.ts:35   profileId: process.env.ADS_PROFILE_ID
src/lib/amazon/ads-api.ts:70   if (!cfg.profileId) throw new Error("ADS_PROFILE_ID required...")
```

Nineteen scripts read the same variable. Nothing in the codebase takes a profile as an argument.

**Eleven tables would collide.** Every one keys on a keyword or entity ID with no profile column:

```
kw_bid_state        no profile col    kw_state_snapshot   no profile col
kw_bid_history      no profile col    ad_reintro_cohort   no profile col
kw_kill_ledger      no profile col    kw_tombstone        no profile col
kw_lifetime         no profile col    bid_gate_notice     no profile col
bid_epoch           no profile col    ad_engine_log       no profile col
ads_report_jobs     no profile col
```

`ads_report_jobs` is the sharpest of these: its primary key is a `key` string built from purpose and
date. A Canadian `engine-mtd` request would overwrite the US one for the same day, and the US engine
would then read Canadian rows and act on them. That is not a theoretical collision, it is a wrong
bid on the wrong marketplace.

**The engine is already failing at its current scope.** It made 3 Sponsored Products bid decisions
in the 30 hours to 08-19 06:04Z. PRs #6, #7 and #8 are open and unmerged, and #7 is the one that
makes the engine run four times a day rather than once.

**Canadian demand is unmeasured, not measured as zero.** The 90-day window showing 0 Canadian orders
was recorded while Canada was deactivated, which was already logged as a faulty inference on 08-13.
The marketplace is now `selling=true, suspended=false` and all four listings are BUYABLE and
DISCOVERABLE with zero issues.

---

## 4. Options

**A. Add a second env var and a second cron.** `ADS_PROFILE_ID_CA` plus a duplicated set of routes.
Fast, and wrong: it doubles nine crons into eighteen, and it does nothing about the eleven tables,
so the collisions arrive anyway.

**B. Make the profile a parameter and add a profile column to all eleven tables.** The correct shape.
Every rule then runs per profile with its own state. Cost: a schema migration across eleven tables
plus a backfill stamping existing rows as US, and the whole engine's call surface changes.
Realistically a day, and it lands on top of three unmerged PRs.

**C. A standalone kill-only guard for Canada, no shared state.** One script, its own report, reads
Canadian keywords, pauses breaches, writes nothing to the shared tables. No collision because it
touches nothing that collides. Does not give Canada bid rules, harvesting or reintroduction. This is
what is running read-only now.

**D. Pause the Canadian campaign entirely until the engine can govern it.** Zero risk, zero spend,
and it forecloses a market we have just regained and never fairly tested.

**E. Do nothing.** CAD 100/day of authorised, ungoverned budget in a marketplace nobody is reading.

---

## 5. Recommendation

**C now, B after the merge queue clears. Not A, not E.**

C because the immediate risk is unbounded ungoverned spend, and C removes it today without touching
a single shared table. It is the smallest change that makes the stated instruction true.

B after, because C is a guard and not an engine: it will not lower a Canadian bid, harvest a
Canadian search term or revive a Canadian keyword. Doing B properly requires the profile column, and
doing it *before* #6, #7 and #8 merge would add a fourth branch to the queue that is already the
reason the US engine acts three times a day instead of twelve. Sequencing is the recommendation, not
just scope.

**What NOT to do.** Do not add `ADS_PROFILE_ID_CA` as a second env var. It looks like the cheap
version of B and it is actually A: it leaves every table collision in place while making the engine
appear multi-market, which is the most dangerous of the five states because the failure is silent.

**On the bar itself.** I recommend the Canadian bar be set from Canadian unit economics rather than
copied as the number 4. At CAD 29.28 with remote-fulfilment cost, contribution per unit is not known
here and needs establishing before a bar can be justified. Until then CAD 4 is defensible precisely
because it is conservative, and it should be labelled a placeholder rather than a decision.

---

## 6. Open questions, trade-offs accepted, rollback

**Open questions, in the order they block work.**

1. **Is Canada worth advertising into at all at these prices?** CAD 67.39 for the 3-Pack is $48.83
   equivalent against $16.49 in the US. Governing the spend is right either way, but if the answer
   is no, option D is cheaper than option B.
2. What is contribution per unit in Canada after remote-fulfilment fees? Without it, no bar is
   justified and no ROAS target is meaningful.
3. Do the Canadian listings get Megan's copy? They currently have no description of ours at all;
   today's write was US-only.

**Trade-offs accepted.** C leaves Canada with a kill rule and nothing else, so bids there stay
wherever they were set in 2021 until B lands. C also runs on demand rather than on a cron, so it
protects only when invoked; putting it on a cron is a one-line addition but adds a tenth cron to a
schedule whose ordering bug we fixed only yesterday. The CAD 4 bar is a placeholder and is recorded
as one.

**Rollback.** C pauses keywords, which is reversible by setting state back to ENABLED, and it writes
nothing to the database. B is a schema migration and would need the profile column added with a
default of the US profile so existing rows keep their current meaning; rolling back means dropping
the column, and no existing behaviour depends on it until the engine reads it.
