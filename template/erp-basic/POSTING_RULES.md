# Finsoft ERP — Posting Rules (Basic edition)

How every financial and stock event becomes a journal entry and/or stock movement. Accounts are named by **role** (resolved per tenant through `Company.DefaultAccountMappings` → `Accounting.ChartOfAccounts`; the role catalogue is `Company.PostingRoles`). Account codes shown in brackets are the defaults of the *Trading & Distribution (PK)* COA template and match the journal previews in the prototype.

## 0. Mechanics that apply to every event
1. **Single ledger.** Every posting — manual voucher or system document — is one `Accounting.Vouchers` with ≥ 2 `Accounting.VoucherLines` rows. System postings carry `sourceDocType` + `sourceDocId` back to the document, and the document stores `journalEntryId`.
2. **Balanced on post.** Σ debit = Σ credit > 0; each line has exactly one side > 0; only POSTABLE, ACTIVE accounts allowed for the branch.
3. **Period & lock.** `postingDate` must fall in an OPEN fiscal period (and, in Full, the module must not be locked in `Accounting.PeriodModuleLocks`) and be after `Company.CompanySettings.booksLockDate`.
4. **Immutable.** A POSTED entry and its lines can't change. Corrections are reversals (`reversalOfId`), then re-entry.
5. **Idempotent.** One source document produces at most one live journal (unique on source document); re-posting the same document is a no-op.
6. **Sub-ledgers.** Lines on AR / AP / employee-advance control accounts carry `customerId`, `vendorId` or `employeeId` (at most one), so customer, vendor and staff balances are journal-derived.
7. **Stock.** Quantities move only through `Inventory.StockMovements` (append-only; item × warehouse × bin × batch, base units). Receipts update the item's **moving weighted-average cost**; issues are costed at the current average and picked **FEFO**. `Inventory.StockBalances` is maintained by trigger.
8. **Tax lines.** Output/input GST, further tax, advance tax and WHT post to their own role accounts per `Tax.TaxCodes`.
9. **Numbering.** The document number comes from `Company.getNextDocNo(<doc type>)` (row-locked).

---
## Accounting (acc) — manual vouchers, opening balances, reversal

All postings land in the single ledger `Accounting.Vouchers` + `Accounting.VoucherLines`. Every entry, manual or system, is checked by trigger `journalEntryGuard` when it becomes POSTED:
- ≥ 2 lines, Σ debit = Σ credit > 0, each line has exactly one side > 0;
- every line account is POSTABLE (level 4), ACTIVE, and allowed for the line's branch;
- `postingDate` falls in a fiscal period with status OPEN (`Accounting.getFiscalPeriodForDate` → `Accounting.assertPostingAllowed`) and is after `Company.CompanySettings.booksLockDate`;
- once POSTED the entry and its lines are frozen; corrections are reversals.

Accounts are referenced by role through `Company.DefaultAccountMappings` (role in brackets) or chosen on the screen.

### Journal voucher (JV)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Free-form journal | any postable account(s) | any postable account(s) | optional `customerId` / `vendorId` per line | balanced by the user; cost centre per line |
| JV with "Auto-reverse on <date>" | as entered | as entered | | a job calls `Accounting.voucherReverse(id, autoReverseOn, 'OTHER')` on that date |

### Cash payment (CPV) / Bank payment (BPV)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Pay expense / supplier / liability / asset | each entered line (expense, AP control, liability, asset) | cash account (CPV) or bank account (BPV) = Σ lines — auto contra line (`isAutoContra`) | `vendorId` on AP lines | header `cashBankAccountId`; BPV records instrument (Cheque / IBFT / Pay order / RTGS), cheque no & date |
| WHT deducted on a bank payment | AP / expense (gross) | bank (net) + WHT payable u/s 153 (separate line) | vendor | "WHT u/s 153 … should be posted as a separate line" |

### Cash receipt (CRV) / Bank receipt (BRV)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Receive income / customer / liability / equity / asset | cash (CRV) or bank (BRV) = Σ lines — auto contra line | each entered line (income, AR control, liability, equity, asset) | `customerId` on AR lines | BRV instrument: Cheque deposit / IBFT / Cash deposit |

### Contra (CON)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Cash deposited to bank / bank-to-bank transfer / withdrawal | receiving cash or bank account | paying cash or bank account | — | lines limited to CASH / BANK sub-type accounts |

### Opening balances (OB)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Post opening balances (`Accounting.openingBalancePost`) | every debit line of `Accounting.OpeningBalanceLines` | every credit line | optional customer / vendor on control accounts | one OB journal dated `asAtDate` (01 Jul) |
| Out-of-balance difference | suspense (OB_SUSPENSE, e.g. 3900-01) when credits > debits | suspense when debits > credits | — | difference = `OpeningBalances.difference` |
| Account created with an opening balance | added as a draft line of the FY batch on its normal side | | | "Posted on 01 Jul 2026 against Opening Balance Equity" |

### Reversal (any posted entry)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Reverse voucher (`Accounting.voucherReverse`) | every original credit line | every original debit line | same parties, cost centres, branches | new voucher of the same type (SYSTEM/OB → JV) dated the reversal date, `reversalOfId` + reason; original → REVERSED with `reversedById`; both stay in the register |

### System postings from other modules
Other modules create entries with `voucherType = 'SYSTEM'` (or `JV` when the screen shows a JV number, e.g. payroll accrual, depreciation) and `sourceDocType / sourceDocId / sourceDocNo`; the same guard applies. Their Dr/Cr are documented in each module's section. Module period locks (Full) use `Accounting.getModuleForDocumentType(sourceDocType)`.

Stock effect: none for any accounting voucher.

---

## Treasury: bank, cheques and cash (Basic)

Accounts are named by their `Company.DefaultAccountMappings.role` (**ROLE**) or by the treasury row that carries the GL account: **Bank** = `BankCash.BankAccounts.accountId` (1120-xx), **Cash** = `BankCash.CashAccounts.accountId` (1110-xx). Roles marked † are not yet in the `DefaultAccountMappings.role` CHECK and are proposed in the open questions. Every posting writes one `Accounting.Vouchers` (with `sourceDocType` / `sourceDocId` when it comes from a treasury document) and its `Accounting.VoucherLines` rows; sub-ledger party columns (`customerId`, `vendorId`) are set on the AR / AP line. Bank legs also write a `BankCash.BankTransactions` row. Treasury has no stock effect.

### Cash Book quick entry (`app/cash/book`)
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Cash In — Sales receipts (walk-in) | CRV | Cash | SALES_REVENUE (net) · OUTPUT_GST (18%) | split shown in the Cash Ledger voucher drawer; the counter sale itself is a `Sales.SalesInvoices` channel COUNTER when items are sold |
| Cash In — Customer receipts | CRV | Cash | AR_CONTROL (customer) | generates `Sales.CustomerReceipts` when allocated to invoices |
| Cash In — Other income / Loan / capital / Refund received | CRV | Cash | `CashCategories.defaultAccountId` | |
| Cash Out — expense categories (Office supplies, Utilities, Courier & postage, Staff welfare, Fuel & conveyance, Repairs & maintenance) | CPV | `CashCategories.defaultAccountId` | Cash | |
| Cash Out — Salary advance | CPV | STAFF_ADVANCES† (1160) | Cash | party text in Basic; employee sub-ledger in Full |
| Cash Out — Vendor payment | CPV | AP_CONTROL (vendor) | Cash | generates `Purchases.VendorPayments` when allocated to bills |
| Bank Only In / Out (IBFT, RAAST, Bank transfer, Debit card) | BRV / BPV | Bank / category account | category account / Bank | + `BankTransactions` (PENDING) |
| Every entry | — | — | — | `BankCash.CashBookEntries` holds kind, time, category, payment mode, party text |

### Contra / transfer
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Transfer cash → bank (cash deposited) | CON / JV | Bank | Cash | `CashBookEntries` TRANSFER; `BankTransactions` deposit (UNCLEARED until seen on statement) |
| Transfer bank → cash (withdrawal) | CON / JV | Cash | Bank | `BankTransactions` withdrawal |
| Transfer bank → bank (payroll funding) | CON / JV | Bank (to) | Bank (from) | two `BankTransactions` rows |
| Transfer cash → cash (drawer → imprest) | CON / JV | Cash (to) | Cash (from) | no income or expense booked |

### Cheque received (`app/bank/cheques`, `app/bank/cheque-register`)
`BankCash.Cheques.postingMode` decides when the GL moves.
| Event | Mode | Dr | Cr | Notes |
|---|---|---|---|---|
| Record cheque (dated today / past) | DEPOSIT | Bank (deposit-into account) | AR_CONTROL (customer) | BRV; status IN_HAND → DEPOSITED; `Sales.CustomerReceipts` with `chequeId` settles the allocated invoices |
| Record PDC | HOLD_PDC | CHEQUES_IN_HAND | AR_CONTROL (customer) | CRV-type entry; customer balance reduced at receipt |
| Deposit PDC at maturity | HOLD_PDC | — | — | status DEPOSITED, `BankTransactions` UNCLEARED (no GL until clearing) |
| Clear PDC | HOLD_PDC | Bank | CHEQUES_IN_HAND | BRV ("Cheque cleared · BRV posted"); `clearingJournalEntryId` |
| Record cheque | CLEAR_ON_DEPOSIT | — | — | memo only |
| Clear | CLEAR_ON_DEPOSIT | Bank | AR_CONTROL (customer) | BRV + `Sales.CustomerReceipts` |

### Cheque issued
| Event | Mode | Dr | Cr | Notes |
|---|---|---|---|---|
| Issue current-dated cheque | DEPOSIT | AP_CONTROL (vendor) / `Cheques.accountId` | Bank | BPV; `BankTransactions` UNPRESENTED until presented |
| Issue PDC | HOLD_PDC | AP_CONTROL (vendor) | PDC_PAYABLE | vendor balance reduced at issue |
| PDC presented / cleared | HOLD_PDC | PDC_PAYABLE | Bank | BPV |
| Stop / cancel unpresented cheque | any | reverse the issue voucher | | status STOPPED / CANCELLED |

### Cheque bounce (`ChequeBounces`)
| Event | Dr | Cr | Notes |
|---|---|---|---|
| Received cheque bounced after clearing / deposit (DEPOSIT or CLEAR_ON_DEPOSIT) | AR_CONTROL (customer) | Bank | reversal BRV (`reversalJournalEntryId`); invoice re-opened (receipt reversed) |
| Received PDC bounced (HOLD_PDC, not yet cleared) | AR_CONTROL (customer) | CHEQUES_IN_HAND | |
| Bank return charges | BANK_CHARGES | Bank | `chargesJournalEntryId` |
| Charges recovered from customer ("Yes — debit note") | AR_CONTROL (customer) | BANK_CHARGES | replaces the line above when `recoverCharges` |
| Issued cheque bounced (insufficient funds on our side) | Bank | AP_CONTROL (vendor) / PDC_PAYABLE | vendor re-opened |
| Re-present | — | — | status DEPOSITED again; repeat the receipt postings |

### Bank charges, profit and markup (Bank Transactions → Categorise)
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Bank charges & FED | BPV | BANK_CHARGES (5410) | Bank | FED 16% included in the charge (not claimable) |
| Profit on PLS deposit | BRV | Bank | PROFIT_ON_DEPOSIT† (other income) | WHT deducted by the bank: Dr ADVANCE_INCOME_TAX† |
| Markup on running finance | BPV | MARKUP_EXPENSE† (finance cost) | Bank | |
| Unidentified IBFT credit → customer receipt | BRV | Bank | AR_CONTROL (customer) | `Sales.CustomerReceipts` |
| Vendor payment seen on statement | BPV | AP_CONTROL (vendor) | Bank | `Purchases.VendorPayments` |

### Cash variance (day close)
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Shortage (counted < book) | JV | CASH_OVER_SHORT† (6990) | Cash | `CashDayCloses.varianceJournalEntryId` |
| Overage (counted > book) | JV | Cash | CASH_OVER_SHORT† (6990) | |
| Balanced | — | — | — | day LOCKED with no voucher |

---

## Tax: sales tax and withholding lines (Basic)

Tax lines are posted **inside the source document's voucher**; the tax module owns the codes and rates (`Tax.TaxCodes`, `Tax.TaxCodeRates`), not separate vouchers. The tax account is `Tax.TaxCodes.accountId`, and `inputAccountId` for recoverable input tax. The rate is `Tax.getTaxRateOnDate(taxCodeId, docDate, isAtl)`, snapshotted on the document line as `taxRate`. Roles marked † are proposed additions to `Company.DefaultAccountMappings.role`. Tax has no stock effect.

### Output sales tax (sales invoice, counter sale, credit note)
| Event | Dr | Cr | Base / rule |
|---|---|---|---|
| Standard-rated sale (GST-18) | AR_CONTROL / Cash (gross) | SALES_REVENUE (value excl. tax) · OUTPUT_GST 2210 (18%) | `calcOnExclSalesTax`: rate × value excl. tax |
| Further tax to an unregistered buyer (FT-4) | AR_CONTROL (+4%) | FURTHER_TAX_PAYABLE 2211 | applies when the buyer has no STRN; 4% of value excl. tax |
| Zero-rated (GST-0) | AR_CONTROL | SALES_REVENUE | tax line at 0%; still reported in Annex-C |
| Exempt (EXEMPT) | AR_CONTROL | SALES_REVENUE | no tax line ("Not posted") |
| Reduced rate (GST-RED, Eighth Schedule) | AR_CONTROL | SALES_REVENUE · OUTPUT_GST (10%) | |
| Credit note | reverse of the above lines | | |

### Input sales tax (vendor bill, purchase voucher, debit note)
| Event | Dr | Cr | Base / rule |
|---|---|---|---|
| Standard-rated purchase (GST-18) | INVENTORY / expense (value excl. tax) · INPUT_GST 1410 (18%) | AP_CONTROL / Cash (gross) | `TaxCodes.inputAccountId` |
| Exempt / unregistered supplier | INVENTORY / expense (gross) | AP_CONTROL | no input claimed |
| Debit note | reverse of the above lines | | |

### Advance tax collected on sales (ADV-236G / ADV-236H)
| Event | Dr | Cr | Base / rule |
|---|---|---|---|
| Sale to a distributor / dealer / wholesaler (236G 0.1%) or retailer (236H 0.5%) | AR_CONTROL (+ tax) | ADVANCE_TAX_COLLECTED† 2232 | on gross value incl. sales tax unless `calcOnExclSalesTax`; non-ATL buyers use `nonAtlRate` |

### Withholding on vendor payments (WHT-153A/B/C, WHT-155)
| Event | Dr | Cr | Base / rule |
|---|---|---|---|
| Payment / bill with withholding | AP_CONTROL (gross due) | Bank / Cash (net) · WHT_PAYABLE 2230 (tax) | 153(1)(a) goods 5.5% (non-ATL 11%), 153(1)(b) services 9%, 153(1)(c) contracts 7%, 155 rent 15%; base excl. sales tax when `calcOnExclSalesTax`; non-ATL rate when `checkAtl` and the vendor is not on ATL |

### Withholding suffered on customer receipts (153(1)(a) on our sales)
| Event | Dr | Cr | Base / rule |
|---|---|---|---|
| Customer pays net of WHT | Bank / Cash (net) · ADVANCE_INCOME_TAX† 1420 (tax) | AR_CONTROL (gross) | `appliesTo = CUSTOMER_RECEIPTS`; adjustable against our income tax |

### Salary withholding (WHT-149)
Posted by the payroll run (payroll module): Dr SALARIES expense / Cr SALARIES_PAYABLE (net) · SALARY_TAX_PAYABLE† 2231 (slab tax).

---

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

---

## Purchases & payables

Every journal below is one `Accounting.Vouchers` with `sourceDocType` = the purchase doc type (`GRN`, `BILL`, `PV`, `DN`, `PAY`) and `sourceDocId` = the document id. The document stores the id in `journalEntryId`. Every AP line carries the sub-ledger party `vendorId`. Every line carries the document's `branchId` and the line's `costCentreId`. Accounts are resolved in this order: the line's or document's explicit account, then the vendor's (`Vendors.payableAccountId`, `Vendors.defaultAccountId`), then the item's inventory account, then the company role in `Company.DefaultAccountMappings`. Roles used:

| Role | Prototype account | Used by |
|---|---|---|
| `INVENTORY` | 1310 Inventory — IT Hardware / 1140-01 Finished Goods | GRN, PV, bill price variance, DN |
| `GRNI` | 2115-01 GRN clearing (goods received not invoiced) | GRN, bill |
| `INPUT_GST` | 1250 Input Tax Recoverable (PV preview: 2130-01 Input sales tax) | bill, PV, DN |
| `AP_CONTROL` | 2110 / 2110-01 Trade Creditors | bill, PV, DN, payment |
| `WHT_PAYABLE_153` | 2230 WHT Payable — 153 (PV preview: 2130-02) | bill, PV, DN, payment |
| `ADVANCE_TAX_236G` | 1150-04 Advance Income Tax (236G) | PV |
| `BANK_CHARGES` | 5410-01 Bank charges | payment |
| cash / bank | the GL account of `BankCash.CashAccounts` / `BankCash.BankAccounts` | PV paid-now, payment, DN refund |

Common rules:
- Posting runs in one transaction. The document is inserted as `DRAFT` and posted by a status `UPDATE`.
- The `Accounting` guards reject an unbalanced entry, a closed fiscal period and a date before the company lock date.
- Stock lines write append-only rows to `Inventory.StockMovements` (`sourceDocType` / `sourceDocId` / `sourceLineId`).
  - Receipts (GRN, PV, a bill without a GRN) use `movementType = 'GRN'`. The inv trigger `Inventory.triggerStockLedgerApply` then recomputes `Inventory.Products.avgCost` (Bhatti `AVCOST`) and `Inventory.StockBalances`.
  - Returns to the vendor (DN, PR) use `movementType = 'PURCHASE_RETURN'` at the current average cost.
- Purchasing never writes `Inventory.Products.cost` or `avgCost` directly; the GRN → stock-ledger path owns them. The PV / bill flag `updateItemSalePrice` writes only `Inventory.Products.price`, and only when the new price ≥ `Products.cost`, because inv enforces CHECK `price >= cost` unless the item is DRAFT.
- Reversal: void or cancel posts a mirror journal through acc's reversal mechanism and mirror stock-ledger rows. The document is never edited or deleted.

### Goods received note — `GRN` (app/purchases/grn → *Post GRN*)
| Dr | Cr | Amount |
|---|---|---|
| `INVENTORY` (per item) | `GRNI` | Σ `GoodsReceivedNoteLines.acceptedAmount` (= acceptedQty × unitCost, the PO rate) |

- **Stock:** IN into `GoodsReceivedNotes.warehouseId` for `acceptedQty` per line. Each row carries batchNo and expiryDate (the `Inventory.ProductBatches` row is created if missing) and the unit cost.
- **Rejected quantity** (`rejectedQty`, with its reason) does not enter stock. It is shown as "Rejected (debit note)" and is claimed through a debit note if the vendor bills it.
- **Roll-ups (trigger):**
  - `PurchaseOrderLines.receivedQty += acceptedQty`.
  - The PO moves to `PARTIALLY_RECEIVED`, `RECEIVED` or `BILLED`.
  - A receipt larger than the open PO quantity is rejected (`OVER_RECEIPT`).
- **Cancel:** reverses the journal and the stock. It is allowed only while `GoodsReceivedNoteLines.billedQty = 0`.

### Vendor bill — `BILL` (app/purchases/bills/new → *Submit for approval* → *Approve*; posting happens on final approval)
| Dr | Cr | Amount |
|---|---|---|
| `GRNI` | | Lines that have a `grnLineId`: billed qty × the GRN unit cost (clears the accrual) |
| `INVENTORY` (± price variance) | | Same lines: `netAmount` − GRN value. This revalues the moving average. Any part of the variance whose quantity has already been sold goes to cost of sales. |
| `INVENTORY` | | Stock lines without a GRN (direct receipt): `netAmount`. Stock IN at `netUnitCost` into `VendorBills.warehouseId`. |
| line `accountId` (expense) | | Non-stock lines, e.g. 5420 Freight Inward and 5310 IT Support, with their cost centre |
| `INPUT_GST` | | Σ `taxAmount` (GST + SST) when the tax code is claimable. Otherwise the tax is added to the line cost. |
| | `AP_CONTROL` (vendor) | `netPayableAmount` = total − WHT |
| | `WHT_PAYABLE_153` | `whtAmount` (per line: `netAmount × whtRate`, by section). It is deposited by the 15th through CPR. |

Prototype example: BILL-2026-000088 / PO-063 / GRN-0412.

| Account | Dr | Cr |
|---|---|---|
| 1310 Inventory | 2,554,000 | |
| 5420 Freight Inward | 18,000 | |
| 5310 IT Support | 120,000 | |
| 1250 Input Tax | 480,960 | |
| 2110 Trade Creditors | | 3,034,760 |
| 2230 WHT 153 | | 138,200 |
| **Total** | **3,172,960** | **3,172,960** |

The screen preview shows the inventory debit net of the GRNI clearing.

**Roll-ups (trigger):**
- `PurchaseOrderLines.billedQty` and `GoodsReceivedNoteLines.billedQty` increase.
- `GoodsReceivedNotes.billStatus` and `GoodsReceivedNotes.matchStatus` are refreshed.
- The PO moves to `BILLED` once every line is billed.
- `VendorBills.balanceAmount` starts at `netPayableAmount`.

**Void:** a mirror journal. It is blocked while any live `VendorPaymentAllocations` exists.

### Purchase voucher (counter purchase) — `PV` (app/purchases/voucher → *Save & Post*)
The PV is one `Purchases.VendorBills` row with `channel = COUNTER`. It has no PO or GRN; the PV is itself the receiving document.

| Dr | Cr | Amount |
|---|---|---|
| `INVENTORY` | | taxable amount (gross − discount) |
| `INPUT_GST` | | Σ line GST |
| `ADVANCE_TAX_236G` | | `advanceTaxAmount` (if entered) |
| | `WHT_PAYABLE_153` | `whtAmount` = taxable × "WHT u/s 153(1)(a) %" (5.5% filer, 11% non-filer) |
| | `AP_CONTROL` (vendor) | `netPayableAmount` |
| `AP_CONTROL` (vendor) | | `paidNowAmount` (only when Payment Mode ≠ On Credit) |
| | cash / bank account | `paidNowAmount` |

- The screen preview nets the two AP lines into "A/P = balance payable". We keep both lines so that the vendor ledger shows the full purchase and the payment.
- **Stock:** IN for `totalQty` = Ps-Qty + Bonus − Brk, at `netUnitCost` = taxable ÷ totalQty. Bonus therefore lowers the unit cost (Bhatti `PUR_NETCOST`). Breakage is paid for but never stocked.
- **Status:** `paidNow = netPayable` → `PAID`, `0 < paidNow < netPayable` → `PARTIALLY_PAID`, otherwise `POSTED` (set by trigger).
- **Cheque mode:** a `BankCash.Cheques` (issued) row is created from `chequeNo` and the bank account, and linked in `VendorBills.chequeId`.
- **Prices:** lines with `updateItemSalePrice` write the new sale price to `Inventory.Products`.

### Debit note — `DN` (app/purchases/debit-notes → *Create debit note*)
| Dr | Cr | Amount |
|---|---|---|
| `AP_CONTROL` (vendor) | | `creditAmount` = total − WHT adjustment |
| `WHT_PAYABLE_153` | | `whtAmount` (the WHT adjustment, e.g. 5% of the value) |
| | `INVENTORY` | `netAmount`. Reasons: PURCHASE_RETURN, QUALITY_REJECTION, and PRICE_VARIANCE / SHORT_SUPPLY while the stock is on hand. A non-stock bill line uses its expense account instead. |
| | `INPUT_GST` | `taxAmount` (input tax reversed; reported in the next sales-tax return) |

- **Example:** DN-2026-000013, one Dell Latitude returned. Dr AP 268,940 + Dr WHT 11,900 = Cr Inventory 238,000 + Cr Input GST 42,840 = 280,840.
- **Stock:** OUT from `DebitNotes.warehouseId` for `returnQty` (reasons PURCHASE_RETURN and QUALITY_REJECTION only).
- **Settlement:**
  - `ADJUST_AGAINST_BILL` inserts a `VendorPaymentAllocations` row (`debitNoteId`, `billId`), which lowers the bill balance.
  - `REQUEST_REFUND` leaves the DN `OPEN`. When the vendor refunds: Dr bank / Cr `AP_CONTROL` for `refundedAmount` (a `BankCash.BankTransactions` with source `DN`), then status `REFUNDED`.
  - A DN can also be used as a credit inside a payment allocation; this has no GL effect.

### Vendor payment — `PAY` (app/payables/payments → *Create payment* → approval → post)
| Case | Dr | Cr |
|---|---|---|
| WHT already withheld at bill (default) | `AP_CONTROL` (vendor) `amount` | bank / cash `amount` |
| WHT withheld now (allocation modal "Withhold now · 153(1)(a)") | `AP_CONTROL` `amount + wht` | bank / cash `amount`; `WHT_PAYABLE_153` `wht` |
| Bank charges | `BANK_CHARGES` `bankChargesAmount` | bank |

- **Example (payment run, 4 bills):** Dr AP 1,911,740 / Cr Meezan 1,911,740, plus bank charges 400. The WHT of Rs 130,020 was already withheld at the bills and is paid with the October CPR.
- **Cheque:** `BankCash.Cheques` (issued, crossed "A/C Payee only") linked in `VendorPayments.chequeId`. Status moves `POSTED → PRESENTED → CLEARED` from the bank book or reconciliation. A bounced cheque voids the payment: reversal journal, and its allocations are reversed.
- **Allocation:** each row reduces the bill balance by `amount + whtAmount`. A row only counts once its source payment is posted or its debit note is open. Money not allocated stays on account (`unallocatedAmount`). Allocating it later ("Allocate on-account", "Auto-allocate (FIFO)") has no GL effect unless WHT is withheld at that point. In that case: Dr `AP_CONTROL` / Cr `WHT_PAYABLE_153`.

---

## Inventory (inv)

**Costing.** Moving weighted average per item (`Inventory.Products.avgCost`, Bhatti AVCOST). The ledger trigger `Inventory.triggerStockLedgerApply` recomputes it on every costed receipt (GRN, MANUAL_IN, OPENING):
`newAvg = (prevQty × avg + qtyIn × unitCost) / (prevQty + qtyIn)`, where `prevQty` is the item's on hand across all warehouses before the row; when `prevQty ≤ 0` the receipt cost becomes the average. TRANSFER_IN, SALES_RETURN and ADJUSTMENT receipts move stock at the existing average and do not change it. Outgoing rows default `unitCost` to the current `avgCost`, so the stock value leaving equals the GL credit.

**Picking.** Batches are picked **FEFO** (earliest `expiryDate` first); QUARANTINE / RETURN_TO_PRINCIPAL / WRITTEN_OFF batches cannot be sold (trigger). Expiry-tracked items need a batch on every movement.

**Accounts.** Resolved from `Company.DefaultAccountMappings` unless the document or reason names one. The **inventory account is the warehouse's** `Inventory.Warehouses.inventoryAccountId` (default role INVENTORY, e.g. 1201 Stock in trade / 1310 Inventory). Other roles: STOCK_ADJUSTMENT (5090), STOCK_WRITE_OFF (5095), INVENTORY_SHRINKAGE (5160), INVENTORY_GAIN (4920), STOCK_IN_TRANSIT (1205), OPENING_BALANCE_EQUITY, plus the movement reason's `expenseAccountId`. All JVs are system postings in `Accounting.Vouchers` with `sourceDocType` / `sourceDocId` = the inventory document; values are Σ ledger `value` (cost, never selling price).

| Event | Document → ledger rows | Dr | Cr | Notes |
|---|---|---|---|---|
| **Manual stock in** (MI), reason Opening Stock | `Inventory.StockInOut` mode IN → OPENING in | Inventory (warehouse) | Opening balance equity | at line `unitCost`; recomputes avg |
| Manual stock in, other reasons (Adjustment, Damaged Return, Production, Found in Count, Gift Received, Internal Return) | MANUAL_IN in | Inventory | reason `expenseAccountId` (Adjustment 5090, Found in Count 4920, Gift Received other income, Internal Return the internal-use expense, Production WIP / production clearing, Damaged Return 5090) | recomputes avg |
| **Manual stock out** (MO), reasons Consumption, Sample Issue, Internal Use, Adjustment, Damaged / Breakage, Lost / Theft | MANUAL_OUT out at avg | reason expense (consumables, samples, office supplies, 5090, breakage, 5160) | Inventory | |
| Manual stock out, Expired Write-off | WRITE_OFF out at avg | 5095 Inventory write-off | Inventory | batch → WRITTEN_OFF when emptied |
| **Stock adjustment** (ADJ), net decrease | ADJUSTMENT out per line (WRITE_OFF for write-off reasons) | offset account (5090 / 5095) | Inventory | at weighted average; posted only after approval when \|net\| > Rs 25,000 |
| Stock adjustment, net increase | ADJUSTMENT in per line | Inventory | offset account (5090) | mixed documents post both sides per line |
| **Batch write-off** (Batches & Expiry "Write off…") | ADJ (reason Expired write-off) → WRITE_OFF out | 5095 | Inventory | `Inventory.ProductBatches.disposition = WRITTEN_OFF` |
| Batch → Clearance / Priority / Quarantine | disposition only | — | — | no stock or GL effect |
| Batch → Return to principal | disposition; stock leaves on the purchase debit note / return (PURCHASE_RETURN) | per purchase module | | |
| **Transfer** (TRF) posted / dispatched | TRANSFER_OUT at source (avg cost) | Stock in transit (1205) | Source inventory | JV **only** when source and destination inventory accounts differ; otherwise no GL |
| Transfer received | TRANSFER_IN at destination (in full) | Destination inventory | Stock in transit | as above |

Stock effects owned by other modules (they write `Inventory.StockMovements`; GL is in their sections): GRN → GRN in (Dr Inventory / Cr GRNI), purchase return / debit note → PURCHASE_RETURN out, sale (INV / SV) → SALE out at avg cost (Dr COGS / Cr Inventory), credit note with goods back → SALES_RETURN in at the original issue cost.

---

