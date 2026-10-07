# Finsoft ERP — Posting Rules (Full edition)

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
## Core: approval gate and document numbering at post

These two rules run **before** any module posting rule (sales, purchase, treasury, inv, payroll, fa …). They create no journal lines of their own.

### 1. Approval gate (Full)
| Step | Rule | Tables |
|---|---|---|
| Submit | When a document is submitted, the posting service finds the ACTIVE `Company.ApprovalWorkflows` for its subject with the lowest `priority` whose `ApprovalWorkflowConditions`s all hold (amount, doc type, branch …). If one matches, it inserts `Company.Approvals` (PENDING, `currentStepNo` = first applicable step, `currentStepDueAt` = now + `slaHours`) and `Company.ApprovalActions` SUBMIT. The document stays unposted (e.g. status `SUBMITTED` / `PENDING_APPROVAL` in its own table). | `ApprovalWorkflows`, `ApprovalWorkflowConditions`, `ApprovalWorkflowSteps`, `Approvals`, `ApprovalActions` |
| Steps | Steps with `appliesAboveAmount` ≥ the amount are skipped (AUTO_SKIP). The approver may not be the preparer (`blockSelfApproval`). The approver's `Company.RoleLimits.maxVoucherAmount` and `Company.Users.approvalLimit` must cover the amount. An SLA breach escalates or reminds. | `ApprovalWorkflowSteps`, `RoleLimits`, `Users` |
| Outcome | Last step APPROVE → request APPROVED. If `onComplete` = AUTO_POST, the document is posted immediately (section 2 + the module's posting rule). REJECT / REQUEST_CHANGES → document back to DRAFT, request closed. | `Approvals` |
| Guard | Every posting function calls `Company.assertDocumentApproved(<doc type>, <id>, <workflow matched?>)`. It raises unless the latest request is APPROVED, or no workflow applied (`NOT_ROUTED` with `pRequired = false`). | `Company.assertDocumentApproved()`, `Company.getApprovalStatus()` |

Basic has no approvals engine. Posting there is gated only by the permission (`…:post`), the user's approval limit, and the period / lock-date checks.

### 2. Document number assigned at post (Basic + Full)
| Step | Rule |
|---|---|
| Drafts | Posting documents are saved as DRAFT with `docNo` holding a temporary reference (or NULL where the module allows it), so cancelled drafts never burn a number. |
| Post | In the posting transaction, before the journal is written: `docNo := Company.getNextDocNo('<DOC_TYPE>', docDate, branchId)`. The function takes the branch series first, else the tenant-wide one. It locks the `Company.NumberingSeriesCounters` row for (series, period), where the period comes from `resetPolicy` (YEARLY → `YYYY` of docDate, MONTHLY → `YYYY-MM`, NEVER → `ALL`). It then returns the formatted number (`INV-2026-000146`, `CRV-LHR-0381`). |
| Rollback | If the post fails, the transaction rolls back and the counter increment rolls back with it: no gaps from failures and no duplicates (never MAX+1). |
| Journal | `Accounting.Vouchers.sourceDocType` / `sourceDocId` point back to the document. The journal's own number (`JV`/`CRV` …) is drawn the same way for manual vouchers. |
| Masters | Masters (CUST, VEN, ITEM, EMP …) take their `code` from `Company.getNextDocNo` at **save**, not at post. |

Guards that apply at post, in order:
1. permission `…:post`;
2. approval gate (Full);
3. `docDate > Company.getBooksLockDate()`;
4. open fiscal period (acc);
5. role back-dating window `RoleLimits.backdateDays` (Full);
6. number assignment;
7. module posting rule.

Each successful post writes `Company.AuditTrailEntries` with action POST.

---

## Accounting (acc) — manual vouchers, opening balances, reversal, recurring, allocation, year-end close

All postings land in the single ledger `Accounting.Vouchers` + `Accounting.VoucherLines`. Every entry, manual or system, is checked by trigger `journalEntryGuard` when it becomes POSTED:
- ≥ 2 lines, Σ debit = Σ credit > 0, each line has exactly one side > 0;
- every line account is POSTABLE (level 4), ACTIVE, and allowed for the line's branch;
- `postingDate` falls in a fiscal period with status OPEN, the module of the entry (`Accounting.getModuleForDocumentType`: GL, AR, AP, INV, PAY) is not CLOSED/LOCKED in `Accounting.PeriodModuleLocks`, and the date is after `Company.CompanySettings.booksLockDate`;
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

### Recurring templates (`Accounting.recurringVoucherTemplateRun`)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| JV template run (rent, accruals, insurance amortisation, audit fee) | template debit lines | template credit lines | per line | voucher of type JV dated the run date, `recurringTemplateId` set |
| BPV / CPV template run (loan instalment, advance tax u/s 147) | template debit lines | template bank / cash account = Σ lines (auto contra) | per line | posts immediately when `autoPost`, else stays DRAFT |
| Run fails (e.g. period locked) | — | — | — | nothing posted; `Accounting.RecurringVoucherRuns` FAILED, template FAILED with `lastError`, notification if `notifyOnFailure` |

### Allocation rules (on posting)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Line on an allocation rule's account (e.g. 5110-01 Rent) in a voucher being posted | same account, split by the posting service (while still DRAFT) into one line per `Accounting.CostAllocationSplits` (amount × %), each with its `costCentreId` and `allocationRuleId` | unchanged | — | Σ split lines = original line; rounding difference to the largest share; not a DB trigger |

### Period reopen
No posting. An approved `Accounting.PeriodReopenRequests` sets the period (or module lock) OPEN until `reopenUntil`; postings dated in it are then accepted; the job re-closes it to `previousStatus`.

### Year-end close (`app/periods/close`, FINAL)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Included year-end adjustments (`Accounting.YearEndAdjustments`) | `debitAccountId` | `creditAccountId` | — | JV each, e.g. doubtful-debt provision, stock obsolescence, gratuity true-up |
| Close income accounts | every class-4 account with a credit balance (its balance) | class-4 accounts with debit balances (contra revenue, e.g. returns & discounts) | — | one closing JV dated the last day of the year (or P13) |
| Close expense accounts | — | every class-5 account (its balance) | — | same closing JV |
| Transfer result | net loss → retained earnings | net profit → retained earnings (RETAINED_EARNINGS, e.g. 3201) | — | `YearEndCloses.netProfit`; `FiscalYears.closingJournalEntryId`, `netProfitTransferred` |
| Carry forward | — | — | — | balance-sheet balances become next year's `Accounting.OpeningBalances` (no extra journal: the ledger is continuous; the batch documents the brought-forward position) |
| Lock | — | — | — | all periods LOCKED, year CLOSED + locked; dry run posts nothing |

---

## Fixed assets (fa) — capitalisation, depreciation, disposal, transfer

Accounts come from the asset (defaults from `FixedAssets.FixedAssetCategories`): asset cost (e.g. 1105 Vehicles — Cost), accumulated depreciation (e.g. 1155 Vehicles — Acc. Dep.), depreciation expense (e.g. 6107). Gain/loss and output-GST accounts come from `Company.DefaultAccountMappings` (FA_GAIN e.g. 4910 Other Income / 4210-02, FA_LOSS, OUTPUT_GST). All journals pass the acc posting guard (balanced, open period, after books lock date). Stock effect: none.

### Capitalisation
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Asset bought on a vendor bill | asset cost account (`FixedAssets.FixedAssets.costAccountId`) + input GST if claimable | AP control | vendor | posted by the purchase bill; `FixedAssets.FixedAssets.sourceDoc*` links the bill |
| Asset capitalised without a bill (e.g. from CWIP) | asset cost account | CWIP / clearing account | — | manual JV |

### Monthly depreciation (`FixedAssets.depreciationRunPost`)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Post depreciation run for a period | depreciation expense (`expenseAccountId`) per branch and cost centre ("cost centre split by branch") | accumulated depreciation (`accumDepAccountId`) per category account and branch | — | one JV (source DEP, e.g. JV-2026-000412) dated the run posting date; charge = WDV: opening NBV × rate ÷ 12, SLM: cost × rate ÷ 12, capped at NBV − residual; method NONE (land) and fully depreciated assets skipped; full month in month of purchase when `chargeFullMonthOnPurchase` |
| After posting | — | — | — | `FixedAssets.FixedAssets.accumulatedDepreciation` += charge, `depreciatedThrough` = period end; NEW → IN_USE; NBV ≤ residual → FULLY_DEPRECIATED; an asset can be charged only once per period (unique run line) |

### Disposal (`FixedAssets.assetDisposalPost`)
| Event | Dr | Cr | Party | Notes |
|---|---|---|---|---|
| Sale / trade-in proceeds | receive-into bank or cash account (proceeds + GST) | — | `customerId` when sold on credit to AR | |
| Remove accumulated depreciation | accumulated depreciation (to the month before disposal) | — | — | |
| Remove cost | — | asset cost account (original cost) | — | |
| Output GST on asset sale | — | output GST (`gstAmount`) | — | "GST 18% — Rs 243,000"; none when Exempt |
| Gain (proceeds > NBV) | — | gain on disposal (e.g. 4910 Other Income) | — | `gainLoss` > 0 |
| Loss (proceeds < NBV) | loss on disposal | — | — | `gainLoss` < 0; scrapped / written off with no proceeds = loss of the full NBV |
| After posting | — | — | — | asset DISPOSED (`disposedOn`), disposal POSTED with `journalEntryId` |

### Transfer
No journal. Completing `FixedAssets.AssetTransfers` changes `FixedAssets.FixedAssets.branchId` / custodian; later depreciation lines carry the new branch.

---

## Treasury: bank, cheques and cash (Full)

Accounts are named by their `Company.DefaultAccountMappings.role` (**ROLE**) or by the treasury row that carries the GL account: **Bank** = `BankCash.BankAccounts.accountId` (1120-xx), **Cash** = `BankCash.CashAccounts.accountId` (1110-xx). Roles marked † are not yet in the `DefaultAccountMappings.role` CHECK and are proposed in the open questions. Every posting writes one `Accounting.Vouchers` (with `sourceDocType` / `sourceDocId` when it comes from a treasury document) and its `Accounting.VoucherLines` rows; sub-ledger party columns (`customerId`, `vendorId`) are set on the AR / AP line. Bank legs also write a `BankCash.BankTransactions` row. Treasury has no stock effect.

### Cash Book quick entry (`app/cash/book`)
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Cash In — Sales receipts (walk-in) | CRV | Cash | SALES_REVENUE (net) · OUTPUT_GST (18%) | split shown in the Cash Ledger voucher drawer; the counter sale itself is a `Sales.SalesInvoices` channel COUNTER when items are sold |
| Cash In — Customer receipts | CRV | Cash | AR_CONTROL (customer) | generates `Sales.CustomerReceipts` when allocated to invoices |
| Cash In — Other income / Loan / capital / Refund received | CRV | Cash | `CashCategories.defaultAccountId` | |
| Cash Out — expense categories (Office supplies, Utilities, Courier & postage, Staff welfare, Fuel & conveyance, Repairs & maintenance) | CPV | `CashCategories.defaultAccountId` | Cash | |
| Cash Out — Salary advance | CPV | STAFF_ADVANCES† (1160), `employeeId` sub-ledger | Cash | `CashBookEntries.employeeId`; recovered through payroll |
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

### Cash Ledger approval (`app/cash/ledger`)
| Event | Effect |
|---|---|
| Cash voucher ≥ `CashAccounts.approvalThreshold` (Rs 50,000) or any contra JV | `Vouchers.status` PENDING_APPROVAL; posts on Finance Manager approval (`approvedByUserId`) |
| Reverse from the ledger drawer | reversing voucher drafted for approval; blocked when `CashDayCloses` is LOCKED for that day |

### Bulk cheque voucher (`ChequeBatches`)
Each generated row follows the cheque received / issued rules above with the batch `postingMode` (Deposit in Bank = DEPOSIT, Hold as PDC = HOLD_PDC, Clear on deposit = CLEAR_ON_DEPOSIT). One voucher per row.

### Bank rules and reconciliation
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Rule match, outflow (auto-post) | BPV | `BankRules.accountId` (cost centre `BankRules.costCentreId`) | Bank | `BankStatementLines` CATEGORISED; `BankTransactions` (CLEARED) with `bankRuleId` |
| Rule match, inflow | BRV | Bank | `BankRules.accountId` | |
| Raast / IBFT credit matched to invoice | BRV | Bank | AR_CONTROL (customer) | `Sales.CustomerReceipts` allocated to `BankStatementLines.matchedInvoiceId` |
| Reconciliation "Create adjustments" | BRV / BPV | as Bank charges / Profit above | | `BankReconciliationMatches.adjustmentJournalEntryId` |
| Finish reconciliation | — | — | — | no GL; matched `BankTransactions` → RECONCILED |

### Petty cash (imprest method)
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Fund set-up / increase | CPV / BPV / CON | Cash (fund's `CashAccounts`) | Cash (main) or Bank | imprest raised |
| Petty expense voucher (PCV) | — | — | — | no GL: voucher UNREPLENISHED |
| Replenishment (top-up) | CPV / BPV | each voucher's `accountId` (cost centre) | Cash (main, `payFromCashAccountId`) or Bank | restores the fund to imprest; vouchers REPLENISHED; "Post expense vouchers and CPV together" posts one voucher with one Dr line per category |
| Top-up without vouchers (float increase) | CPV / BPV | Cash (fund) | Cash (main) or Bank | |

### Expense claims
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Approve claim | JV | `chargeAccountId` / line `accountId` (cost centre, project) | EMPLOYEE_CLAIMS_PAYABLE† (`employeeId` sub-ledger) | `approvalJournalEntryId`; input GST on itemised receipts is not claimed |
| Pay claim by bank | BPV | EMPLOYEE_CLAIMS_PAYABLE† | Bank (`paymentBankAccountId`) | "Pay approved" makes one BPV per claim or a batch |
| Pay claim by cash | CPV | EMPLOYEE_CLAIMS_PAYABLE† | Cash | |
| Reimburse with payroll | — | — | — | payroll run posts Dr EMPLOYEE_CLAIMS_PAYABLE† / Cr SALARIES_PAYABLE (payroll module); claim PAID with `payrollRunId` |
| Reject / withdraw | — | — | — | no GL |

---

## Tax: sales tax and withholding lines (Full)

Tax lines are posted **inside the source document's voucher**; the tax module owns the codes and rates (`Tax.TaxCodes`, `Tax.TaxCodeRates`). In Full, every withholding / collection line also writes a `Tax.WhtDeductions` row (direction DEDUCTED / COLLECTED / SUFFERED) and the only vouchers the tax module raises itself are the CPR settlements below. The tax account is `Tax.TaxCodes.accountId`, and `inputAccountId` for recoverable input tax. The rate is `Tax.getTaxRateOnDate(taxCodeId, docDate, isAtl)`, snapshotted on the document line as `taxRate`. Roles marked † are proposed additions to `Company.DefaultAccountMappings.role`. Tax has no stock effect.

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

### WHT register rows (Full)
| Source event | `Tax.WhtDeductions` | Notes |
|---|---|---|
| Vendor payment / bill with 153 / 155 | direction DEDUCTED, `vendorId`, `sourceDocType` PAY / BILL, status UNPAID | `journalEntryId` = the payment / bill voucher |
| Sale with 236G / 236H | direction COLLECTED, `customerId`, `sourceDocType` INV | |
| Receipt net of customer WHT | direction SUFFERED, `customerId`, `sourceDocType` RCPT | → CLAIMED when the certificate is received (`WhtCertificates` RECEIVED) and adjusted |
| Payroll run 149 | direction DEDUCTED, `employeeId`, `sourceDocType` PRUN | one row per employee |

### WHT deposit with FBR (CPR, `Tax.WhtChallans`)
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Record challan 153 · 236G/H | BPV | WHT_PAYABLE 2230 · ADVANCE_TAX_COLLECTED† 2232 | Bank (`WhtChallans.bankAccountId`) | settles the UNPAID `WhtDeductions` rows of the period and sections → PAID |
| Record challan 149 salary | BPV | SALARY_TAX_PAYABLE† 2231 | Bank | |

### Sales tax settlement (`Tax.SalesTaxReturns`)
| Event | Voucher | Dr | Cr | Notes |
|---|---|---|---|---|
| Return filed (month-end transfer, optional) | JV | OUTPUT_GST 2210 · FURTHER_TAX_PAYABLE 2211 | INPUT_GST 1410 (admissible) · SALES_TAX_SETTLEMENT† (net payable) | inadmissible input u/s 8 / 8B: Dr expense / Cr INPUT_GST |
| CPR payment | BPV | SALES_TAX_SETTLEMENT† (or OUTPUT_GST directly when no settlement JV is used) | Bank (`paidFromBankAccountId`) | `paymentJournalEntryId`, `cprNo`, status PAID |
| Net refundable / negative | — | — | — | carried forward as `carryForwardIn` of the next return |

### FBR real-time reporting
No GL effect. `Tax.FbrInvoiceSubmissions` stores the IRN; when `blockIfUnreachable` is set, posting an invoice is refused while FBR cannot be reached (otherwise the submission is queued as PENDING and retried).

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

### Full-only events

Extra roles (all † = not yet in the `Company.DefaultAccountMappings.role` CHECK): `GDNI`† 1206 Goods delivered not invoiced, `CASH_OVER_SHORT`† 5490 Cash over / short, `CARD_CLEARING`† 1128 Card settlement clearing, `WALLET_CLEARING`† 1129 Mobile wallet clearing. Stock write-off uses the existing `INVENTORY_SHRINKAGE`.

### Wholesale invoice — `WS` (app/wholesale/*, delivery runs)
Same journal as `INV`. Rates are `listRate × priceTierFactor` unless `isManualRate`. Scheme discounts are already inside `discountAmount` (`schemeAmount` shows the scheme part), and scheme free goods are `bonusQty` (COGS, no revenue). When `SalesInvoices.creditOverrideId` is set, posting is allowed above the limit.
- `stockIssueMode = 'AT_POSTING'`: stock OUT and Dr `COGS` / Cr `INVENTORY` at posting, as for `INV`.
- `stockIssueMode = 'AT_DISPATCH'` (delivery-run invoices): at posting, only the AR / revenue / tax lines. When the van is dispatched (dist run), the following happen together:
  - stock OUT;
  - Dr `COGS` / Cr `INVENTORY`;
  - `stockIssuedAt`, `SalesInvoiceLines.unitCost` and `costAmount` are set (the line guard allows exactly these columns after posting).

### POS sale — `POS` (app/sales/pos → *Complete sale*)
1. Invoice journal and stock exactly as `INV` (`channel = 'POS'`, `posShiftId` set; `fbrServiceFee` Rs 1 → `FBR_POS_FEE`).
2. One `PosPayments` per tender. Each non-credit tender also creates a `Sales.CustomerReceipts` (`posShiftId`) allocated to the bill:

| Tender | Dr | Cr | Amount |
|---|---|---|---|
| Cash | `CASH_IN_HAND` (shift drawer `PosShifts.cashAccountId`) | `AR_CONTROL` | `PosPayments.amount` (change already netted) |
| Card | `CARD_CLEARING` | `AR_CONTROL` | amount |
| JazzCash / Easypaisa | `WALLET_CLEARING` | `AR_CONTROL` | amount |
| Credit | — | — | stays open on the customer |

3. Shift roll-up: `PosShifts.cashSales / cardSales / walletSales / creditSales / billsCount`.

### POS shift close — `ZR` (app/sales/pos → *Close shift & print Z-report*)
| Dr | Cr | Amount |
|---|---|---|
| `CASH_OVER_SHORT` | drawer cash account | shortage (`overShort < 0`) |
| drawer cash account | `CASH_OVER_SHORT` | excess (`overShort > 0`) |

No other journal: the sales and receipts were already posted bill by bill. Banking the drawer (cash → bank) is a treasury contra entry. Card and wallet clearing are settled against the acquirer statement in reconciliation.

### Delivery challan — `DC` (app/sales/challans)
| Event | Dr | Cr | Amount | Stock |
|---|---|---|---|---|
| *Mark dispatched* | `GDNI` | `INVENTORY` | Σ `DeliveryChallanLines.costAmount` (moving average) | OUT from `DeliveryChallans.warehouseId`; `SalesOrderLines.deliveredQty` += |
| *Convert to invoice* | `AR_CONTROL` | `SALES_REVENUE`, `OUTPUT_GST`, … | as `INV` | none (lines carry `deliveryChallanLineId`) |
| same | `COGS` | `GDNI` | the challan cost of the invoiced lines | — |
| *Cancel* after dispatch | `INVENTORY` | `GDNI` | challan cost | IN (mirror rows) |

### Sales return — `SR` (app/sales/returns → *Save Return*)
The AR and tax side is the credit note the return raises (`CreditNotes.salesReturnId`, its lines `restock = false`), posted as §Credit note with `SALES_RETURNS` / `OUTPUT_GST` Dr and `AR_CONTROL` Cr. The return itself posts the goods by line `disposition`:

| Disposition | Dr | Cr | Amount | Stock |
|---|---|---|---|---|
| `RESTOCK` | `INVENTORY` | `COGS` | `SalesReturnLines.costAmount` | IN to `SalesReturns.warehouseId`, original batch, saleable |
| `QUARANTINE` | `INVENTORY` | `COGS` | cost | IN, batch disposition QUARANTINE (not available for sale) |
| `WRITE_OFF` (e.g. expired) | `INVENTORY_SHRINKAGE` | `COGS` | cost | IN then OUT (movement `SR` + write-off), net zero on hand, audit trail kept |

`REPLACEMENT` returns also create a replacement invoice (`replacementInvoiceId`). That invoice is posted as `INV`; the return and the replacement usually net to zero AR.

### Recurring invoice run — `RP`
Each run creates a normal `INV` (`recurringProfileId`) and posts it as §Sales invoice. A profile with `saveAsDraft` (or `autoSend = false`) leaves the invoice in `DRAFT` with no journal.

### Credit override / hold / reminders
No journal. `CreditOverrides`, `CreditHoldEvents` and `PaymentReminderLogs` are control records only.

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

### Import GRN (Full) — `GRN` with `GoodsReceivedNotes.isImport = true`
- **Stock:** IN at a **provisional FOB cost**, the same as any GRN.
- **GL:** none at receipt. The import vendor bill posts Dr `GRNI` / Cr `AP_CONTROL` (FOB × fx). The landed-cost journal below then moves the goods into inventory at the full landed value and clears `GRNI`.

### Purchase return (Full) — `PR` (app/purchases/returns → *Save & Post*)
| Settlement | Dr | Cr |
|---|---|---|
| `CREDIT` (Payment Type "Credit") | `AP_CONTROL` (vendor) `totalAmount` | `INVENTORY` `gross − discount`; `INPUT_GST` `taxAmount` ("Sales Tax Payable (input reversal)") |
| `CASH_REFUND` ("Cash refund") | `PurchaseReturns.cashAccountId` (e.g. 1110-01 Cash in Hand — Lahore HQ) `totalAmount` | same as above |

- **Stock:** OUT from `PurchaseReturns.warehouseId` for `returnQty + bonusQty`, per batch and expiry, at the current moving-average cost. Any difference against the return value goes to `INVENTORY` (revaluation).
- **AP sub-ledger (CREDIT):** posting raises a `Purchases.DebitNotes` (reason `PURCHASE_RETURN`, `purchaseReturnId` set, `journalEntryId` = the PR's journal). That debit note posts no second journal and moves no stock. It is the settlement instrument that is allocated to the referenced bill, and the PR becomes `REFERENCED`.
- **Cancel** of a posted PR: mirror journal and stock IN. Blocked while its debit note has allocations.

### Landed cost (Full) — `LC` (app/purchases/landed-cost → *Post landed cost* → *Post journal*)
| Dr | Cr | Amount |
|---|---|---|
| `INVENTORY` (1140-01 Stock in trade, per item) | | `fobAmount + allocatedAmount` per `LandedCostItems` |
| `IMPORT_INPUT_ST` (1350-01 Input sales tax, import) | | the IMPORT_SALES_TAX charge, when it is not capitalised |
| `ADVANCE_TAX_148` (1360-03 Advance income tax u/s 148) | | the INCOME_TAX_148 charge, when it is not capitalised |
| | `GRNI` (2115-01 GRN clearing, goods in transit) | Σ FOB (clears the import vendor bill) |
| | `AP_CONTROL` per payee (`payeeVendorId`, e.g. "2110-01 Payables · Pakistan Customs") | each charge's `amount`, both capitalised and claimable |

- **Allocation:** capitalised charges are spread over the items by `allocationBasis`: VALUE uses FOB, QTY uses qty, WEIGHT uses `weightKg`. Rounding goes to the last line so the total stays exact. `landedUnitCost = (fob + allocated) / qty`.
- **Charges already booked through AP:** a charge with `billId` set (its own payee bill) credits `LANDED_COST_CLEARING` instead of AP, so the payable is never booked twice.
- **Stock revaluation (chosen approach):** a direct update of `Inventory.Products.avgCost`, logged in `Inventory.ProductPriceLogs` (`priceField = 'AVG_COST'`, old and new value). No `Inventory.StockMovements` row is written, because the ledger CHECK requires exactly one of qtyIn / qtyOut to be > 0, so value-only rows are impossible.
  - Per item: on hand = Σ `Inventory.StockBalances.qtyOnHand`; affected = min(on hand, `LandedCostItems.qty`); uplift = allocated × affected ÷ qty.
  - New `avgCost` = old avg + uplift ÷ on hand. The share of `allocatedAmount` for units already sold (allocated − uplift) is debited to cost of sales instead of `INVENTORY`.
  - `Inventory.ProductBatches.unitCost` of the GRN batch is set to `landedUnitCost`.
  - The "Item average costs are revalued from today" note on the post sheet matches this behaviour.
- **Status:** shipment `POSTED`. The posted journal is the "JV-2026-000322" in the toast.

### Additional roles (Full)
`IMPORT_INPUT_ST` (1350-01), `ADVANCE_TAX_148` (1360-03), `LANDED_COST_CLEARING`. WHT deposits (`WHT_PAYABLE_153` → bank through CPR) are posted by the tax module (`Tax.WhtChallans`).

---

## Inventory (inv)

**Costing.** Moving weighted average per item (`Inventory.Products.avgCost`, Bhatti AVCOST). The ledger trigger `Inventory.triggerStockLedgerApply` recomputes it on every costed receipt (GRN, MANUAL_IN, OPENING, ASSEMBLY):
`newAvg = (prevQty × avg + qtyIn × unitCost) / (prevQty + qtyIn)`, where `prevQty` is the item's on hand across all warehouses before the row; when `prevQty ≤ 0` the receipt cost becomes the average. TRANSFER_IN, SALES_RETURN, COUNT and ADJUSTMENT receipts move stock at the existing average and do not change it. Outgoing rows default `unitCost` to the current `avgCost`, so the stock value leaving equals the GL credit. Landed cost (purchase module) revalues `avgCost` directly and logs `Inventory.ProductPriceLogs` (AVG_COST).

**Picking.** Batches are picked **FEFO** (earliest `expiryDate` first); QUARANTINE / RETURN_TO_PRINCIPAL / WRITTEN_OFF batches cannot be sold (trigger). Expiry-tracked items need a batch on every movement.

**Accounts.** Resolved from `Company.DefaultAccountMappings` unless the document or reason names one. The **inventory account is the warehouse's** `Inventory.Warehouses.inventoryAccountId` (default role INVENTORY, e.g. 1201 Stock in trade / 1310 Inventory). Other roles used below: STOCK_ADJUSTMENT (5090), STOCK_WRITE_OFF (5095), INVENTORY_SHRINKAGE (5160), INVENTORY_GAIN (4920), STOCK_IN_TRANSIT (1205), OPENING_BALANCE_EQUITY, plus the movement reason's `expenseAccountId` and the stock-voucher type accounts (5110-03, 5220-07, 5220-08, 5220-03). All JVs are system postings in `Accounting.Vouchers` with `sourceDocType` / `sourceDocId` = the inventory document; values are Σ ledger `value` of the document (cost, never selling price).

| Event | Document → ledger rows | Dr | Cr | Notes |
|---|---|---|---|---|
| **Manual stock in** (MI), reason Opening Stock | `Inventory.StockInOut` mode IN → OPENING in | Inventory (warehouse) | Opening balance equity | at line `unitCost`; recomputes avg |
| Manual stock in, other reasons (Adjustment, Damaged Return, Production, Found in Count, Gift Received, Internal Return) | MANUAL_IN in | Inventory | reason `expenseAccountId` (Adjustment 5090, Found in Count 4920, Gift Received other income, Internal Return the internal-use expense, Production WIP / production clearing, Damaged Return 5090) | recomputes avg |
| **Manual stock out** (MO), reasons Consumption, Sample Issue, Internal Use, Adjustment, Damaged / Breakage, Lost / Theft | MANUAL_OUT out at avg | reason expense (consumables, 5220-08, 5220-03, 5090, 5110-03, 5160) | Inventory | |
| Manual stock out, Expired Write-off | WRITE_OFF out at avg | 5095 Inventory write-off | Inventory | batch → WRITTEN_OFF when emptied |
| **Stock adjustment** (ADJ), net decrease | ADJUSTMENT out per line (WRITE_OFF for write-off reasons) | offset account (5090 / 5095) | Inventory | at weighted average; posted only after approval when \|net\| > Rs 25,000 |
| Stock adjustment, net increase | ADJUSTMENT in per line | Inventory | offset account (5090) | mixed documents post both sides per line |
| **Batch write-off** (Batches & Expiry "Write off…") | ADJ (reason Expired write-off) → WRITE_OFF out | 5095 | Inventory | `Inventory.ProductBatches.disposition = WRITTEN_OFF` |
| Batch → Clearance / Priority / Quarantine | disposition only | — | — | no stock or GL effect |
| Batch → Return to principal | disposition; stock leaves on `Purchases.PurchaseReturns` (PURCHASE_RETURN) | per purchase module | | claim in `Inventory.PrincipalClaims` (EXPIRY) |
| **Transfer** (TRF) posted / dispatched | TRANSFER_OUT at source (avg cost) | Stock in transit (1205) | Source inventory | JV **only** when source and destination inventory accounts differ; otherwise no GL |
| Transfer received | TRANSFER_IN at destination (received qty, same unit cost) | Destination inventory | Stock in transit | as above |
| Transfer receipt shortage (Full) | — (never arrived) | 5160 Inventory shrinkage (or carrier receivable) | Stock in transit / source inventory | value = short qty × cost |
| Transfer receipt excess (Full) | extra TRANSFER_IN qty | Destination inventory | 4920 Inventory gains | |
| Van loading (Full, VAN warehouse) | TRANSFER_OUT / TRANSFER_IN warehouse ↔ van | — | — | same inventory account → no GL; settlement handled in dist |
| **Stock count variance** (SC) shortage (Full) | COUNT out per short line | 5160 Inventory shrinkage & losses | 1201 Stock in trade | JV at approval |
| Stock count excess (Full) | COUNT in per excess line | 1201 Stock in trade | 4920 Inventory gains (other income) | |
| **Stock voucher** Breakage (BRK) (Full) | BREAKAGE out | 5110-03 Stock breakage & write-off | Inventory | |
| Stock voucher Gift (GFT) (Full) | GIFT out | 5220-07 Gifts & promotions | Inventory | |
| Stock voucher Sample (SMP) (Full) | SAMPLE out | 5220-08 Samples & trials | Inventory | returned samples: MI reason Internal Return, Cr 5220-08 |
| Stock voucher Internal use (INT) (Full) | INTERNAL_USE out | 5220-03 Stationery & office supplies (cost centre = voucher cost centre) | Inventory | |
| **Assembly** ASSEMBLE (Full) | ASSEMBLY out per component (avg); ASSEMBLY in of the kit item at Σ component cost | Kit inventory | Component inventory | JV only when accounts differ; kit avg recomputed |
| Assembly DISASSEMBLE (Full) | ASSEMBLY out of kit (avg); ASSEMBLY in per component at kit cost × component share | Component inventory | Kit inventory | rounding difference to 5090 |
| Reservation (Full) | `Inventory.StockReservations` → `StockBalances.qtyReserved` | — | — | no ledger row, no GL |
| Price change (bulk / inline) | `Inventory.ProductPriceLogs` | — | — | prices only, no GL |

Stock effects owned by other modules (they write `Inventory.StockMovements`; GL is in their sections): GRN → GRN in (Dr Inventory / Cr GRNI), purchase return → PURCHASE_RETURN out, sale (INV / SV / WS / POS / DC) → SALE out at avg cost (Dr COGS / Cr Inventory), sales return → SALES_RETURN in at the original issue cost.

---

## Wholesale & distribution (`Distribution`) — FULL edition

Accounts are resolved through `Company.DefaultAccountMappings.role` (codes shown are the Trading & Distribution (PK) template defaults used on the screens). Every journal is one `Accounting.Vouchers` with `sourceDocType` / `sourceDocId` pointing at the dist document. AR lines carry `customerId`; salesman lines carry `employeeId`.

Account roles used here:

| Role | Default account |
|---|---|
| `CASH_IN_HAND` | 1110-01 Cash in Hand (from `RouteSettlements.cashAccountId` when set) |
| `CHEQUES_IN_HAND` | 1130-02 Cheques in Hand |
| `AR_CONTROL` | 1140-01 Trade Debtors |
| `SALESMAN_RECEIVABLE` | 1150-07 Salesman Receivable |
| `STOCK` | 1310-01 Stock in Hand (warehouse) |
| `STOCK_VAN` | Stock in Hand — Van (sub-account of 1310; same account as STOCK if not split) |
| `SALES_RETURNS` | 4100-03 Sales Returns & Allowances |
| `OUTPUT_GST` | Output sales tax (returns reverse their GST share) |
| `COGS` | 5100-01 Cost of Goods Sold |
| `CASH_OVER_SHORT` | 4900-02 Cash Over / Short |
| `STOCK_GAIN` | 4900-03 Stock Gain |
| `SALES_COMMISSION_EXPENSE` | Sales commission expense |
| `COMMISSION_PAYABLE` | Commission payable (or salaries payable if paid through payroll) |

### Wholesale invoice (Quick Entry, Bulk Invoicing, booking / back-order conversion)
These are ordinary `Sales.SalesInvoices` rows (channel WHOLESALE). Use **§Sales invoice**: Dr AR_CONTROL (net) / Cr SALES (gross − discount) / Cr OUTPUT_GST. Scheme free goods carry zero revenue; their cost goes to COGS with the paid lines.
- **Stock and COGS timing.** An invoice that is **not** put on a delivery run issues stock from `SalesInvoices.warehouseId` when it is posted (Dr COGS / Cr STOCK).
- **Run invoices** are posted with stock issue deferred (`Sales.SalesInvoices.stockIssueMode = 'AT_DISPATCH'`). Only the stock is *reserved* (`Inventory.StockReservations`) until dispatch.
- **Credit override** (`Distribution.CreditOverrideLogs`) has no GL effect.

### Van dispatch — `Distribution.LoadSheets` DISPATCHED
| Step | Dr | Cr | Stock effect |
|---|---|---|---|
| 1. Transfer the load | STOCK_VAN (at moving-avg cost) | STOCK | `Inventory.StockTransfers` source warehouse → van warehouse: TR OUT from the warehouse, TR IN to the van for each `LoadSheetLines` (batch FEFO). No GL entry when STOCK_VAN = STOCK. |
| 2. Issue the run's invoices | COGS | STOCK_VAN | StockMovements OUT from the van warehouse for each invoice line's base + bonus qty. The reservation is released. |

### Route settlement — `Distribution.RouteSettlements` SETTLED (one JV)
Amounts come from the settlement totals. The screen's journal preview groups the lines as Receipts, Returns, Cash short and Stock variance.

| Event | Dr | Cr | Party / notes |
|---|---|---|---|
| Receipts — cash | CASH_IN_HAND **counted** (`cashCounted`) | — | |
| Receipts — cheques | CHEQUES_IN_HAND (`chequeTotal`) | — | one `BankCash.Cheques` per `RouteSettlementCheques`; PDC if chequeDate > docDate |
| Receipts — AR | — | AR_CONTROL (`cashExpected + chequeTotal`) | per customer, matched by a `Sales.CustomerReceipts` (RCPT) per invoice and allocated to that invoice |
| Returns — revenue | SALES_RETURNS (`returnTotal`, excl. GST share) + OUTPUT_GST (GST share) | AR_CONTROL (`returnTotal`) | per customer, via `Sales.SalesReturns` (SR) per invoice |
| Returns — stock | STOCK (`returnCostTotal`) | COGS | stock IN to the van, then `Inventory.StockTransfers` van → warehouse for returned qty (counted qty if lower) |
| Cash short (counted < expected) | SALESMAN_RECEIVABLE (`cashShortAmount`) | — | employeeId = settlement salesman. It balances the receipt (AR credited in full, cash debited as counted). |
| Cash over (counted > expected) | — | CASH_OVER_SHORT (`cashOverAmount`) | |
| Van stock loss (variance < 0) | SALESMAN_RECEIVABLE (\|varianceValue\|) | STOCK_VAN | StockMovements ADJ OUT at the van for missing qty |
| Van stock gain (variance > 0) | STOCK (varianceValue) | STOCK_GAIN | StockMovements ADJ IN at the van for the extra qty |
| Credit sales (`creditAmount`) | — | — | **Memo only.** The invoice already debited AR, so the balance just stays open and keeps ageing from the invoice date. |
| Unexplained short rows (`differenceAmount > 0`) | — | — | **No posting.** They stay as an open AR balance on the invoice. The UI warns before posting. |
| Not delivered (state NONE) | SALES_RETURNS + OUTPUT_GST | AR_CONTROL | Same as a full return. Stock returns as above, and the invoice is released from the run (`LoadSheetInvoices.releasedAt`). Alternative: void the invoice if it is unpaid and in the same period. |

Balance check: Dr = counted cash + cheques + returns + return cost + short + loss; Cr = AR(receipts + returns) + COGS + over + van stock. Receipts balance because the AR credit uses the *expected* cash, and the gap between expected and counted goes to short or over.

### Recovery receipt — `Distribution.RecoverySheetLines` POSTED
| Mode | Dr | Cr | Notes |
|---|---|---|---|
| CASH | CASH_IN_HAND | AR_CONTROL | `Sales.CustomerReceipts` (RCPT), customerId set |
| CHEQUE | CHEQUES_IN_HAND | AR_CONTROL | creates `BankCash.Cheques` (from remarks: cheque no / bank) |
| ONLINE / JAZZCASH | BANK (`depositBankAccountId` → its GL account) | AR_CONTROL | the remarks carry the transaction id |

**Allocation:** FIFO. `Sales.CustomerReceiptAllocations` rows are created against the customer's open invoices, oldest due date first (then docDate, then docNo), until the amount is used. `collectedAmount ≤ outstandingAmount` is enforced, so the receipt never leaves an unapplied balance.

### Back-orders
- **Allocation** (`Distribution.BackOrderAllocations`) has no GL effect. It creates an `Inventory.StockReservations` against the GRN batch.
- **Conversion** produces a normal wholesale invoice (above).
- **Cancellation** has no GL or stock effect.

### Commission accrual — `Distribution.SalesmanCommissions` ACCRUED
| Event | Dr | Cr | Notes |
|---|---|---|---|
| Accrue (period close) | SALES_COMMISSION_EXPENSE | COMMISSION_PAYABLE | employeeId on the payable line. Amount = achieved × slab rate / 100. Cost centre = route's branch. |
| Pay through payroll | COMMISSION_PAYABLE | (payroll run clears it via salaries payable) | `Payroll.PayrollAdjustments` earning line (see open question) |
| Pay in cash | COMMISSION_PAYABLE | CASH_IN_HAND / BANK | |

### Settlement of salesman receivable
A shortage booked to SALESMAN_RECEIVABLE is recovered by:
- **Cash deposit:** Dr CASH_IN_HAND / Cr SALESMAN_RECEIVABLE.
- **Payroll deduction:** Dr SALARIES_PAYABLE / Cr SALESMAN_RECEIVABLE (payroll module).

---

## HR — posting rules

**HR posts nothing to the general ledger and has no stock effect.** HR produces approved *inputs*. Payroll turns them into earnings and deductions, and the payroll run posts the journal (see §Payroll).

| HR event | Source table | Feed to payroll | GL / stock effect |
|---|---|---|---|
| Overtime approved, then *Push to payroll* | `HumanResources.OvertimeClaims` (status APPROVED → PUSHED, `isCompOff = false`) | `Payroll.PayrollAdjustments`: OT earning = `amount` (hours × hourly rate × multiplier) for `payrollMonth`; `payrollRunId` written back | None in HR. The payroll run posts Dr Salaries & Wages (OT) / Cr Salaries Payable |
| Overtime as compensatory off | `HumanResources.OvertimeClaims` (`isCompOff = true`, amount 0) | none. Creates `HumanResources.LeaveAdjustments` (COMP_OFF credit) | None |
| Leave encashment at year end (*Run carry forward*) | `HumanResources.LeaveAdjustments` (kind ENCASHMENT, `encashAmount` = basic or gross ÷ 30 × days) via `HumanResources.LeaveYearEndClosings` | `Payroll.PayrollAdjustments`: "Leave encashment" earning in the chosen run (next payroll or off-cycle) | None in HR. Payroll posts Dr Leave Encashment expense / Cr Salaries Payable |
| Leave encashment at exit | `HumanResources.LeaveBalances.encashable` for the exiting employee | `Payroll.FinalSettlementLines` in the final settlement | Posted by the final settlement |
| Unpaid leave / absence / late-mark ½-day deductions | `HumanResources.AttendanceRegister.payableFraction` (locked by the run), `HumanResources.LeaveRequests` on unpaid types (`deductionBasis`) | Payroll reads payable days from `HumanResources.getAttendanceRegister` | Reduces gross in payroll. No separate HR entry |
| Attendance month lock | `HumanResources.AttendanceRegister.lockedAt`, `payrollRunId` | Payroll run consumes the register | None. Later corrections go to the next run as adjustments |
| Asset issued / returned | `HumanResources.EmployeeAssets` | none | None. Fixed-asset custody only; any write-off is posted by `FixedAssets.AssetDisposals` |
| Clearance: recoverable amounts | `HumanResources.ClearanceItems.recoverableAmount` | Deducted in `Payroll.FinalSettlements` | Posted by the final settlement |

---

## Payroll (People)

Accounts come from `Payroll.SalaryComponents.debitAccountId / creditAccountId` and `Payroll.PayrollRuns.salaryPayableAccountId`; codes below are the prototype COA (Trading & Distribution PK template). All vouchers are `Accounting.Vouchers` with `sourceDocType` / `sourceDocId` pointing at the payroll document and `employeeId` on sub-ledger lines where noted. No stock effect for any payroll event.

### 1. Payroll run — post (`PRUN`, `app/hr/payroll/run` step 5 "Post & Pay")
JV-2026-000451 · dated `PayrollRuns.payDate` · narration "Payroll October 2026 (PR-2026-10)" · source `PRUN / PayrollRuns.id`. Built by summing `PayrollRunLineComponents` per component × department (cost centre = `PayrollRunLines.costCentreId`, else department's cost centre). Lines with `PayrollRunLines.isOnHold` are excluded (paid in final settlement).

| Dr / Cr | Account | Amount (prototype Oct-26) | Source |
|---|---|---|---|
| Dr | 5110 Salaries & Wages Expense — per department (8) | 21,612,400.00 | EARNING components → `debitAccountId` (BAS, HRA, MED, UTL, CNV; OVT → 5111, FUL → 5112, COM → 5130 when mapped separately) |
| Dr | 5115 Employer EOBI Contribution — per department | 345,950.00 | EOR |
| Dr | 5116 Employer PESSI Contribution — Lahore / Faisalabad | 187,900.00 | PSI (Punjab branches only; Karachi under SESSI) |
| Dr | 5117 Employer PF Contribution — per department | 617,800.00 | PFR |
| Dr | 5118 Gratuity expense (when GRT provision is enabled) | — | GRT, Cr 2170 Gratuity Provision |
| Cr | 2140 Salaries Payable | 19,240,600.00 | Σ `PayrollRunLines.netAmount` |
| Cr | 2152 Income Tax Payable — u/s 149 | 1,295,300.00 | ITX |
| Cr | 2155 EOBI Payable (employee 69,190 + employer 345,950) | 415,140.00 | EOB + EOR |
| Cr | 2156 PESSI Payable | 187,900.00 | PSI |
| Cr | 2160 Provident Fund Payable (employee 617,800 + employer 617,800) | 1,235,600.00 | PFE + PFR |
| Cr | 1340 Loans to Employees / 1341 Advances to Employees (sub-ledger `employeeId`) | 389,510.00 | LON / ADV; marks `LoanInstallments` RECOVERED |
| | **Total** | **22,764,050.00 = 22,764,050.00** | must balance (acc trigger) |

Effects: `PayrollRuns.status = POSTED`, `journalEntryId` set; inputs/lines frozen; payslips generated/emailed; `LoanInstallments.payrollLineId` set.

### 2. Salary payment (bank transfer / cheque / cash)
One BPV per `Payroll.SalaryPaymentBatches` (Meezan bulk upload, HBL IBFT) and CPV/cheque for "Cheque / Cash" lines; dated value date.

| Dr / Cr | Account | Amount |
|---|---|---|
| Dr | 2140 Salaries Payable | batch `totalAmount` (e.g. 14,860,200 Meezan) |
| Cr | Bank GL of `SalaryPaymentBatches.bankAccountId` (or cash account) | same |

When all batches are confirmed `PayrollRuns.status = PAID`, `paidAt` set.

### 3. Statutory deposits (15th of next month)
| Event | Dr | Cr |
|---|---|---|
| Income tax CPR (u/s 149) | 2152 Income Tax Payable | Bank (`Tax.WhtChallans` CPR) |
| EOBI PR-01 | 2155 EOBI Payable | Bank |
| PESSI | 2156 PESSI Payable | Bank |
| PF to Staff PF Trust | 2160 PF Payable | Bank |

### 4. Loan / salary advance — disbursement (`LN` / `ADV`, `app/hr/loans`)
BPV-2026-000061 (or CPV when disbursed from cash) · `LoansAndAdvances.disbursementJournalEntryId`.

| Dr / Cr | Account | Amount |
|---|---|---|
| Dr | 1340 Loans to Employees (LOAN, MEDICAL) or 1341 Advances to Employees (SALARY_ADVANCE) — sub-ledger `employeeId` | `LoansAndAdvances.approvedAmount` |
| Cr | Bank (`disbursedFromBankAccountId`) or Cash (`disbursedFromCashAccountId`) | same |

Recovery is part of the payroll post (§1, Cr 1340/1341). Prepayment outside payroll: Dr Bank/Cash, Cr 1340/1341, installment type PREPAYMENT. Markup (if ever enabled): Cr markup income on recovery.

### 5. Final settlement (`FS`, `app/hr/settlement`, off-cycle run `PR-2026-OFF-02`)
JV on approval (`FinalSettlements.journalEntryId`), then BPV-2026-000318 (`paymentJournalEntryId`). Prototype FS-2026-007 (Kashif Ali):

| Dr / Cr | Account | Amount | FinalSettlementLines |
|---|---|---|---|
| Dr | 5110 Salaries & Wages (department of employee) | 108,000.00 | PENDING_SALARY |
| Dr | Leave Encashment Provision / expense | 28,000.00 | LEAVE_ENCASHMENT |
| Dr | 2170 Gratuity Provision (expense 5118 for any un-provided part) | 420,000.00 | GRATUITY |
| Cr | Notice Pay Recovery (Other Income) | 36,000.00 | NOTICE_SHORTFALL |
| Cr | 1341 Advances to Employees (AD-2026-019, sub-ledger employee) | 45,000.00 | ADVANCE_RECOVERY (installments SETTLED → loan CLOSED) |
| Cr | 2152 Income Tax Payable | 12,450.00 | INCOME_TAX (gratuity above Rs 300,000 taxed at 3-year average rate) |
| Cr | 2155 EOBI Payable | 370.00 | EOBI |
| Cr | 2140 Salaries Payable (final dues, sub-ledger employee) | 462,180.00 | net payable |
| | **Total** | **556,000.00 = 556,000.00** | |

Payment: Dr 2140 Salaries Payable 462,180 · Cr Bank Alfalah (`payFromBankAccountId`) 462,180 → `FinalSettlements.status = PAID`.
PF balance (Rs 512,340) is paid by the PF Trust, not by the company — no entry here.

### 6. Gratuity & leave provisions (monthly, optional)
If GRT (and a leave-encashment component) is active, the run posts Dr 5118 Gratuity expense / Cr 2170 Gratuity Provision (1 month basic per completed year ÷ 12) per department; settlement then debits the provision (§5).

### 7. Reversal
A POSTED run is corrected only by reversal: a mirror JV (`PayrollRuns.reversalJournalEntryId`), status REVERSED, recovered installments returned to SCHEDULED; a new run is then created for the month.

---

## Platform billing (Finsoft Cloud's own revenue) — no tenant GL

Platform invoices, payments, dunning and partner payouts are **Finsoft (Pvt) Ltd's own revenue cycle**. They live in the global `Platform` schema and **never post to any tenant's `Accounting.Vouchers`**. No tenant ledger, stock or tax return is touched. If Finsoft keeps its own books in Finsoft, those entries are made in Finsoft's own tenant (e.g. `FSSTAFF`) by an export or integration. That is outside this schema.

For reference, the economic meaning, if mirrored into Finsoft's own books:

| Event (platform table) | Finsoft's own books (reference only) |
|---|---|
| Invoice issued (`PlatformInvoices` OPEN) | Dr Trade receivable (tenant) · Cr Subscription revenue (net) · Cr Provincial sales tax on services payable (PRA/SRB/KPRA/BRA, `taxAmount`) |
| Payment succeeded (`PlatformPayments` SUCCEEDED) | Dr Bank / wallet clearing (JazzCash, Easypaisa, Raast, card) · Cr Trade receivable |
| Refund (`PlatformPayments` REFUNDED / PARTIALLY_REFUNDED) | Dr Trade receivable (or revenue) · Cr Bank |
| Invoice void (`PlatformInvoices` VOID) | reversal of the issue entry |
| Write-off (`DunningCases` WRITTEN_OFF / invoice UNCOLLECTIBLE) | Dr Bad debts · Cr Trade receivable |
| Partner payout (`ResellerPayouts` PAID) | Dr Partner commission expense (gross) · Cr Bank (net) · Cr WHT payable u/s 233 (12%) |

### Invoice → payment → dunning transitions

**Invoice** (`Platform.PlatformInvoices.status`)
- `DRAFT` → `OPEN` when issued (renewal run, provisioning, plan change proration, add-on, overage or manual). Sets `issuedOn` and `dueOn`, and emails the billing contact (`CommunicationLogs`, template INVOICE).
- `OPEN` → `PARTIALLY_PAID` → `PAID` automatically. The trigger `Platform.triggerPlatformPaymentApply` sums SUCCEEDED/PARTIALLY_REFUNDED payments (net of refunds) into `paidAmount`. `balanceAmount` is generated.
- `OVERDUE` is derived, never stored: `dueOn < currentDate AND balanceAmount > 0`.
- `OPEN`/`PARTIALLY_PAID` → `VOID` (needs `voidReason`; audited `invoice.void`) or → `UNCOLLECTIBLE` (after collections / write-off).

**Payment** (`Platform.PlatformPayments.status`)
- `PENDING` → `SUCCEEDED` (sets `paidAt`) or `FAILED` (sets `failureCode` / `failureMessage`, e.g. `doNotHonor`).
- `SUCCEEDED` → `PARTIALLY_REFUNDED` / `REFUNDED` (`refundedAmount`).
- A failed charge on an invoice that has no open case opens a `DunningCases`.

**Dunning** (`Platform.DunningCases.stage`, thresholds from the active `Platform.DunningPolicies`; day = days after `dueOn`)

| Day (default policy) | Stage | Tenant effect |
|---|---|---|
| 1 – graceDays (1–7) | `GRACE` | full access, reminders per channel offsets (D−3, D0, D+3 …), smart retries per `retrySchedule` |
| grace+1 – grace+readOnly (8–14) | `READ_ONLY` | `Tenants.status = 'READ_ONLY'` (view & export only) |
| … + suspendedDays (15–45) | `SUSPENDED` | `Tenants.status = 'SUSPENDED'`, `Subscriptions.status = 'SUSPENDED'` |
| beyond | `COLLECTIONS` | manual collections; on cancel: `subscription` CANCELLED, tenant data archived `archiveDays` (90) |
| any open stage | `PROMISE` | promise-to-pay: retries paused until `promiseDate`, optionally lifts read-only |

- Every retry is a `DunningAttempts` (SCHEDULE / MANUAL / BATCH) that creates a `PlatformPayments`.
- A SUCCEEDED attempt sets the case to `RECOVERED` (`recoveredPaymentId`, `closedAt`). The invoice becomes `PAID` (trigger), the tenant returns to `ACTIVE`, and `SubscriptionEvents` REACTIVATED is logged if the tenant was suspended.
- Closing without payment: `CANCELLED` (invoice voided or credited) or `WRITTEN_OFF` (invoice `UNCOLLECTIBLE`).

---

