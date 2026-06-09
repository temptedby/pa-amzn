# Sales Recovery Gameplan — Phone Assured (sales down ~90%)

**Mission:** recover Phone Assured sales (down ~90%). Everything else (Ads API, content, inbox, the Flippa sale) serves this.

## Diagnosis first (don't fix blind)

A ~90% drop has a specific cause; the highest-probability one is measurable in minutes.

### #1 hypothesis — Buy Box / Featured Offer loss (CHECK NOW)
The Buy Box drives 80-90% of Amazon sales; a listing that loses it falls to <5% of normal volume — i.e. a ~90% drop is the signature ([BellaVix](https://www.bellavix.com/why-your-amazon-listing-lost-the-buy-box-and-how-to-win-it-back-fast/), [SentryKit hidden causes](https://sentrykit.com/blog/amazon-sales-dropping-for-no-reason-hidden-causes-sellers-miss/), [Aura suppressed Buy Box](https://goaura.com/blog/suppressed-buy-box)).
- **5-min check:** open each ASIN's public product page — is there an "Add to Cart" with **your** offer, or is the Buy Box **suppressed** / held by another seller? In Seller Central → Manage Inventory, check Buy Box % per SKU.
- **Common triggers:** price above Amazon's reference threshold; lost Prime/FBA eligibility (stranded/inactive inventory); account-health/policy ding; listing content suppression; a competing/hijacker offer underpricing total price (incl. shipping).
- **Fix speed:** content-suppression clears in 15 min-6 h; listing/account-health cases 24-72 h via a Seller Support case.

### #2 — Canada (amazon.ca) block (you flagged it)
Directly removes the Canadian marketplace's revenue. Separate verification/account issue (Task 11) — not the Ads API.

### #3 — Paid traffic collapsed
If Sponsored Products spend dropped or campaigns paused, paid sales AND organic rank fall together (wasted clicks land on a no-Buy-Box page). The Ads API (pending) restores automated bidding; interim: confirm manual campaigns are actually live.

### Confirm with data
SP-API can pull the **daily sales/orders trend** — the exact date sales fell pinpoints the cause (a price change? a suppression event? the Canada block? ads pausing?). Build a sales-trend pull next.

## The levers, prioritized

| Pri | Lever | Why | Action |
|---|---|---|---|
| **P0** | Restore the Buy Box | 80-90% of sales | Check status → fix price/Prime/suppression/account-health |
| **P0** | Unblock Canada | Lost marketplace | Resolve amazon.ca verification (Task 11) |
| **P1** | Ads back on | Paid traffic + rank | Ads API approval (pending) → bid/harvest engine; verify manual campaigns live now |
| **P1** | Listing + reviews | Conversion + rank | A+ content, images, the fbareviews you bought → testimonial content |
| **P2** | Free external traffic | New top-of-funnel | Meta posts + hashtags + Amazon Posts from the content library. Reuse Social Scene's content *method*, NOT its data (two-companies rule) |
| **Ops** | Inbox digest + easy replies | Don't lose customers/buyers | Daily auto-clean + needs-attention email to william@besocialscene.com; reply from hello@ via Resend |

## Supporting workstreams
- **Flippa financials sheet** ([sheet](https://docs.google.com/spreadsheets/d/1NN5eHe8cU8B8ckOKEAixulirPOGWLcrd/edit)): pull 3 months of Amazon sales via SP-API; costs from Douglas Dean bank statements; needs Sheets API enabled. (A recovering sales trend also raises the sale价值.)
- **Daily inbox digest:** archive noise + flag Flippa-buyer / Amazon-reply / customer-issue mail → email digest.
- **Reply capability:** send replies from hello@phoneassured.com via Resend (domain already verified).

## Immediate next steps
1. **You:** eyeball the Buy Box on each ASIN (5 min) — is it yours, suppressed, or someone else's?
2. **Me:** build the SP-API daily sales-trend pull to date the drop.
3. Then fix the confirmed P0 cause first; layer ads + content for durable recovery.
