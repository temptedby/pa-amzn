# RBB: aibooks.phoneassured.com — finance consolidation

2026-08-08. Research before build, per William's standing rule. Nothing built yet.

**William's spec, verbatim:** *"i want to leave the documents in drive and just have the financial
reports to see on the aibooks.phoneassured.com not have a duplicate location to host the pdf."*

So: **reports on the site, documents stay in Drive, exactly one copy of every PDF.**

---

## 1. Problem

Three financial records live in three places and never meet:

| Source | Where it lives now | Format |
|---|---|---|
| PNC 5384 (checking) | Drive `2026 Douglas Dean Finances/PNC 5384` | 8 monthly PDFs, Dec 2025 - Jul 2026 |
| Amex 4008 (card) | Drive `.../Amex 4008` | 8 monthly PDFs, Dec 2025 - Jul 2026 |
| Amazon payouts | Seller Central only | live, via SP-API |

Answering "what did we actually make and spend last month" means opening sixteen PDFs and a browser
tab. Success looks like one screen: cash in, cash out, card balance, Amazon payout, by month, with a
link to the source document for anything that looks wrong.

Relevant context: the goal for PA is [[pa-goal-sell-through-wind-down]], moving ~2,000 units with no
new investment. This is a *visibility* tool for that wind-down, not a bookkeeping product.

## 2. Industry standard

- **Don't duplicate the system of record.** Serving copies of statements from a second host doubles
  the attack surface and creates a stale-copy problem. Link to the authoritative store instead. This
  is what William specified independently, and it is the right call.
- **Derived data over source documents.** Balances and monthly totals are far less sensitive than a
  statement PDF containing the full account number, address and every transaction line.
- **OWASP ASVS** on authentication: a single shared secret with no per-user identity gives no
  revocation and no audit trail. Named-identity sign-in restricted to an allowlist is the accepted
  baseline for anything financial.
- **Reconciliation before display** is standard accounting-software practice: never show a computed
  figure that does not balance. Show a flag instead.

## 3. Codebase reality

Checked, with citations:

| Need | Status |
|---|---|
| Hosting + subdomain | Vercel already. `amzn.phoneassured.com` proves the pattern. Just a CNAME. |
| Google Drive read | **Already works.** `scripts/drive-list.mjs:20` and `src/lib/google/gmail.ts:14` use `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN` with a Drive scope. |
| Database | Turso via `@libsql/client`, already a dependency. |
| Charts | `recharts`, already a dependency. |
| Auth | `src/app/login/page.tsx` exists but it is a **single shared password** ("Enter access password"). |
| PDF text extraction | **Missing.** No `pdf-parse`, `pdfjs-dist` or equivalent in `package.json`. |
| Amazon settlement data | SP-API client exists (`src/lib/amazon/sp-api.ts`); the Finances API role is **unverified**. |

### Two real blockers

**(a) The app cannot see the folder yet.** The Drive refresh token in this repo belongs to
**hello@phoneassured.com**. The `2026 Douglas Dean Finances` folder is owned by
**william@besocialscene.com** and hello@ is not on it. Nothing can be read until that folder is
shared with hello@phoneassured.com as Viewer. *This is William's action, one click.*

**(b) The Finances API role may not be granted.** We have been bitten by this exact thing before:
[[sp-api-brand-analytics-403]] documents a 403 caused by an ungranted role while everything looked
fine. Per [[cbc-confirm-before-claim]] this must be proven with a real call returning real
settlement data before it goes in the plan as done.

## 4. Options

| # | Approach | Effort | Trade-off |
|---|---|---|---|
| 1 | **Manual entry.** William types the monthly numbers into a form. | ~2h | No parsing risk at all, but it is recurring manual work forever. Fails the point. |
| 2 | **Deterministic PDF parse.** Extract text, match per-issuer patterns (PNC and Amex separately), store the derived totals. | ~6-8h | Brittle if an issuer changes layout, but a layout change fails loudly and is fixable. Numbers are exact. |
| 3 | **LLM extraction of the PDFs.** | ~4h | Flexible, but a model can silently transpose a digit. **Not acceptable for financial figures.** |
| 4 | **Bank API aggregator (Plaid or similar).** | ~15h + monthly cost | Live data and no parsing, but it means handing bank credentials to a third party and paying, for a business being wound down. Disproportionate. |

## 5. Recommendation

**Option 2, with a reconciliation guard, plus live Amazon data via SP-API.**

Shape:

- `aibooks.phoneassured.com` CNAME to Vercel, served by this same Next.js app under a route group
  that is separate from the ads dashboard.
- **Google sign-in restricted to an allowlist** (`william@besocialscene.com`,
  `hello@phoneassured.com`), not the existing shared password. Financial data earns named identity.
- A sync job reads the Drive folder, extracts text from each new PDF, parses per issuer, and stores
  **only derived figures**: period, opening balance, total credits, total debits, closing balance,
  plus the Drive `fileId`.
- **No PDF is ever copied, cached or served.** Each row links to `drive.google.com/file/d/<id>/view`,
  so the document opens in Drive behind Google's own auth. One copy, as specified.
- **Reconciliation guard:** if `opening + credits - debits != closing`, the row renders as "needs
  review" with the Drive link, and never as a number. A wrong number is worse than no number.
- Amazon payouts pulled live from SP-API Finances, joined on month.

### What NOT to do, and why

- **Do not use the existing shared password.** It has no revocation and no audit trail. Fine for ad
  keyword data, not for bank balances.
- **Do not use an LLM to read the statements.** Silent digit errors in a financial report are the
  one failure mode with no recovery, because nobody double-checks a number that looks plausible.
- **Do not put Social Scene anywhere near this.** `PNC Bank 8948 Social Scene` sits in the same Drive
  tree. William's two-companies rule means this surface is Douglas Dean and Phone Assured only.
- **Do not mirror the PDFs "just for speed."** That is the duplicate location William ruled out.

## 6. Open questions, trade-offs, rollback

**Open questions for William:**
1. Google sign-in as recommended, or reuse the existing shared password to save the auth work?
2. Amex 4008 is a card that may carry personal as well as business spend. Include it, or PNC and
   Amazon only?
3. How far back? The folder holds Dec 2025 onward. Earlier years exist in
   `2025 Douglas Dean + Phone Assured FInances`.

**Trade-offs accepted:** parsers are per issuer and will need a fix if PNC or Amex changes layout.
The reconciliation guard converts that from a silent wrong number into a visible flag, which is the
whole reason it is there.

**Rollback:** the subdomain is a DNS record and a Vercel domain. Removing both takes it offline
instantly with zero effect on `phoneassured.com`, `amzn.phoneassured.com` or the Drive files, since
nothing is ever moved or copied out of Drive.

## 7. Blocked on

1. William shares `2026 Douglas Dean Finances` with **hello@phoneassured.com** (Viewer is enough).
2. A real SP-API Finances call returning real settlement data, before any claim that it works.
3. Answers to the three questions above.
