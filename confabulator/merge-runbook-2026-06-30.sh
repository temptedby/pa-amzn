#!/usr/bin/env bash
# Merge runbook — PA-AMZN — generated 2026-06-30 by scripts/ship-plan.mjs
# LOCAL merges only. This script NEVER pushes. Review each diff first.
# Run deliberately, line by line or whole; the test gate halts on any failure.
# Phase 3 (code collisions) is NOT here — it needs a human lineage decision.
set -euo pipefail
git checkout main

echo "=== phase 0 union driver ==="
# merge=union .gitattributes — makes journal/TASKS re-append conflicts auto-resolve
git merge --no-ff chore/gitattributes-union-merge-2026-06-28
npm test
echo "=== phase 1 clean ==="
git merge --no-ff content/image-stack-cro-audit-2026-06-29
npm test
git merge --no-ff content/live-image-compliance-audit-2026-06-29
npm test
git merge --no-ff chore/ship-plan-tool-2026-06-30
npm test
echo "=== phase 2 doc-only ==="
git merge --no-ff research/profitable-store-gap-analysis-2026-06-27
npm test
git merge --no-ff audit/ad-engine-verify-2026-06-28
npm test
git merge --no-ff content/aplus-brand-story-draft-2026-06-28
npm test
git merge --no-ff diag/sales-drop-classify-2026-06-28
npm test
git merge --no-ff feat/baseline-bid-engine-drift-guard
npm test
git merge --no-ff research/ad-engine-strategy-audit-2026-06-28
npm test
git merge --no-ff research/autonomous-governance-and-shared-tools-2026-06-28
npm test
git merge --no-ff research/vine-review-acceleration-2026-06-28
npm test
git merge --no-ff tooling/branch-readiness-analyzer-2026-06-28
npm test
git merge --no-ff audit/ad-engine-strategy-2026-06-29
npm test
git merge --no-ff feat/ad-allocation-profit-analyzer-2026-06-29
npm test
git merge --no-ff research/validated-data-baseline-2026-06-29
npm test
git merge --no-ff tooling/merge-train-empirical-2026-06-29
npm test

echo "=== phase 3 (manual — code-collision clusters) ==="
# cluster: land feat/item-highlights-secondary-keywords first, then rebase: feat/finance-csv-export-2026-06-29, feat/item-highlights-secondary-keywords, feat/return-rate-denominator-2026-06-29, feat/returns-reason-analysis, feat/sales-anomaly-tripwire, feat/title-rewrite-proposer-2026-06-29, feat/weekly-business-report, research/multipack-fees-validated-2026-06-29, research/returns-reason-analysis-2026-06-27
#   shared files: .agent/overnight.md, .gitignore, scripts/fees.mjs, scripts/returns-analysis.mjs, scripts/title-audit.mjs, scripts/title-candidates.mjs, src/lib/amazon/listings.test.ts, src/lib/amazon/listings.ts, src/lib/amazon/price-bandit.test.ts, src/lib/amazon/price-bandit.ts, src/lib/amazon/reports.ts, src/lib/amazon/returns-analysis.test.ts, src/lib/amazon/returns-analysis.ts, src/lib/amazon/title-candidates.test.ts, src/lib/amazon/title-candidates.ts, src/lib/amazon/title-compliance.test.ts, src/lib/amazon/title-compliance.ts, vercel.json
# cluster: land feat/ad-engine-visibility-floor-2026-06-28 first, then rebase: audit/branch-merge-readiness-2026-06-28, feat/ad-engine-bid-stability-gate-2026-06-29, feat/ad-engine-visibility-floor-2026-06-28, feat/price-experiment-bandit-2026-06-30, fix/ad-engine-loop-stability-bundle-2026-06-29
#   shared files: confabulator/margin-model-2026-06-29.md, scripts/margin-model.mjs, src/lib/amazon/ad-engine.test.ts, src/lib/amazon/ad-engine.ts, src/lib/amazon/bid-damping.test.ts, src/lib/amazon/bid-damping.ts, src/lib/amazon/pricing.test.ts, src/lib/amazon/pricing.ts
# cluster: land feat/listing-copy-rewrite-draft-2026-06-27 first, then rebase: audit/ad-engine-strategy-2026-06-27, feat/listing-copy-rewrite-draft-2026-06-27
#   shared files: confabulator/ad-engine-audit-2026-06-27.md
# cluster: land feat/review-coverage-instrumentation-2026-06-28 first, then rebase: feat/inventory-health-classifier-2026-06-29, feat/review-coverage-instrumentation-2026-06-28
#   shared files: src/lib/amazon/review-coverage.test.ts, src/lib/amazon/review-coverage.ts, src/lib/amazon/sync-review-requests.ts
echo "Done. Nothing was pushed. Review 'git log --oneline main' before any push."
