# Amazon account actions — live tracker

Started 2026-08-19. Two clocks are running and they are NOT the same item. Confusing them is what
cost three days in early August, so this file keeps them apart.

---

## The two clocks

### 1. Identity verification — the 10-day one

**Submitted 2026-08-18.** The only "Action required" on Verify selling account was the
**Registration Extract**, which had rejected the 2011 Illinois Articles on two grounds: expired past
180 days, and not an acceptable document type. The Delaware Certificate of Good Standing dated
2026-08-06 was uploaded to that slot and William submitted it.

```
We are validating your information
Verification checks can take up to 10 business days.
```

**This is the item with the 10-day wait.** Nothing to do but wait. 10 business days from 08-18 lands
around 2026-09-01.

### 2. INFORM Consumers Act — the Friday one

**Due 2026-08-21.** This is NOT the same item and it is NOT on a 10-day clock.

Amazon's own INFORM checklist, read in US marketplace context on 08-18, showed four of five items
green. The single failure:

```
  OK   Identity          William Douglas Holdeman / Douglas Dean Holdings LLC / 371953962
  OK   Business Address  STE 162, 730 W LAKE ST, CHICAGO, IL, 60661-1010
  ->   Bank Account      "You don't have a verified bank account or didn't assign the verified
                          bank account as your default deposit method to the US marketplace."
  OK   Phone Number      +17733123388
  OK   Tax ID Number     TIN: XXXXX3962
```

The account `ending in 384` is already **Active, marked Default, and assigned to Amazon.com.br,
Amazon.ca and Amazon.com.mx**. It is simply not attached to Amazon.com. No document is involved
anywhere in that flow; both deposit pages were searched for a file input and there is none.

**Why this matters for the deadline.** There are two different things William could have submitted
on 08-18, and they behave differently:

- **Assigning the existing verified account** to the US marketplace clears immediately. No wait.
- **Adding a NEW bank account** starts Amazon's own bank verification, which does take days.

Which one happened is not knowable from this repo. It is knowable in about a minute in Seller
Central. **Check: Account Health -> Priority Actions -> INFORM Consumers Act, and look at whether
the Bank Account line has gone green.** If it is green, the Friday deadline is cleared and there is
nothing to chase. If it is still amber, the deadline is real and two days away.

Note: Amazon forces a fresh password on every visit to Deposit Methods, and the marketplace selector
must be on **United States** or the page shows Canada's actions instead.

---

## Plan agreed with William, 2026-08-19

1. **Today** — William calls Amazon Seller Support about the bank account / INFORM item.
2. **Friday 2026-08-21** — open a support ticket (case in Seller Central), then call them on the
   back of the case number so there is a written record before the deadline expires.

Reason for doing both: a phone call alone leaves no case id to point at if the store is actioned on
the 21st. The ticket creates the paper trail; the call gets it in front of a human the same day.

---

## Everything else on the account, as of 2026-08-19

- Account Health Rating 216. ODR 0% of 157 orders. Policy Compliance Healthy. All Issues zero.
- US balance $662.18 (the $918.48 figure was the Canada-context aggregate).
- Canada is deactivated and blocked on the same identity verification, one past-due item.
- Do NOT alter or redact a bank document. Amazon requires documents be "authentic and unaltered" and
  their deactivation language is "appear to be forged or manipulated", a lower bar than actually
  being forged.
- Amazon never asks for an EIN on a bank document. The stated field list is bank logo, account holder
  name, account number, date, address. The EIN goes through the tax interview.
- The two PNC verification letters dated 08-18 (one STE 162, one UNIT 162, both carrying the full
  unmasked account number) are held and were never needed for the INFORM item. Keep them: the
  business record uses STE and the residential record uses UNIT, and Amazon checks each address
  against its own document.
