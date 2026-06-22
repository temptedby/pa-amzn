# Research Discipline (HARDWIRED — applies to ALL work, incl. background automation)

No assumptions. Every meaningful decision or build, foreground or autonomous, must trace to **validated data** (our own DB / Amazon reports / Seller Central / financials) or a **citable industry source**. If neither exists yet, the first step is to go get it — research before build.

## The 6-step gate (before any meaningful/irreversible change)
1. **Problem** — what's wrong + what success looks like, quoting specifics (real numbers).
2. **Industry standard** — at least one external, cited pattern (Amazon policy doc, SP-API/Ads-API docs, a named tool, a published practice) with a URL.
3. **Codebase / reality** — open the files, pull the live data, cite line numbers / table counts / report figures. Don't guess.
4. **Options** — 3-5 paths with effort / impact / trade-offs.
5. **Recommendation** — pick one, say why, and what NOT to do and why.
6. **Risks, trade-offs accepted, rollback.**

## How it binds the BACKGROUND/automated work
- **Every autonomous build carries its cited basis** in the commit message, the decisions-journal entry, or the relevant log — not just code. A reviewer (or Bear) can trace any change to its data/source.
- **The ad engine** acts only on its own validated report pulls (≤31-day Ads reports, the `ad_engine_log` records each action + the ACOS/spend that justified it). Targets are computed from real numbers — e.g. Single break-even ACOS = **52%**, validated via SP-API `getMyFeesEstimate` (sale $9.49 − COGS $0.62 − referral $1.42 − FBA $2.52 = $4.93 contribution; 4.93/9.49), never picked by feel or an assumed fee.
- **Content/graphics** cite the stat or claim behind any text and pass the `amazon-image-compliance.md` linter (sourced from Amazon's image policy). No unverified statistics on any asset.
- **Price/title moves** trace to the bandit's logged experiment data + Amazon pricing/MYE constraints (cited), preview-first.
- **Research deliverables** (Delaware process, Vine, organic growth, Amazon content) ship with source URLs; vendor/aggregator figures are flagged as directional, not primary.

## What "validated" means here
DB row/counts, SP-API / Ads-API report figures, Seller Central screens (read via Playwright), bank/financial docs, or a primary source (Amazon Seller Central / developer docs, a regulator, an RFC/standard). Aggregator/agency blogs are corroborated by ≥2 sources and flagged as non-primary.

## Anti-assumption checks (lessons already paid for)
- Never diagnose off a hardcoded ASIN/SKU list — pull the live inventory SKUs every time (a stale list produced a wrong out-of-stock call William caught).
- Verify a surprising number against a second source before acting on it.
- Distinguish correlation from cause (the "empty DB ad tables" looked like the drop cause but the engine reads live from the API — corrected on inspection).

This file is referenced by the charter guardrails; Bear and any operator follow it.
