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
