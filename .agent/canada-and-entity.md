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
