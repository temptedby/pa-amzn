# Ad-engine harvest + reactivation rule (William, 2026-06-26)

## The rule (William's words, formalized)
- THRESHOLD: a search term / keyword qualifies when, over the measurement window, it has **>= $4.00 spend** AND **ACOS <= 50%** (equivalently **ROAS >= 2x** — they are the same: 2x ROAS = 50% ACOS).
- HARVEST: any qualifying **search term** -> add it as BOTH **EXACT** and **PHRASE** match keywords.
- MONTHLY REACTIVATION: each month, re-check **paused** keywords -> **turn back on** any whose trailing **65 days** still holds ACOS <= 50% (ROAS >= 2x) at the >= $4 spend bar.
- Rationale: break-even ACOS is ~52% (Single, validated), so the 50% bar keeps a small margin while scaling winners.

## Why this matters now
- Engine added only **2 keywords this month** (1 EXACT + 1 PHRASE) per ad_engine_log (log starts 2026-06-18). Far too few.
- Root cause = audit bug **H1**: harvest writes every new keyword to ONE anchor ad group, so 18 of 19 campaigns receive nothing. Fixing H1 + implementing this rule is the unlock.

## Implementation spec (propose-only until William approves the fix)
1. Pull spSearchTerm over trailing 60-65 days (chunked, Ads API caps ~31d/report). Aggregate cost+sales per search term.
2. Qualify: cost >= 4 AND sales >= 2*cost (ACOS <= 50%). Exclude terms already present as EXACT keywords.
3. Create EXACT + PHRASE keywords in the SAME campaign/ad group the term came from (fixes H1), at the new-keyword start bid, respecting the profit floor.
4. Monthly job: list paused keywords; for each, pull trailing 65 days; if cost >= 4 AND ACOS <= 50%, re-enable.
5. Idempotent; log every add/reactivate to ad_engine_log with match_type.
