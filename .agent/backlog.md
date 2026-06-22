# PA-AMZN — Bear backlog (never submit/send/deploy without approval)

## 🔴 PRIORITY 1 — recover the ~90% sales drop (William, 2026-06-23)
Research-backed plan (sources in the 2026-06-23 daily summary / journal). A 90% drop = almost
always suppression, Buy-Box loss, deindexing, ad-budget, or competitor move. Buy-Box loss is RULED
OUT (sole seller on every ASIN). Prime suspects: soft suppression/deindexing + conversion collapse.

**🔎 DIAGNOSTIC FINDING (2026-06-23, read-only DB pull) — strong lead:**
The ad engine still RUNS (ad_engine_log latest 2026-06-22) but its core tables are **EMPTY**:
campaigns=0, keywords=0, search_terms=0, hourly_snapshots=0, bid_changes=0 — while operational
tables are alive (inventory has stock, review_requests=138, engine_log=28). So it's NOT a wrong-DB.
The ad-campaign/keyword/performance dataset is GONE → the engine has nothing to manage → no bid
moves, no harvesting. For a low-margin ad-dependent product this plausibly drives the 90% drop.
**CONFIRM (William, Seller Central):** are the Sponsored Products campaigns still ACTIVE + spending?
- If active but our DB is empty → the **Ads-API data sync is broken** (repopulate campaigns/keywords/snapshots).
- If campaigns went inactive on Amazon → that's the smoking gun (re-enable + rebuild).
Confidence: medium-high this is a MAJOR contributor; not yet confirmed sole cause. Diag scripts:
`scripts/diag-drop*.mjs` (read-only).

**Step 1 — further DIAGNOSE (read-only; Bear can pull, William confirms in Seller Central):**
- Business Reports → Detail Page Sales & Traffic: sessions, page-view, CTR, **CVR** trend (did CVR
  fall from the ~11% June recovery?). Unit-session % by ASIN/day.
- Inventory → Manage All Inventory → filter **"Suppressed"**; check for listing/policy/account-health notices.
- **Title compliance:** titles ~88 chars vs 75-char limit (eff. 2026-07-27) — check for suppression/early enforcement.
- Ad engine: did the ≥$4-spend/0-order auto-pause over-cut visibility on key terms? Check `bid_changes` + spend/impressions trend.
- Classify the cause: indexing vs visibility vs conversion.

**Step 2 — FIX by cause:**
- Suppressed → fix flagged issue (often recovers 24-48h); escalate a Seller Support case if not.
- Conversion → main image refresh + A+ / comparison chart + **Vine reviews** (3.8★ is the biggest drag).
- Ad/visibility → restore bids on recovering keywords.

**Step 3 — VELOCITY push:** tighten PPC on recovering terms + short price test (COGS now known:
black $0.62 / Pro $1.62) + external traffic burst (social/email/content).

## Other (from digest + intake)
- [ ] Canada reinstatement: Delaware Certificate of Good Standing + phone fix (William executes submit).
- [ ] Price/title bandit — now COGS-unblocked; build `listings.ts` + bandit, preview-first.
- [ ] Automate: content creation (graphics/AI/native + Vine), email CS (draft+approve), shipping-label planning.
- [ ] Finances: monthly reports for Douglas Dean Holdings → ready for March taxes (bank-statement backups).
- [ ] Research: aligned new SKUs; international expansion (UK/AU/ZA) + overseas QC/inventory holder.
