# Ad engine rules (William, 2026-08-02) — the single source of truth

Supersedes the 2026-07-24 spec. Every rule below was decided by William on 2026-08-02
and is implemented in `src/lib/amazon/ad-rules.ts` (pure, unit-tested) and applied by
`ad-engine.ts` (Sponsored Products) and `sbsd-engine.ts` (Sponsored Brands incl. Video,
Sponsored Display).

## Why the rules changed

The 2026-07-24 spec was written on the belief that unmanaged Sponsored Brands Video and
Sponsored Display spend was the ACOS leak. Validated on 2026-08-02 against live campaign
reports, that was wrong:

| Product | July 2026 spend | Sales | Orders | ACOS |
|---|---|---|---|---|
| Sponsored Products | $82.09 | $77.43 | 6 | 106% |
| Sponsored Brands (incl. Video) | **$0.00** | $0.00 | 0 | no spend |
| Sponsored Display | $14.48 | $26.98 | 2 | 54% |
| **Total** | **$96.57** | **$104.41** | **8** | **92%** |

The account is not overspending. It is spending almost nothing ($96.57 in a month against
$996 of store revenue) and losing money on what it does spend. The real mechanism is the
floor trap below.

## The floor trap (the thing the rules must fix)

3,452 Sponsored Products keywords: 2,275 ENABLED, 975 PAUSED, 202 ARCHIVED.
**1,840 of the 2,275 enabled keywords bid exactly $0.10**, the engine floor. Median enabled
bid is $0.10. July CPC was $0.59, so a $0.10 bid wins nothing.

No impressions means no clicks means no orders means no ACOS signal, and every bid rule we
have only acts on keywords that have orders. Both the old convergence engine and the
2026-07-24 rewrite leave these keywords parked forever. Eighty percent of the keyword list is
switched on and invisible. `ad_engine_log` confirms it: in seven weeks live the engine touched
11 distinct keywords out of 2,164 servable ones.

## Rule 1 — KILL

An ENABLED keyword or target is PAUSED for the rest of the month when both hold:

- month-to-date spend is **>= $4.00**, and
- it is not profitable: **0 orders**, OR **ACOS >= 52%**.

52% is the validated break-even on the Single ($9.49 price, $0.62 COGS, $1.42 referral,
$2.52 FBA, so $4.93 contribution; 4.93/9.49 = 0.519). Anything at or above it loses money.
A keyword converting below 52% is profitable and is never killed on spend alone.

Applies identically to Sponsored Products keywords, Sponsored Brands keywords (including
Video) and Sponsored Display targets. Nothing runs without this rule on it.

## Rule 2 — BID

Per run, step the bid **±10%** around the 52% pivot:

- ACOS below 52% (profitable): raise 10%, buy more share.
- ACOS at or above 52%: lower 10%.
- No ACOS signal yet (no sales) and below the kill bar: hold.

Bounded to [$0.10, $2.50], whole cents. Replaces the old ±25% convergence, which produced a
visible six-day oscillation in the log: "phone tethered" climbed $0.35 to $0.94 over nine
consecutive runs, then crashed back to $0.35 in four.

## Rule 3 — HARVEST

A search term that **converts** in any match type is added as **PHRASE and EXACT** into the
ad group it converted in. It then lives under Rule 1: it runs until it converts again or
spends $4 without profit, then it is turned off.

Harvest on the first conversion, not after $4 of spend. This replaces the old bar
(>= $4 spend AND ACOS <= 50%), which harvested 3 keywords in six weeks.

### Amazon's keyword limits are hard limits

Sponsored Products keywords cap at **80 characters and 10 words**. Amazon rejects anything
longer, no matter how well it converted. This is not our policy, it is the API's.

The live engine has been retrying a 98-character, 14-word search term (the Single's own
product title) since 2026-08-01, eight attempts and counting, because nothing checked the
limit and the log recorded the add as successful regardless of the API response.

So: a term over the limit is **shortened to a valid root on a word boundary and harvested**,
not silently dropped. The value is kept, the impossible request is not repeated. If no valid
root can be formed, the term is skipped and the skip is logged.

## Rule 4 — REINTRODUCTION (the floor trap fix)

A keyword parked at the floor is eligible to be brought back when either holds over the
longest history the Ads API will give us:

- it has **never spent** anything, or
- it has spent, and its **ACOS is under 50%**.

Eligible keywords are raised off the $0.10 floor to a bid that can actually win a click.
They then live under Rule 1 like everything else: $4 of rope, then off.

### The rate limits, and why they exist

William's constraint, verbatim: "I don't want 1000 keywords spending $4 and putting us deep
into negative." 1,840 eligible keywords at $4 each is $7,360 of theoretical exposure against
a store doing roughly $414/month of contribution. So reintroduction is throttled three ways
at once, and all three must pass:

| Guard | Default | What it caps |
|---|---|---|
| `REINTRO_PER_DAY` | 10 | new keywords switched on per day |
| `REINTRO_MAX_IN_TRIAL` | 40 | keywords simultaneously on trial (spent < $4, no conversion yet), so open exposure never exceeds 40 x $4 = $160 |
| `REINTRO_MONTHLY_SPEND_CAP` | $150 | total month-to-date spend by the reintroduced cohort; at the cap, no new introductions until next month |

Ordering: keywords with proven history (converted, ACOS under 50%) go first, best ACOS first,
then never-spent keywords. So the strongest evidence is tested first and the cap is spent on
the most likely winners.

### The history window is not "lifetime"

Amazon's Ads API retains Sponsored Products report history for roughly 60 to 95 days. True
lifetime figures exist only in the Campaign Manager console. Everything here uses the longest
window the API allows and is labelled as such. A keyword with no data inside that window is
treated as "never spent", which is the conservative reading only because Rule 1 still caps it
at $4.

## Rule 5 — the cron must actually run

The $4 cutoff is only as reliable as the job that enforces it. `vercel.json` schedules the
engine every 6 hours (00/06/12/18 UTC). `ad_engine_log` shows 30 runs at 00:00, 25 at 06:00,
6 at 18:00 and **none ever at 12:00**. Runs that take no action write no rows, so this is
suggestive rather than proof, but a 12:00 run has never once produced an action in seven weeks.

Before reintroduction goes live, the engine must record a heartbeat row on every run whether
or not it acted, so "did the cutoff run?" is answerable. Reintroduction stays off until the
heartbeat shows the cron firing on schedule.

## What is deliberately NOT in these rules

- No ACOS target above break-even. 52% is the ceiling, not a goal.
- No bulk enablement. Ten a day, never more.
- No live SB/SD writes until the pause and bid endpoints return a real 200. Read paths are
  verified (`GET /sb/keywords` 200, `GET /sd/targets` 200); the write paths are not.
