# Ads API Launch Plan — week of 2026-06-08

**Goal:** Get the Amazon Advertising API approved and live this week. The application was rejected for an **address mismatch**; this plan gets the right documents in order, fixes the mismatch, and re-submits.

**Target:** approved (or re-submitted with everything correct) by **Fri 2026-06-12**.

**Owner split:** William does the Amazon-account + document steps (only he can log into Seller Central / the developer account). Claude does the app code (Track B bridge) and drafts/checklists.

---

## Why it was rejected (what "address didn't match" means)

Amazon's identity check for advertiser/API access compares the address across **three surfaces** and rejects if any disagree, even by formatting:

1. **Seller Central business address** (Account Info → Business Address)
2. **Tax interview address** (the W-9/W-8 on file — Account Info → Tax Information)
3. **Proof-of-address document** you upload (bank/credit-card statement or utility bill)

Sources: [Amazon Ads — apply for API access](https://advertising.amazon.com/API/docs/en-us/guides/onboarding/apply-for-access), [SP-API identity verification](https://developer-docs.amazon.com/sp-api/docs/verify-identity-in-spp), [re-verification tips](https://myamazonguy.com/amazon/successful-amazon-re-verification/).

**Until we read the rejection email we don't know which surface mismatched** — that is Monday's first task. The plan below covers all three so we fix it once.

---

## The documents to get in order

Amazon requires **two** documents: one identity, one proof-of-address. Proof-of-address must be **issued within the last 180 days** and show the account holder's name + address.

- [ ] **Identity document** — government photo ID for the account's authorized rep (William).
- [ ] **Proof of address** — pick ONE, name + address must match Seller Central exactly:
  - Bank statement (checking/savings/loan), OR
  - Credit-card statement, OR
  - Utility bill (accepted for the authorized representative).
- [ ] **Business legal name + address** confirmed identical across: Seller Central business address, tax interview (W-9), and the chosen proof-of-address doc. No abbreviation differences ("St" vs "Street"), no suite-line drift, no PO-box vs street.

---

## Priority #1 — the "Hello App Phone Assured" app (LWA developer application)

The Ads API binds to a **Login with Amazon (LWA) security profile / developer application**, set up under the `hello@phoneassured.com` Amazon account. This is the thing API access gets "assigned" to after approval.

- [ ] Confirm the LWA app exists at `developer.amazon.com` under the `hello@phoneassured.com` login (the SP-API app from April may already be it, or Ads needs its own profile).
- [ ] Confirm the **app/developer-profile address** also matches the three surfaces above (this is a common 4th mismatch source).
- [ ] Note the **Client ID** + **Client Secret** for the LWA profile — needed later for the live API wiring (Track A code, Task 4).

---

## What we already have (don't redo)

- **SP-API: fully authorized** since 2026-04-20 (inventory, restock, shipments). Amazon Fulfillment role enabled. This is the "pre-approval / access we already set up."
- **Bid + harvest engines built and tested** (38/38). They just need data I/O.
- The rejection is **only** on the **Ads API** (separate OAuth from SP-API — one LWA refresh token does not cover both).

---

## Day-by-day

**Monday 6/8 (≈45 min, William)**
1. Auth Gmail (`/mcp` → "claude.ai Gmail") so Claude reads the forwarded rejection email → pin the exact mismatched field.
2. Log into Seller Central → Account Info → screenshot/copy the **business address** and **tax-interview address**.
3. Log into `developer.amazon.com` (`hello@phoneassured.com`) → confirm the "Hello App Phone Assured" LWA app + its address.

**Tuesday 6/9 (documents)**
4. Pull one proof-of-address doc (≤180 days old) whose name + address match Seller Central.
5. Reconcile any mismatch found Monday (edit the surface that's wrong so all three agree).

**Wednesday 6/10 (re-submit)**
6. Re-apply for Ads API access at `advertising.amazon.com/partner-network` with corrected address + uploaded docs.

**Thursday–Friday 6/11–6/12**
7. Watch for Amazon's response (SLA ~72h). On approval: complete **"Assign API access"** while logged into the correct ad-owning account ([assign-access guide](https://advertising.amazon.com/API/docs/en-us/guides/onboarding/assign-api-access)).
8. Claude (in parallel, no approval needed): build the **Track B bulk-file bridge** so the bid engine starts producing value regardless of approval timing.

---

## Open questions to confirm Monday
- Exact mismatched address field (from the rejection email).
- Is "Hello App Phone Assured" the existing SP-API LWA app, or does Ads need its own new security profile?
- Which proof-of-address doc is easiest to produce with a matching address.
