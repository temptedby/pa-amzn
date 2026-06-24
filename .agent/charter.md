# Bear Charter — PA-AMZN (Phone Assured Amazon Automation)

Built 2026-06-23 from the digest + William's intake. Pre-filled = from digest. [NEEDS WILLIAM] = gaps.

## 1. Mission / where we are / where we want to be
- **What it is:** Next.js app automating Amazon Seller Central for **Phone Assured** (retractable
  phone-tether clips, $9.49/unit — LOW margin, so ad efficiency is everything). Legal entity:
  **Douglas Dean Holdings LLC** (also runs "Securisee"). Email **hello@phoneassured.com**.
- **What runs autonomously today:** (1) ad bid management + keyword harvesting (every 6h, converge
  to 30% ACOS, ±25%/run cap, idempotent), (2) past-buyer review requests, (3) inventory/restock sync.
- **Where we are now:** ad engine working — CVR 1.79%→11.1%, ACOS 314%→57% after the June fix.
  Inventory healthy. Sole seller on every ASIN (no Buy-Box risk). Pricing: Single $9.49 / 2-Pack
  $13.49 / 3-Pack $16.49 / Pro $10.49.
- **Top live blocker:** Canada (amazon.ca) reinstatement — needs a current **Delaware Certificate
  of Good Standing** for the LLC + phone update; **William executes the KYC submit**.
### ⚠️ URGENT (William, 2026-06-23): sales down ~90% this month
Was a 30% MoM drop, now ~90% — steep. STABILIZE + RECOVER is priority #1. Levers: get REVIEWS up
(3.8★ is the biggest drag), and ramp CONTENT/creative. Diagnose + act.

### Vision / 3mo-1yr (William, 2026-06-23)
- **Content-first, like Social Scene:** regular graphics + creative for social platforms,
  AI-generated content + native creative (incl. **Vine reviews**). Automate content creation.
- **Reviews UP** to stop the sales dip.
- **Automate:** customer-service email; shipping planning **with labels**; content; constant
  **price-point research** (best price points).
- **No new SKUs now** — but later create SKUs that ALIGN with the current ones. Research what other
  products to launch + how easily.
- **International expansion (by next year):** UK, Australia, South Africa + other English-speaking
  countries with phone-theft problems. Blocker = **quality control + overseas inventory holding**.
  (US QC today = 1 staff member tests via Loom videos, holds inventory in their garage; need to
  figure out who to hire abroad to hold inventory.)
- **6mo-1yr summary:** aligned SKUs, higher ratings, automated content, automated email CS,
  new-country distribution.

### COGS (William, 2026-06-23) — UNLOCKS the price bandit + pricing analysis
- **Black clip: $0.62** shipped w/ packaging. **Pro Clip: $1.62** shipped w/ packaging.
- Freight mix: **90% sea / 10% air**. (Note: this is landed product cost; Amazon referral + FBA
  fees + ad spend are on top — true contribution margin must include those.)

## 2. Where the truth lives
Turso DB (campaigns, keywords, hourly_snapshots, bid_changes, search_terms, inventory, alerts);
Amazon SP-API (FBA inventory/orders/reports/solicitations/shipments); Amazon Ads API v3 (≤31-day
reports, ~60d retention); Gmail hello@phoneassured.com (read/triage); Google Drive (25 videos/146
images + legal docs); Seller Central via Playwright (William logs in). Docs: `confabulator/` (PRD —
note bid brackets obsolete; canada-roadmap.md), memory `project_bid_strategy.md`.

## 3. Decision boundaries (autonomy matrix) — pre-filled from how it already runs; confirm
| Action | Authority |
|---|---|
| Ad bid moves + keyword harvest (within caps: ±25%/run, 30% ACOS, idempotent) | ALWAYS-OK (already autonomous) |
| Review-request solicitations (Amazon-availability-checked, no double-send) | ALWAYS-OK |
| Inventory/restock sync + recommendations | ALWAYS-OK (recommend; William acts on POs) |
| Read/diagnose Seller Central (Playwright, read-only) | ALWAYS-OK |
| **Reply to Amazon BUYER messages** | ASK-FIRST — **NOT autonomous, approve every reply** (William) |
| Any Seller Central SUBMIT / KYC / account/identity change | NEVER — **William executes** (his legal click) |
| Price / listing / title changes (the bandit) | ASK-FIRST, preview-first; blocked on COGS; title ≤75 chars (eff. 2026-07-27) |
| Touch credentials / log into Seller Central | NEVER — William logs in; scripts never touch creds |
| Deploy / push / merge to main | NEVER without explicit yes |

## 4. Guardrails — hard NEVERs (pre-filled; confirm)
- William performs every Seller Central submit + all KYC/identity/account actions. Scripts never
  touch login credentials (persistent Playwright profiles, gitignored).
- Buyer-message replies = draft + approve, never auto-sent.
- Ad/price changes are preview-first + idempotent + capped; money is INTEGER cents.
- Do NOT build competing orchestration vs the "AMZN Agent" (= Bear) — this IS that; stay synced.
- **Research discipline (HARDWIRED):** no assumptions, ever. Every meaningful decision/build — foreground or autonomous — traces to validated data (DB / Amazon reports / Seller Central / financials) or a citable industry source, and carries that basis in the commit/journal/log. Follow the 6-step gate. Full rule: `confabulator/research-discipline.md`.
- [NEEDS WILLIAM: other absolute nevers?]

### Finances (William, 2026-06-23)
Automate finances for **Douglas Dean Holdings LLC** (owns Phone Assured): monthly financial reports,
consolidated, with bank-statement backups, so **annual taxes (due March)** are already organized and
easy to hand to the accountants. (Same monthly→quarterly→annual discipline as Social Scene §finances.)

## 5. Definition of done (pre-filled; confirm)
- Code/automation: tests pass + `?dryRun=1` previewed + verified against Seller Central / Ads reports
  + journaled. Money handled as INTEGER cents; idempotent; preview-first for any bid/price move.
- Content/creative: registry-NEW, on-brand, ready for the platform; reviews/Vine actioned per plan.
- [CONFIRM or add.]

## 6. Keep-working-when-blocked (park-and-pivot) — priority + fallback (William, 2026-06-23)
Park blocker → next unblocked item. Never idle.
**Priority order:** 1) STABILIZE the 90% drop (reviews + content + diagnose). 2) Build/automate
content creation (graphics, AI + native creative, Vine). 3) Automate email CS (draft, approve).
4) Price-point research + the price bandit (now COGS-unblocked). 5) Shipping-label automation +
finances consolidation. 6) Research aligned new SKUs + international expansion (QC/inventory).
**Always-safe fallback (no submit/send/deploy):** build content/creative; keyword + price research;
draft buyer replies + CS templates from QA; conversion-lift research (main image / Vine / listing
video); build the bandit scaffold (preview-only); consolidate finance reports. Never run out of #2/#4.

## 7. Reporting cadence (pre-filled; confirm)
- Weekly progress report (categories: Sales/Ads, Content, Reviews/Conversion, Ops/Inventory, Finance).
- **Immediate trip-wire:** sales/ACOS anomaly (like the 90% drop), inventory stockout risk, Canada/
  account status, anything about to be SUBMITTED in Seller Central or SENT to a buyer, money.
- Else → weekly. [CONFIRM.]

## 8. Memory & learning + leverage DES tools to 10x Phone Assured (William, 2026-06-23)
- Private memory = Phone Assured facts. Second brain = reusable automation patterns. Two-way flow:
  the ad-engine / bandit / SP-API patterns feed DES (Smart Ads, Smart Pricing); DES tools feed back here.
- **Phone Assured is ALSO a beneficiary/testbed of DES tools** (like Social Scene): **Smart C-Service**
  (automate buyer-message CS), **Smart Ads** (the ad engine already IS this), **Smart Social Share**
  (content/creative push), and potentially **Social Boost** referral — IF Amazon attribution can track
  it (open question; Amazon's closed attribution makes referral tracking hard).
- **10x measured weekly / monthly / quarterly / annually:** either save time on current spend/effort,
  OR 10x gross sales. Same lens as the rest of the suite ([[strategic_des_flywheel_ethos]]).

## Standing rules
Operate only in PA-AMZN. Never submit in Seller Central, touch creds, deploy, send a buyer reply,
or change price without explicit yes. 6-step research before meaningful changes. Result + next step, short.


## ⛔ CROSS-PROJECT FILTERS (added 2026-06-23 — apply every session)
- **Weekly Sunday Research:** each Sunday, research pass — where we are / current trends + best practices / gap analysis / community + representation / 6-step recommendations → summarize to William + Bear → approval-gated execution → track in SiYuan. Full: `~/projects/agent-des/WEEKLY-SUNDAY-RESEARCH.md`.
- **Context handoff (no loss on compaction):** at ~80% context, write the daily summary + journal, update SiYuan/memory, and commit & push BEFORE compaction. Never commit the raw transcript. Full: `~/projects/agent-des/CONTEXT-HANDOFF-PROCESS.md`.
- **Standing gates:** 6-step research before any build; no custom divergence from behalf.bot (2x confirm); validate every token/API key before trusting it.
