# Operations — inventory, inbox, account health

## Inventory

```
node scripts/inventory-health.mjs    FBA units on hand, all pages
```

Around 280 units late August, falling a handful a day. **Several SKUs are dead or duplicate and sit
at zero** — a zero is not evidence of a stockout. "9 of 13 SKUs at zero" was investigated as a
cause of a sales drop and ruled out.

The flagship carries all 480 reviews. Because that is over Vine's 30-review cap, **Vine enrolment
for it is impossible** — do not propose it. Review velocity is the lever.

## The inbox

```
node scripts/inbox-list.mjs     what is there, read vs unread
node scripts/inbox-file.mjs     label and archive
node scripts/inbox-trash.mjs    reversible 30-day delete of known noise
```

`ES` means email sweep: label and archive, delete only if genuinely not needed. Account is
`hello@phoneassured.com`. Never send to a real person without an explicit go.

## Account health and payouts

```
node scripts/sc-account-status.mjs    opens Seller Central headed; William logs in himself
```

We never see or store his credentials. Two navigation facts worth keeping:

- **Actions and balances are per marketplace.** Switch the selector to United States first, every
  session, or the task you are looking for is invisible.
- **Do not guess Seller Central URLs.** `/payments/deposit-methods` 404s even in US context.
  Use the on-page action or the gear menu.

Settled as of 2026-08: INFORM certification done, US identity and bank verified. Canada's remaining
blocker is KYC identity.

Amazon asks for name, account number and address on a bank document — **never an EIN**. A statement
that masks the account number can never pass. Address format is per-document: the business record
uses `STE 162`, the residential record `UNIT 162`. Never carry one document's format to the other.

## Deploys

Merging to `main` deploys to production. **A merged PR is not shipped** — one production build died
on a database error and three engine runs used the old code while everyone assumed otherwise.

```
npx vercel ls --yes                            is the build Ready or Error
curl -so /dev/null -w '%{http_code}' https://amzn.phoneassured.com/api/cron/<route>
```

`401` means the route is live and refusing an unauthenticated caller, which is correct. `404` means
it did not ship. Preview deploys always fail because the database URL is Production-only; that is
expected and not a signal.

Force-push is blocked. If a rebase is needed, push a new branch and open a fresh PR.

## The database

Turso. Tables worth knowing:

```
ad_engine_log        what the engine did, plus a per-run heartbeat and a country
kw_bid_history       every bid move, with the reason in plain English
kw_bid_state         current bid, ladder state, escalation stamp
kw_kill_ledger       kills by month — what the in-month revival reads
kw_day / kw_month    our own copy of ad history
ads_report_jobs      the report cache, keyed by purpose+profile+dates+columns
```

**The log is not the engine.** `ad_engine_log` has died twice mid-run while the engine kept working
correctly. Judge from `kw_bid_history` plus a live Amazon read, never from the log alone.
