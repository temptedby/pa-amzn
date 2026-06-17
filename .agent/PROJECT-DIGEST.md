<!-- Auto-generated read-only comprehension pass. Refresh: node router/build-digests.mjs PA-AMZN --force -->

# PA-AMZN — Project Digest

## What this project is

PA-AMZN ("Phone Assured Amazon Automation") is a Next.js 16.2.4 app (App Router, React 19, Tailwind v4, Turso/libsql, Resend, Vercel) that automates Amazon Seller Central operations for **Phone Assured**, a brand selling retractable phone-tether clips at **$9.49/unit** (low margin, so ad efficiency is everything). Legal entity: **Douglas Dean Holdings LLC** (730 W Lake St Ste 162, Chicago IL 60661-1010), which also operates the "Securisee" brand. It runs three things autonomously: (1) ad bid management + keyword harvesting, (2) past-buyer review requests, (3) inventory/restock sync — plus a layer of operator tooling (Playwright-driven Seller Central, Gmail inbox triage, Drive doc retrieval, content/pricing playbooks). Hosted at `amzn.phoneassured.com`; business email `hello@phoneassured.com`. Spec: `confabulator/PRD.md` (note: the PRD's static ACOS bid brackets are **obsolete** — superseded by target-ACOS convergence; see memory `project_bid_strategy.md`).

## Data sources (for each: where it lives and how to read it)

- **Turso / libsql database** — production: `DATABASE_URL` + `DATABASE_AUTH_TOKEN` in `.env.local`; local dev file `data/pa-amzn.db` (120 KB). Schema: `src/lib/db/schema.sql`. Client: `src/lib/db/client.ts` (`@libsql/client`). Tables: `campaigns`, `ad_groups`, `keywords`, `hourly_snapshots` (perf per keyword/hour, source `ams`|`reporting_api`), `bid_changes` (audit of every proposed+executed bid move), `search_terms` (rolling-14d, graduation tracking), `inventory` (per-SKU FBA + Amazon restock recs), `alerts`, `auth_sessions`, `prep_contacts`, `shipment_templates`, `shipments`. Money = INTEGER cents; timestamps = ISO8601 UTC text. Note: scripts reference a `review_requests` table (see `verify-systems.mjs`) not present in `schema.sql` — likely created elsewhere/migration drift.
- **Amazon SP-API** (live since 2026-04-20) — generic client `src/lib/amazon/sp-api.ts`; modules `inventory.ts`, `reports.ts`, `restock.ts`, `inbound-plan.ts`, `solicitations.ts`, `sync-*.ts`. Creds: `SP_API_CLIENT_ID/SECRET/REFRESH_TOKEN`. Used for FBA inventory, orders, reports, review solicitations, shipments. Planned (not yet built): `listings.ts` (`patchListingsItem`) for the price bandit.
- **Amazon Advertising API v3** (live since ~2026-06-09) — client `src/lib/amazon/ads-api.ts`; engine `src/lib/amazon/ad-engine.ts`. Creds: `ADS_CLIENT_ID/SECRET/REGION/PROFILE_ID/REFRESH_TOKEN`. Hard constraints: report date range **≤31 days**, data retention **~60-65 days** (so multi-month reads are chunked into 30-day windows; see `scripts/ads-harvest.mjs`, `ads-month.mjs`).
- **Gmail API (read-only)** for `hello@phoneassured.com` — raw `fetch` to `oauth2.googleapis.com/token` + Gmail REST (DES house pattern, no SDK). Creds: `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN`, scope `gmail.readonly` (inbox-trash/file scripts use `gmail.modify`). Scripts: `find-amazon-email.mjs`, `inbox-list/clean/trash/file.mjs`. Setup: `confabulator/gmail-inbox-setup.md`.
- **Google Drive / Sheets** — via the connected claude.ai Google Drive MCP (tools now available) and `scripts/drive-*.mjs` / `sheets-*.mjs`. Holds the asset library (**25 videos / 146 images**) and business/legal docs. `read_file_content`, `search_files`, `download_file_content` MCP tools.
- **Seller Central (live, no API)** — headed Playwright with persistent profiles `.pw-sc-profile` / `.pw-profile` / `.pw-ads-onboard` (all gitignored). William logs in himself; scripts never touch credentials. `scripts/seller-central-canada.mjs`, `canada-verify-open.mjs`. Read-only diagnosis; William performs any submit.
- **Cron entry points** (`vercel.json`): `/api/cron/daily-sync` (14:00 UTC daily), `/api/cron/ad-engine` (every 6h). Plus `/api/cron/review-requests`. All Bearer `CRON_SECRET`-authed; `?dryRun=1` previews.

## Current state and key metrics

- **Ad engine is autonomous and working.** Runs every 6h on Vercel (`ad-engine.ts` + cron route): pause any keyword ≥$4 spend / 0 orders (30d), harvest converting search terms → exact+phrase, converge bids toward **30% ACOS target** (capped ±25%/run, idempotent). Emails `[PA-AMZN ads]` only on action/error.
- **Optimization paid off:** after the 06-11 manual apply, weekend metrics moved **CVR 1.79% → 11.1%, ACOS 314% → 57%**. June baseline was dire: $32.90 spend / $10.49 sales / 1 order / 11,836 impressions = ACOS 314%.
- **Root cause of the ~90% sales drop (diagnosed):** (1) dormant account — old "Adverio" agency left ~21/33 campaigns paused with 2,267 keywords stranded inside paused campaigns; (2) weak conversion driven by a **3.8★** rating + thin listing content.
- **Inventory is healthy** (a key correction): Single B07Y5GZP1T = 242, 2-Pack = 35, black 3-Pack B097MK5VZ4 = 16, Pro B0BLLJLSDP = 28. (Stale/retired duplicate SKUs read 0 — do not query them.)
- **Pricing landscape:** Single $9.49 / 2-Pack $13.49 / 3-Pack(blk) $16.49 / Pro $10.49, all buyable; **Phone Assured is the sole seller on every ASIN** (no Buy-Box-loss risk). Titles run ~88 chars — over the **75-char limit effective 2026-07-27**.
- Working tree (uncommitted): modified `scripts/drive-images.mjs`; new `scripts/inbox-file.mjs`, `scripts/verify-systems.mjs`, `confabulator/amazon-image-compliance.md`.

## Open threads / in-flight work

- **Canada (amazon.ca) reinstatement — the top live blocker.** Store Deactivated for "Canada identity verification, PAST DUE." Single failing item: **Registration Extract = "Invalid Document"** (the uploaded 2011 Illinois Articles + EIN bundle doesn't show *current status*). Fix = upload a current **Delaware Certificate of Good Standing** for Douglas Dean Holdings LLC (entity confirmed Delaware; reg # 371953962). Prereq: must be current on DE franchise tax (~$300/yr) or DE won't issue it. Also update the on-file phone (currently the partner's unreachable 208/Idaho number). Doc not in Drive/inbox — likely with the accountant (a recurring **TaxDome** thread is the lead). **William executes the submit** (KYC = his legal click); roadmap in `confabulator/canada-roadmap.md`.
- **Price + title bandit (scoped, not built).** Reuse the DES Thompson-sampling bandit + experiment-log; reward = units with a profit-per-unit floor ("blend"). **Blocked on William's unit COGS.** Needs `src/lib/amazon/listings.ts`. Title test = one challenger via Manage Your Experiments, manual, ≤75 chars — never auto-rotated.
- **Conversion lift (Phase 1, not built).** Impact-ordered: main image + MYE A/B → Vine reviews (3.8★ is the biggest drag) → 7-image set → listing video → A+/Brand Story/Premium A+. Amazon Posts is **dead** (discontinued July 2025) — removed from plans.
- **Review-request catch-up:** a ~60-request batch crashed on Vercel (500 INTERNAL_FUNCTION_INVOCATION_FAILED, platform-level); **0 sent, safe to retry** (engine checks Amazon solicitation availability first, no double-send risk).
- **Inbox triage:** `inbox-file.mjs` (new, label+archive, reversible) supersedes trash-only flow; `fbareviews.com` (18 msgs) left pending William's yes/no on whether it's a paid service.
- **AMZN Agent:** William is building this agent in partnership with "behalfbot"; do not build competing orchestration until synced.

## Backlog (prioritized, most important first)

1. **Canada:** obtain + upload the Delaware Certificate of Good Standing, fix phone, resubmit (gated on William + franchise-tax status).
2. **Build the price bandit** once COGS is provided (`listings.ts` + bandit on cron; preview-first).
3. **Conversion Phase 1:** ship main-image A/B + Vine + 7-image set; build images against `confabulator/amazon-image-compliance.md` linter rules.
4. **Rewrite all titles to ≤75 chars** before 2026-07-27.
5. **Re-run the review-request catch-up** (~60 buyers, oldest→newest) locally or after fixing the serverless crash.
6. **Content build:** fix `content-calendar.md` (remove Posts, add TikTok/YouTube Shorts/Pinterest + keyword-first captions), connect @phoneassured's own Meta + create TikTok/YT/Pinterest accounts; nothing posts until a verified test post.
7. **Lifetime-relaunch pass:** ~60-65d lookback to re-enable paused past-winner keywords (API retention ceiling).
8. **Confirm 6h ad-engine cadence** is actually firing (requires Vercel Pro; Inngest is the fallback).

## Risks and project-specific guardrails

- **Two-companies rule:** never combine Phone Assured / Amazon data with Social Scene or Social Boost. Never use `william@besocialscene.com` in any Amazon-facing field — that personal-email/company-name mismatch caused the original Ads API rejection (ticket AO-40501). Amazon identity = company "Phone Assured" + `hello@phoneassured.com` only.
- **Never log into Seller Central or upload identity/KYC docs autonomously.** William does all logins (Playwright runs headed under his session) and all legal submits; the agent assembles, diagnoses, and guides to one click.
- **Never diagnose off a hardcoded ASIN/SKU list** — pull live inventory SKUs every time (a hardcoded list produced a wrong out-of-stock diagnosis that William caught). Verify surprising numbers before acting.
- **Ad-engine idempotency:** any few-hourly logic must converge, not compound — target-ACOS bidding capped ±25%/run; kill-switch + harvest are dedup/idempotent. Apply changes preview-first.
- **Image/listing compliance is a hard gate** (`amazon-image-compliance.md`): white-bg + ≥85% fill on main image; no price/promo/Amazon-badge/urgency/superlative text; a regex linter blocks violations before export. Account safety > aesthetics.
- **Real sends to real people require explicit go-ahead** even after the 6-step research gate; drafts are always fine. Destructive ops (delete, force-push) need approval — inbox cleanup uses reversible Trash/archive, not permanent delete, behind a PROTECT list for Amazon/customer/financial/named-rep mail.
- **Secrets** live in `.env.local` and Vercel encrypted env (gitignored); `.pw-*` Playwright profiles are gitignored. Don't commit them.
- **6-step research gate + decisions-journal** (`decisions-journal.md`, 7-question ADR format) before any meaningful/irreversible change; daily summaries in `confabulator/daily-summaries/`.
