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

### 2026-06-09 (later) — Ads API SUBMITTED as Phone Assured; Playwright form automation; Google access broadened; inbox 769→61

**Context.** Same-day continuation after finding the real rejection reason. Goal: actually submit the corrected application, then start the content + inbox workstreams.

**What happened.**
- **Ads API SUBMITTED.** Direct Advertiser application filed as **Phone Assured** (Company legal name + Brand name), website https://www.phoneassured.com, account type *Amazon seller*, countries US/CA/MX, with own-campaign bid/keyword automation justification + consent. Confirmation email *"Amazon Ads API Registration Request Pending"* received in hello@. Awaiting review (~2–3 business days). Caveat being watched: the ad account brand displays as **Securisee** (per the payout email "Congratulations Securisee!"); we deliberately optimized for the *documented* rejection (email↔company-name, which Phone Assured satisfies vs hello@phoneassured.com). If the reviewer wants the account brand instead, we pivot — but Securisee has no matching email domain, so Phone Assured was the right first move.
- **Playwright form automation** (`scripts/pw-ads-inspect.mjs`, `scripts/pw-ads-fill.mjs`): headed browser with a persistent profile (`.pw-profile`, gitignored) so William logs in once (no creds in code); inspect dumps every field, fill populates all data fields and **verifies each read-back before submit**. Amazon's custom checkboxes needed label/force clicks. William added CA+MX and clicked submit.
- **Google access broadened** from `gmail.readonly` → `gmail.modify` + `drive.readonly` + `spreadsheets` + `calendar` (one re-consent) for inbox cleanup, Drive content, and the Flippa financials sheet. Token rotated in `.env.local`.
- **Inbox cleaned 769→61.** `scripts/inbox-clean.mjs` archives Gmail's Promotions/Social/Updates buckets with KEEP overrides for personal/actionable mail + protected humans (Flippa brokers, fbareviews, Amazon `dev-reg-vetting`, buyer-seller messages). Archived 708; reversible (All Mail). Drive reader (`scripts/drive-list.mjs`) ready pending Drive-API enable + folder share to hello@.

**Decisions / learnings.** For a one-time, identity-sensitive submit, Playwright = inspect + fill + *verify-gate*, with the human doing login and the final click — never blind auto-submit. For inbox cleanup, archive (reversible) not delete, and lean on Gmail's own categories with explicit human/actionable KEEP overrides.

**Status.** Application PENDING (watch hello@). Inbox clean. Next: daily auto-clean + needs-attention digest email; Drive content once the folder is shared.

---

### 2026-06-09 (evening) — Ads API APPROVED + wired LIVE; first ad optimization applied by hand before automating

**Context.** Morning's diagnosis (rejection = email↔company-name mismatch, not address) led to a same-day resubmission as **Phone Assured**, **approved in ~1 hour**. Sales are down ~90% and ad spend had collapsed to ~$60/14d at 115% ACOS — the core lever. The momentum bid + harvest engines were built/tested in April but never had an API to drive.

**Options considered.**
1. **Full auto from day 1** — pull → decide() → auto-push across all 3,424 keywords. Rejected for day 1: $9.49 thin margin, and blind automation on a just-connected account is risky.
2. **Apply the few obvious cases by hand, then build the daily runner.** *Chosen.* The report surfaced 2 unambiguous bleeders ($28 wasted on competitor term "holdmate", 0 sales) and 3 unambiguous winners (22-23% ACOS throttled at $0.37). Pausing/raising those is low-risk, high-value, and demonstrates the engine's logic on real data before automating.
3. Preview everything first — valid, but the 5 obvious changes were worth doing immediately.

**Decision.** Wired the live Ads API (`ads-api.ts` + OAuth/profile/report/apply scripts), then **applied 5 high-confidence changes to live ads with William's approval**: paused the 2 "holdmate" bleeders, raised the 3 winners +50%. Next build is the **full daily runner** (kill-switch + momentum + harvest-new-keywords + relaunch-paused-winners, preview→approve→auto).

**Reasoning.** The account isn't broken — it's a switched-off agency (Adverio) structure (10 enabled / 21 paused, 3,424 mostly-dormant keywords). Fastest recovery: stop the obvious bleed, scale proven winners, then let the engine systematically re-activate the paused winners + harvest. Preview-then-apply respects the thin margin; the engine's built-in kill-switch + 6h rate-limit + soft-cap are the guardrails.

**Industry source / best practice.** Standard performance-PPC: negative-out competitor/non-converting terms, scale low-ACOS winners, harvest converting search terms, prune by a spend-with-no-conversion kill switch. Amazon Ads API v3 (spTargeting reports, /sp/keywords updates).

**Learnings worth keeping.** (1) Ads API scope is **`advertising::campaign_management`** (double colon), not the older `cpc_advertising:` — "unknown scope" until corrected. (2) The onboarding/binding link must be clicked in a session with **no other Amazon accounts** (the same besocialscene trap that caused the original rejection) — a fresh browser guarantees it. (3) v3 write APIs want **IDs as strings** even though reports return them as numbers ("NUMBER_VALUE can not be converted to a String"). (4) The proxy was 307'ing `/api/cron/*` to /login since April — the daily cron never ran; now exempted.

**Trade-offs accepted.** Manual one-time apply (not yet automated) for the 5 cases; the daily runner generalizes it. Ad-spend monthly attribution + "Revenue from Ads" (Flippa col J) still need a couple days of Ads data / the Reporting API to backfill.

**Status / date to revisit.** Ads API LIVE 2026-06-09, first optimization applied. Next: build the daily engine runner (preview→approve→auto). Then content (graphics/videos from Drive → IG/FB/Amazon Posts, Task 20) and Canada reinstatement (Task 11). Financing research (Payability/Amazon Lending, Task 23) flagged for real 6-step, no fabrication.

---

### 2026-06-09 (correction, for accuracy) — exactly what changed in the ad account today

To be precise about today's live ad changes (no overstating):
- **Paused: 2 keywords** ("holdmate phone lanyard" ×2 — competitor term, $28 wasted/0 sales). Applied ✓.
- **Raised: 3 keyword bids** ("retractable phone lanyard tether" $0.37→$0.55, "cell phone lanyard" $0.37→$0.55, "retractable cord for phone" $1.11→$1.67). Applied ✓.
- **NO new keywords were added.** The negative-keyword "holdmate" add FAILED (sent `CAMPAIGN_NEGATIVE_PHRASE`; valid is `NEGATIVE_PHRASE`) and was **not** applied — code fixed for the daily runner, but not re-run today. **No harvest / new-keyword creation yet** — that is the next build (the daily engine runner: harvest converting search terms <40% ACOS → new exact+phrase keywords, plus re-activating paused past-winners).
- Net live changes today = 2 pauses + 3 bid raises. Everything else (negatives, new keywords, paused-winner relaunch) is queued in the daily runner.

---

### 2026-06-09 (late) — Content engine: reuse the DES method as standalone PA scripts; Meta connection is the gate

**Context.** With ads live + the content strategy set (boating flagship, atomize each asset into Reel+Feed+Story), William wants to build the content engine, reusing Social Scene's content-building research/method, and confirm we can post to Phone Assured's own FB/IG.

**Reality (explored DES/SS tooling).** DES already has the full machine: Meta Graph publishing routes (`social-share/*`, `/cron/social-publish`), Meta OAuth (`/analytics/meta/*`), and AI content-gen scripts (`social-scene-ai-graphics.ts`, Flux/fal `-kontext-scenes2`, Canva `-canva-*`, video `-montage`). Posting needs `META_APP_ID/SECRET` + a page access token + IG business id. **PA has none of these tokens yet** — it has the Drive library (25 videos/146 images) + the strategy, but not a Meta connection.

**Options considered.** (a) Standalone PA scripts mirroring the DES method; (b) port the whole social-share engine into PA-AMZN; (c) use the DES app for PA. (c) rejected — two-companies rule (PA must be self-contained, separate Meta accounts/publishing). 

**Decision.** **(a)** — build standalone PA content scripts that mirror DES's proven approach (recut existing videos → Reels first, then Flux/fal AI creatives + Canva graphics; a Meta publisher that atomizes one asset → Feed+Reel+Story, staggered). Reuse SS's *method/tooling*, never its data/audiences. **Gate:** connect Phone Assured's own FB page + IG business account via a Meta app + OAuth — that's the first action tomorrow; nothing posts until tokens + a test post are verified.

**Reasoning.** Standalone scripts match how the rest of PA-AMZN is built (gmail/ads/flippa scripts), keep PA self-contained, and let us start from the proven existing ad videos (fast) before layering AI generation. Atomization (Feed=permanent anchor, Reel=discovery, Story=daily frequency) covers all audience behaviors.

**Industry source / best practice.** Content atomization (Gary V's content-pillar model); Meta Graph API IG `media_publish` + page feed; reuse of the DES social-share + AI-graphics pipeline.

**Trade-offs / risk.** Meta publishing permissions may need app review (verify before relying on it). Some content-gen depends on Flux/fal/Canva API keys for PA. Don't post until a verified test post.

**Status / date to revisit.** Plan + 6-step saved in `content-strategy.md` for tomorrow. First action: Meta OAuth for @phoneassured. Then content-gen + publisher + first batch (4 recut videos + 2 boating creatives) + Amazon content (A+, Posts, hero-image A/B).

---

---

### 2026-06-10 — Daily ad engine runner built (preview-first, whole-account)

**Context.** Yesterday's optimization was a one-off (`ads-apply.mjs`: 2 pauses + 3 raises). William wants the daily engine: kill-switch + momentum bids + harvest + relaunch paused winners, across all 3,424 keywords, preview→approve→auto.

**Options.** (a) Generalize the working `ads-apply.mjs` into a preview-first runner using the 14d report; (b) wire the full tested `bid-engine.ts`/`harvest-engine.ts` with proper 3d/prior-3d windows via a daily-granularity report. (b) is the eventual target but needs windowed data plumbing.

**Decision.** Ship (a) now as `scripts/ads-engine.mjs` — kill (≥$4/0 orders→pause), scale (ACOS<25%→+20%, <40%→+10%), cut (≥60%→−15%), relaunch paused winners; floor $0.10 / cap $2.50; preview by default, `MODE=live` to apply. Hardened report polling for Amazon's 425 duplicate-report response.

**Reasoning.** The ACOS-bracket logic is the same shape that worked live yesterday, is safe, and gets a daily cadence running immediately. Today's preview was tiny and correct (kill 1 / scale 2 / cut 1), matching the account's small spend.

**Industry source.** Amazon Ads API v3 (`/sp/keywords` PUT, Reporting v3 spTargeting); standard ACOS-threshold bid management.

**Trade-offs / risk.** Not yet the true momentum engine (no 3d/prior-3d windows); relaunch returns 0 on 14d data. Mitigation: next add a long-lookback pass. Live writes gated behind `MODE=live` + preview.

**Status.** Preview verified; apply pending William's go. Lifetime-relaunch pass queued.

---

### 2026-06-10 — "Lifetime words to relaunch" needs a long-lookback pass (not 14d)

**Context.** William: paused keywords that did well historically should go live again. The 14d relaunch check returns 0 because paused keywords get no recent impressions.

**Decision.** Add a separate relaunch pass over the **maximum report window the API allows (~60-65d, the data-retention ceiling)** to surface paused past-winners (orders + ACOS under threshold over that window), then re-enable. True "lifetime" beyond ~65d isn't available via the API (retention limit) — note that openly, don't pretend to it.

**Industry source.** Amazon Ads Reporting v3 date-range + ~60-65d data-retention limits.

**Trade-offs.** Can't see pre-65d history through the API; the old "Adverio" winners older than that need a manual/bulk export if we want them. Status: queued for the next engine build.

---

### 2026-06-10 — Canada reinstatement: canonical identity confirmed from the bank statement; Delaware unresolved

**Context.** amazon.ca selling is blocked on a documents "could not align" verification. William granted Drive access and handed over statements; goal is to assemble the package and align the identity.

**Reality (read the actual docs).** May 2026 PNC statement → **`Douglas Dean Holdings LLC` / `730 W Lake St, Ste 162, Chicago, IL 60661-1010`** (fresh, in Amazon's window, #1 accepted proof). The only formation docs on hand are the **2011 Illinois** Articles of Organization + 2011 EIN letter (older addresses). No Delaware Certificate of Formation found anywhere we can reach; the reported DE move is undocumented to us. A "Cynthia Lafferty W9" was her personal SSN form — wrong doc, deleted.

**Options.** (a) Submit bank statement + align Seller Central name/address/state, escalate to live video verification if it bounces; (b) also produce the Delaware formation doc; (c) discover the entity is still Illinois, not Delaware.

**Decision.** Prep the package around the bank statement (a). Two real mismatch roots to fix: legal name must read **"Douglas Dean Holdings LLC"** (stop dropping "Holdings"), and **state of formation must be verified** — William searches icis.corp.delaware.gov (free) to confirm DE vs IL and get the file number; orders a certified Certificate of Formation only if Amazon requires it.

**Reasoning / boundary.** Bank statement is Amazon's top accepted proof; exact-match on name/address/state is what these KYC checks enforce. I do **not** log into Seller Central or upload identity documents — William's login + identity-sensitive; I assemble, he submits.

**Industry source.** Amazon Global seller identity/address verification (KYC/PCMLTFA); Delaware Division of Corporations entity search + certified-copy service.

**Trade-offs / risk.** If the entity was never actually converted to Delaware, Seller Central's state field and the formation doc must say Illinois — guessing "Delaware" would re-trigger the mismatch. Verify before submitting. Tooling: installed `poppler` to read scanned PDFs; added `scripts/drive-find-docs.mjs`.

**Status.** Proof-of-address ready. Pending: William verifies DE/IL on the state site, aligns Seller Central, reads Amazon's exact ask, then submits.

---

### 2026-06-10 — Review catch-up batch crashed on Vercel; safe to retry, none sent

**Context.** William wants another ~60 review requests out (oldest→newest). The production `review-requests?catchUp=1` endpoint returned **500 INTERNAL_FUNCTION_INVOCATION_FAILED** at ~42s.

**Finding.** Platform-level crash, not app logic (`maxDuration=300`; engine catches its own errors). **No double-send risk on retry** — the engine checks Amazon's solicitation availability first, and Amazon blocks a second request per order. So zero reviews went out today, and a rerun is safe.

**Decision.** Reroute: run the engine locally (avoids the serverless crash, full visibility) or fix the function, then send. Not done today.

**Status.** Open — 0 of the intended ~60 sent.

---

### 2026-06-10 (cont.) — Sales-drop diagnostic: a wrong first answer, corrected to the real cause

**Context.** Still down ~90%; June ACOS reported ~220% ("never seen it that bad"). William: "do a review and test everything." Need the real cause, not a guess.

**What happened (and the mistake).** Built `scripts/diagnose.mjs` (SP-API inventory + Buy Box + ad conversion). First run used a hardcoded ASIN list copied from an old gameplan doc and concluded "out of stock on 3 of 4 ASINs, that's the cause." **William challenged it** (he saw 16 units on the 3-Pack). He was right and I was wrong — the script read retired/duplicate SKUs and collapsed by ASIN (last-SKU-wins).

**Correction (raw all-SKU dump).** Real stock is healthy: Single B07Y5GZP1T **242** (live SKU 57-P4AJ-J4AC; the dead dupe XR-S5DA-VB4S reads 0), 2-Pack 35, black 3-Pack B097MK5VZ4 **16** (I'd queried the retired white 3-Pack B097MHPL12=0), Pro B0BLLJLSDP **28** (I'd read the old Pro ASIN B0CFYVNBJX=0). Out-of-stock retracted.

**The real diagnosis (`ads-month.mjs`).** June: $32.90 spend / $10.49 sales / 56 clicks / **1 order** / 11,836 impr → **ACOS 314%, CVR 1.79%**. All spend is on the in-stock, buy-box-winning Single (not dead ASINs). Two real causes: **(1) the account is dormant** ($33/mo; the old Adverio agency left ~21 campaigns paused; 2,267 keywords sit "enabled" inside paused campaigns so they never spend), and **(2) conversion is weak** (1.79% vs ~10% healthy → the 3.8★ + listing).

**Decision.** Recovery is two-pronged: **turn the account back on intelligently** (relaunch paused campaigns that historically converted, harvest converting search terms into new keywords, scale converters, kill wasters) and **lift conversion** (keep the review engine firing on the 3.8★, build A+ content, run the hero-image A/B). Bid tuning alone was never going to fix a dormant, low-converting account.

**Industry source.** Amazon ad ACOS/CVR benchmarks; FBA Inventory API per-SKU truth vs. stale ASIN maps; classic "out-of-stock vs conversion vs dormancy" triage.

**Trade-offs / lesson logged.** Never diagnose off a hardcoded ASIN/SKU list — pull the live inventory SKUs every time. Verify a surprising number before acting on it (the user caught this; the 6-step "open files, cite reality, don't guess" rule applies to live data too).

**Status.** Cause identified. Action (relaunch + harvest + bid moves) gated on the 90-day chunked report (`ads-harvest.mjs`).

---

### 2026-06-10 (cont.) — Ad keyword review must be chunked into 30-day windows

**Context.** William wants to know which keywords converted "over the last two and a half months" to add, turn off, or re-bid.

**Reality.** Amazon Ads Reporting v3 rejects any report whose date range exceeds **31 days** ("must not exceed maximum range (31 days)"). A single 60-90d pull is impossible.

**Decision.** `ads-harvest.mjs` pulls **three 30-day windows (~90d)** per report type and aggregates by searchTerm / keywordId / campaignId. Three views: (A) **campaign history** → paused campaigns that converted <40% ACOS are relaunch candidates; (B) **search-term harvest** → converting customer searches not already keywords → add as exact/phrase; (C) **keyword perf** → turn off (≥$4/0 orders), raise (ACOS<25%), lower (ACOS≥60%). Preview-first.

**Industry source.** Amazon Ads API v3 reporting 31-day max range + ~60-65d data retention; standard search-term harvesting + paused-winner relaunch.

**Trade-offs.** Data older than ~60-65d may be unavailable (retention) — the oldest window can come back thin. Status: running; apply on review.

---

### 2026-06-10 (cont.) — Content calendar built on the Social Scene cadence

**Context.** William wants to start producing graphics/content for @phoneassured + Amazon, using the Social Scene method, with a 1-2 month calendar. SS posts 4x/day + an end-of-day recap; each post atomizes Feed→Reel→Story; recap is a slideshow of the day's 4.

**Decision.** `confabulator/content-calendar.md`: the 4-posts + recap-slideshow model, 5 pillars (boating flagship, anti-theft, anti-drop, everyday, warranty), a weekly pillar-rotation grid, an 8-week summer→back-to-school theme arc, a fully spec'd sample Week 1 (28 posts), and a parallel Amazon track (Posts + A+ + hero A/B) fed by the same assets. Reuse the existing 25 videos / 146 images + located source docs first; AI fills gaps.

**Reality (source assets, `drive-blogs.mjs`).** Found reusable PA docs: "Uses for Phone Assured for activities / other items to attach to," "Stats on phones dropped in home," "Personas/Content," "Travel Hacks," "Billo Scripts," "Nov 2020 Website Copy," "Friends & Family Reviews."

**Industry source.** Content atomization (pillar model); Meta Graph IG `media_publish` + page feed; the DES social-share pipeline (method reuse only, two-companies).

**Trade-offs / gate.** Building graphics needs no keys (HTML→Playwright + ffmpeg recuts); AI needs `FAL_KEY`; publishing needs @phoneassured's own Meta connection (page token + IG id) + a Blob token. Nothing posts until a verified test post.

**Status.** Calendar + asset map done. Next: connect Meta, build the Week 1 batch.

---

### 2026-06-11 — Applied the ad optimization LIVE + built organic-growth playbook

**Context.** William: "we have no sales today, work the ads account" + confirmed the strategy (add converting search terms as exact+phrase, cut $4 wasters, re-bid by ACOS, check every few hours).

**Decision + action (LIVE, `scripts/ads-apply2.mjs`).** Applied to the US account: paused 3 proven wasters (`cell phone tether tab heavy duty`, `holdmate`, `leash for iphone`); added 14 keywords (7 converting search terms × exact+phrase: phone tethered, securisee phone tether, retractable phone holder for disabled person / with belt clip, cell phone case with tether strap, retractable tool tether, wired anti theft phone strap) into the Branded Manual campaign; raised 3 low-ACOS converters, lowered the high-ACOS ones. All 207-multistatus success except one archived keyword Amazon rejected (expected). Harvest keywords go to a MANUAL ad group (auto campaigns reject keywords).

**Reasoning.** The 90d review (`ads-harvest.mjs`, chunked 30d windows — API max range is 31d) showed the account is dormant (21/33 campaigns paused, none converted in 90d so no data-backed relaunch), one Auto campaign carries sales, and 8 converting search terms weren't keywords. Turning those into keywords + cutting waste is the immediate, reversible lever.

**Open (William's ask): run every few hours.** Next build = wrap the kill-switch + harvest + bid logic into a Vercel cron route on a few-hour schedule (currently manual scripts + the once-daily sync). Plus a health check that re-researches if the system isn't producing.

**Industry source.** Amazon Ads API v3 (keyword create/update, 31-day report cap); standard search-term harvest + ACOS bid management.

**Trade-offs.** New keywords at $0.50 are unproven at the keyword level (were proven as search terms); monitor. Archived-entity edits fail silently-ish (logged).

---

### 2026-06-11 — Organic-growth playbook (4 platforms, 2026, cited)

**Decision.** `confabulator/organic-growth-playbook.md`: add TikTok + YouTube Shorts + Pinterest to IG/FB; rewrite every caption as a search result (keyword-first, not hashtag-stuffed, 3-5 niche tags); one source video → 4 placements (always strip TikTok watermark); Pinterest as the evergreen Amazon-traffic channel; micro-creator gifting wks 3-4; honest cadence caution (2-3 strong source pieces/day beats forcing 4 weak). Keyword/hashtag sets per pillar + 30-day plan + 5 metrics included.

**Industry source.** 2026 best-practice across Later/Toptal/Buffer (IG), SEO Sherpa/Metricool (TikTok), JoinBrands/HashtagTools (YT), Social Media Examiner (FB), Outfy/SEO Sherpa (Pinterest), plus Amazon A10 rewarding off-Amazon traffic. Seeding-ROI figures flagged vendor/directional.

**Status.** Playbook saved; fold the keyword sets + 3 new platforms into `content-calendar.md` next; publishing still gated on connecting @phoneassured's Meta + creating the TikTok/YT/Pinterest accounts.

---

### 2026-06-14 — Ad engine made autonomous (Vercel cron, every 6h)

**Context.** William: "build something that runs autonomously even when my computer/terminal isn't on." The ad logic lived in manual `.mjs` scripts.

**Decision.** Port the logic to `src/lib/amazon/ad-engine.ts` + a CRON_SECRET-auth route `src/app/api/cron/ad-engine`, scheduled every 6h in `vercel.json`. Reuses the existing cron + email pattern (no new dependency; chose Vercel cron over Inngest for zero-friction since infra already uses it).

**Design (safe-to-repeat).** Kill-switch (≥$4/0 orders → pause) and harvest (converting terms → exact+phrase, deduped) are idempotent. Bids use **target-ACOS convergence** (toward 30%, capped ±25%/run) instead of relative nudges, so repeated runs converge rather than compounding to the cap. Emails a summary only on action/error.

**Reasoning.** A few-hourly loop must not compound; target-based bidding is the standard fix. Verified: deploy → first dry-run failed (`ADS_* env not configured`, creds were local-only) → added `ADS_*` to Vercel env → redeploy → production dry-run returned sensible actions (pause 1, re-bid 5) in 118s.

**Industry source.** Target-ACOS automated bidding; Vercel Cron; idempotent job design.

**Trade-offs / risk.** 6h cadence requires Vercel Pro (Hobby caps at daily) — first weekend emails confirm; Inngest is the fallback. New keywords unproven at keyword level. Rollback: remove the cron entry from `vercel.json`.

**Status.** Live + verified. Weekend already showed CVR 1.79%→11.1%, ACOS 314%→57% from the manual 06-11 apply.

---

### 2026-06-14 — Amazon content priorities; Amazon Posts is dead

**Context.** William wants to build content for Amazon + IG/FB/TikTok/YouTube; "research how Amazon does content."

**Reality (researched, cited).** **Amazon Posts was discontinued July 2025** — our `content-calendar.md` + plan wrongly relied on it; dropped (task #10 deleted). For a 1.79%-conversion / 3.8★ listing the ranked levers are: main image + Manage Your Experiments A/B → Vine reviews (3.8★ is the top drag) → 7-image set (+~35%) → listing video (+9-15%, UGC ~+23%) → A+ → Brand Story → Premium A+ (+8%→+20%).

**Decision.** Sequence conversion work by impact-per-hour (image + reviews + images first, before spending on traffic). Build content from the Drive library (25 videos / 146 images) + repurpose into Amazon surfaces + the 4 social platforms. Posting to social still gated on connecting @phoneassured's own Meta + creating TikTok/YT/Pinterest accounts.

**Industry source.** Amazon A+/Premium A+ (+8%/+20%), 7+ images ~+35%, video +9-15%, 4.5★+50 reviews ~2× conversion; MYE for content (not price) A/B. (Two aggregator stats flagged unverified-to-primary.)

**Status.** Research saved (subagent output); fix `content-calendar.md` (remove Posts, add TikTok/YT/Pinterest + keyword captions) next.

---

### 2026-06-14 — Price + title testing: reuse DES bandit; we're sole seller on all ASINs

**Context.** William: can DES Smart Pricing (price + title) work for Amazon? Research it.

**Reality.** DES blends a phased model + Gallego-van Ryzin (deadline) + a **Thompson-sampling bandit** + auto-title rotation, for perishable event tickets. Reuse the bandit + the window-snapshot experiment-log; drop the deadline math and auto-title rotation (Amazon policy + new 75-char title cap on July 27). **Price scan finding: Phone Assured is the SOLE seller on every ASIN (others=0)** — so no Buy-Box-loss risk; the test can explore the $8-16 band against only a margin floor.

**Decision.** Build a thin bandit price-tester: candidate prices in ~$0.50 buckets, reward = **units/rank with a hard profit-per-unit floor** (William's choice: "blend"), ~3-7 day windows, runs on the cron pattern. Add `src/lib/amazon/listings.ts` (`patchListingsItem` to set price, `getListingsItem` to read) to the generic `sp-api.ts`. Title test = ONE challenger via Manage Your Experiments (manual, ≤75 chars, policy-clean), never auto-rotated.

**Industry source.** SP-API Listings Items `patchListingsItem` + Price Adjustment Automation guide; Thompson-sampling price testing; Amazon MYE (content-only A/B); 75-char title rule (July 27 2026).

**Open question / trade-offs.** Need William's **unit COGS** to set the profit floor. Slow convergence at one low-volume SKU (accept patience). Rollback: kill-switch env flag + revert-to-$9.49 patch; experiment log audits every change. Live price changes = preview first, then explicit go.

**Status.** Researched + scoped; `price-scan.mjs` confirms the landscape. Build pending COGS + go-ahead.
