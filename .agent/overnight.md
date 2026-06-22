# Bear — Overnight Queue (~10h, William asleep, starting 2026-06-22 late)

Rule: work the BACKGROUND-SAFE items below in order. **Never** submit in Seller Central, send a buyer reply, change a live price/title, or deploy a risky change. The ONE pre-authorized deploy is the inbox agent (drafts+trash only, reversible). Everything ships to the registry/gallery for William's morning review. Follow `research-discipline.md` (cite/validate) and `amazon-image-compliance.md` (every listing image shows the clip + passes the linter).

## Autonomous ops already running (no action)
- Ad engine cron (every 6h, now ACOS target 50% recovery) — fires ~00:00 + 06:00 UTC; logs to `ad_engine_log`.
- Review-request engine (daily 14:00 UTC) — past-buyer asks.
- Daily-sync (14:00 UTC) — inventory/restock/shipments + inbox digest.

## Overnight work queue (priority order)
1. **GREAT graphics (top priority — William rejected current ones twice).** Use the deep-study agent's findings (running). Honestly determine if "great" is reachable with current tools (mediocre source photos, HTML/sharp/ffmpeg, no AI key) or if it needs a named input (FAL/Magnific key, a $20-50 reshoot, a designer). Then: (a) do the maximum-quality build possible now — true alpha background removal + synthesized soft shadow on the clip, refined typography/composition, and CURATE the already-professional Drive infographics (UNMATCHED DURABILITY / EASY INSTALLATION / QUICK RELEASE) into the set rather than regenerating worse ones; (b) produce the comparison + before/after + 3-step concepts at the pro bar; (c) write a crisp "what I need from you to hit great" note (the missing input, costed). Everything to the gallery, status=review.
2. **Inbox agent (hello@) — build + deploy (pre-authorized).** Finish `src/lib/google/inbox-agent.ts` + `/api/cron/inbox-agent` route + vercel.json crons at **11:00 & 21:00 UTC (6am/4pm CDT)**: trash marketing/spam (PROTECT list), file/label, create DRAFT replies (never send) for support-needed buyer/customer messages, email a digest. Typecheck (`npm run build`) before deploy. Drafts+trash only = reversible.
3. **Price bandit scaffold (preview-only).** `src/lib/amazon/listings.ts` (getListingsItem + patchListingsItem) + Thompson-sampling bandit; reward = units with profit floor (contribution $4.93 Single, validated). PREVIEW only — no live price change. Tests + dryRun.
4. **Title rewrite drafts (≤75 chars, compliant)** for the 4 ASINs — drafts for William to approve (the 88-char titles must shrink before 2026-07-27).
5. **Curate existing Drive infographics** into the content registry (the pro ones) + dedup angles.
6. **Finance consolidation scaffold** — monthly report structure for Douglas Dean Holdings (SP-API finances + the fee math), ready for March taxes.

## Parked — do NOT touch overnight (needs William)
Canada submit (DE Certificate of Good Standing + KYC); Vine enrollment; main-image upload / Manage Your Experiments; any live price/title change; buyer-reply SENDS; the william@besocialscene OAuth token; any deploy beyond the inbox agent.

## Morning report (leave for William)
A short progress note: graphics verdict + the missing input if any; inbox agent live + first run result; bandit/title drafts ready for review; anything that hit the approval wall.
