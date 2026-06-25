# Bear — PA-AMZN: RESEARCH/AUDIT-FIRST (build nothing until William approves)

MODE: research + audit only. Cited/validated, no assumptions (RBB). HARD RAILS: no deploy/push/prod,
no live Seller Central change, no sends, no spend. Output = reports on a BRANCH for William's review.

## TONIGHT'S TOP JOB (William, 2026-06-25): AD-ENGINE STRATEGY AUDIT (read-only)
Goal: prove the ad strategy works and find any bugs. Deliverable: `confabulator/ad-engine-audit-2026-06-25.md`.
1. **Keyword harvesting coverage.** Confirm the engine is populating NEW keywords for ALL campaigns (not just some). Pull every campaign via the Ads API; for each, check whether harvested search terms are being promoted to keywords. Flag any campaign getting ZERO new keywords (a bug).
2. **Full action audit since launch.** Read the `ad_engine_log` table (run_at, action, keyword, match_type, from_bid, to_bid, acos, spend). Tabulate everything the engine has done since launch: keywords ADDED, SUBTRACTED (paused/negated), bids RAISED, bids LOWERED. Counts + per-keyword history.
3. **Bug hunt.** Cross-check log vs current Ads API state for: bid changes exceeding the ±25%/run cap; keywords that hit the $4-no-sale kill rule but were NOT paused; ACOS-bracket logic firing wrong direction; duplicate/again-and-again actions (idempotency); harvested terms that should have been added but weren't; bids below the profit floor.
4. **Verdict.** Is the strategy executing as designed? List concrete bugs (with the log/API evidence) + recommended fixes (do NOT fix live — propose only).
Read-only: query the log + Ads API reports; change NOTHING in the live account.

## Foundation research queue (after the audit — all read-only, output = a brief)
A. Understand the business via email discovery (sent + labeled hello@).
B. Profitable-Amazon-store process + structure -> gap analysis (cited).
C. Validated-data baseline (8,134 units/$127,456, fees, inventory) as one source of truth.
D. Content + traffic foundation plan (Drive creative, Social Scene BRC tooling, AI options, blog/SEO).
E. phoneassured.com migration research (off Shopify, SEO-preserving) — plan only.
F. Autonomous-with-checks governance spec + the agent-amzn<->agent-des shared-tools contract.

## Parked — needs William
Delaware Certificate of Good Standing (Canada) in exact name "Douglas Dean Holdings LLC"; william@ OAuth; AI key+budget; any build/go-live; the entity-name mismatch fix.

## Leave a note each cycle
Append 3 lines to `.agent/inbox-handoff-from-bear.md`: what you audited/researched, key finding, what needs William.
