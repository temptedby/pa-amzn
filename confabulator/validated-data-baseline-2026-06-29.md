# Phone Assured — Validated-Data Baseline (one source of truth)

Foundation-research queue item **C**. Built 2026-06-29 (Bear, autonomous, read-only, branch
`research/validated-data-baseline-2026-06-29`). Purpose: stop re-deriving the same numbers and the
hour-burning probe loops (decisions-journal 2026-06-24 PM lesson). Every figure below carries its
**source + retrieval method + known limit/staleness**. If a number isn't here with provenance, it is
not yet validated — go get it before acting (research-discipline.md).

Regenerate the live section any time: `node scripts/baseline.mjs` (read-only, no writes).

---

## 1. Identity & structure (William-confirmed / memory)
| Fact | Value | Source | Limit |
|---|---|---|---|
| Legal entity | Douglas Dean Holdings LLC | charter §1 (William 2026-06-23) | amzn-clicks portal shows "Douglas Dean LLC" — **name-mismatch flag**, blocks Canada KYC |
| Brand (also run) | Securisee | charter; listing brand field | All 4 ASINs registered brand="Securisee" not "Phone Assured" (memory listing-brand-field-securisee) — Vine/Brand-Registry impact |
| Contact | hello@phoneassured.com | charter | — |
| Domain | amzn.phoneassured.com (storefront on Shopify) | charter / CLAUDE.md | migration is queue item E (not started) |
| Buy-Box risk | none — **sole seller on every ASIN** | charter §1 | — |
| Star rating | 3.8★ (the single biggest CVR drag) | charter; gap-analysis | rating is a console figure; re-confirm in Seller Central |
| Flagship reviews | Single (B07Y5GZP1T) ~480 reviews | memory vine-flagship-ineligible | >Vine's <30 cap -> Vine enrollment impossible for the flagship |

## 2. Pricing & unit economics (William-confirmed COGS 2026-06-23)
| SKU | Price | Notes |
|---|---|---|
| Single | $9.49 | hero / 63% of 2-yr units |
| 2-Pack | $13.49 | |
| 3-Pack | $16.49 | |
| Pro | $10.49 | |

**Landed COGS:** Black clip **$0.62**, Pro clip **$1.62** (shipped w/ packaging; freight 90% sea / 10% air).
**Single contribution (validated via SP-API getMyFeesEstimate, research-discipline.md):**
sale $9.49 − COGS $0.62 − referral $1.42 − FBA $2.52 = **$4.93 contribution** → **break-even ACoS = 52%**.
> Structural constraint: a sub-$15 hero makes FBA profit nearly impossible (gap-analysis GAP 1). Recovery
> is a CVR / organic / ad-efficiency problem, NOT a bid-harder problem. Do not fix margin mid-collapse.

## 3. Sales & units — the authoritative figures
| Figure | Value | Source | Limit |
|---|---|---|---|
| 2-yr total (ex-cancelled) | **8,134 units / $127,456.06** | SP-API GET_FLAT_FILE_ALL_ORDERS, 28 stitched windows (`scripts/alltime-report.mjs`) | reaches only 2024-05-08 (Amazon ~2-yr order retention wall) |
| Lifetime ad-attributed | **8,926 units** | William's Campaign Manager console | console-only; Ads API caps history ~60-95d |
| Lifetime total (ads+organic) | **~18,000 units** | William | authoritative all-time; ~half organic = a real valuation strength |
| Ad recovery (June fix) | CVR 1.79% → 11.1%; ACoS 314% → 57% | charter §1 / ad-engine work | re-confirm via current Ads report |

**Per-ASIN, 2-yr (alltime-sales-report-2026-06-24):** B07Y5GZP1T 5,149u/$64.3k · B097MGPCPC 1,320u/$28.6k ·
B097MK5VZ4 575u/$15.5k · B0BLLJLSDP 558u/$8.4k · B0CFYW3NYQ 357u/$6.6k · B0CFYVNBJX 164u/$3.9k · B0BLLHDRX5 11u/$154.

### The decline is a 12-month bleed, not a one-time cliff (synthesis, this baseline)
Monthly units (SP-API): mid-2025 peak **~492/mo** (2025-06) → 174 (2026-05) → **62 partial June** (through 06-22).
YoY June ≈ **−83%**; May YoY ≈ −64%. A gradual, accelerating decline across ~12 months fits **CVR / rating /
organic erosion**, not a sudden suppression event — corroborates gap-analysis and the ad-engine R1 finding
(stop cutting bids; fix conversion). The headline "~90% drop" is roughly the YoY-June figure on a partial month.

## 4. Live DB baseline (read-only pull 2026-06-29 — `node scripts/baseline.mjs`)
**Table row counts:** ad_engine_log 118 · alerts 4 · inventory 13 · review_requests 156 ·
campaigns/ad_groups/keywords/hourly_snapshots/bid_changes/search_terms **0** · auth_sessions/prep_contacts/
shipment_templates/shipments 0.
> The 0-count ad tables are **EXPECTED, not the drop cause**: the live ad engine reads the Ads API at run
> time, not these tables (memory ad-engine-which-one-runs / sales-drop-root-cause). ad_engine_log is active
> (6-18 actions/day, latest 2026-06-29) so the engine IS running.

**Inventory — only 4 of 13 SKUs have FBA stock (⚠️ 9 at zero):**
| SKU | ASIN | FBA | Days supply | Alert |
|---|---|---|---|---|
| 57-P4AJ-J4AC | B07Y5GZP1T (Single hero) | 256 | 149 | ok |
| CPH-BLCK-2 | B097MGPCPC (2-Pack) | 33 | 55 | ok |
| UG-SVG8-LB0P | B0BLLJLSDP (Pro) | 28 | 67 | ok |
| CPH-BLCK-3 | B097MK5VZ4 (3-Pack) | 17 | 52 | ok |
| 4N-06WS-Y02E | B0CFYW3NYQ | 0 | 0 | **out_of_stock** |
| 5S-RW0O-8KTZ | B0CFYVNBJX (Pro variant) | 0 | 0 | **out_of_stock** |
| CPH-WHTE-1/2/3 | B097MJCPBK / B097MJCQBF / B097MHPL12 | 0 | — | **out_of_stock** (all white) |
| EG-HYI8-35CO | B0BLLHDRX5 (Securisee lanyard) | 0 | 0 | **out_of_stock** |
| N1-APR0 / XR-S5DA | B07Y5GZP1T (dup SKUs) | 0 | — | — |

> ⚠️ **New finding to verify (William):** the hero Single and the 3 core black packs are in stock, but the
> Pro variant B0CFYVNBJX, the Assured B0CFYW3NYQ, ALL white packs, and the Securisee lanyard read zero FBA.
> Variant stockouts suppress those child listings and bleed sales — a plausible *contributor* to the decline
> on top of the CVR story. Confirm in Seller Central whether these are intentional (discontinued) or lapsed
> restocks. Reorder/landed-cost is a William action.

**review_requests:** 156 total. By day: a 120-row backfill on 2026-06-09, then a thin trickle (2-13/day),
**nothing after 2026-06-25.** Corroborates the review-coverage leak / 180-per-week ceiling (memory
review-engine-coverage-blind) — the engine isn't asking most eligible buyers, and 3.8★ is the top CVR drag.

## 5. Data-access reality (so we stop re-probing — journal 2026-06-24 PM lesson)
| Want | Where it lives | Why not the API |
|---|---|---|
| 2-yr units/$ | SP-API all-orders (stitched) | works; capped at ~2 yr retention |
| Lifetime units/$ | **Seller Central console only** (Campaign Manager ~5yr; Payments Date-Range to inception; 1099-K) | Ads API caps SP history ~60-95d; 2025 unified-reporting API still beta |
| Sales & Traffic / CVR by day | needs **Brand-Analytics role** | app currently 403s (memory sp-api-brand-analytics-403) — use all-orders instead |
| Live title char-counts | Listings Items API | needs `SP_API_SELLER_ID` (merchant token) env — parked ask 2026-06-29 |
| Finance (referral/FBA/settlements) detail | SP-API Finance role | needs role grant + re-consent (parked) |

## 6. How to keep this current
- `node scripts/baseline.mjs` → refresh §4 (live DB) any time; read-only, safe to run repeatedly.
- §3 lifetime figures are console-held → re-confirm with William, don't re-probe the API.
- When a parked role/env unblocks (Brand-Analytics, Finance, SP_API_SELLER_ID), add the new validated
  figure here with its source — this file is the canonical place.

**Provenance flags:** all figures above are our own validated data (DB / SP-API reports / William-confirmed
console figures). No aggregator/agency numbers in this baseline. Read-only; no live change, no spend, no send.
