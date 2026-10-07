## Tax — Full

**Screens (4).**
- Basic: Tax Codes (`app/tax/codes`).
- Full only: Sales Tax Return (`app/tax/sales-tax`), Withholding Tax (`app/tax/wht`), FBR Integration (`app/tax/fbr`).

**Tables (12).**
- Basic 2: TaxCodes, TaxCodeRates.
- Full-only 10: SalesTaxReturns, SalesTaxReturnLines, WhtChallans, WhtCertificates, WhtDeductions, WhtStatements, FbrSettings, FbrBranchMappings, FbrInvoiceSubmissions, FbrConnectionEvents†.
- † helper table not in the contract registry.

### Features (in addition to Basic)
- **Monthly sales tax return (STR).**
  - Output tax (Annex-C) with further tax on unregistered buyers, and input tax (Annex-A) with supplier match status.
  - Inadmissible input u/s 8 / 8B and the 90% cap check, carry-forward and net payable.
  - Pre-filing validation:
    - buyer NTN / CNIC;
    - Annex-C reconciles to GL 2210;
    - blacklist check;
    - unmatched input;
    - FBR digital-invoice sync.
  - IRIS export of Annex-A / C / H (CSV or Excel, include or exclude unmatched input), filing, CPR payment and filing history.
- **Withholding register.** Every deduction or collection is kept by section:
  - deducted from vendors and staff (153, 155, 149);
  - collected from customers (236G / 236H);
  - suffered on our receipts (153(1)(a) withheld by customers).

  Each row records the party, ATL status, source document, taxable amount, rate and tax.
- **CPR challans.** Monthly challans settle the unpaid deductions of the chosen sections and create the BPV.
- **Certificates.** Deduction certificates are issued to deductees (PDF), and certificates are received from customers.
- **Statements.** Quarterly u/s 165 and annual u/s 149 statements, with due date, tax, status and filing date.
- **FBR real-time invoicing (PRAL).**
  - Settings: environment (Production / Sandbox), POS ID, NTN / STRN snapshot, token (held in the secret store) with expiry, and branch → POS mapping.
  - Behaviour: report on posting, print QR, block posting if FBR is unreachable, sync interval.
  - Monitoring: a submission log with IRN, status, retries and errors, plus connection history (health checks, timeouts, token renewals).

### Business rules (in addition to Basic)
- One return per authority, month and revision. Inadmissible input ≤ input tax.
  - FILED / PAID needs a filing date. PAID needs a CPR no., date and amount.
  - CPR numbers are unique.
- Annex lines:
  - C rows are sales-side only with value and tax.
  - A rows are purchase-side with a match status and no further tax.
  - H rows need an item and a closing quantity.
  - At most one source document per row.
- WHT deduction:
  - one party at most, on the side allowed by its direction;
  - PAID exactly when a CPR payment is linked;
  - CLAIMED only for SUFFERED rows.
- WHT certificate: issued ones carry no customer; received ones carry no vendor or employee; dates follow the direction.
- FBR:
  - one configuration per authority;
  - a live connection needs a token reference;
  - one submission per invoice / credit note, and ACCEPTED exactly when an IRN exists;
  - FAILED needs an error;
  - IRNs are unique.
- Connection log is append-only.

### Statuses (in addition to Basic)
- Sales tax return: DRAFT → VALIDATED → FILED → PAID · REVISED.
- WHT deduction: UNPAID → PAID; CLAIMED (suffered); CANCELLED.
- WHT payment: DRAFT → PAID · CANCELLED.
- WHT return: IN_PREPARATION → FILED → REVISED.
- WHT certificate: DRAFT → ISSUED / RECEIVED → CLAIMED · CANCELLED.
- FBR config: NOT_CONFIGURED → CONNECTED · DEGRADED · DISCONNECTED.
- FBR submission: PENDING → ACCEPTED · FAILED.

### Integrations
- FBR IRIS (annex upload, WHT statements).
- FBR / PRAL Digital Invoicing API (real-time reporting, QR).
- FBR ATL lookup.
- FBR e-Payment (CPR).

### Doc types
STR (sales tax return), WHT (WHT challan record).
