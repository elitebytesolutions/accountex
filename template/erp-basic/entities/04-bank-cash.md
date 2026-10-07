# 04 · Bank & Cash: page → entity map (Basic)

Schema: `BankCash` (`database/schema/04-treasury.sql`), cross-module FKs in `database/fk/04-BankCash-fks.sql`.
The Cash Book and Bank Book are **views over the single journal** (`Accounting.Vouchers` / `Accounting.VoucherLines`). Treasury tables hold the bank and cheque master data, the bank-side lines, the cheque lifecycle, and the quick-entry metadata the journal has no column for.

Permission keys follow the Roles & Permissions matrix (`src/9E-cash-users.js`, group *Finance*): module `bank` (Bank & cheques), `cash` (Cash book & petty cash), with the actions view / create / edit / approve / post / delete / export.

Basic screens: `app/bank/accounts`, `app/bank/transactions`, `app/bank/cheques`, `app/bank/cheque-register`, `app/bank/book`, `app/cash/book`.

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
| Import modal: Bank account *, Format, Statement period | `BankTransactions.source = 'STATEMENT_IMPORT'`, `statementRef` | Basic stores imported lines directly (Full adds a statement-import header) |
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
| Notify Bilal Khan (account owner) and put customer on credit hold | `ChequeBounces.notifyOwner`, `ownerUserId`, `creditHold` | → `Company.Notifications`; customer hold flag on `Sales.Customers` |
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
| Customer / Vendor pick | `CashBookEntries.customerId` / `vendorId`; `VoucherLines.customerId` / `vendorId` | |
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
