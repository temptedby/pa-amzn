# Decisions Journal — PA-AMZN (Phone Assured Amazon Automation)

A running log of meaningful decisions, the reasoning behind them, options
considered, and trade-offs accepted. Different from the daily summaries
(`confabulator/daily-summaries/YYYY-MM-DD.md`, which capture *what shipped*).
This file is the *why* — more detailed, decision-by-decision.

## Format

Each entry is dated with timestamp `YYYY-MM-DD HH:MM PT` and answers seven
questions (inspired by ADRs — Michael Nygard, 2011 — but lighter weight):

- **Context** — what triggered the decision (data point, blocker, signal)
- **Options considered** — alternatives evaluated and why we passed
- **Decision** — what we chose
- **Reasoning** — the load-bearing argument
- **Industry source / best practice** — at least one cited reference. "Industry standard" without a name doesn't count.
- **Trade-offs accepted** — what we explicitly gave up
- **Status / date to revisit** — done, in flight, or "check back when X happens"

### The 6-step research gate (apply BEFORE any meaningful change)

Production code, real-person emails, DB changes, deploys, payments, refactors,
new dependencies — anything hard to reverse — passes this gate first:

1. **Problem** — what's wrong + what success looks like. Quote specifics.
2. **Industry standard** — cite at least one external pattern (OWASP, RFC, official docs, well-known tool).
3. **Codebase / reality** — open files, run commands, cite line numbers. Don't guess.
4. **Options** — 3-5 paths with effort / impact / trade-offs.
5. **Recommendation** — pick one, explain why, say what NOT to do and why.
6. **Open questions, trade-offs accepted, rollback plan.**

Drafts for review are always fine. Real sends to real people require explicit go-ahead.

## Entries

---

### 2026-06-06 — Ads API blocked on address mismatch; decouple the bid engine via a manual bulk-file bridge

**Context.** The Amazon Advertising API is the *only* thing gating the rest of PA-AMZN. SP-API has been live since 2026-04-20 (inventory, restock recs, shipments). The Ads API was submitted 2026-04-21 as Direct Advertiser tier with approval expected ~04-24. It never landed — and nothing has shipped to the repo since 2026-04-21 (a ~6-week gap; the last commit is `88b5a6a`). William reports the application was **rejected because "my address didn't match."** The rejection email is in the Gmail inbox (forwarded to himself); reading it to confirm the exact field is a pending task — Gmail MCP needs auth. The momentum bid engine and harvest engine are already built and tested (38/38 passing); they are pure functions waiting on data I/O. `src/lib/amazon/ads-api.ts` was never written.

**Options considered.**
1. **Wait on re-approval, then build the live API path.** Single track. Rejected as the *only* plan: it leaves the core IP idle behind Amazon's gatekeeping for an unknown number of weeks, and the same address mismatch could recur.
2. **Manual bulk-file bridge (no API needed).** Megan downloads a Bulk Operations sheet from the Ads console; the app ingests the CSV, runs the existing `decide()` + harvest engines, and emits a ready-to-upload bulk sheet + a diff email. She re-uploads it. Delivers the bid engine's value today, zero API dependency.
3. **Re-apply at a different access tier.** Deferred until we read the rejection email — may not be necessary if the fix is just an address field.

**Decision.** Run **two tracks in parallel:** (A) fix the address mismatch and re-apply for live API access; (B) build the manual bulk-file bridge so the bid/harvest engines start producing value now, independent of approval. Track B's output (a previewable change-list) is useful even after the API goes live, as an audit/preview mode.

**Reasoning.** The project's actual IP is the momentum engine, not the API plumbing. Coupling delivery to Amazon's approval queue has already cost ~6 weeks. Decoupling via the officially-supported bulk-sheet workflow de-risks the whole project and starts compounding value immediately, while the admin fix proceeds on its own clock.

**Industry source / best practice.** Amazon Ads [Bulk Operations](https://advertising.amazon.com/help) is Amazon's own supported path for programmatic-style bid/keyword management without API access. The "Assign API access to a Login with Amazon application" step ([Amazon docs](https://advertising.amazon.com/API/docs/en-us/guides/onboarding/assign-api-access)) is a common silent failure point even post-approval, reinforcing the value of an API-independent path.

**Trade-offs accepted.** Track B requires a manual download/upload by Megan each cycle (not unattended) until the live API is wired. We accept that as a bridge. Identity/address verification for Direct Advertiser tier may require matching the address on the Amazon payee/seller account exactly — exact field TBD pending the rejection email.

**Status / date to revisit.** In flight as of 2026-06-06. Tracking infra (this journal + task list) established today. Design findings logged for tomorrow:
- Both engines are pure functions: `decide(KeywordState, cfg, now)` needs three windows (rolling7d, rolling3d, prior3d); `decideHarvest(SearchTermStats, cfg)` needs one rolling14d window. Schema already has `keywords`, `search_terms` (rolling_14d_*), `hourly_snapshots`, `bid_changes`.
- A single Amazon bulk-ops export is a multi-tab `.xlsx` aggregating *one* date range — it does NOT give daily granularity. So the full momentum (3d-vs-prior-3d) rules can't run from one export. **Proposed v1:** a 7-day export drives the high-value rules that only need one window (kill-switch, dead-keyword, exploration-drop), and a 14-day export drives the full harvest engine. Momentum fine-tuning is layered in later (needs multiple exports or the daily Reporting API). To confirm with William before building.
- Open: confirm which Gmail (`william@besocialscene.com`) holds the forwarded rejection email, and that Amazon console access uses the `hello@phoneassured.com` seller login (separate from Gmail).

---

### 2026-06-07 — Documents-first game plan to get the Ads API live the week of 2026-06-08

**Context.** William wants the Ads API live *this week*, with the right documents lined up in advance so the week is execution, not discovery. He named getting the **"Hello App Phone Assured" app** (the LWA developer application under `hello@phoneassured.com`) set up as priority #1, and noted we already have SP-API access/pre-approval that we should not redo.

**Options considered.**
1. **Re-submit immediately and react to whatever bounces.** Rejected — that's how April's 6-week stall happened; one wrong field round-trips another 72h+.
2. **Document-first: reconcile all three address surfaces and gather both required docs before re-submitting once, cleanly.** *Chosen.*
3. **Pay a third-party agency to handle Amazon verification.** Deferred — not warranted for a single address fix.

**Decision.** Wrote `confabulator/ads-api-launch-plan.md` as a living checklist. Core insight: Amazon's "address didn't match" almost always means a disagreement among **(1) Seller Central business address, (2) tax-interview/W-9 address, (3) the uploaded proof-of-address document** — and a 4th common culprit, the developer/LWA app address. The plan reconciles all four so the fix happens once. Day-by-day Mon→Fri: read rejection email + audit the address surfaces (Mon), gather a ≤180-day proof-of-address doc (Tue), re-submit (Wed), watch for approval + assign API access (Thu–Fri). Track B (bulk bridge) proceeds in parallel since it needs no approval.

**Reasoning.** Each rejected re-submission costs another multi-day SLA cycle; the cheapest path to "live this week" is to make the next submission the last one by getting every address surface and both documents correct up front. SP-API is already authorized, so the work is scoped strictly to the Ads-API identity check.

**Industry source / best practice.** Amazon's own [apply-for-API-access](https://advertising.amazon.com/API/docs/en-us/guides/onboarding/apply-for-access) and [SP-API identity verification](https://developer-docs.amazon.com/sp-api/docs/verify-identity-in-spp) docs: two documents required (identity + proof-of-address), proof-of-address issued within 180 days, name/address must match the tax interview and Seller Central. KYC "single source of truth for address" principle.

**Trade-offs accepted.** The exact mismatched field is still unconfirmed until the rejection email is read Monday (Gmail not yet authed), so the plan covers all four surfaces rather than surgically fixing one — slightly more work, but it removes the guess. Re-application is gated on William doing the Seller-Central/document steps; Claude can't touch those.

**Status / date to revisit.** Plan committed 2026-06-07. Revisit Monday 2026-06-08 after the rejection email is read. Target: approved or cleanly re-submitted by Fri 2026-06-12.

---

### 2026-06-09 — Enable the hello@phoneassured.com inbox the DES way (Gmail API + refresh token), not the MCP connector

**Context.** To read Amazon's emails (the Ads API rejection, future approvals/verification) we need programmatic access to the `hello@phoneassured.com` inbox. I first proposed the claude.ai Gmail MCP connector; William corrected: "this is not the way we enable the inbox" — pointing to how DES and Social Scene do it. Confirmed by DNS that `hello@phoneassured.com` is a Google Workspace mailbox (MX → `aspmx.l.google.com`). Also resolved the document worry: William has a **company bank statement** (Amazon's #1 accepted proof of address) — so Douglas Dean Holdings' thin expense footprint is a non-issue; only the address on it must match the Amazon account.

**Options considered.**
1. **claude.ai Gmail MCP connector.** Rejected by William — not their established method; ties inbox access to a session connector rather than the app.
2. **Gmail API via Google OAuth with a stored refresh token (the DES/Social Scene pattern).** *Chosen.* DES uses raw `fetch` to `oauth2.googleapis.com/token` + the Gmail REST API (no SDK), scopes `gmail.readonly/send/modify`, token stored encrypted in DB (multi-user SaaS).
3. **Service-account domain-wide delegation** (also used in Social Scene for Forms/Drive). Rejected for this: heavier admin setup than a single mailbox warrants.

**Decision.** Replicate the DES Gmail-API pattern, scoped down for PA-AMZN: a **fresh, dedicated** Google Cloud project under the phoneassured.com Workspace (William's choice — keeps the Amazon business self-contained from besocialscene); a **Desktop-app OAuth client**; **`gmail.readonly` only** (least privilege — we read Amazon mail, never send; sends stay on Resend); refresh token stored in **`.env.local` as `GMAIL_REFRESH_TOKEN`**, mirroring `SP_API_REFRESH_TOKEN` (single mailbox → env, not DB-encrypted). Built two zero-dependency Node scripts: `scripts/gmail-auth-setup.mjs` (loopback-OAuth one-time refresh-token mint) and `scripts/find-amazon-email.mjs` (search + read Amazon mail). Setup documented in `confabulator/gmail-inbox-setup.md`.

**Reasoning.** Matching the proven house pattern means the integration is durable and lives in the app (so a future cron can watch for Amazon's approval automatically), not in an interactive connector. Read-only + a fresh project respects both least-privilege and William's company-separation preference. Env-based token storage matches this repo's existing SP-API convention rather than importing DES's DB-encryption machinery for one inbox.

**Industry source / best practice.** Google OAuth 2.0 installed-app loopback flow (Google deprecated OOB `urn:ietf:wg:oauth:2.0:oob`; loopback is the current installed-app redirect). OAuth least-privilege scope selection. Matches DES `src/lib/gmail/client.ts` + `scripts/process-replies-from-inbox.ts`.

**Trade-offs accepted.** William must do the ~10-min Google Cloud console steps (create project, enable Gmail API, create the Desktop OAuth client) — only he can, under the phoneassured.com Workspace. The typed in-app `src/lib/google/gmail.ts` (for cron-watching Amazon mail) is deferred; the two scripts cover the immediate need. Read-only means if we later want to send from hello@ we add `gmail.send` and re-consent.

**Status / date to revisit.** ✅ DONE 2026-06-09 — inbox is live. William created the Google Cloud project + Desktop OAuth client, minted the refresh token, enabled the Gmail API, and `find-amazon-email.mjs` now reads hello@ end-to-end. Refresh token in `.env.local` (gitignored). Debugging lessons worth keeping: (1) the consent flow is a **browser** flow, not an email prompt — opening the URL via `open` on the Mac eliminated the confusion; (2) the repeated "Access blocked / Error 400" was a **truncated copy-paste of the auth URL** (missing `response_type`), not a redirect or propagation issue — the path-less `http://localhost:53682` Desktop redirect was correct all along; (3) the Gmail API must be explicitly **enabled** in the Cloud project (separate 403 `SERVICE_DISABLED` until done). Follow-on: re-consent with broader scopes when we wire Sheets/Drive/Calendar (Tasks 8, 10) and gmail.modify for inbox cleanup (Task 9).

---

### 2026-06-09 — Real Ads API rejection reason found: email-domain ↔ company-name mismatch (NOT a postal address); re-apply as "Phone Assured"

**Context.** With the hello@ inbox finally readable, pulled the actual rejection (Jira ticket **AO-40501**, from S Emmanuel / Amazon Ads API Support, 2026-04-21; auto-closed "Done" 2026-04-28 for no response). It disproves the entire address-mismatch theory we'd built the week's plan around.

**What Amazon actually said (verbatim).** *"We are unable to confirm the relationship between your email domain and company name used to register for the Amazon Ads API. To address this issue, ensure your Amazon login or the email used to access the Amazon Ads API registration form matches your company name. Please do not use your personal email to register."* The email opens *"Hello Douglas Dean LLC."* William's reply added *"Securisee is the company name, Phone Assured is the product, owned by Douglas Dean LLC."*

**Root cause.** The application presented **three different names** (Douglas Dean LLC / Securisee / Phone Assured) and a registration email that didn't map to any of them (william@besocialscene.com appears in the thread — a personal/other-business address). Amazon's identity check (active advertiser account must match the company name and be related to the email) couldn't reconcile it. It was never about a postal address, a bank statement, or LLC paperwork — none of which Amazon requested.

**Decision.** Re-apply (fresh; the old ticket is closed) with ONE consistent identity, anchored on the fact that the **Seller account already shows "Phone Assured"**:
- Company name → **Phone Assured**
- Registration/login email → **hello@phoneassured.com** (business email; domain `phoneassured.com` matches the company name)
- Website → **https://www.phoneassured.com**
- Keep "Douglas Dean LLC" / "Securisee" out of the company-name field (legal entity only where a form explicitly asks); never use besocialscene.

**Reasoning.** Amazon's stated fix is to make the email domain map to the company name and avoid personal email. "Phone Assured" + hello@phoneassured.com + phoneassured.com is a single verifiable identity (the website is live, the brand sells on Amazon, the Seller account name already matches). This is the minimal change from the failed application — same email as intended, the only real fix is putting "Phone Assured" (not the legal entity) in the company-name field.

**Industry source / best practice.** Primary source: the rejection email itself. Corroborated by Amazon's onboarding docs — an active advertiser account must *"match the company name submitted in your request and be related to the email address you provided,"* and to *"use the email registered to your Login with Amazon account"* ([apply for access](https://advertising.amazon.com/API/docs/en-us/guides/onboarding/apply-for-access), [onboarding guide PDF](https://m.media-amazon.com/images/G/01/decassets/Amazon_Ads_API_onboarding_guide.pdf)). KYC single-identity consistency.

**Trade-offs accepted.** Using "Phone Assured" as the company name rather than the legal entity "Douglas Dean LLC" — acceptable because Amazon's check is advertiser-account-to-email consistency, and the Seller account already displays Phone Assured. If a future form step hard-requires the legal entity, we supply Douglas Dean LLC only in that explicitly-labeled field. Approval SLA for Direct Advertiser is ~2-3 business days; the inbox is now wired to catch the response automatically.

**Status / date to revisit.** Re-application guidance delivered + apply pages opened for William 2026-06-09 (he submits, only he can log in as hello@). Closed the obsolete address/proof-of-address task (#6). Watch hello@ for Amazon's response; on approval, proceed to wire `ads-api.ts` (Task 4).

---
