# 04 · Bank & Cash: page → entity map (Full)

Schema: `BankCash` (`database/schema/04-treasury.sql`), cross-module FKs in `database/fk/04-BankCash-fks.sql`.
The Cash Book and Bank Book are **views over the single journal** (`Accounting.Vouchers` / `Accounting.VoucherLines`). Treasury tables hold the bank and cheque master data, the bank-side lines, the cheque lifecycle, and the quick-entry metadata the journal has no column for.

Permission keys follow the Roles & Permissions matrix (`src/9E-cash-users.js`, group *Finance*): module `bank` (Bank & cheques), `cash` (Cash book & petty cash), `recon` (Bank reconciliation), with the actions view / create / edit / approve / post / delete / export.

Screens (12): Basic `app/bank/accounts`, `app/bank/transactions`, `app/bank/cheques`, `app/bank/cheque-register`, `app/bank/book`, `app/cash/book` · Full `app/bank/cheque-voucher`, `app/bank/reconciliation`, `app/bank/rules`, `app/cash/ledger`, `app/cash/petty`, `app/cash/expenses`.

Full adds columns to Basic tables: `Cheques.chequeBookId`, `Cheques.crossedAcPayee`, `ChequeBounces.creditHoldEventId`, `BankTransactions.statementLineId / bankRuleId / reconciliationId`, `CashBookEntries.employeeId`, `CashAccounts.approvalThreshold`.

---

### Bank Accounts — `app/bank/accounts`
*Source:* `src/40-acc-core.html` (section `app/bank/accounts`, modal `#Accounting-new-bank`) · seed `src/91-data.js` `banks[]`
**Purpose.** List our bank accounts with book vs statement balance and reconciliation status, and add a new account linked to a GL account under 1120 Banks.
**Tables.** Primary: `BankCash.BankAccounts` · Reads: `BankCash.Banks`, `Company.Branches`, `Accounting.ChartOfAccounts`, `BankCash.getBankAccountBalances` (book balance from GL), `BankCash.BankTransactions` (open items) · Writes: `BankCash.BankAccounts`, `Accounting.ChartOfAccounts` (new GL 1120-0x created with the account)
**Functions.** Save → `BankCash.bankAccountAddUpdate` · Open → `BankCash.getBankAccountInfo`
**Lookups.** `BankAccounts.accountType` → `AccountType` · `BankAccounts.purpose` → `BankAccountPurpose` · `BankAccounts.statementFormat` → `StatementFormat` · `BankAccounts.status` → `BankAccountStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Bank (card title, table) / Bank * (modal) | `BankAccounts.bankId` → `BankCash.Banks.name` | Meezan Bank, HBL, UBL, Bank Alfalah; modal adds Bank Al Habib, MCB Bank, Allied Bank, Faysal Bank, Standard Chartered |
| Account type | `BankAccounts.accountType` | CURRENT · SAVINGS_PLS · RUNNING_FINANCE · FOREIGN_CURRENCY |
| Account title * | `BankAccounts.accountTitle` | Al-Noor Enterprises (Pvt) Ltd |
| Account number * / "•••• 0123" | `BankAccounts.accountNo`, `accountLast4` (generated) | |
| IBAN | `BankAccounts.iban` | CHECK `PK` + 2 digits + 4-letter bank code + 16 digits |
| Bank branch / card sub-line "Gulberg III, Lahore" | `BankAccounts.bankBranch` | |
| Branch (table) | `BankAccounts.branchId` → `Company.Branches` | Lahore HQ, Karachi, Islamabad, Faisalabad |
| GL code | `BankAccounts.accountId` → `Accounting.ChartOfAccounts.code` | 1120-01 … 1120-05; one bank account per GL account |
| Opening balance | `BankAccounts.openingBalance`, `openingBalanceDate` | Also posted as an OB voucher by Opening Balances |
| Enable statement import (CSV / MT940) | `BankAccounts.statementImportEnabled`, `statementFormat` | BANK_CSV · EXCEL · MT940 · CUSTOM |
| Use for payroll disbursement | `BankAccounts.useForPayroll` | |
| Badge Primary / Running finance / Vendor payments / Payroll | `BankAccounts.purpose` | PRIMARY (one per tenant) · RUNNING_FINANCE · VENDOR_PAYMENTS · PAYROLL · COLLECTIONS · GENERAL |
| "Limit Rs 50,000,000" | `BankAccounts.creditLimit` | required when RUNNING_FINANCE |
| Book balance | view `BankCash.getBankAccountBalances.bookBalance` | GL balance of `accountId` |
| Statement balance | `BankAccounts.lastStatementBalance` | from the latest imported statement |
| Reconciled to / "Last reconciled 31 Aug 2026" | `BankAccounts.reconciledTo` | |
| "14 open" / "3 open · overdue" | count of `BankTransactions` with status ≠ RECONCILED after `reconciledTo` | derived |
| Status (Active) | `BankAccounts.status` | ACTIVE · DORMANT · CLOSED |
| KPIs: Total bank balance, Deposits (Sep), Withdrawals (Sep), Unreconciled items | view `BankCash.getBankAccountBalances`, `BankCash.BankTransactions` | derived |
| Spark line | view over `Accounting.VoucherLines` per day | **[simulated]** in prototype |
**Statuses.** ACTIVE → DORMANT → CLOSED (`closedOn` set).
**Actions → effects.** *Add account* → insert `BankCash.BankAccounts` + create GL `Accounting.ChartOfAccounts` (1120-0x) · *Reconcile* → `app/bank/reconciliation` (Full) · *Bank book* → `app/bank/book` · *Import statement* → `app/bank/transactions`.
**Permission.** `bank:view`, `bank:create`, `bank:edit` · **Approval.** —

---

### Bank Transactions — `app/bank/transactions`
*Source:* `src/40-acc-core.html` (section `app/bank/transactions`, modal `#Accounting-import-statement`)
**Purpose.** All deposits and withdrawals per bank account, from posted vouchers and imported statements; categorise unbooked statement lines.
**Tables.** Primary: `BankCash.BankTransactions` · Reads: `BankCash.BankAccounts`, `Accounting.Vouchers` (voucher no), `BankCash.Cheques` · Writes: `BankCash.BankTransactions`, `Accounting.Vouchers` / `Accounting.VoucherLines` (Categorise posts a BRV/BPV/JV)
| UI field / column | Table.column | Notes |
|---|---|---|
| Date | `BankTransactions.txnDate` | `valueDate` optional |
| Bank ("Meezan — 0123") | `BankTransactions.bankAccountId` | filter select "All bank accounts" |
| Description / sub-text | `BankTransactions.description`, `detail` | "IBFT from Packages Ltd" / "Against INV-2026-000377" |
| Cheque / Ref | `BankTransactions.reference`, `chequeId` | FT26273PKG, 00451209, DS-55118 |
| Voucher | `BankTransactions.journalEntryId` → `Accounting.Vouchers.docNo` | BRV-2026-000188, BPV-…, CON-… |
| Deposit / Withdrawal | `BankTransactions.depositAmount` / `withdrawalAmount` | exactly one > 0 |
| Status | `BankTransactions.status` | RECONCILED · UNCATEGORISED · UNPRESENTED (+ PENDING, UNCLEARED, CLEARED) |
| Categorise menu | `BankTransactions.category` | BANK_CHARGES · PROFIT_ON_DEPOSIT · MARKUP_EXPENSE · CUSTOMER_RECEIPT · VENDOR_PAYMENT … |
| Chips All / Deposits / Withdrawals / Uncategorised 4 | filters on amounts / `status` | |
| Search "description, cheque no., amount" | trigram index on `description`, `reference` | |
| Import modal: Bank account *, Format, Statement period | `BankCash.BankStatementImports` (+ `BankStatementLines`); `BankTransactions.source = 'STATEMENT_IMPORT'`, `statementLineId` | |
| KPIs Deposits / Withdrawals / Uncategorised / Bank charges (Sep) incl. FED 16% | aggregates of `BankTransactions` | derived |
**Statuses.** UNCATEGORISED → (Categorise) PENDING / CLEARED → RECONCILED · issued cheque lines: UNPRESENTED → CLEARED → RECONCILED · deposits: UNCLEARED → CLEARED.
**Actions → effects.** *Categorise* → `Accounting.Vouchers` BPV/BRV (Bank charges: Dr 5410 Bank charges / Cr Bank; Profit on deposit: Dr Bank / Cr Other income; Markup: Dr Finance cost / Cr Bank; Customer receipt → `Sales.CustomerReceipts`; Vendor payment → `Purchases.VendorPayments`) and sets `journalEntryId`, `category` (POSTING_RULES §Treasury · Bank charges & profit) · *Import & match* → insert `BankTransactions` rows (source STATEMENT_IMPORT) and auto-match to open vouchers · *New transaction* → `app/accounting/vouchers/new` · *Export* → file.
**Permission.** `bank:view`, `bank:create`, `bank:post`, `bank:export` · **Approval.** —

---

### Receive & Issue Cheques — `app/bank/cheques`
*Source:* `src/40-acc-core.html` (section `app/bank/cheques`, "Record cheque" panel, tabs Received / Issued)
**Purpose.** Record cheques received from customers and issued to vendors, including post-dated cheques, and deposit them.
**Tables.** Primary: `BankCash.Cheques`, `BankCash.ChequeAllocations` · Reads: `Sales.Customers`, `Purchases.Vendors`, `BankCash.Banks`, `BankCash.BankAccounts`, `Sales.SalesInvoices` (open invoices), `Purchases.VendorBills` · Writes: `BankCash.Cheques`, `BankCash.ChequeAllocations`, `Accounting.Vouchers` (CRV/BRV draft), `BankCash.BankTransactions` (on deposit)
**Functions.** Save → `BankCash.chequeAddUpdate` · Open → `BankCash.getChequeInfo` · Actions → `BankCash.chequeCancel`, `BankCash.chequeDeposit`, `BankCash.chequePresent`, `BankCash.chequeClear`, `BankCash.chequeBounce`
**Lookups.** `Cheques.direction` → `ReceivedIssuedDirection` · `Cheques.postingMode` → `PostingMode` · `Cheques.status` → `ChequeStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Receive / Issue | `Cheques.direction` | RECEIVED · ISSUED |
| Customer * / Payee (vendor) * | `Cheques.customerId` / `Cheques.vendorId`, `partyName` | non-trade payee → `Cheques.accountId` |
| Cheque no. * | `Cheques.chequeNo` | 4–10 digits |
| Drawn on bank / Issue from | `Cheques.drawnOnBankId` (received) / `Cheques.bankAccountId` (issued) | |
| Cheque date * | `Cheques.chequeDate` | |
| Received on | `Cheques.receivedOn` | |
| Amount (Rs) * | `Cheques.amount` | > 0 |
| Deposit into | `Cheques.bankAccountId` | |
| Against invoices | `BankCash.ChequeAllocations.invoiceId`, `amount` | issued cheques: `billId` |
| Remarks | `Cheques.remarks` | "Post-dated — collected by Bilal Khan" |
| Issue from (cheque book leaf) | `Cheques.chequeBookId`, `crossedAcPayee` | Full |
| Post-dated cheque (PDC) — hold until maturity | `Cheques.isPdc`, `postingMode = 'HOLD_PDC'` | |
| Table: Cheque # (+ "PDC"), Customer/Payee, Drawn on/Bank, Cheque date, Amount, Status | `cheque.*` | |
| Chips In hand / Deposited / Cleared / Bounced | `Cheques.status` | |
| KPIs In hand, Deposited · in clearing, Issued · unpresented, Bounced (FY) | aggregates of `cheque` / `ChequeBounces` | derived |
| Voucher no (not shown here; R-CHQ-0001 on Cheque Voucher) | `Cheques.docNo`, `docDate` | `Company.getNextDocNo('CHQ')` |
**Statuses.** Received: IN_HAND → DEPOSITED → CLEARED · DEPOSITED → BOUNCED → DEPOSITED (re-present) / REPLACED · CANCELLED. Issued: ISSUED → PRESENTED → CLEARED · BOUNCED · STOPPED · CANCELLED. Transitions enforced by `BankCash.triggerChequeStatusGuard`.
**Actions → effects.** *Save cheque* → `BankCash.Cheques` (IN_HAND / ISSUED) + allocations; non-PDC posts per `postingMode` (toast "CRV draft created"); PDC with HOLD_PDC → Dr Cheques in hand (PDC) / Cr AR (POSTING_RULES §Cheque received) · *Deposit* → status DEPOSITED, `depositedOn`, `BankTransactions` (UNCLEARED) · *Mark cleared* → CLEARED, `clearedOn`, `Sales.CustomerReceipts` generated with `chequeId` (allocations copied) · *Mark bounced…* → `app/bank/cheque-register` bounce modal · *Print cheque* → document.
**Permission.** `bank:view`, `bank:create`, `bank:post` · **Approval.** —

---

### Cheque Register & PDC — `app/bank/cheque-register`
*Source:* `src/40-acc-core.html` (section `app/bank/cheque-register`, modal `#Accounting-bounce-cheque`)
**Purpose.** Lifecycle of every cheque (deposit, clearing, bounce, reversal) with post-dated maturity tracking.
**Tables.** Primary: `BankCash.Cheques`, `BankCash.ChequeBounces` · Reads: view `BankCash.getChequeRegister`, view `BankCash.getPdcMaturity` · Writes: `BankCash.Cheques`, `BankCash.ChequeBounces`, `Accounting.Vouchers` (BRV on clear, reversal BRV on bounce, charges JV), `Sales.Customers` (credit hold)
**Functions.** Save → `BankCash.chequeAddUpdate` · Open → `BankCash.getChequeInfo` · Actions → `BankCash.chequeCancel`, `BankCash.chequeDeposit`, `BankCash.chequePresent`, `BankCash.chequeClear`, `BankCash.chequeBounce`
**Lookups.** `Cheques.direction` → `ReceivedIssuedDirection` · `Cheques.postingMode` → `PostingMode` · `Cheques.status` → `ChequeStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Cheque # (+ "PDC") | `Cheques.chequeNo`, `isPdc` | |
| Direction Received / Issued | `Cheques.direction` | |
| Party | `Cheques.partyName` (+ `customerId` / `vendorId`) | |
| Bank "HBL → Meezan 0123" | `Cheques.drawnOnBankId` → `Cheques.bankAccountId` | |
| Cheque date | `Cheques.chequeDate` | |
| Days ("Today", −2, 4) | `chequeDate − currentDate` | derived in `vChequeRegister.daysToMaturity` |
| Amount, Status | `Cheques.amount`, `Cheques.status` | |
| Chips All 48 / Received 31 / Issued 17 / PDC 20 / Bounced 2 | filters on `direction`, `isPdc`, `status` | |
| "Maturity: next 30 days / Overdue / All dates" | `getPdcMaturity` | |
| Maturity calendar (next 10 days, +receivable / −payable) | `getPdcMaturity` grouped by `chequeDate`, `direction` | |
| KPIs PDC receivable / PDC payable / Maturing today / In clearing (T+1) / Bounced (FY) | aggregates | derived |
| Bounce modal: Bounce date * | `ChequeBounces.bounceDate` (+ `Cheques.bouncedOn`, `bounceCount`) | |
| Return reason * | `ChequeBounces.reason` | INSUFFICIENT_FUNDS · SIGNATURE_MISMATCH · PAYMENT_STOPPED · ACCOUNT_CLOSED · STALE_OR_POSTDATED |
| Bank charges (Rs) | `ChequeBounces.bankCharges` | |
| Recover charges from customer (Yes — debit note / No) | `ChequeBounces.recoverCharges` | charges JV `chargesJournalEntryId` |
| Notify Bilal Khan (account owner) and put customer on credit hold | `ChequeBounces.notifyOwner`, `ownerUserId`, `creditHold`, `creditHoldEventId` | → `Company.Notifications`; `Sales.CreditHoldEvents` |
**Statuses.** As on `app/bank/cheques`. Bounce `resolution`: OPEN → REPRESENTED · REPLACED · RECOVERED · WRITTEN_OFF.
**Actions → effects.** *Deposit* → DEPOSITED + `BankTransactions` · *Clear* → CLEARED; HOLD_PDC / CLEAR_ON_DEPOSIT post Dr Bank / Cr Cheques in hand (or Cr AR) — toast "Cheque cleared · BRV posted" · *Bounce* → `ChequeBounces` row, status BOUNCED, reversal BRV Dr AR / Cr Bank, bank charges Dr Bank charges (or customer if recovered) / Cr Bank; customer credit hold (POSTING_RULES §Cheque bounce) · *Stop* (issued) → STOPPED · *Reverse* (cleared) → reversing voucher, status CANCELLED · *Re-present* → BOUNCED → DEPOSITED, bounce resolution REPRESENTED · *Replace* → new `cheque`, old REPLACED with `replacedByChequeId` · *Print register* → document.
**Permission.** `bank:view`, `bank:post`, `bank:export` · **Approval.** —

---

### Bank Book — `app/bank/book`
*Source:* `src/47-books.html` (mount) · `src/98-books.js` (BANK BOOK engine: `BANKS`, `bbCompute`, `bbView`)
**Purpose.** Per-account bank ledger with running balance, statement vs book difference and reconciliation progress.
**Tables.** Primary: view `BankCash.getBankBook` · Reads: `BankCash.BankAccounts`, `BankCash.BankTransactions`, `Accounting.VoucherLines` · Writes: `BankCash.BankTransactions.status` (Mark as cleared / uncleared)
| UI field / column | Table.column | Notes |
|---|---|---|
| Bank Account select ("HBL - Main Account", "PKR • 0012 3456 7890 8721") | `BankAccounts.bankId`, `purpose`, `accountNo` | |
| Date range (Full period / First 10 days / Mid-month / Last 7 days) | view filter on `txnDate` | |
| Search (cheque, deposit, transfer, rent, pending) | `getBankBook.description`, `reference`, `kind`, `status` | |
| KPIs Opening Balance / Total Withdrawals / Total Deposits / Closing Balance | `getBankBook.openingBalance`, sums, `runningBalance` | |
| Row: kind icon (cheque, deposit, transfer, receipt, atm, loan, charges, tax), title, sub | `getBankBook.kind`, `description`, `detail` | `kind` from `BankTransactions.category` / `paymentMode` |
| Withdrawals / Deposits / Running balance | `vBankBook.withdrawal`, `deposit`, `runningBalance` | |
| Status Cleared / Uncleared / Pending | `BankTransactions.status` | CLEARED · UNPRESENTED / UNCLEARED · PENDING |
| Reconciliation Progress "n of m transactions matched", Pending Cheques, Unresolved Entries | counts by `status` | |
| Statement Balance / Book Balance / Difference | `BankAccounts.lastStatementBalance` vs GL balance | |
| "Last statement: Aug 2026" | `BankAccounts.lastStatementDate` | |
| Drawer: Bank account, Value date, Description, Type, Statement match | `BankTransactions.valueDate`, `status` | |
**Statuses.** As `BankTransactions.status`.
**Actions → effects.** *Mark as cleared / uncleared* → `BankTransactions.status`, `clearedOn` · *Reconcile with Statement* / *View Statement* → `app/bank/reconciliation` (Full) · *Export Bank Book* (PDF / Excel / Print) → file.
**Permission.** `bank:view`, `bank:edit`, `bank:export` · **Approval.** —

---

### Cash Book — `app/cash/book`
*Source:* `src/47-books.html` (mount) · `src/98-books.js` (CASH BOOK engine: `ACC`, `MODES`, `CAT_IN`, `CAT_OUT`, `panelHTML`, `trHTML`, `save`, `renderCC`, `viewVoucher`, `reverse`)
**Purpose.** Quick Cash In / Cash Out / Bank / Transfer / Cheque entry that posts CRV / CPV / BRV / BPV / JV vouchers, with the drawer ledger and the daily cash count.
**Tables.** Primary: `BankCash.CashBookEntries`, `Accounting.Vouchers` / `Accounting.VoucherLines`, `BankCash.CashDayCloses`, `BankCash.CashDayCloseDenominations` · Reads: view `BankCash.getCashBook`, `BankCash.CashAccounts`, `BankCash.BankAccounts`, `BankCash.CashCategories`, `Sales.Customers`, `Purchases.Vendors` · Writes: `Accounting.Vouchers` (+ lines), `BankCash.CashBookEntries`, `BankCash.Cheques` (Cheque mode), `BankCash.BankTransactions` (bank legs), `BankCash.CashDayCloses`, `Company.Attachments`
**Functions.** Save → `Accounting.voucherAddUpdate` · Open → `Accounting.getVoucherInfo` · Actions → `Accounting.voucherPost`, `Accounting.voucherReverse` ‖ Save → `BankCash.cashDayCloseAddUpdate` · Open → `BankCash.getCashDayCloseInfo`
**Lookups.** `Vouchers.voucherType` → `VoucherType` · `Vouchers.instrumentType` → `VoucherInstrumentType` · `Vouchers.status` → `VoucherStatus` · `Vouchers.reversalReason` → `ReversalReason` · `CashDayCloses.status` → `CashDayCloseStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Total Liquid Cash / Main Cash Drawer / Bank Account (4 accounts) / Petty Cash (Imprest Rs 30,000) | `getCashBook` balances; `CashAccounts.imprestAmount` | "+12.5% from last month" **[simulated]** |
| Quick Entry: Cash Only / Bank Only / Transfer / Cheque | `CashBookEntries.entryKind` | CASH_IN/OUT · BANK_IN/OUT · TRANSFER · CHEQUE_IN/OUT |
| Date *, Time * | `CashBookEntries.entryDate`, `entryTime`; `Vouchers.docDate` | |
| Received From / Paid To / Party * | `CashBookEntries.partyName`; `Vouchers.partyName` | |
| Customer / Vendor pick | `CashBookEntries.customerId` / `vendorId`; `VoucherLines.customerId` / `vendorId` | Salary advance party → `CashBookEntries.employeeId` |
| Category * | `CashBookEntries.categoryId` → `BankCash.CashCategories` | Sales receipts, Customer receipts, Other income, Loan / capital, Refund received · Office supplies, Utilities, Courier & postage, Staff welfare, Salary advance, Fuel & conveyance, Repairs & maintenance, Vendor payment |
| Account / Bank Account * | `CashBookEntries.cashAccountId` / `bankAccountId`; `Vouchers.cashBankAccountId` | |
| Payment Mode * | `CashBookEntries.paymentMode` | CASH, CARD · IBFT, RAAST, BANK_TRANSFER, DEBIT_CARD · CHEQUE |
| Reference No. | `CashBookEntries.referenceNo`; `Vouchers.referenceNo` | |
| Cheque No. *, Cheque Date *, Drawn On, PDC | `BankCash.Cheques.chequeNo`, `chequeDate`, `drawnOnBankId`, `isPdc`; `CashBookEntries.chequeId` | status "PDC" shown from `Cheques.isPdc` |
| Amount * | `CashBookEntries.amount`; journal totals | "Exceeds available balance" check from `getCashBook` |
| Notes / Narration | `CashBookEntries.narration`; `Vouchers.narration` | |
| Receipt / Attachment | `Company.Attachments` (entity `Vouchers`) | |
| Transfer: From account, To account, Available / After transfer, Date *, Reference No., Amount *, Narration | `CashBookEntries` (`cashAccountId`/`bankAccountId` → `toCashAccountId`/`toBankAccountId`) | posts a contra JV/CON |
| Cash Ledger list: Transaction, Receipt (+), Payment (−), Running balance, Status | view `BankCash.getCashBook` | status Posted / Draft from `Vouchers.status` |
| Search / In / Out / date range | view filters | |
| Cash Count: 5,000 … 10, Coins | `CashDayCloseDenominations.noteValue`, `qty`, `amount` | coins as `noteValue` 1 |
| Counted / Book balance / Over / Short | `CashDayCloses.countedAmount`, `bookBalance`, `varianceAmount` | |
| Reconcile & close day | `CashDayCloses.status = 'LOCKED'`, `lockedByUserId`, `lockedAt`, `varianceJournalEntryId` | |
| Today at a glance (Cash in / Cash out / Top categories) | `getCashBook` grouped by `category` | |
| Voucher drawer: Voucher, Date & time, Party, Category, Payment mode, Branch, Prepared by, Journal lines | `Vouchers.*`, `VoucherLines.*`, `CashBookEntries.*` | |
**Statuses.** Voucher: DRAFT → POSTED → REVERSED (`Accounting.Vouchers.status`). Day close: COUNTED → LOCKED → REOPENED.
**Actions → effects.** *Save Cash In / Cash Out* → `Accounting.Vouchers` CRV/CPV (or BRV/BPV in Bank Only) + `CashBookEntries` (POSTING_RULES §Cash receipt / payment) · *Save Transfer* → contra JV Dr To-account / Cr From-account + `CashBookEntries` (TRANSFER) + `BankTransactions` for bank legs (POSTING_RULES §Contra / transfer) · *Cheque mode* → also `BankCash.Cheques` · *Edit draft* → reload DRAFT voucher · *Reverse* → reversing voucher (`Vouchers.reversalOfId`) · *Reconcile & close day* → `CashDayCloses` LOCKED; non-zero variance posts JV to Cash over/short (POSTING_RULES §Cash variance).
**Permission.** `cash:view`, `cash:create`, `cash:post`, `cash:approve` (reverse) · **Approval.** —

---

### Cheque Voucher — `app/bank/cheque-voucher`
*Source:* `src/44-purchase-docs.html` (section `app/bank/cheque-voucher`, panes Single / Bulk) · `src/94-purchase-docs.js` (`cqSingle`, `cqPreview`, `cqValidate`, `cqBValidate`, `cqGenerate`)
**Purpose.** Create one cheque voucher (receive or issue) with a posting preview and a printed cheque preview, or many vouchers at once from a bulk sheet.
**Tables.** Primary: `BankCash.Cheques` (single), `BankCash.ChequeBatches`, `BankCash.ChequeBatchLines` (bulk) · Reads: `Sales.Customers`, `Purchases.Vendors`, `BankCash.BankAccounts`, `BankCash.ChequeBooks` · Writes: `BankCash.Cheques`, `BankCash.ChequeBatches(Line)`, `Accounting.Vouchers`, `Company.Attachments` (uploaded sheet)
**Functions.** Save → `BankCash.chequeAddUpdate` · Open → `BankCash.getChequeInfo` · Actions → `BankCash.chequeCancel`, `BankCash.chequeDeposit`, `BankCash.chequePresent`, `BankCash.chequeClear`, `BankCash.chequeBounce` ‖ Save → `BankCash.chequeBatchAddUpdate` · Open → `BankCash.getChequeBatchInfo` · Actions → `BankCash.chequeBatchCancel`, `BankCash.chequeBatchGenerate`
**Lookups.** `Cheques.direction` → `ReceivedIssuedDirection` · `Cheques.postingMode` → `PostingMode` · `Cheques.status` → `ChequeStatus` · `ChequeBatches.direction` → `ReceivedIssuedDirection` · `ChequeBatches.postingMode` → `PostingMode` · `ChequeBatches.oldNoRule` → `OldNoRule` · `ChequeBatches.source` → `ChequeBatchSource` · `ChequeBatches.status` → `ChequeBatchStatus` · `ChequeBatchLines.validationStatus` → `ValidationStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Voucher Type: Receive Cheque / Issue Cheque | `Cheques.direction` / `ChequeBatches.direction` | |
| Old No. ("Auto if new") | `Cheques.legacyNo` | |
| Voucher No. (R-CHQ-0001 / I-CHQ-0001) | `Cheques.docNo` | `Company.getNextDocNo('CHQ')` |
| Voucher Date | `Cheques.docDate` | |
| Party / Account * | `Cheques.customerId` / `vendorId` / `accountId`, `partyName` | |
| Cheque No. * (6–8 digits) | `Cheques.chequeNo` | issued leaf from `Cheques.chequeBookId` |
| Cheque Date *, Due Date (≥ cheque date) | `Cheques.chequeDate`, `dueDate` | CHECK `dueDate >= chequeDate` |
| Amount * (+ amount in words) | `Cheques.amount` | words derived |
| Remarks (0/500) | `Cheques.remarks` | |
| Bank Account * | `Cheques.bankAccountId` | |
| Mode banner "Receive mode: Deposit in bank" | `Cheques.postingMode` | DEPOSIT · HOLD_PDC · CLEAR_ON_DEPOSIT |
| Posting information Dr · Bank / Cr · Customer (issue: Dr Vendor / Cr Bank) | journal preview | POSTING_RULES §Cheque received / issued |
| Cheque preview (bank, date, pay, words, MICR, signatory) | `cheque.*`, `Cheques.crossedAcPayee` | print only |
| Additional Notes | `Cheques.narration` | |
| Bulk: Voucher Type *, Voucher Date *, Bank Account *, Posting Mode, Old No. Rule, Default Remarks Prefix | `ChequeBatches.direction`, `docDate`, `bankAccountId`, `postingMode`, `oldNoRule`, `remarksPrefix` | |
| Bulk rows: #, Party Code *, Party Name *, Cheque No. *, Cheque Date *, Due Date, Amount *, Remarks, Old No. | `ChequeBatchLines.lineNo`, `partyCode`, `partyName`, `chequeNo`, `chequeDate`, `dueDate`, `amount`, `remarks`, `legacyNo` | resolved to `customerId` / `vendorId` |
| Total Rows / "n rows · total Rs" | `ChequeBatches.rowCount`, `totalAmount` | max 1,000 |
| Sheet Population (template, upload .xlsx/.xls/.csv, preview) | `ChequeBatches.source = 'SHEET'`, `sheetAttachmentId` | |
| Validate Rows (highlighted cells) | `ChequeBatchLines.validationStatus`, `validationErrors` | |
| Generate Vouchers ("Done — n vouchers created") | `ChequeBatchLines.chequeId`, `ChequeBatches.status`, `generatedAt` | |
**Statuses.** Batch: DRAFT → VALIDATED → GENERATED / PARTIAL · CANCELLED. Line: PENDING → VALID / INVALID → GENERATED. Cheque: as `app/bank/cheques`.
**Actions → effects.** *Save voucher* → `BankCash.Cheques` + journal per `postingMode` · *Generate Vouchers* → one `BankCash.Cheques` (+ journal) per valid row · *Print* → document · *Exit* → `app/bank/cheque-register`.
**Permission.** `bank:create`, `bank:post` · **Approval.** —

---

### Bank Reconciliation — `app/bank/reconciliation`
*Source:* `src/40-acc-core.html` (section `app/bank/reconciliation`)
**Purpose.** Match statement lines to book entries for one account and period, book the unbooked items and close the reconciliation at zero difference.
**Tables.** Primary: `BankCash.BankReconciliations`, `BankCash.BankReconciliationMatches` · Reads: `BankCash.BankStatementImports`, `BankCash.BankStatementLines`, `BankCash.BankTransactions`, `Accounting.Vouchers`, `BankCash.BankAccounts` · Writes: `BankCash.BankReconciliations(Match)`, `BankCash.BankTransactions.status/reconciliationId`, `Accounting.Vouchers` (adjustments), `BankCash.BankAccounts.reconciledTo` (trigger on close)
**Functions.** Save → `BankCash.bankReconciliationAddUpdate` · Open → `BankCash.getBankReconciliationInfo`
**Lookups.** `BankReconciliations.status` → `BankReconciliationStatus` · `BankReconciliationMatches.status` → `BankReconciliationMatchStatus` · `BankReconciliationMatches.matchMethod` → `MatchMethod` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Account select | `BankReconciliations.bankAccountId` | |
| Period ("September 2026", "As at 30 Sep 2026") | `BankReconciliations.periodFrom`, `periodTo` | |
| "Meezan Bank · imported 01 Oct 07:40" | `BankReconciliations.statementImportId` → `BankStatementImports.importedAt` | |
| KPIs Statement lines 142 / Matched 90% / Unmatched statement / Unmatched book | counts of `BankReconciliationMatches` by `status` | |
| Bank statement: Date, Description, Amount, Matched / Unmatched | `BankStatementLines.txnDate`, `description`, `amount`; `BankReconciliationMatches.status` | |
| Book entries: Date, Voucher, Amount, Matched / Suggested / Unpresented / Amount differs | `BankReconciliationMatches.journalEntryId` / `bankTransactionId`, `bookAmount`, `status` | |
| Balance per bank statement | `BankReconciliations.statementBalance` | |
| Less: unpresented cheques / Add: deposits in transit | `unpresentedCheques`, `depositsInTransit` | |
| Adjusted bank balance | `adjustedBankBalance` (generated) | |
| Balance per books (1120-01) | `bookBalance` | |
| Add: PLS profit not booked / Less: bank charges not booked | `unbookedCredits`, `unbookedDebits` | |
| Adjusted book balance / Difference Rs 0.00 | `adjustedBookBalance`, `difference` (generated) | close only when zero |
| History (August 2026 · Sana Javed · 04 Sep · Closed) | `BankReconciliations.periodTo`, `closedByUserId`, `closedAt`, `status` | |
**Statuses.** IN_PROGRESS → CLOSED → REOPENED. Match: MATCHED · UNMATCHED · SUGGESTED · UNPRESENTED · AMOUNT_DIFFERS.
**Actions → effects.** *Import* → `app/bank/transactions` / `BankStatementImports` · *Auto-match* → `BankReconciliationMatches` rows (method AUTO, SUGGESTED / MATCHED) · *Create adjustments* → BRV/BPV for PLS profit and bank charges, `adjustmentJournalEntryId` (POSTING_RULES §Bank charges & profit) · *Finish* → status CLOSED, matched `BankTransactions` → RECONCILED, `BankAccounts.reconciledTo` = period end.
**Permission.** `recon:view`, `recon:create`, `recon:post` · **Approval.** —

---

### Bank Rules & Import — `app/bank/rules`
*Source:* `src/4A-company-plus.html` (section `app/bank/rules`) · `src/9A-company-plus.js` (`bankRules()`: `RULES`, `STMT`, `test`, `apply`, `raastPaint`, `openBuilder`)
**Purpose.** Import statements, auto-categorise routine lines with rules, and match Raast / IBFT credits to open invoices.
**Tables.** Primary: `BankCash.BankRules`, `BankCash.BankRuleConditions`, `BankCash.BankStatementImports`, `BankCash.BankStatementLines` · Reads: `Accounting.ChartOfAccounts`, `Accounting.CostCentres`, `Sales.SalesInvoices` (open) · Writes: the above, `Accounting.Vouchers` (auto-post), `Sales.CustomerReceipts` (Raast match), `BankCash.BankTransactions`
**Functions.** Save → `BankCash.bankRuleAddUpdate` · Open → `BankCash.getBankRuleInfo` ‖ Save → `BankCash.bankStatementImportAddUpdate` · Open → `BankCash.getBankStatementImportInfo`
**Lookups.** `BankRules.matchMode` → `MatchMode` · `BankRuleConditions.field` → `BankRuleConditionField` · `BankRuleConditions.operator` → `BankRuleConditionOperator` · `BankStatementImports.format` → `BankStatementImportFormat` · `BankStatementImports.status` → `BankStatementImportStatus` · `BankStatementLines.channel` → `BankStatementLineChannel` · `BankStatementLines.status` → `BankStatementLineStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Import statement: bank select, drop file (.csv .xlsx .sta MT940) | `BankStatementImports.bankAccountId`, `fileName`, `attachmentId`, `format`, `layout` | |
| Progress "Detecting format… Parsing 15 transactions… Removing 2 duplicates" | `BankStatementImports.lineCount`, `duplicateCount`, `status` | duplicates via `BankStatementLines.dedupeHash` |
| "15 lines · Meezan 0123 · 26 Sep → 01 Oct 2026" | `periodFrom`, `periodTo` | |
| Statement lines: Date, Description (+ ref), Amount (Rs), Category / match | `BankStatementLines.txnDate`, `description`, `reference`, `amount`, `categoryAccountId`, `bankRuleId`, `status` | |
| KPIs Unmatched lines / Auto-categorised % / Active rules / Raast-IBFT credits | aggregates | "91% last month" **[simulated]** |
| Raast & IBFT matching: tag, amount, ref, → invoice, confidence %, Match, "Match ≥ 90%" | `BankStatementLines.channel`, `matchedInvoiceId`, `matchConfidence`, `matchReason` | |
| Rule card: name, BR-05, "48 hits in 90 days", Active switch, IF … THEN … | `BankRules.code`, `name`, `hitCount`, `isEnabled`, conditions, `accountId`, `costCentreId` | |
| Builder: Rule name *, Match all / Match any | `BankRules.name`, `matchMode` | ALL · ANY |
| Condition: Field, Operator, Value | `BankRuleConditions.field`, `operator`, `value` | DESC/AMT/REF/TYPE × CONTAINS/STARTS_WITH/EQUALS/LT/GT/IS |
| Then: Categorise to account, Cost centre, Auto-post when matched | `BankRules.accountId`, `costCentreId`, `autoPost` | |
| "Rules run top to bottom; first match wins" | `BankRules.priority` | |
**Statuses.** Import: UPLOADED → PARSED → MATCHED · FAILED. Line: UNMATCHED → CATEGORISED / MATCHED · IGNORED.
**Actions → effects.** *Import* → `BankStatementImports` + `BankStatementLines` · *Apply rules* → line CATEGORISED, `BankRules.hitCount`++, auto-post BPV/BRV to the rule account (+ `BankTransactions`) · *Match* → `Sales.CustomerReceipts` against the invoice, line MATCHED · *Save / Delete rule* → `bankRule(Condition)` (soft delete) .
**Permission.** `recon:view`, `recon:create`, `recon:edit`, `recon:post` · **Approval.** —

---

### Cash Ledger — `app/cash/ledger`
*Source:* `src/49-cash-users.html` (mount) · `src/9E-cash-users.js` (CASH LEDGER: `CATS`, `CONTRA`, `PROFILE`, `genAccount`, `renderDayClose`, `lockDay`, `renderVariance`, `openVoucher`)
**Purpose.** Running balance of every drawer, counter and imprest with category filters, day close with denominations, variance trend and a voucher audit trail.
**Tables.** Primary: view `BankCash.getCashLedger`, `BankCash.CashDayCloses`, `BankCash.CashDayCloseDenominations` · Reads: `BankCash.CashAccounts`, `BankCash.CashBookEntries`, `BankCash.CashCategories`, `Accounting.Vouchers`, `Accounting.VoucherLines`, `Company.Attachments`, `Company.AuditTrailEntries` · Writes: `BankCash.CashDayCloses(+ counts)`, `Accounting.Vouchers` (variance JV, reversal draft)
**Functions.** Save → `BankCash.cashDayCloseAddUpdate` · Open → `BankCash.getCashDayCloseInfo`
**Lookups.** `CashDayCloses.status` → `CashDayCloseStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Account tiles (Lahore HQ drawer · 1110-01 · Lahore HQ, balance, % since 15 Sep, spark) | `CashAccounts.shortName`, `code`, `branchId`; `getCashLedger.runningBalance` | |
| Custodian Hira Ali | `CashAccounts.custodianUserId` | |
| Period presets Today / This week / This month / Custom | view filter on `entryDate` | |
| KPIs Opening / Receipts (in) / Payments (out) / Closing / Transactions | `getCashLedger` aggregates | |
| Table: Date (+ time, lock), Voucher (CRV-LHR-0381 + type), Particulars (+ "To/By 4110 · Sales — Counter"), Category, Receipt, Payment, Balance Dr | `Vouchers.docNo`, `voucherType`, `CashBookEntries.entryTime`, `narration`, contra `VoucherLines.accountId`, `CashBookEntries.categoryId` | docNo pattern `{PREFIX}-{BR}-{SEQ4}` |
| Day total rows, "Closed" / "Open" | `CashDayCloses.status` | |
| Filters: In / Out, voucher type CRV / CPV / JV, Min / Max amount, category chips | view filters | |
| Views Table / Timeline / Calendar heatmap | same view | |
| Day Close: day select, notes 5000…10 + Coins, Counted, Book balance, Over / short, ±Rs 1,000 tolerance, Lock | `CashDayCloses.*`, `CashDayCloseDenominations.*`, `CashAccounts.varianceTolerance` | |
| "Closed by Sana Javed at 17:24" | `CashDayCloses.lockedByUserId`, `lockedAt` | |
| Variance trend · last 14 days | `CashDayCloses.varianceAmount` series | |
| Top categories (Out / In donut) | `getCashLedger` by category | |
| Voucher drawer: type, amount, journal lines (incl. Output sales tax @18% on walk-in sales), Party, Source document, Prepared by, Approved by, Attachments, Audit trail | `Vouchers`, `VoucherLines`, `CashBookEntries.partyName`, `referenceNo`, `Vouchers.preparedByUserId`, `approvedByUserId`, `Company.Attachments`, `Company.AuditTrailEntries` | approver required for amount ≥ `CashAccounts.approvalThreshold` (Rs 50,000) and for JV |
**Statuses.** Voucher DRAFT → PENDING_APPROVAL → POSTED → REVERSED. Day COUNTED → LOCKED → REOPENED (locked days read-only, `triggerCashDayCloseGuard`).
**Actions → effects.** *Lock day* → `CashDayCloses` LOCKED; variance JV Dr/Cr 6990 Cash over / short (POSTING_RULES §Cash variance) · *Reverse* → reversing voucher drafted for approval (blocked if day locked) · *Export* (CSV / Excel) / *Print* → file.
**Permission.** `cash:view`, `cash:approve`, `cash:post`, `cash:export` · **Approval.** Cash vouchers ≥ Rs 50,000 and contra JVs need Finance Manager approval (`Company.Approvals`).

---

### Petty Cash — `app/cash/petty`
*Source:* `src/40-acc-core.html` (section `app/cash/petty`, modals `#Accounting-petty-topup`, `#Accounting-petty-expense`)
**Purpose.** Imprest funds by branch with custodians, small expense vouchers and top-ups.
**Tables.** Primary: `BankCash.PettyCashFunds`, `BankCash.PettyCashVouchers`, `BankCash.PettyCashReplenishments` · Reads: `BankCash.CashAccounts`, `BankCash.ExpenseCategories`, view `BankCash.getPettyCashFundPositions` · Writes: the above, `Accounting.Vouchers` (replenishment CPV/BPV), `Company.Attachments`
**Functions.** Save → `BankCash.pettyCashFundAddUpdate` · Open → `BankCash.getPettyCashFundInfo` ‖ Save → `BankCash.pettyCashVoucherAddUpdate` · Open → `BankCash.getPettyCashVoucherInfo` · Actions → `BankCash.pettyCashVoucherVoid` ‖ Save → `BankCash.pettyCashReplenishmentAddUpdate` · Open → `BankCash.getPettyCashReplenishmentInfo` · Actions → `BankCash.pettyCashReplenishmentPost`, `BankCash.pettyCashReplenishmentCancel`
**Lookups.** `PettyCashFunds.status` → `PettyCashFundStatus` · `PettyCashVouchers.receiptStatus` → `ReceiptStatus` · `PettyCashVouchers.status` → `PettyCashVoucherStatus` · `PettyCashReplenishments.status` → `DraftPostedCancelledStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Fund card: Lahore HQ, Custodian: Nida Shah, Healthy / Topped up / Low / Critical | `PettyCashFunds.name`, `custodianEmployeeId`, `status` | thresholds `lowPct`, `criticalPct` |
| Rs 61,250 of Rs 100,000 imprest | `vPettyFundPosition.cashOnHand`, `PettyCashFunds.imprestAmount` | |
| Spent this cycle / Since 16 Sep | sum of UNREPLENISHED vouchers; `cycleStartedOn` | |
| Table: Date, Ref (PC-LHR-0412), Fund, Description, Category, Paid to, Amount, Receipt, Status | `PettyCashVouchers.docDate`, `docNo`, `fundId`, `description`, `categoryId`, `paidTo`, `amount`, `receiptStatus`/`receiptCount`, `status` | |
| Chips All / Unreplenished / Replenished; fund select | filters | |
| Imprest position: Total imprest / Cash on hand / Vouchers pending replenishment | `getPettyCashFundPositions` | |
| Spend by category (Sep) | sums by `categoryId` | |
| Top-up: Fund *, Date, Pay from, Amount, Replenish vouchers (14 · Rs 37,850), Post together | `PettyCashReplenishments.fundId`, `docDate`, `payFromCashAccountId` / `payFromBankAccountId`, `amount`, `voucherCount`, `vouchersTotal`, `postTogether` | |
| Record expense: Fund *, Date, Category, Amount, Description, Paid to, Attach receipt photo | `PettyCashVouchers.*`, `Company.Attachments` | |
**Statuses.** Fund HEALTHY · TOPPED_UP · LOW · CRITICAL · CLOSED. Voucher UNREPLENISHED → REPLENISHED · VOID. Replenishment DRAFT → POSTED · CANCELLED.
**Actions → effects.** *Save expense* → `PettyCashVouchers` (no GL yet: imprest method) · *Top-up* → `PettyCashReplenishments` POSTED, vouchers REPLENISHED, CPV/BPV Dr expense accounts per voucher / Cr cash or bank (POSTING_RULES §Petty cash replenishment); fund status recomputed.
**Permission.** `cash:view`, `cash:create`, `cash:post` · **Approval.** —

---

### Expense Claims — `app/cash/expenses`
*Source:* `src/40-acc-core.html` (section `app/cash/expenses`, modal `#Accounting-reject-claim`) · ESS side `src/6A-ess.html` + `src/9C-ess.js` (`ess/expenses`)
**Purpose.** Review employee reimbursement claims submitted via ESS, approve or reject them, and pay approved claims.
**Tables.** Primary: `BankCash.ExpenseClaims`, `BankCash.ExpenseClaimLines`, `BankCash.ExpenseClaimActions` · Reads: `HumanResources.Employees`, `BankCash.ExpenseCategories`, `Accounting.CostCentres`, `Sales.Customers`, `Company.Attachments` · Writes: the above, `Accounting.Vouchers` (approval accrual, payment), `Company.Notifications`, `Payroll.PayrollAdjustments` (reimburse with payroll — payroll module)
**Functions.** Save → `BankCash.expenseClaimAddUpdate` · Open → `BankCash.getExpenseClaimInfo` · Actions → `BankCash.expenseClaimApprove`, `BankCash.expenseClaimPay`
**Lookups.** `ExpenseClaims.source` → `ExpenseClaimSource` · `ExpenseClaims.policyLimitPeriod` → `PolicyLimitPeriod` · `ExpenseClaims.status` → `ExpenseClaimStatus` · `ExpenseClaims.workflowStage` → `WorkflowStage` · `ExpenseClaims.rejectionReason` → `ExpenseClaimRejectionReason` · `ExpenseClaims.paymentMethod` → `ExpenseClaimPaymentMethod` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Claim # (EXP-0219) + title | `ExpenseClaims.docNo`, `title` | |
| Employee + department | `ExpenseClaims.employeeId` → `HumanResources.Employees` | department filter via employee |
| Category | `ExpenseClaims.categoryId` | Travel, Fuel, Lodging, Meals, Telecom, Training, Courier, Office supplies, Other |
| Submitted | `ExpenseClaims.submittedAt` | |
| Receipts (n) | `ExpenseClaims.receiptCount` | |
| Amount | `ExpenseClaims.totalAmount` | |
| Status Pending / Over policy / Approved / Paid / Rejected | `ExpenseClaims.status` | PENDING · OVER_POLICY · APPROVED · PAID · REJECTED (+ DRAFT, WITHDRAWN) |
| Detail lines (Daewoo Express … 7,800) | `ExpenseClaimLines.description`, `qty`, `unitAmount`, `amount`, `receiptAttachmentId` | |
| Policy limit Rs 30,000 per trip | `ExpenseClaims.policyLimitAmount`, `policyLimitPeriod` (from `ExpenseCategories`) | |
| Customer Fatima Group | `ExpenseClaims.customerId` | |
| Charge to 5310-01 Travel — Sales | `ExpenseClaims.chargeAccountId`, `costCentreId` | |
| Line manager Approved — Ahmed Raza | `ExpenseClaims.managerUserId`, `managerApprovedAt`; `ExpenseClaimActions` | |
| Reject: Reason *, Comment to employee, Allow resubmit | `rejectionReason`, `rejectionComment`, `allowResubmit` | |
| KPIs Awaiting approval / Approved · unpaid / Paid this month / Policy exceptions | aggregates | |
| ESS: Merchant, Date, Amount, Category, Project / cost centre, Purpose, OCR confidence, tracker Sent → Manager → Finance → Paid | `merchant`, `docDate`, `totalAmount`, `categoryId`, `costCentreId`/`projectId`, `title`, `ocrConfidence`, `workflowStage` | `source = 'ESS'` |
**Statuses.** DRAFT → PENDING (or OVER_POLICY) → APPROVED → PAID · REJECTED · WITHDRAWN; `workflowStage` SENT → MANAGER → FINANCE → PAID.
**Actions → effects.** *Approve* (with exception if over policy) → APPROVED, `ExpenseClaimActions`, accrual JV Dr expense / Cr Employee claims payable (POSTING_RULES §Expense claim approval) · *Reject* → REJECTED + action + ESS notification · *Pay* / *Pay approved* → PAID; BPV Dr Employee claims payable / Cr Bank, or added to payroll (`payrollRunId`) (POSTING_RULES §Expense claim payment) · *Export* → file.
**Permission.** `cash:view`, `cash:approve`, `cash:post`, `cash:export` · **Approval.** Manager then Finance (`Company.Approvals`); over-policy needs exception approval.
