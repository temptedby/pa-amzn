# PA-AMZN — Around-the-Clock Bear System: Roadmap (William's vision, 2026-06-24/25)

Goal: a robust 24/7 Bear-run system for the Phone Assured Amazon business that researches, plans, and builds autonomously, with William check-ins at the gates. Everything traces to research-discipline (cited/validated, no assumptions). Two-companies rule: Amazon stays fully separate from Social Scene DATA (reusing TOOLING/filters is fine).

## Operating model
- Autonomous (self-checking): pricing engine + ad engine run and self-correct within guardrails; daily inventory/restock/review crons; inbox triage (drafts only).
- Research-then-gate: each new pillar gets 6-step research + a plan, William approves, THEN build, THEN autonomous with checkpoints.
- Never autonomous: deploy/push, live price/title/image go-live, buyer SENDS, Seller Central KYC/identity submits, hosting/DNS changes, spend.

## Pillars

### 1. Email discovery (understand the business)
Bear reads ALL sent + labeled messages in hello@ (and william@ for amzn-tagged) to learn the full history: suppliers, customers, Amazon comms, past strategies, Flippa. Build a structured digest of what the business IS, who the players are, and recurring themes. Read-only; output a knowledge brief. (Needs william@ OAuth token for that mailbox.)

### 2. Profitable-Amazon-store research
Systematic research brief: listing quality, images/A+, reviews, pricing, ads (TACoS), inventory/restock, conversion levers, what top sellers in the category do. Cited. Feeds the build queue.

### 3. Content + traffic engine
- Curate existing Google Drive creative (videos/photos) into a content registry (no dupes, compliance-gated).
- Generate new AI content (needs an image/video AI key decision — costed).
- Reuse the Social Scene BRC graphics filters/tooling (TOOLING reuse only, not data) for both social + Amazon content.
- Post to social (@phoneassured) via the DES Meta plugin pattern to drive traffic to Amazon.
- Blogs: plan + draft SEO posts that funnel to the listings.

### 4. Website migration (phoneassured.com)
We own phoneassured.com, currently Shopify-hosted. Plan to move OFF Shopify, cancel that hosting, and stand up a lean site whose job is to drive traffic to the Amazon listings. RESEARCH + PLAN first (SEO preservation, redirects, host choice, cost savings). Cancelling hosting / DNS changes = William gate.

### 5. Autonomous engines (self-checking) — already live, keep hardening
- Ad engine (ACOS target 50% recovery, every 6h, logs ad_engine_log) — self-corrects.
- Pricing engine (price-bandit, preview-only until approved, then autonomous with profit floor).
- Daily inventory/restock/shipments + review-request + inbox triage crons.

### 6. Canada (amazon.ca) — William-gated
Needs the Delaware Certificate of Good Standing + KYC (William's identity/legal click). Bear preps everything around it; William supplies the document.

## Open questions -> .agent/questions-for-William.md
Shared vs separate overnight loop; william@ OAuth; AI content key (which + budget); Shopify cancel timing; which pillars to sequence first.
