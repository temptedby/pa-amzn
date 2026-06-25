# Canada reactivation + legal entity (William, 2026-06-25)

## Legal entity — EXACT name
**Douglas Dean Holdings LLC** is the correct legal entity for the Amazon business (Phone Assured / Securisee).

### Name-mismatch flag (verification risk)
- The amzn-clicks Ads API service desk (ticket AO-40501) lists the party as **"Douglas Dean LLC"** (missing "Holdings"). Mismatch vs the true "Douglas Dean Holdings LLC".
- Amazon identity/KYC + Ads API + Brand Registry verifications fail when the entity name is not IDENTICAL across Seller Central, tax interview, proof-of-address, bank, and registration docs. This mismatch is a likely contributor to the Ads API rejection and could block Canada.
- ACTION (RBB): audit every place the entity name appears (Seller Central legal name, tax interview/W-9/W-8, bank/disbursement, Delaware formation docs, registration extract) and confirm all read exactly "Douglas Dean Holdings LLC".

## Canada (amazon.ca) — needs document updates
- Status: amazon.ca selling offline; needs document/address alignment (task #11) + a valid Registration Extract.
- Known blocker from prior work: invalid Registration Extract -> need a **Delaware Certificate of Good Standing** in the EXACT entity name (Douglas Dean Holdings LLC).
- RBB next step (Bear, research-only): confirm the current amazon.ca rejection reason + the exact document list Amazon Canada requires (Certificate of Good Standing, proof of address, business license?), in the correct entity name; prep a checklist.
- William-gated (his legal/KYC click): ordering/uploading the Delaware Certificate of Good Standing; any Seller Central identity submit. Bear preps everything around it.

## Open question
- Which documents did amazon.ca specifically reject / request? (drives the exact list)

## DE Certificate of Good Standing — William can't find how to order (2026-06-25)
William: doesn't have it, can't find where to apply on Delaware's site.
- Reality: Delaware has no simple checkout button. Two paths:
  1. REGISTERED AGENT (fastest): the LLC's required DE registered agent can pull it in minutes. Find the agent on the formation docs / franchise-tax notice; ask for "Certificate of Good Standing for Douglas Dean Holdings LLC".
  2. STATE DIRECT: Division of Corporations (corp.delaware.gov) Document Upload Service + cover memo, ~$50 short form; needs the entity FILE NUMBER (on the formation certificate).
- Prereqs: DE franchise tax must be current; name must read exactly "Douglas Dean Holdings LLC".
- BEAR TASK (overnight, research-only): produce a step-by-step checklist — exact corp.delaware.gov page/URL, current fee, how to find the file number, registered-agent option, and the order for Amazon Canada. Cite sources. William then orders it (his action).

## CONFIRMED from documents (2026-06-25)
- EXACT legal name (from 2019 DE Certificate of Good Standing): **DOUGLAS DEAN HOLDINGS LLC** (with "Holdings"). The amzn-clicks "Douglas Dean LLC" is a confirmed MISMATCH to correct.
- Delaware FILE NUMBER: **7603115** (SR# 20197698822). Formed under DE law; good standing as of 10-29-2019.
- Registered agent / formation: **E-Government LLC, dba Delawarefile.com** (info@delawarefile.com); client portal "My Client Management". Formed Sept 2019 ($414).
- 2025 registered-agent payment on file (confirms agent active; franchise tax likely current).
- Saved (gitignored, NOT committed): .docs/legal/ has the 2019 Good Standing + 2025 payment PDFs.
- NEED: an UPDATED Certificate of Good Standing (2019 is too old for Amazon). Draft request to delawarefile.com is in hello@ Drafts (review+send). Use file number 7603115.
