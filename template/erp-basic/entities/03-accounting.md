# 03 · Accounting — page → entity map (Basic)

Schema: `Accounting` (`database/schema/03-acc.sql`), cross-module FKs in `database/fk/03-Accounting-fks.sql`.
Screens: 7 — `app/accounting/coa`, `app/accounting/ledger`, `app/accounting/opening`, `app/accounting/vouchers`, `app/accounting/vouchers/new`, `app/accounting/vouchers/view`, `app/periods`.

Conventions used below: money `numeric(18,2)`; every table has `tenantId` + RLS; the standard tail (`createdAt … rowVersion`) is not repeated. Posting rules: `POSTING_RULES.md` §Accounting.

---

### Chart of Accounts — `app/accounting/coa`
*Source:* `src/46-coa.html` (shell + Add/Delete modals) · `src/97-coa.js` (engine: tree, map view, inspector drawer, add/edit modal, bulk actions)
**Purpose.** Maintain the 4-level chart of accounts (class → header → group → postable) and see each account's balance and recent postings.
**Tables.** Primary: `Accounting.ChartOfAccounts` · Reads: `Accounting.VoucherLines` + `Accounting.Vouchers` (balances, "Recent postings"), `Company.Branches`, `Company.Currencies` · Writes: `Accounting.ChartOfAccounts`, `Accounting.OpeningBalanceLines` (opening entered on creation)
**Functions.** Save → `Accounting.accountAddUpdate` · Open → `Accounting.getAccountInfo`
**Lookups.** `ChartOfAccounts.nature` → `Nature` · `ChartOfAccounts.kind` → `AccountKind` · `ChartOfAccounts.subType` → `AccountSubType` · `ChartOfAccounts.status` → `ActiveInactiveStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Account name * | `Accounting.ChartOfAccounts.name` | |
| Description / row sub-line | `Accounting.ChartOfAccounts.description` | "Main operating account" |
| Tree icon | `Accounting.ChartOfAccounts.icon` | lucide icon name |
| Parent account * (searchable) | `Accounting.ChartOfAccounts.parentAccountId` | must be `Accounting.getParentAccountCode(code)`, one level up, same class, not POSTABLE (trigger `accountGuard`) |
| Account code * (auto-suggested) | `Accounting.ChartOfAccounts.code` | `^[1-5][0-9]{3}(-[0-9]{2,3})?$`, unique per tenant; next free code under the parent; read-only on edit |
| Level n of 4 / Level filter | `Accounting.ChartOfAccounts.level` | derived from code (`Accounting.getAccountLevel`) |
| Category chips (Assets/Liabilities/Equity/Income/Expenses) | `Accounting.ChartOfAccounts.accountClass` | 1–5 = first digit of code |
| Type filter Header / Group / Postable (kind badge) | `Accounting.ChartOfAccounts.kind` | HEADER (L1–2), GROUP (L3), POSTABLE (L4) |
| Account type select (Cash, Bank, Receivable …) | `Accounting.ChartOfAccounts.subType` | UPPER_SNAKE; allowed per class; postable only; FINANCE_COST and TAXATION added for the P&L sections |
| Nature Debit (Dr) / Credit (Cr) | `Accounting.ChartOfAccounts.nature` | defaults from class, editable (contra accounts) |
| Opening balance (PKR) | `Accounting.ChartOfAccounts.openingBalance`, `openingAsOf` | postable only; locked after creation; seeds the draft opening batch |
| Status Active / Inactive; Activate / Deactivate (single + bulk) | `Accounting.ChartOfAccounts.status` | |
| Branch (inspector) | `Accounting.ChartOfAccounts.branchId` | NULL = All branches |
| Currency | `Accounting.ChartOfAccounts.currencyCode` | PKR |
| Balance column, ▲ % change, sparkline | `Accounting.getAccountBalances` | roll-up of children for HEADER/GROUP |
| Sub-account count | derived | children of `parentAccountId` |
| Last modified (date · by) | `Accounting.ChartOfAccounts.updatedAt`, `updatedBy` | |
| Recent postings (drawer) | `Accounting.getGeneralLedger` | last 5 lines for the account |

**Statuses.** ACTIVE ⇄ INACTIVE · deleted (soft: `deletedAt`).
**Actions → effects.** *Create account* → insert `Accounting.ChartOfAccounts` (+ `Accounting.OpeningBalanceLines` in the draft batch when an opening is entered) · *Edit* → name/description/sub-type/nature/status only (code, parent, level, opening locked by trigger) · *Delete* → blocked while it has sub-accounts or postings ("This account can't be deleted"), else `deletedAt` · *Bulk activate/deactivate/move/delete* → same rules per row · *View Ledger* → `app/accounting/ledger?code=…`.
**Permission.** `coa:view`, `coa:manage` · **Approval.** —

---

### Account Ledger — `app/accounting/ledger`
*Source:* `src/46-coa.html` (shell) · `src/97-coa.js` (Account Ledger engine, `LS` state)
**Purpose.** Show every posted movement on one postable account with opening, running balance and closing.
**Tables.** Primary: view `Accounting.getGeneralLedger` · Reads: `Accounting.ChartOfAccounts`, `Accounting.Vouchers`, `Accounting.VoucherLines`, `Accounting.getAccountBalances` · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Account picker (side list, search) | `Accounting.ChartOfAccounts` (kind = POSTABLE) | balance per account from `Accounting.getAccountBalances` |
| Header: name, status, code, class, group path, nature | `Accounting.ChartOfAccounts.*` + ancestors | |
| Office / book (branch · PKR) | `Accounting.ChartOfAccounts.branchId`, `currencyCode` | |
| KPI Opening Balance (as at period start) | `Accounting.getGeneralLedger` opening row | Σ posted lines before the range |
| KPI Debits / Credits / Closing / Transactions | aggregates over range | |
| Date | `Accounting.Vouchers.postingDate` | |
| Voucher (no. + type badge) | `Accounting.Vouchers.docNo` / `sourceDocNo`, `voucherType` | SI / PI / CN shown for system postings via `sourceDocType` |
| Particulars | `Accounting.VoucherLines.particulars` (else `Vouchers.narration`) | |
| Contra account | derived (other lines of the same entry) | "Contra account" filter |
| Debit (Rs) / Credit (Rs) | `Accounting.VoucherLines.debit` / `credit` | |
| Balance (Rs) | running balance (window over postingDate, docNo) | Dr/Cr per account nature |
| Filters: Voucher type, Transaction side, Minimum amount, Contra account; date range | view predicates | |
| Saved Views | — | Full only (`Accounting.SavedLedgerViews`); Basic keeps the menu client-side |

**Statuses.** Only POSTED and REVERSED vouchers appear (both legs of a reversal show).
**Actions → effects.** *View voucher* → `app/accounting/vouchers/view` · *Export Excel/PDF* → client export · *View chart of accounts* → `app/accounting/coa`.
**Permission.** `ledger:view` · **Approval.** —

---

### Opening Balances — `app/accounting/opening`
*Source:* `src/40-acc-core.html` (section `app/accounting/opening`, modal `Accounting-import-opening`)
**Purpose.** Enter the opening trial balance as at the first day of the fiscal year and post it once debits equal credits (difference parked in suspense).
**Tables.** Primary: `Accounting.OpeningBalances`, `Accounting.OpeningBalanceLines` · Reads: `Accounting.ChartOfAccounts`, `Accounting.FiscalYears`, `Company.Branches`, `Sales.Customers`, `Purchases.Vendors` · Writes: batch + lines; on post `Accounting.Vouchers` (voucherType OB) + `Accounting.VoucherLines`
**Functions.** Save → `Accounting.openingBalanceAddUpdate` · Open → `Accounting.getOpeningBalanceInfo` · Actions → `Accounting.openingBalancePost`
**Lookups.** `OpeningBalances.status` → `OpeningBalanceStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| As at 01 Jul 2026 · FY 2026-27 | `OpeningBalances.asAtDate`, `fiscalYearId` | one batch per FY |
| Status: Draft | `OpeningBalances.status` | DRAFT / POSTED |
| KPI Total debits / Total credits | `OpeningBalances.totalDebit` / `totalCredit` | maintained by trigger from lines |
| KPI Difference ("Debit heavy") / banner "Out of balance by Rs 125,000" | `OpeningBalances.difference` | generated `totalDebit - totalCredit` |
| "parked in 3900-01 Opening Balance Suspense" | `OpeningBalances.suspenseAccountId` | required when difference ≠ 0 |
| Code / Account | `OpeningBalanceLines.accountId` → `Accounting.ChartOfAccounts.code`, `name` | postable only |
| Type badge (Asset / Contra asset / Liability / Equity) | `Accounting.ChartOfAccounts.accountClass`, `nature` | contra = class nature ≠ account nature |
| Debit / Credit cells | `OpeningBalanceLines.debit` / `credit` | exactly one > 0 |
| Branch filter / CSV "branch" | `OpeningBalanceLines.branchId` | NULL = batch branch |
| Party (AR/AP control accounts) | `OpeningBalanceLines.customerId` / `vendorId` | optional |
| Chips All/Assets/Liabilities/Equity/With balance | filter on `accountClass` | |
| "48 accounts with zero balance hidden" | `Accounting.ChartOfAccounts` without a line | |
| Import modal: CSV (code, debit, credit, branch), As at date, On duplicate (Replace / Add / Skip), Validate codes | upsert on `openingBalanceLineUk` | options are request parameters, not stored |

**Statuses.** DRAFT → POSTED (lines frozen by trigger `openingBalanceLineGuard`).
**Actions → effects.** *Save / Save draft* → upsert lines · *Discard changes* → client · *Template* → CSV download · *Post opening balances* → `Accounting.openingBalancePost(batch)` → OB journal dated `asAtDate` (POSTING_RULES §Opening balances), batch POSTED.
**Permission.** `ob:view`, `ob:manage`, `ob:post` · **Approval.** —

---

### Voucher Register — `app/accounting/vouchers`
*Source:* `src/40-acc-core.html` (section `app/accounting/vouchers`, modal `po-vch-act` Post/Reverse)
**Purpose.** Track, filter and act on every journal, cash, bank and contra voucher.
**Tables.** Primary: `Accounting.Vouchers` · Reads: `Accounting.VoucherLines`, `Company.Branches`, `Company.Users`, `Company.Attachments` · Writes: `Accounting.Vouchers` (post / reverse / duplicate)
**Functions.** Save → `Accounting.voucherAddUpdate` · Open → `Accounting.getVoucherInfo` · Actions → `Accounting.voucherPost`, `Accounting.voucherReverse`
**Lookups.** `Vouchers.voucherType` → `VoucherType` · `Vouchers.instrumentType` → `VoucherInstrumentType` · `Vouchers.status` → `VoucherStatus` · `Vouchers.reversalReason` → `ReversalReason` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Voucher # + sub-label (Accrual, Cash sales …) | `Vouchers.docNo`; sub-label = `referenceNo` / `tags[1]` | |
| Date | `Vouchers.docDate` | range picker "01 Sep – 30 Sep 2026" |
| Type badge JV / CPV / CRV / BPV / BRV / Contra | `Vouchers.voucherType` | chips with counts |
| Narration + sub-line (INV-…, bank, cheque) | `Vouchers.narration`; `sourceDocNo`, `cashBankAccountId`, `instrumentNo` | |
| Branch | `Vouchers.branchId` | "All" when lines span branches |
| Debit / Credit | `Vouchers.totalDebit` / `totalCredit` | |
| Status Draft / Pending / Posted / Reversed | `Vouchers.status` | DRAFT / PENDING_APPROVAL / POSTED / REVERSED |
| "Reversed by JV-2026-000041" | `Vouchers.reversedById` → `docNo` | |
| Created by | `Vouchers.preparedByUserId` | "Created by me" filter |
| KPIs Total vouchers, Total debit, Pending approval (count + Rs), Drafts (oldest n days) | aggregates on `Accounting.Vouchers` | view `Accounting.getVoucherRegister` |
| Filters: Amount above Rs 100,000, Has attachments | `totalDebit`; `Company.Attachments` (entityType JV…) | |
| Post modal: Posting date, Period, Remarks | `postingDate`, `fiscalPeriodId` (resolved), remarks → `Company.AuditTrailEntries` | |
| Reverse modal: Reversal date, Reason *, Remarks | `reversalDate` (original); `reversalReason`, `reversalRemarks` (reversing voucher) | reasons INCORRECT_AMOUNT / WRONG_ACCOUNT / DUPLICATE / WRONG_PERIOD / OTHER |

**Statuses.** DRAFT → PENDING_APPROVAL → POSTED → REVERSED. Posted rows are immutable (trigger `journalEntryGuard`).
**Actions → effects.** *Post voucher…* → `status = POSTED` (balance, ≥ 2 lines, open period, after `Company.CompanySettings.booksLockDate`) · *Reverse voucher…* → `Accounting.voucherReverse()` (mirror voucher, original REVERSED) · *Duplicate as draft* → new DRAFT copy · *Print* · *Export* (412 rows).
**Permission.** `jv:view`, `jv:post`, `jv:reverse`, `jv:export` · **Approval.** Basic: single approver recorded in `approvedByUserId` ("Finance Manager → CFO above Rs 500,000" routing is Full `core.approval*`).

---

### New Voucher — `app/accounting/vouchers/new`
*Source:* `src/44-purchase-docs.html` (section `app/accounting/vouchers/new`) · `src/94-purchase-docs.js` (`VT`, `VN`, `vnMorph`, `vnTotals`, `vnPost`)
**Purpose.** Enter a balanced JV, CPV, CRV, BPV, BRV, Contra or Opening voucher; cash/bank vouchers post their cash/bank leg automatically.
**Tables.** Primary: `Accounting.Vouchers`, `Accounting.VoucherLines` · Reads: `Accounting.ChartOfAccounts` (postable, grouped by class), `Accounting.CostCentres`, `Company.Branches`, `Company.Users`, `Company.NumberingSeries` · Writes: `Accounting.Vouchers`, `Accounting.VoucherLines`, `Company.Attachments`
**Functions.** Save → `Accounting.voucherAddUpdate` · Open → `Accounting.getVoucherInfo` · Actions → `Accounting.voucherPost`, `Accounting.voucherReverse`
**Lookups.** `Vouchers.voucherType` → `VoucherType` · `Vouchers.instrumentType` → `VoucherInstrumentType` · `Vouchers.status` → `VoucherStatus` · `Vouchers.reversalReason` → `ReversalReason` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Type tiles / Voucher Type * (Journal, Cash Payment, Cash Receipt, Bank Payment, Bank Receipt, Contra, Opening) | `Vouchers.voucherType` | JV, CPV, CRV, BPV, BRV, CON (UI "CV"), OB |
| Auto number JV-2026-000046 (gear → prefix) | `Vouchers.docNo` | `Company.getNextDocNo(type, docDate, branch)`; branch cash series `CPV-LHR-0621` |
| Voucher Date * | `Vouchers.docDate` | |
| Posting Date * | `Vouchers.postingDate` | drives the fiscal period |
| Reference No. | `Vouchers.referenceNo` | |
| Branch * | `Vouchers.branchId` | default for line branch |
| Department | `Vouchers.department` | text: Finance, Administration, Sales, Procurement, Operations, Warehouse |
| Prepared By | `Vouchers.preparedByUserId` | |
| Approved By | `Vouchers.approvedByUserId` | |
| Narration * (0/300) | `Vouchers.narration` | 1–300 chars (CHECK) |
| Cash account * / Bank account * (balance pill) | `Vouchers.cashBankAccountId` | required for CPV/CRV/BPV/BRV |
| Instrument type (Cheque, Online transfer (IBFT), Pay order, RTGS / Cheque deposit, IBFT, Cash deposit) | `Vouchers.instrumentType` | CHEQUE, IBFT, PAY_ORDER, RTGS (BPV); CHEQUE_DEPOSIT, IBFT, CASH_DEPOSIT (BRV) |
| Cheque / Ref No. · Cheque Date | `Vouchers.instrumentNo`, `instrumentDate` | |
| Pay to / Received from / Payee | `Vouchers.partyName` | free text; sub-ledger party goes on the line |
| JV: Auto-reverse on 01 Nov 2026 | `Vouchers.autoReverseOn` | job calls `Accounting.voucherReverse` on that date |
| JV: Recurring monthly | — | Full only (`Accounting.RecurringVoucherTemplates`) |
| Lines: # (drag to reorder) | `VoucherLines.lineNo` | unique deferrable |
| Account / Code | `VoucherLines.accountId` | POSTABLE + ACTIVE only (trigger); CPV/BPV restrict to expense/AP/liability/asset kinds, CRV/BRV to income/AR/liability/equity/asset, Contra to cash/bank (UI rule) |
| Description / Narration | `VoucherLines.particulars` | |
| Debit (PKR) / Credit (PKR) (or single Amount for one-sided types) | `VoucherLines.debit` / `credit` | exactly one > 0 |
| Cost Centre | `VoucherLines.costCentreId` | |
| Auto contra row (locked) | `VoucherLines` with `isAutoContra = true` on `cashBankAccountId` | amount = Σ lines |
| Total Debit / Total Credit / Balanced · Difference | `Vouchers.totalDebit` / `totalCredit` | maintained by trigger; post enabled only when balanced |
| Attachments (PDF, Excel, JPG ≤ 10 MB) | `Company.Attachments` (entityType = voucher type, entityId = journal id) | |
| Tags | `Vouchers.tags` | |
| Comments | `Vouchers.remarks` | |
| Save as template / Import from template | — | Full only (`Accounting.RecurringVoucherTemplates` with frequency NONE) |

**Statuses.** Save Draft → DRAFT · Save & Post → POSTED (or PENDING_APPROVAL when an approver is required).
**Actions → effects.** *Save Draft* → insert header + lines (DRAFT) · *Save & Post* → set POSTED → ledger (POSTING_RULES §Manual vouchers) · *Add line / Add multiple lines / Duplicate / Delete line* → `Accounting.VoucherLines` (draft only).
**Permission.** `jv:create`, `jv:post` · **Approval.** optional approver (`approvedByUserId`).

---

### Voucher Detail — `app/accounting/vouchers/view`
*Source:* `src/40-acc-core.html` (section `app/accounting/vouchers/view`, modal `Accounting-reverse-voucher`)
**Purpose.** Read one voucher with its lines, audit trail, approval state and attachments; approve, duplicate or reverse it.
**Tables.** Primary: `Accounting.Vouchers`, `Accounting.VoucherLines` · Reads: `Accounting.ChartOfAccounts`, `Accounting.CostCentres`, `Accounting.FiscalPeriods`, `Accounting.FiscalYears`, `Company.AuditTrailEntries`, `Company.Attachments`, `Company.Users` · Writes: `Accounting.Vouchers` (approve / post / reverse)
**Functions.** Save → `Accounting.voucherAddUpdate` · Open → `Accounting.getVoucherInfo` · Actions → `Accounting.voucherPost`, `Accounting.voucherReverse`
**Lookups.** `Vouchers.voucherType` → `VoucherType` · `Vouchers.instrumentType` → `VoucherInstrumentType` · `Vouchers.status` → `VoucherStatus` · `Vouchers.reversalReason` → `ReversalReason` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Title JV-2026-000045 + status badge | `docNo`, `status` | |
| Voucher type | `voucherType` | |
| Voucher date | `docDate` | |
| Fiscal period "Sep 2026 · FY 2026-27" | `fiscalPeriodId` → `Accounting.FiscalPeriods.code`, `Accounting.FiscalYears.code` | |
| Reference | `referenceNo` | PR-2026-09 |
| Branch | `branchId` | |
| Cost centre "All departments" | derived from lines | |
| Created by · time | `preparedByUserId`, `createdAt` | |
| Submitted | `submittedAt` | |
| Currency | `currencyCode` | |
| Narration | `narration` | |
| Ledger entries: #, Account, Particulars, Cost centre, Debit, Credit, Total | `VoucherLines.lineNo`, `accountId`, `particulars`, `costCentreId`, `debit`, `credit` | |
| KPI Voucher amount · Balanced · n lines | `totalDebit`, line count | |
| Audit trail (When, User, Action, Detail) | `Company.AuditTrailEntries` (table Accounting.Vouchers / VoucherLines) | Full adds `Accounting.VoucherActivities` |
| Approval timeline (Prepared, Submitted, Finance Manager, CEO) | `preparedByUserId`, `submittedAt`, `approvedByUserId`, `approvedAt` | multi-step chain is Full `Company.Approvals` |
| Attachments | `Company.Attachments` | |
| Related: PR-2026-09 payroll run, fiscal period | `sourceDocType`, `sourceDocId`, `sourceDocNo`; `fiscalPeriodId` | |
| Reverse modal: Reversal date *, Reversal voucher no. (auto), Reason *, Remarks | `Accounting.voucherReverse(id, date, reason, remarks)` | |

**Statuses.** DRAFT / PENDING_APPROVAL / POSTED / REVERSED.
**Actions → effects.** *Approve* → `approvedByUserId`, `approvedAt`, then POSTED · *Send back* → status DRAFT · *Reverse* → mirror voucher JV-2026-000046 posted, original REVERSED · *Duplicate* → new DRAFT · *Print*.
**Permission.** `jv:view`, `jv:approve`, `jv:reverse` · **Approval.** single approver (Basic).

---

### Fiscal Years & Periods — `app/periods`
*Source:* `src/42-acc-reports.html` (section `app/periods`, modals `Reports-close-period`, `Reports-reopen-period`)
**Purpose.** Control which months accept postings: open, close, lock and reopen periods; see each fiscal year's state.
**Tables.** Primary: `Accounting.FiscalYears`, `Accounting.FiscalPeriods` · Reads: `Accounting.Vouchers` (voucher/draft counts), `Company.Users` · Writes: `Accounting.FiscalYears`, `Accounting.FiscalPeriods`
**Functions.** Save → `Accounting.fiscalYearAddUpdate` · Open → `Accounting.getFiscalYearInfo`
**Lookups.** `FiscalYears.status` → `OpenClosedStatus` · `FiscalPeriods.status` → `OpenClosedLockedStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Year card: FY 2025-26 · 01 Jul 2025 – 30 Jun 2026 | `FiscalYears.code`, `startDate`, `endDate` | code = `Company.getFiscalYearLabel(startDate)` |
| Closed · Locked / Open · Current / Not created | `FiscalYears.status`, `isLocked`; no row = not created | |
| Net profit transferred | `FiscalYears.netProfitTransferred` | |
| Closing entry JV-2026-000188 | `FiscalYears.closingJournalEntryId` | |
| Closed by · date | `FiscalYears.closedByUserId`, `closedAt` | |
| Audited by | `FiscalYears.auditorName` | |
| "2 of 12 periods closed · 17%" / Profit to date / Current period / Next close target | derived; `FiscalPeriods.closeTargetDate` | profit from `Accounting.getProfitAndLoss` |
| Add adjustment period (P13) | `FiscalYears.hasAdjustmentPeriod` + `FiscalPeriods` with `periodNo = 13`, `isAdjustment` | |
| Period | `FiscalPeriods.code` | `MON-YYYY` / `P13-YYYY` |
| From / To | `FiscalPeriods.startDate`, `endDate` | no overlap (exclusion constraint) |
| Vouchers / Drafts | count of `Accounting.Vouchers` by `postingDate` and status | view `Accounting.getFiscalPeriodSummary` |
| Modules | — | Full only (`Accounting.PeriodModuleLocks`); Basic closes the whole period |
| Status Open / Closed / Locked | `FiscalPeriods.status` | |
| Closed by · date | `FiscalPeriods.closedByUserId`, `closedAt` (`locked*` for Locked) | |
| Close modal checks (bank reconciled, depreciation posted, move drafts to next period) | pre-checks; drafts block closing (trigger) | "Move remaining drafts" = update `postingDate` of drafts |
| Reopen modal (Period, Reopen until, Reason *, Approver, Re-close automatically) | Basic: `status → OPEN` (audited in `Company.AuditTrailEntries`) | request/approval workflow is Full `Accounting.PeriodReopenRequests` |

**Statuses.** Period OPEN → CLOSED → LOCKED (reopen → OPEN). Year OPEN → CLOSED (+ locked).
**Actions → effects.** *New fiscal year* → insert `Accounting.FiscalYears` + 12 (+P13) `Accounting.FiscalPeriods` · *Close* → CLOSED (blocked while drafts/pending vouchers exist) · *Lock* → LOCKED · *Reopen* → OPEN · *Year-end close* → `app/periods/close` (Full).
**Permission.** `period:view`, `period:manage`, `period:close`, `period:reopen` · **Approval.** reopening a locked period requires CEO (Full workflow; Basic: permission only).
