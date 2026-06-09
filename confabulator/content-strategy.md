# Phone Assured — Content Strategy (IG/FB + Amazon Posts)

Regular, use-case-driven content around **preventing theft, drops, and loss / keeping your phone close**, leaning into the wide-open **boating** niche. Posted to @phoneassured (IG/FB) via the DES Meta-publishing tooling + Amazon Posts (Securisee Brand Registry). Reuse Social Scene's *method* and DES *tooling* only — Phone Assured content/data stays separate (two-companies rule).

## Assets already in Drive (reuse first)
Proven FB ad **videos**: "Protect Phone Festivals," "Protect Phone Whatever You Do," "Testimonial PA Billo," "Animation Product Details," plus a "Phone Assure Ad Videos" folder + older graphic ad clips. **Images/brand:** "PHONE ASSURED TAG FINAL," product shots, logos, print files. → Recut/repurpose these into IG Reels / FB posts before producing new.

## Real data hooks (cited — no made-up numbers)
- **60% of phone thefts are opportunistic pickpocketing; 30% are from vehicles** ([identity-theft-awareness](https://www.identity-theft-awareness.com/smartphone-theft-statistics.html)).
- **Global phone-theft losses hit ~$50B (2022)**; **avg 3.5 days to replace + restore**, ~$120/day productivity lost; **50% would pay $500** to get their phone back ([worldmetrics](https://worldmetrics.org/phone-theft-statistics/)).
- **45% of 18-24-year-olds have lost a phone**; most lost phones are simply misplaced ([mspoweruser](https://mspoweruser.com/how-many-cell-phones-are-lost-each-day/)).
- Water/saltwater submersion is a real loss mode (boating) ([securedatarecovery](https://www.securedatarecovery.com/blog/states-break-phones-most)).

## Content pillars × use cases (the product's flexibility = endless content)
1. **Boating / water (FLAGSHIP wedge):** phone overboard = gone forever; tether it on the boat, kayak, jet ski, paddleboard, cruise, fishing. *No Amazon competitor owns this.* William's own use case → authentic.
2. **Anti-theft:** festivals, concerts, travel, crowded cities, transit (pickpocket stat).
3. **Anti-drop / active:** skiing, biking, hiking, rollercoasters, climbing.
4. **Everyday "keep it close":** purse, pocket, gym, parents/toddlers, nurses/hands-busy, accessibility.
5. **Trust / warranty (differentiator):** 1-yr warranty + free replacement clip — *no competitor offers this.* Lead with it.

## Format mix
- IG Reels / FB short video (recuts of existing ad videos + new AI-generated clips).
- "Stat + product" graphics (use the cited numbers).
- UGC / testimonials (existing "Billo" testimonial + new).
- Amazon Posts: lifestyle shots tied to each use case → show on product pages.

## Production
- **Reuse** the Drive library first (fast).
- **AI-generate** new use-case creatives (image/video) for boating/ski/bike etc. via the graphic/video API plugins William has — low cost, high volume, "no limits."
- Cadence: ~3-5 posts/week, rotating use cases, boating featured.

## Channels + tooling
- **IG/FB (@phoneassured):** reuse the DES Meta Graph publishing system (socialSharePosts pattern) — needs a Meta app + page/IG tokens for the Phone Assured accounts.
- **Amazon Posts:** free brand feed (Securisee Brand Registry), posts.amazon.com.

## Next steps
1. Full inventory of the "Phone Assure Ad Videos" / "Phone Assured Ads" folders (catalog every reusable clip).
2. Connect the DES Meta plugin to @phoneassured (Meta app + tokens).
3. First batch: recut 3-4 existing videos + 2 boating-flagship AI creatives → schedule.
4. Confirm Securisee Brand Registry for Amazon Posts.

## Drive inventory (2026-06-09) — what we have to work with
- **25 videos.** Finished FB ad creatives (reuse first): "Protect Phone Festivals," "Protect Phone Whatever You Do," "Testimonial PA Billo," "Animation Product Details," 2 PIWT graphic ads. Plus ~15 raw lifestyle .MOV clips (IMG_*.MOV) for new edits. (Note: 2 "BPA-Day1/Day2" files are incomplete .crdownload course videos, not content.)
- **146 images.** "PA - FB ad" graphic series (post-ready), product/brand shots ("phone secured phone assured," "phone assured pro unmatched," brand tags), and a "Smadar WANT THEEEESSE" folder of 16+ DJI drone/aerial shots (outdoor/lifestyle backdrops).
- Reproduce anytime: `node scripts/drive-inventory.mjs`.

**First content batch (recommended):** recut the 4 finished FB ad videos into IG/FB Reels; post the "PA - FB ad" graphics; produce 2 boating-flagship pieces (AI + a raw .MOV clip over a drone aerial). Then connect the DES Meta plugin to schedule @phoneassured.

## Distribution rule — atomize every piece across formats + across the day
Each content asset is repurposed into a **string of content**, not a single post:
- **Reel** (vertical video — discovery/reach)
- **Feed post** (the anchor — image or video)
- **Story / update** (ephemeral — frequency + top-of-mind)
Stagger them through the day (e.g., Reel AM, Feed midday, Story PM) so @phoneassured has continuous presence. The DES Meta-publishing tooling schedules each format/placement from one source asset. Apply the same atomization to Amazon Posts where it fits.

## 6-step + game plan for the content engine build (saved 2026-06-09 for tomorrow)

**1. Problem.** Produce on-brand graphics/videos for Phone Assured and post them to @phoneassured IG/FB (atomized: Reel + Feed + Story, staggered through the day) + Amazon Posts. Success = a daily string of free-traffic content, reusing the Drive library + AI generation, fully separate from Social Scene data.

**2. Standard / what already exists (reuse the method).** DES has the whole machine: Meta Graph publishing routes (`src/app/api/events/[id]/social-share/{generate,schedule,publish,generate-week,auto-generate,sync-engagement}` + `/api/cron/social-publish`), Meta OAuth (`/api/analytics/meta/callback`,`/accounts`), and AI content-gen scripts (`scripts/social-scene-ai-graphics.ts`, `-hero-v3`, `-kontext-scenes2` (Flux/fal image gen), `-canva-*` (Canva), `-montage` (video)). Meta needs: `META_APP_ID/SECRET`, a `page_id` + page access token, `instagram_user_id` (IG business).

**3. Reality.** PA has the Drive library (25 videos / 146 images) + this strategy. PA does NOT yet have Meta tokens — needs a Meta app + OAuth to connect Phone Assured's **own** FB page + IG business account (two-companies: separate accounts, separate publishing from SS; reuse method/tooling only).

**4. Options.** (a) Standalone PA scripts mirroring the DES method (fast, matches our other PA scripts). (b) Port the full social-share engine into PA-AMZN. (c) Use the DES app for PA — rejected (two-companies; PA stays self-contained).

**5. Recommendation: (a) standalone PA scripts mirroring DES.** Content-gen (recut the 4 proven FB ad videos first → Reels; Flux/fal for new boating/use-case creatives; Canva for graphics) + a Meta publisher (page-token feed post + IG `media_publish` + Story) + atomization. Connect PA's Meta accounts first; verify a test post before scheduling.

**6. Risk/rollback.** Meta publishing permissions may need app review; start with proven assets; **do NOT post until tokens + a test post are verified.** First action: connect PA's FB page + IG to a Meta app via OAuth.

### Tomorrow's game plan (informal)
1. **Connect Meta for @phoneassured** — Meta app + OAuth → page access token + IG business id into `.env.local`.
2. **Port content-gen** (mirror `social-scene-ai-graphics.ts` etc.) — recut existing videos + first Flux/fal boating creatives.
3. **Meta publisher + atomizer** — one asset → Feed + Reel + Story, staggered; test post to @phoneassured.
4. **Amazon content ideas to build:**
   - A+ Content / Brand Story: boating + use-case lifestyle modules, warranty callout, vs-competitor comparison.
   - Amazon Posts (Securisee Brand Registry): one lifestyle shot per use case (boat/ski/festival), staggered.
   - **Hero-image A/B** (#24): test product-on-white vs boating-lifestyle vs warranty-badge main image via Manage Your Experiments.
   - Listing video + copy: lead with 1-yr warranty + anti-theft/boating keywords.
