# Keywords — what works, what is dead, what to add

## The questions and their tools

| Question | Tool |
|---|---|
| What is every word spending? | `node scripts/word-spend.mjs` |
| Anything past the bar and still enabled? | `node scripts/over-bar.mjs` |
| Full compliance across products and countries | `node scripts/rule-compliance.mjs` |
| Search terms that earned their way in | `node scripts/harvest-candidates.mjs` |
| The story of one word's bids | `node scripts/bid-history.mjs --word=<text>` |
| What the engine decided | `node scripts/ad-log.mjs` |
| Duplicate copies of the same word | `node scripts/dupe-twins.mjs` |
| Paused Brands words worth reviving | `node scripts/sb-candidates.mjs` |
| Switch off anything under a ROAS bar | `node scripts/kill-below-roas.mjs --roas=1.5 --bar=4` |

`kill-below-roas.mjs` is the safe way to enforce by hand. It previews, then on `--live` it pauses,
**re-reads Amazon twice** to prove the write landed, and writes `kw_kill_ledger`. That ledger is
what the in-month revival reads, so a kill made outside it can never be brought back that month.
Never write a one-off pause script; use this.

## Proving a write landed

A 207 means Amazon accepted the request, not that it happened — 207 is inside the 2xx range and the
body splits into `success` and `error` arrays. Worse, a state read-back showing PAUSED cannot tell
a write that landed from one that landed and was reverted.

**`lastUpdateDateTime` moving is the only proof.** Read it with `includeExtendedDataFields: true`,
compare before and after. Without that flag `extendedData` is undefined and every genuine write
reports as unproven.

## Duplicates

The same word exists more than once under different keyword IDs. Roughly 310 redundant enabled
copies. Amazon states that two of your own campaigns bidding on one keyword **do not compete
against each other**, and the measurement agrees: the auction cost is **$0.00**.

The real harm is governance. Kill one copy and the twin keeps spending while the records say the
word is handled. Measured cost: about **$36 a month**, across 15-16 words. Worth tidying. It is not
a major lever, and it was wrongly called one — do not repeat that.

## The bid ladder is William's rule, not a bug

*"Only raise bid if word is not spending"*, 2026-08-05. A word climbs a rung because it did **not**
spend. There is no ROAS term. That is deliberate: a bid buys entry to the auction, so raising a word
that is already spending only pays more for the same click.

It has been framed as a defect three times and William has corrected it each time. **Do not propose
switching it off.** His actual concern — that the $4 kill arrives late — is the correct one and is
a latency problem.

Consequences to state accurately when asked: raises are made on words with zero clicks by
definition, and several hundred words sit at the $0.85 ceiling.

## The absolute cap: never above the kill bar

William 2026-08-27: *"The most a bid can ever cap at is $4. We're not going above that because it
means one click needs to convert in one click."*

The reasoning is exact and worth keeping: $4 IS the kill bar, so a bid at $4 buys a word exactly
one click before the rule switches it off. A bid above it is a word that must convert on its first
click or die. There is no version of that which makes sense.

So the cap, in every currency, is the kill bar for that currency:

```
  US      $4.00        Canada  CAD 5.50        Mexico  MXN 68
```

`BID_CAP` is currently 2.50, stricter than the rule, and `BID_CONFIRM_CEILING` is 0.85. **However
high the ceiling is ever raised, it never goes above the kill bar.** Resolve it through
`killSpendFor(currency)`, never a bare 4 — a Mexican bid of 14 pesos is 70 cents, not a breach.

## Above the ceiling

`BID_CONFIRM_CEILING` stops a **raise**, not a cut. Words can sit above $0.85 from earlier eras or
manual changes; around 100 do, up to $2.50. A rule will walk them down but never up.

## Intake is deliberately slow

Reintroduction runs every 6 hours, not hourly. William wants slow promotion of untested words
alongside fast switching-off of failures. **Never make intake hourly** — `cron-schedule.test.ts`
fails the build if you do.

Harvest promotes a converting search term to PHRASE and EXACT. New keywords start at $0.37, and the
bar to promote is 2x.

## Things that silently break keyword work

- **The keyword list caps at 1,000 per page.** A count equal to the page size is a cap, not a total.
  Always follow `nextToken`. The real account holds ~3,500.
- **`creationDateTime`, not `creationDate`.** The wrong field matches nothing and reports zero new
  keywords when the engine has been harvesting fine.
- **`kw_lifetime` is keyed by word AND match type**, so summing it double-counts every paused copy.
  De-duplicate before quoting a lifetime total. This produced a threefold overstatement once.
- **A separator dash is rejected by Amazon**; a hyphen inside a word is fine. `clip-on` is legal,
  `tether - durable` is not.
- **Sponsored Brands keyword IDs are 18 digits.** A bare `JSON.parse` rounds them and every write
   404s against an ID that does not exist. Same for Display creative IDs.
