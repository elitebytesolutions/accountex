## Sales & receivables

Every journal below is one `Accounting.Vouchers`. Its `sourceDocType` is the sales doc type (`INV`, `SV`, `CN`, `RCPT`) and its `sourceDocId` is the document id. The document stores the id in `journalEntryId`.
- Every AR line carries the sub-ledger party `customerId`.
- Every line carries the document's `branchId`.
- Accounts are resolved in this order: the line's explicit account (`SalesInvoiceLines.revenueAccountId`), then the customer's `receivableAccountId`, then the item's revenue / inventory / COGS account, then the company role in `Company.DefaultAccountMappings`.

Roles used:

| Role | Prototype account | Used by |
|---|---|---|
| `AR_CONTROL` | 1130 Trade Debtors (1131 Related Parties via `Customers.receivableAccountId`) | invoice, SV, CN, receipt |
| `SALES_REVENUE` | 4010 Sales — Goods · 4020 Service Revenue (per item) | invoice, SV |
| `SALES_RETURNS` | 4110 Sales Returns & Allowances | CN |
| `OUTPUT_GST` | 2210 Output GST Payable | invoice, SV, CN |
| `FURTHER_TAX_PAYABLE` | 2211 Further Tax Payable | invoice, CN |
| `ADVANCE_TAX_COLLECTED`† | 2232 Advance Tax Collected (236G / 236H) | invoice |
| `ADVANCE_INCOME_TAX`† | 1420 Advance Income Tax (WHT deducted by customers, s.153) | receipt |
| `FBR_POS_FEE`† | 2215 FBR POS service fee payable | invoice / SV (Rs 1 per FBR-integrated invoice) |
| `INVENTORY` / `COGS` | 1140 Inventory / 5010 Cost of Sales | invoice, SV, CN (restock) |
| `BANK_CHARGES` | 5410-01 Bank charges | receipt |
| `CASH_IN_HAND` / `CHEQUES_IN_HAND` | cash account GL / 1125 Cheques in hand | receipt |
| bank | GL of `BankCash.BankAccounts` | receipt |

† not yet in the `Company.DefaultAccountMappings.role` CHECK. See the open questions in the sales report.

Common rules:
- Posting runs in one transaction. The document is inserted as `DRAFT` and posted by a status `UPDATE` (`postedAt` set). The `Accounting` guards reject an unbalanced entry, a closed fiscal period and a date before the company lock date.
- Revenue is credited at the **taxable value** (gross − line discounts), so discounts are never posted separately. This matches the New Invoice posting preview.
- Stock lines write append-only `Inventory.StockMovements` rows with `sourceDocType` / `sourceDocId`. Issues are valued at the moving-average cost (Bhatti `AVCOST`) and picked FEFO by batch. `SalesInvoiceLines.unitCost` / `costAmount` keep the value used.
- Settlement is never a journal of its own: `CustomerReceiptAllocations` only moves open items inside the customer sub-ledger. Triggers recompute invoice / credit-note / receipt status.
- Reversal: VOID posts a mirror journal (`reversalJournalEntryId`) and mirror stock rows. Nothing is edited or deleted. An invoice can be voided only while `paidAmount = 0`.

### Sales invoice — `INV` (app/sales/invoices/new → *Save & send*)
| Dr | Cr | Amount |
|---|---|---|
| `AR_CONTROL` (customer) | | `SalesInvoices.netAmount` |
| | `SALES_REVENUE` (per line `revenueAccountId`) | Σ `SalesInvoiceLines.taxableAmount` |
| | `OUTPUT_GST` | Σ `SalesInvoiceLines.taxAmount` |
| | `FURTHER_TAX_PAYABLE` | `SalesInvoices.furtherTaxAmount` (unregistered buyer, 4 %) |
| | `ADVANCE_TAX_COLLECTED` | `SalesInvoices.advanceTaxAmount` (236G / 236H) |
| | `FBR_POS_FEE` | `SalesInvoices.fbrServiceFee` |
| `COGS` | `INVENTORY` | Σ `SalesInvoiceLines.costAmount` (stock lines only) |

Prototype check (INV-2026-000149): Dr 1130 1,866,760 = Cr 4010 1,557,000 + Cr 4020 25,000 + Cr 2210 284,760.
- **Stock:** OUT from `SalesInvoices.warehouseId` for `baseQty + bonusQty` per stock line. The batch comes from `SalesInvoiceLines.batchId` (FEFO default). Bonus goods are costed into COGS at zero revenue.
- **Order roll-up:** `SalesOrderLines.invoicedQty` and `deliveredQty` (Basic: delivery = invoicing) increase. The order moves to `INVOICED` when every line is fully invoiced.
- **FBR:** with `submitToFbr`, the invoice goes to FBR after the journal. Success sets `fbrStatus = 'POSTED'` and `fbrInvoiceNo`; failure sets `FAILED` and retries. The journal is not affected.
- **WHT estimate** (`expectedWhtAmount`) is informational. WHT is booked only when the customer actually deducts it (receipt).

### Counter cash sale — `SV` (app/sales/voucher → *Save & Post* / *Confirm & Post*)
1. Invoice journal and stock exactly as `INV` above (`channel = 'COUNTER'`, `sourceDocType = 'SV'`).
2. One `Sales.CustomerReceipts` per non-credit tender row of the Receive Payment modal, each allocated to the voucher:

| Tender | Dr | Cr | Amount |
|---|---|---|---|
| Cash | `CASH_IN_HAND` (branch drawer cash account) | `AR_CONTROL` (customer) | cash tender (tendered − change) |
| Card | bank GL of the card-settlement account | `AR_CONTROL` | card tender |
| JazzCash / Easypaisa | wallet bank GL | `AR_CONTROL` | wallet tender |
| Credit | — | — | stays as the invoice balance (credit-limit check applies) |

Walk-in sales use the walk-in customer, so AR is debited and credited in the same transaction and nets to zero.

### Receipt with WHT and bank charges — `RCPT` (app/receivables/receipts → *Save receipt*; invoice view → *Record payment*)
| Dr | Cr | Amount |
|---|---|---|
| bank GL (`bankAccountId`) / `CASH_IN_HAND` (`cashAccountId`) / `CHEQUES_IN_HAND` (cheque not yet deposited) | | `CustomerReceipts.amountReceived` |
| `ADVANCE_INCOME_TAX` | | `CustomerReceipts.whtAmount` (s.153 deducted by the customer) |
| `BANK_CHARGES` | | `CustomerReceipts.bankCharges` |
| | `AR_CONTROL` (customer) | `CustomerReceipts.settledAmount` = received + WHT + bank charges |

Prototype check (RCPT-2026-000096): Dr Meezan 738,000 + Dr Advance tax 62,000 = Cr 1130 800,000 against INV-2026-000146.
- **Allocation** (`CustomerReceiptAllocations`): no journal. Invoices with allocations go to PARTIALLY_PAID / PAID. Any unallocated remainder is a customer advance and stays as a credit in the customer sub-ledger (shown as "Unallocated (customer advance)").
- **Credit note in a receipt:** a CREDIT_NOTE allocation consumes an open customer credit and lets more invoice value be settled in the same receipt. No journal is needed, because both items are already in AR.
- **WHT certificate:** `whtCertificateStatus` NOT_YET_RECEIVED → RECEIVED. Tracking only; no journal.

### Cheque receipt link
The cheque lives in `BankCash.Cheques` (see POSTING_RULES §Bank & cash):
- **Hold as PDC:** Dr `CHEQUES_IN_HAND` / Cr `AR_CONTROL`.
- **Deposit:** Dr bank / Cr `CHEQUES_IN_HAND`.

The `Sales.CustomerReceipts` row (`method = 'CHEQUE'`, `chequeId`) carries the AR side and its allocations. The cheque's own `ChequeAllocations` rows are copied into `CustomerReceiptAllocations`.

**Bounce:** treasury posts the reversal: Dr `AR_CONTROL` (customer) / Cr bank, plus bank charges recovered from the customer (Dr `AR_CONTROL` / Cr `BANK_CHARGES`). The receipt moves to `BOUNCED` and stores `bounceJournalEntryId`. Trigger `receiptStatusSync` then re-opens every invoice it settled and frees any credit note it used.

### Credit note — `CN` (app/sales/credit-notes → *Submit for approval* → approve)
| Dr | Cr | Amount |
|---|---|---|
| `SALES_RETURNS` | | `CreditNotes.valueAmount` |
| `OUTPUT_GST` | | `CreditNotes.taxAmount` (reported as a debit note line in the Sales Tax Return) |
| `FURTHER_TAX_PAYABLE` | | `CreditNotes.furtherTaxAmount` |
| | `AR_CONTROL` (customer) | `CreditNotes.totalAmount` |
| `INVENTORY` | `COGS` | Σ `CreditNoteLines.costAmount` for lines with `restock = true` |

Prototype check (CN-2026-000022): Dr Sales returns 27,500 + Dr Output GST 4,950 = Cr 1130 32,450. New invoice balance 663,200 − 32,450 = 630,750.
- **Stock:** lines with `restock = true` come IN to `returnWarehouseId` at the original issue cost (`SalesInvoiceLines.unitCost`), into the original batch.
- **Treatment:**
  - `APPLY_TO_INVOICE`: status `APPLIED`; the invoice's `creditAppliedAmount` rises (trigger).
  - `KEEP_AS_CREDIT`: status `OPEN`; consumed later through a receipt allocation.
  - `REFUND`: a payment voucher pays it out: Dr `AR_CONTROL` / Cr bank. The voucher sets `refundedAmount`.

### Invoice void
The mirror of the invoice journal (all Dr ↔ Cr) plus stock IN of the issued quantities at the same cost. It sets `reversalJournalEntryId`, `voidedAt` and `voidReason`. It is allowed only when nothing is allocated.

### Customer opening balance
The opening balance is posted by the accounting opening-balance batch (`Accounting.OpeningBalanceLines` with `customerId`): Dr `AR_CONTROL` / Cr `OPENING_BALANCE_EQUITY`. `Sales.Customers.openingBalance` is the sub-ledger figure that receipts settle (`CustomerReceiptAllocations.targetType = 'OPENING_BALANCE'`).
