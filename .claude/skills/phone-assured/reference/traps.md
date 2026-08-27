# Traps — read this before debugging anything that looks impossible

Most "impossible" results in this account are already here.

## Numbers that lie

**`purchase-date` is UTC.** Slicing it to ten characters moves every evening sale to the next day
and reverses Saturday against Sunday. Month totals agree either way, which is why it hid for weeks.

**The all-orders report ignores the marketplace filter.** It returns US data whatever you ask for.
Read the `sales-channel` column, never the request. It also caps at **30 days**; ad reports cap at
**31**; Amazon's real retention was measured at **96 days**.

**`kw_lifetime` is keyed by word AND match type**, so summing it credits every paused copy the full
amount. One such total was overstated threefold. De-duplicate first.

**A partial day is not a day.** A reading at 21:35Z reported $28.56 against $65.45 and "the best
shape of the month"; the day finished at $86.89 against $41.96. Two thirds landed after the look.

**Sales land for 14 days after the click.** A recent day's ROAS always understates. Cumulative is
the trustworthy figure.

**Compare equal windows.** Raw totals across different window lengths reversed every correct cut
once. Compare as a daily rate.

**Currency.** A bare 4 against a peso account is meaningless. Resolve every bar through
`killSpendFor(currency)`.

## Things that report success without succeeding

**HTTP 207 is not success.** It is inside the 2xx range and the body splits into `success` and
`error`. `applied=1` was logged forty times for a keyword Amazon refused every time.

**A state read-back cannot prove a write.** PAUSED-after cannot distinguish a write that landed
from one that landed and was reverted. **`lastUpdateDateTime` moving is the only proof**, and it
needs `includeExtendedDataFields: true` or `extendedData` comes back undefined and every real write
reports as unproven.

**A merged PR is not shipped.** One production build died and three engine runs used old code.
Probe the route: `401` live, `404` not there.

**A count equal to the page size is a cap, not a total.** The keyword list pages at 1,000; the
account holds ~3,500.

**Silence means two different things.** Alert emails failed instantly for twenty days because
production had no API key, and the absence of mail read exactly like good news. An engine that ran
and did nothing looked identical to a cron that never fired. Always separate "it ran" from "it did
something", and always emit a heartbeat.

**`ad_engine_log` is not the engine.** It has died mid-run twice while the engine kept working — on
2026-08-26 it lost 61 verified Amazon writes. Judge from `kw_bid_history` plus a live read.

## Fields and endpoints that quietly do nothing

- **`creationDateTime`, not `creationDate`.** The wrong one matches nothing.
- **18-digit IDs.** Sponsored Brands keyword IDs and Display creative IDs exceed
  `Number.MAX_SAFE_INTEGER`; a bare `JSON.parse` rounds them and every write 404s. Extract as
  strings from the raw text.
- **`/sb/keywords` needs its own Accept media type.** `application/json` gets a 406. Use
  `fetchSbKeywords` from `sb-v2.ts` rather than hand-rolling it. This has been got wrong twice.
- **Sponsored Brands v3 reporting excludes single-ad-group legacy campaigns**, which is both of our
  spending ones. Use the v2 HSA day reports.
- **Sponsored Display reports take 10-15 minutes.** Pending at 550 seconds is normal.
- **A separator dash is rejected** by Amazon; a hyphen inside a word is fine.
- **Compatibility's filterable field takes snake_case tokens** and rejects display names, including
  Amazon's own example.
- **Do not guess Seller Central URLs.** `/payments/deposit-methods` 404s even in US context.
- **Seller Central actions are per marketplace.** Switch to United States first, every session, or
  the task is invisible.
- **Preview deploys always fail** because the database URL is Production-only. Not a signal.
- **Force-push is blocked.** Rebase onto a new branch and open a fresh PR.

## Reasoning traps

**Trusting a label over a live read.** A Store Status panel said Mexico's listings were inactive
while the Listings API said `DISCOVERABLE, BUYABLE`. Five of six corrections in one day were this
same error.

**Calling an unshipped rule "correct".** If William stated a threshold, that is the threshold. The
code lagging is a delivery backlog, not a property of the account.

**Narrowing or widening a stated rule.** Both are equally wrong and equally quiet. Implement it
literally and ask about the neighbouring case.

**Calling William's own rule a bug.** The bid ladder that raises a word for not spending is his
rule from 2026-08-05, working as designed. It has been framed as a defect three times.

**Assuming the queue is the problem.** Asking Amazon for less data does not make a report faster:
27 days built in 9.1 minutes, 1 day in 10.0, requested side by side.

**Config as proof.** Reading the git tree, an env var or a budget figure is not evidence that
something ran. Probe production.
