---
name: phone-assured
description: The full Amazon operation for Phone Assured (Securisee) — sales, ad spend, keywords, inventory, listings, A+ content, creative, competitors, the inbox, and the US/Canada/Mexico marketplaces. Use for the morning review, for any question about what the account is doing or earning, before changing a bid, price, keyword or listing, and when researching expansion or new content.
---

# Phone Assured — the whole Amazon operation

A retractable phone tether sold on Amazon under the brand **Securisee**, seller login
`hello@phoneassured.com`. Four ASINs. Live in **US, Canada and Mexico**.

**The goal, set by William 2026-08-04: sell through the remaining stock and wind the business down.
No new investment.** That single line decides most trade-offs. Prefer moves that convert existing
inventory over moves that build long-term position.

---

## Read this before you answer anything

**Confirm before you claim (CBC).** A live runtime call, never config, never a log, never a label,
never your own earlier sentence. This project has burned days on the difference. A Seller Central
panel said Mexico's listings were inactive while the API said `DISCOVERABLE, BUYABLE`. Our own
`ad_engine_log` showed nothing for two days while Amazon's timestamps proved 61 real writes.

**Not found is a violation, never a pass.** If a report will not complete, a scope is unreadable, or
an entity cannot be resolved, say UNREAD. "We could not look" and "we looked and it was fine" are
different answers and only one of them is reassuring. Never fill the gap with a zero.

**The stated rule is the rule.** If William has stated a threshold, that is the threshold, even if
the deployed code still carries the old one. An unmerged change is a delivery backlog, not a
property of the account, and calling the engine "correct" because the code lags is how a backlog
turns into spend.

**Do not widen or narrow a stated rule.** Implement it literally. If the neighbouring case seems to
need the same treatment, ask; do not extend it silently. This has gone wrong repeatedly.

**Talk before you act (TBA).** Never change direction, swap the method, or take a live action that
was not asked for. Drafts and dry runs are always fine.

**Research before you build (RBB).** Six steps: problem, industry standard, codebase reality with
line numbers, three to five options, a recommendation with what NOT to do, then open questions and
rollback. Applies before any live write, price change, listing change or deploy.

---

## The daily rhythm

**`MR` — morning review.** Read two weeks of daily summaries, the journal, and the session
transcripts, then take live readings. All three sources, not one.

```
confabulator/daily-summaries/YYYY-MM-DD.md    what happened each day
decisions-journal.md                          why, in the 7-question format
~/.claude/projects/-Users-williamholdeman-projects-PA-AMZN/*.jsonl   William's own words
```

Then the live layer, in this order. See `reference/money.md` for what each one answers.

```
node scripts/audit-spend.mjs        the month, per day, per ad product   (slow, 15-40 min)
node scripts/budget-usage.mjs       spend RIGHT NOW, all 3 countries     (instant)
node scripts/orders-recent.mjs      orders, no report queue              (fast)
node scripts/inventory-health.mjs   units on hand                        (fast)
node scripts/rule-compliance.mjs    is every rule actually obeyed        (very slow)
```

**`SJC` / `SJCC`** — write the daily summary, write the journal entry in the 7-question format,
commit and push. The second C compacts. Never commit a raw transcript; it can contain tokens.

---

## Where to look, by question

| The question | Start here |
|---|---|
| What are we spending and earning? | `reference/money.md` |
| Which keywords work, which are dead, what should we add? | `reference/keywords.md` |
| What is happening in Canada or Mexico? Where next? | `reference/countries.md` |
| Is the listing right? Titles, bullets, A+, compatibility? | `reference/listings.md` |
| Graphics, video, blogs, what should we make? | `reference/content.md` |
| Inventory, inbox, account health, payouts | `reference/operations.md` |
| Who are we up against? | `reference/competitors.md` |
| Why did that not work the way I expected? | `reference/traps.md` |

`reference/traps.md` is the most valuable file here. Read it before debugging anything that looks
impossible. Most "impossible" results in this account are already documented there.

---

## The numbers that govern everything

```
                price     we keep    ads must beat    best ever measured
  US            $9.49      $3.55         2.67x              2.90x
  Canada       CAD 18.72   $3.59         3.78x
  Mexico       MXN 289     $3.53         4.28x
```

Break-even ROAS is price divided by contribution. Export markets are brutal because cross-border
FBA is $2.52 in the US, **$5.96 in Canada and $8.07 in Mexico** — every export unit ships from a US
warehouse while local sellers hold local stock.

**Only the US is winnable on advertising, and only just.** Say so plainly when asked about scaling
an export market.

The price was $19.95 and is now $9.49. Repricing August at the old figure moves ROAS 0.63x to 1.13x
with no keyword changes at all. **No bid rule can fix a margin problem.** Do not propose one.

---

## The rules the engine runs on

Live in `src/lib/amazon/ad-rules.ts`. Never restate a threshold from memory; read the constant.

```
KILL_SPEND       $4 US, CAD 5.50, MXN 68     spend before any kill applies
KILL_MIN_ROAS    the converting-word floor   (William raised it to 1.5 on 2026-08-23)
BID_FLOOR        $0.10
BID_CONFIRM_CEILING  $0.85   a rule may not raise past this; it asks instead
BID_SEARCH_STEP  $0.10 flat, never a percentage
BID_SHAVE_STEP   $0.02       the gentle cut on a word that already works
BID_CAP          $2.50       the absolute clamp; NEVER raise it above the kill bar (William 2026-08-27)
BID_COOLDOWN_HOURS           minimum gap between moves on one keyword
```

**The shape of the bid rule.** No impressions and no clicks, raise to enter the auction.
Impressions but no clicks, raise to find a clickable position. Getting clicks, **every path is
down**, hunting the cheapest bid that still converts: 2 cents when it is working, 10 cents when it
is not. A spending word is never raised. A cut that made things worse reverses 2 cents at a time.

**The $4 bar is a receipt, not a brake.** It cannot stop a word that spends $8 in a day, and 2,277
keywords times $4 permits about $9,000 a month. When William asks why spend is high, latency and
the rope are usually the answer, not the rule.

---

## What runs by itself

All hourly, all in production on Vercel.

```
:00  report-warm      fetch the numbers
:15  engine-watch     THE WATCHDOG — silent unless something is wrong
:20  ad-engine-ca     Canada
:25  ad-engine-mx     Mexico
:40  ad-engine        US search ads
:50  sb-engine        banner ads
:55  sd-engine        retargeting
     ad-engine-reintroduce   every 6h, deliberately NOT hourly — slow intake is the point
```

The watchdog alerts on **Telegram**, never routine email. William 2026-08-27: *"i dont want to fill
the inbox"*. It sends one heartbeat a day so that silence provably means clean rather than dead.

**Verify a deploy, never assume it.** A merged PR is not shipped. Probe the route unauthenticated:
`401` means live and protected, `404` means it is not there.

---

## Boundaries

Never create accounts, enter credentials, accept terms, or make a payment. William does those.
Never send a real email to a real person without an explicit go. Never combine Social Scene and
Social Boost data on one surface. Phone Assured is a third business; keep its infrastructure
separate from both.

Push to a branch and open a PR. Force-push is blocked. Merging to `main` deploys to production, so
confirm before merging unless William has asked for that specific fix.
