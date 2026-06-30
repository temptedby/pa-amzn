# Bear — PA-AMZN: OVERNIGHT RESEARCH (William asleep 2026-06-25). Read-only, RBB, branch-only.
MODE: research/audit only. No deploy/push/prod, no live Seller Central change, no sends, no spend. Cite everything. If a task gets blocked (needs William / a login / a token), LEAVE A NOTE and move to the next item — keep finding research that helps. Output = briefs on a branch + notes in `.agent/inbox-handoff-from-bear.md`.

## CONFIRMED FACTS to use (from docs, 2026-06-25)
- Entity (exact): DOUGLAS DEAN HOLDINGS LLC. DE file number: 7603115. Good standing as of 2019-10-29 (cert too old now).
- Registered agent: E-Government LLC dba Delawarefile.com (info@delawarefile.com), portal "My Client Management". 2025 agent payment on file.
- amzn-clicks Ads API portal shows "Douglas Dean LLC" (no Holdings) = mismatch to fix.

## TOP JOB: get an UPDATED Certificate of Good Standing for Amazon (research only)
1. Exact step-by-step to obtain a CURRENT DE Certificate of Good Standing via Delawarefile.com / "My Client Management" portal AND via corp.delaware.gov direct (URL, fee, turnaround, whether file number 7603115 is enough). Cite.
2. Exact amazon.ca (and Seller Central) document requirements to reactivate / verify: which doc types, recency window (e.g. issued within X days), exact-name-match rules. Cite Amazon help pages.
3. Entity-name-mismatch remediation: every place the name must read "Douglas Dean Holdings LLC" (Seller Central legal name, tax interview, bank, Ads/amzn-clicks, Brand Registry) + how to correct the amzn-clicks "Douglas Dean LLC". Cite.
4. Output: `confabulator/canada-good-standing-playbook-2026-06-25.md` — a clean checklist William can execute in the morning, plus what (if anything) only he can do.

## NEXT (if top job blocked or done) — read-only research
A. Ad-engine audit FIXES as proposals only (H1 harvest single-ad-group, C1 cent-rounding cap breach, G1 sub-$4 bleed, R1 intraday ratchet) — write the fix design, do NOT change live code paths' behavior.
   - [x] C1 BUILT on branch `fix/ad-engine-c1-cap-rounding` (2026-06-26): `clampBidStep()` + 7 tests + vitest.config; branch-only, needs William merge approval.
   - [x] H1 BUILT on branch `fix/ad-engine-h1-harvest-source-adgroup` (2026-06-26, stacked on C1): `harvestCandidates()` harvests into the SOURCE ad group + William's $4/ACOS<=50% rule + 60d chunked window; 14 tests; 59/59 green; branch-only, needs William merge approval. G1/R1 + monthly reactivation still propose-only.
B. Profitable-Amazon-store process + structure gap analysis (cited).
C. Validated-data baseline doc (8,134 units/$127,456, fees, inventory, ~18k lifetime, ad 8,926).
D. Content/traffic foundation plan (Drive creative, Social Scene BRC tooling reuse, AI options, blog/SEO).
E. phoneassured.com Shopify-migration research (SEO-preserving) — plan only.
F. Seller financing (Payability / Amazon Lending) brief.

## Parked — needs William
Ordering/downloading the updated cert (his login/payment); william@ OAuth token; AI key+budget; any build/go-live; sending the delawarefile draft.
- [x] 2026-06-30 cycle 15 - BUILT the SHIP-PLAN TOOL (attacks the validated #1 bottleneck: 29->69 unmerged branches, merge map went stale). Tested pure `src/lib/ship-plan.ts` (classifyConflict / collapseStacks / codeFileOverlap; 9 tests) + read-only `scripts/ship-plan.mjs` (git merge-tree trial-merge). Live: 69 unmerged -> 35 units (7 clean / 21 doc-only / 7 code-conflict; 30 colliding files); reconfirms the two ad-engine lineages collide on ad-engine.ts + bid-damping.ts. Branch `chore/ship-plan-tool-2026-06-30`, 76/76 green, tsc clean, INDEPENDENT file set. Deliverable `confabulator/ship-plan-2026-06-30.md`. Needs William: run the review+merge pass (regenerable via `node scripts/ship-plan.mjs`).
- [x] 2026-06-30 cycle 16 - BUILT the MERGE RUNBOOK generator (extends the cycle-15 ship-plan tool; same independent file set, NO ad-engine.ts touch). Pure `buildMergeRunbook()` in `src/lib/ship-plan.ts` (+5 tests: union-driver-first, clean auto-merge+test-gate, colliding-units-never-auto-merged, connected-component clusters, recommend-first ordering). Wired into `scripts/ship-plan.mjs` to emit `confabulator/merge-runbook-<date>.sh` (set -euo pipefail, per-merge `npm test`, NEVER pushes) + a runbook MD section. Live: 70 unmerged -> 17 test-gated auto-merges (union driver + 3 clean + 13 doc-only) + 4 manual code-collision clusters (ad-engine/pricing, title/listings/returns/finance, listing-copy, review-coverage). Branch `chore/merge-runbook-2026-06-30`, 81/81 green, tsc + eslint clean. Needs William: run a merge session via the runbook (regenerate first), then make the 4 Phase-3 lineage calls.
- [x] 2026-06-30 cycle 19 - FIXED the merge-runbook generator's Phase-0 halt (the one-line tweak parked in cycle 18). `buildMergeRunbook` now emits a `prep` step that lands `.gitattributes` (checkout+add+guarded commit) BEFORE merging the union-driver branch, so a fresh runbook run no longer conflicts on its first merge. Widened `RunbookStep.kind` to include `"prep"`; renderer is a pass-through so no `.mjs` change. +2 tests; suite 83/83 green, tsc+eslint clean. Branch `fix/merge-runbook-gitattributes-phase0-2026-06-30` (off chore/merge-runbook-2026-06-30; NOT pushed/merged). Needs William: land it with the merge-runbook tooling.
