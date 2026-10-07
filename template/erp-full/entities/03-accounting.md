# 03 · Accounting — page → entity map (Full)

Schema: `Accounting` (`database/schema/03-acc.sql`), cross-module FKs in `database/fk/03-Accounting-fks.sql`.
Screens: 12 — the 7 Basic screens (`app/accounting/coa`, `/ledger`, `/opening`, `/vouchers`, `/vouchers/new`, `/vouchers/view`, `app/periods`) + `app/accounting/cost-centres`, `app/accounting/recurring`, `app/periods/close`, `app/budgets`, `app/budgets/variance`.

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
| Branch (inspector) | `Accounting.ChartOfAccounts.branchId`; `Accounting.AccountBranches` for several branches | NULL + no rows = All branches |
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
| Saved Views (Month-end review, Large debits ≥ Rs 1M, Save current view…) | `Accounting.SavedLedgerViews.name`, `accountId`, `dateFrom`, `dateTo`, `filters`, `isShared` | per user |

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
**Permission.** `jv:view`, `jv:post`, `jv:reverse`, `jv:export` · **Approval.** `Company.ApprovalWorkflows` for voucher types: Finance Manager → CFO above Rs 500,000 (`Company.Approvals`).

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
| JV: Recurring monthly | `Accounting.RecurringVoucherTemplates` (frequency MONTHLY) created from this voucher | `sourceJournalEntryId` |
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
| Save as template / Import from template | `Accounting.RecurringVoucherTemplates` (frequency NONE) + `Accounting.RecurringVoucherTemplateLines` | applies lines + narration |

**Statuses.** Save Draft → DRAFT · Save & Post → POSTED (or PENDING_APPROVAL when an approver is required).
**Actions → effects.** *Save Draft* → insert header + lines (DRAFT) · *Save & Post* → set POSTED → ledger (POSTING_RULES §Manual vouchers) · *Add line / Add multiple lines / Duplicate / Delete line* → `Accounting.VoucherLines` (draft only).
**Permission.** `jv:create`, `jv:post` · **Approval.** `Company.ApprovalWorkflows` rules by voucher type and amount.

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
| Audit trail (When, User, Action, Detail) | `Accounting.VoucherActivities.occurredAt`, `userId`, `action`, `detail` | CREATED / EDITED / ATTACHMENT / SUBMITTED / APPROVED / SENT_BACK / POSTED / REVERSED; field diffs in `Company.AuditTrailEntries` |
| Approval timeline (Prepared, Submitted, Finance Manager, CEO) + Comment, Send back / Approve | `Company.Approvals` / `Company.ApprovalActions` (entity = voucher); final approver mirrored to `approvedByUserId`, `approvedAt` | rule "JV > Rs 500,000 → Finance Manager; > Rs 10,000,000 → CEO" |
| Attachments | `Company.Attachments` | |
| Related: PR-2026-09 payroll run, fiscal period | `sourceDocType`, `sourceDocId`, `sourceDocNo`; `fiscalPeriodId` | |
| Reverse modal: Reversal date *, Reversal voucher no. (auto), Reason *, Remarks | `Accounting.voucherReverse(id, date, reason, remarks)` | |

**Statuses.** DRAFT / PENDING_APPROVAL / POSTED / REVERSED.
**Actions → effects.** *Approve* → `approvedByUserId`, `approvedAt`, then POSTED · *Send back* → status DRAFT · *Reverse* → mirror voucher JV-2026-000046 posted, original REVERSED · *Duplicate* → new DRAFT · *Print*.
**Permission.** `jv:view`, `jv:approve`, `jv:reverse` · **Approval.** `Company.Approvals` chain (Finance Manager, CEO above Rs 10,000,000).

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
| Modules (All locked · AR, AP, GL closed · AR closed · GL open) | `Accounting.PeriodModuleLocks.moduleCode`, `status` | GL, AR, AP, INV, PAY; Close modal "All modules / Sub-ledgers only" |
| Status Open / Closed / Locked | `FiscalPeriods.status` | |
| Closed by · date | `FiscalPeriods.closedByUserId`, `closedAt` (`locked*` for Locked) | |
| Close modal checks (bank reconciled, depreciation posted, move drafts to next period) | pre-checks; drafts block closing (trigger) | "Move remaining drafts" = update `postingDate` of drafts |
| Reopen modal (Period, Reopen until, Reason *, Approver, Re-close automatically) | `Accounting.PeriodReopenRequests.fiscalPeriodId`, `reopenUntil`, `reason`, `approverUserId`, `autoReclose`, `previousStatus`, `mfaVerifiedAt` | approval sets the period (or module lock) OPEN; job re-closes after `reopenUntil` |

**Statuses.** Period OPEN → CLOSED → LOCKED (reopen → OPEN). Year OPEN → CLOSED (+ locked).
**Actions → effects.** *New fiscal year* → insert `Accounting.FiscalYears` + 12 (+P13) `Accounting.FiscalPeriods` (auto one month before year start) · *Close* → `Accounting.PeriodModuleLocks` rows CLOSED for the chosen modules; period CLOSED when all modules close (blocked while drafts/pending vouchers exist) · *Lock* → LOCKED · *Reopen* → `Accounting.PeriodReopenRequests` request → on approval period/module OPEN until `reopenUntil` · *Year-end close* → `app/periods/close`.
**Permission.** `period:view`, `period:manage`, `period:close`, `period:reopen` · **Approval.** reopen via `Accounting.PeriodReopenRequests` (approver; locked periods also need approver MFA).

---

### Cost Centres & Projects — `app/accounting/cost-centres`
*Source:* `src/4A-company-plus.html` (section shell) · `src/9A-company-plus.js` (`costCentres()`: `TREE`, `PROJ`, `RULES`, `TX`, modal `cp-cc-modal`)
**Purpose.** Track spend by branch and department, run project P&Ls, and let allocation rules split shared costs automatically.
**Tables.** Primary: `Accounting.CostCentres`, `Accounting.Projects`, `Accounting.ProjectTags`, `Accounting.CostAllocationRules`, `Accounting.CostAllocationSplits` · Reads: `Accounting.VoucherLines` (actuals by `costCentreId` / `projectId`), `Accounting.BudgetVersionLines`, `HumanResources.Employees` (owners), `Company.Branches` · Writes: the five primary tables
**Functions.** Save → `Accounting.costCentreAddUpdate` · Open → `Accounting.getCostCentreInfo` ‖ Save → `Accounting.projectAddUpdate` · Open → `Accounting.getProjectInfo` ‖ Save → `Accounting.costAllocationRuleAddUpdate` · Open → `Accounting.getCostAllocationRuleInfo`
**Lookups.** `CostCentres.status` → `ActiveInactiveStatus` · `CostCentres.centreType` → `CentreType` · `Projects.colour` → `ProjectColour` · `Projects.status` → `ProjectStatus` · `CostAllocationRules.basis` → `CostAllocationRuleBasis` · `CostAllocationRules.status` → `ActiveInactiveStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Segment Cost centre / Project | `Accounting.CostCentres` vs `Accounting.Projects` | |
| Name * | `CostCentres.name` / `Projects.name` | |
| Code (Auto) | `CostCentres.code` (CC-110) / `Projects.code` (PRJ-01) | unique per tenant |
| Parent ((none: top level)) | `CostCentres.parentCostCentreId` | tree Branch → Department |
| Tree label "· Branch / · Department / · Project" | `CostCentres.centreType` (BRANCH / DEPARTMENT) | branch nodes also carry `branchId` |
| Owner | `CostCentres.ownerEmployeeId` / `Projects.ownerEmployeeId` | → `HumanResources.Employees` |
| Annual budget (Rs) | `CostCentres.annualBudget` / `Projects.budgetAmount` | branch budget = Σ children |
| Dates (Oct 2026 → Jun 2027) | `Projects.startDate`, `endDate` | |
| Status badge In progress / Planning (projects), Active (centres) | `Projects.status` (PLANNING, IN_PROGRESS, ON_HOLD, COMPLETED, CANCELLED) / `CostCentres.status` | |
| Colour tile | `Projects.colour` | |
| Tags (#opex, #capex …) | `CostCentres.tags` / `Accounting.ProjectTags.tag` | |
| Tree icon | `CostCentres.icon` | |
| KPIs Budget YTD / Actual to date / Remaining / % used ring | `Accounting.getCostCentreActuals` (+ `BudgetVersionLines` or `annualBudget`) | |
| Budget vs actual by category (Salaries & benefits, Rent & utilities …) | `Accounting.getCostCentreActuals` grouped by account group | category mapping **[simulated]** |
| Project P&L (Revenue, Direct cost, Allocated overheads, Margin, target 18%) | `Accounting.getProjectProfitAndLoss` | overhead 6% and target **[simulated]**; `Projects.expectedRevenue` |
| Burn chart (cumulative actual vs budget, run-rate forecast) | `Accounting.getCostCentreActuals` monthly | forecast computed client-side |
| Top transactions (Date, Voucher, Description, Party, Amount) | `Accounting.getGeneralLedger` filtered by `costCentreId` / `projectId` | |
| KPI Cost centres / Active projects / Opex spend YTD / Auto-allocated | counts; Σ lines with `allocationRuleId` | |
| Allocation rule (Office rent · 5110-01 Rent · by Floor area · tags) | `CostAllocationRules.name`, `accountId`, `basis`, `tags` | |
| Split bar (Finance 25%, Sales 35% …) | `CostAllocationSplits.costCentreId`, `percent` | Σ = 100% (deferred constraint trigger) |

**Statuses.** Project PLANNING → IN_PROGRESS → (ON_HOLD) → COMPLETED / CANCELLED (no new postings once COMPLETED/CANCELLED). Centre/rule ACTIVE ⇄ INACTIVE.
**Actions → effects.** *New centre / project*, *Edit* → upsert · *New rule* → `CostAllocationRules` + splits · *On posting* a voucher line on a rule's account is split into one line per split (`VoucherLines.allocationRuleId`, `costCentreId`) · *Budget variance* → `app/budgets/variance` · *Open in GL* → `app/reports/gl`.
**Permission.** `cc:view`, `cc:manage`, `alloc:manage` · **Approval.** —

---

### Recurring Templates — `app/accounting/recurring`
*Source:* `src/40-acc-core.html` (section `app/accounting/recurring`, modal `Accounting-new-recurring`) · `src/94-purchase-docs.js` (`TPL` templates used by New Voucher "Import from template")
**Purpose.** Generate rent, accruals, depreciation and loan-instalment vouchers automatically on a schedule.
**Tables.** Primary: `Accounting.RecurringVoucherTemplates`, `Accounting.RecurringVoucherTemplateLines`, `Accounting.RecurringVoucherRuns` · Reads: `Accounting.ChartOfAccounts`, `Company.Branches`, `Accounting.Vouchers` · Writes: the three primary tables; generated `Accounting.Vouchers` / `Accounting.VoucherLines` (`recurringTemplateId`)
**Functions.** Save → `Accounting.recurringVoucherTemplateAddUpdate` · Open → `Accounting.getRecurringVoucherTemplateInfo`
**Lookups.** `RecurringVoucherTemplates.voucherType` → `RecurringVoucherTemplateVoucherType` · `RecurringVoucherTemplates.frequency` → `RecurringVoucherTemplateFrequency` · `RecurringVoucherTemplates.endMode` → `RecurringVoucherTemplateEndMode` · `RecurringVoucherTemplates.status` → `RecurringVoucherTemplateStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Template + sub-line (Dr 5220-01 · Cr 2150-01 / Vendor contract SC-22) | `RecurringVoucherTemplates.name`, `description` | |
| Type JV / BPV / CPV | `RecurringVoucherTemplates.voucherType` | BPV/CPV need `cashBankAccountId` |
| Frequency (Monthly · 1st / Monthly · last day / Quarterly · 25th / Yearly · 30 Jun) | `frequency`, `runDay`, `runOnLastDay`, `runMonth`, `runWeekday` | NONE = on-demand voucher template |
| Next run / Last run | `nextRunDate`, `lastRunDate` | |
| Amount | `RecurringVoucherTemplates.amount` | Σ debit lines (trigger) |
| Auto-post switch | `autoPost` | |
| Status Active / Paused / Failed | `status` (ACTIVE / PAUSED / FAILED) | `lastError` "Period locked — Sep" |
| Chips Monthly / Quarterly / Yearly / Paused (counts) | filters on `frequency`, `status` | |
| KPIs Active templates · Due this week · Monthly value · Failed runs | aggregates; `Accounting.RecurringVoucherRuns` (status FAILED) | |
| Modal: Template name * | `name` | unique per tenant |
| Voucher type · Frequency · Day of period (1st/5th/15th/Last day) | as above | |
| Start date | `startDate` | |
| End after (Never / 12 occurrences / On date…) | `endMode`, `endAfterCount`, `endOnDate` | |
| Branch | `branchId` | |
| Lines: Account, Narration, Debit, Credit, Totals | `RecurringVoucherTemplateLines.accountId`, `narration`, `debit`, `credit` | party / cost centre / project optional |
| Auto-post generated vouchers | `autoPost` | |
| Notify me when a run fails | `notifyOnFailure`, `notifyUserId` | → `Company.Notifications` |

**Statuses.** ACTIVE ⇄ PAUSED; ACTIVE → FAILED (run error) → ACTIVE on next success. Run: SUCCESS / FAILED / SKIPPED.
**Actions → effects.** *Create template* → insert template + lines · *Run due now* → `Accounting.recurringVoucherTemplateRun(id, date, 'MANUAL')` for each due template ("3 vouchers generated") · scheduler → same with `'SCHEDULE'` · generated voucher posts if `autoPost` (POSTING_RULES §Recurring) · *Pause / Resume / Edit* (row menu).
**Permission.** `recurring:view`, `recurring:manage`, `recurring:run` · **Approval.** —

---

### Year-end Close — `app/periods/close`
*Source:* `src/42-acc-reports.html` (section `app/periods/close`, 4-step `data-wizard`)
**Purpose.** Run pre-close checks, post year-end adjustments, transfer P&L to retained earnings and lock the year (dry run or final).
**Tables.** Primary: `Accounting.YearEndCloses`, `Accounting.YearEndAdjustments` · Reads: `Accounting.FiscalYears`, `Accounting.FiscalPeriods`, `Accounting.getTrialBalance`, `Accounting.getProfitAndLoss`, `Accounting.Vouchers` (drafts), treasury reconciliation, `FixedAssets.DepreciationRuns`, payroll runs, AR ageing · Writes: both primary tables; on FINAL: closing `Accounting.Vouchers`, `Accounting.FiscalPeriods` (LOCKED), `Accounting.FiscalYears` (CLOSED, `closingJournalEntryId`, `netProfitTransferred`), next year's `Accounting.OpeningBalances`
**Functions.** Save → `Accounting.yearEndCloseAddUpdate` · Open → `Accounting.getYearEndCloseInfo` · Actions → `Accounting.yearEndCloseCancel`
**Lookups.** `YearEndCloses.runMode` → `RunMode` · `YearEndCloses.status` → `YearEndCloseStatus` · `YearEndAdjustments.status` → `YearEndAdjustmentStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| FY select ("FY 2026-27 — dry run as at 30 Sep 2026") | `YearEndCloses.fiscalYearId`, `asAtDate` | |
| Dry run / Final close | `runMode` (DRY_RUN / FINAL) | final unlocks after year end |
| 1 Pre-close checklist (11 checks: periods closed, TB balanced, banks reconciled, depreciation, sub-ledgers = control, payroll posted, suspense nil, tax provision, inter-branch nets to zero, drafts, old debtors) | `checklist` jsonb, `checksTotal`, `checksPassed`, `checksWarning` | each item {key, label, detail, result OK/WARN/FAIL, link} |
| Re-run checks | recompute `checklist` | |
| 2 Adjustments: Adjustment, Debit, Credit, Amount, Status (Posted / Proposed / Awaiting actuary), include checkbox | `YearEndAdjustments.description`, `debitAccountId`, `creditAccountId`, `amount`, `status` (POSTED / PROPOSED / AWAITING_INPUT / EXCLUDED), `isIncluded`, `journalEntryId` | posted ones link JV-2026-000413 |
| 3 Closing entries preview (close income, close expenses, transfer to equity) | computed from `Accounting.getProfitAndLoss` | "JV-2027-CLOSE (draft)" |
| Retained earnings — opening / Add: net profit / after close | `retainedOpening`, `netProfit`, `retainedClosing` | CHECK closing = opening + profit |
| 3201 Retained Earnings | `retainedEarningsAccountId` | default from `Company.DefaultAccountMappings` |
| 4 Confirm: Closing journal (1 voucher · 13 lines) | `closingJournalEntryId` | FINAL only |
| Opening balances FY 2027-28 (balance-sheet accounts only) | `nextOpeningBatchId` | |
| Warnings acknowledged | `warningsAcknowledged` | |
| Lock all 12 periods / Carry forward / Generate audit pack / Notify … | `lockPeriods`, `carryForward`, `generateAuditPack`, `notifyUserIds` | |
| "irreversible without CEO approval" | `ceoApprovedByUserId` | required for FINAL COMPLETED |

**Statuses.** DRAFT → COMPLETED / FAILED / CANCELLED (one completed FINAL per year).
**Actions → effects.** *Run dry-run close* → stores the run, posts nothing · *Final close* → post included adjustments, post closing JV (POSTING_RULES §Year-end close), lock periods, close the year, create next-year OB batch, notify.
**Permission.** `yearend:view`, `yearend:run`, `yearend:final` · **Approval.** CEO for FINAL.

---

### Budgets — `app/budgets`
*Source:* `src/42-acc-reports.html` (section `app/budgets`, modal `Reports-new-budget`, budget editor grid)
**Purpose.** Create versioned operating, capital, department and project budgets per fiscal year and edit monthly amounts per account.
**Tables.** Primary: `Accounting.Budgets`, `Accounting.BudgetVersions`, `Accounting.BudgetVersionLines` · Reads: `Accounting.FiscalYears`, `Accounting.ChartOfAccounts`, `Accounting.CostCentres`, `Accounting.Projects`, `Company.Users`, `Accounting.getBudgetVsActual` (utilisation) · Writes: the three primary tables
**Functions.** Save → `Accounting.budgetAddUpdate` · Open → `Accounting.getBudgetInfo` · Actions → `Accounting.budgetApprove`
**Lookups.** `Budgets.budgetType` → `BudgetType` · `Budgets.seedFrom` → `SeedFrom` · `Budgets.status` → `BudgetStatus` · `BudgetVersions.status` → `BudgetVersionStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Budget + code + sub-line ("BUD-2026-01 · Jul 2026 – Jun 2027") | `Budgets.name`, `code` | `Company.getNextDocNo` style BUD-YYYY-NN |
| Type Operating / Capital / Department / Project | `Budgets.budgetType` | |
| Scope ("Company · all branches", "Sales") | `Budgets.scopeLabel`, `department`, `costCentreId`, `projectId`, `branchId` | |
| Version v1 / v2 / v3 | `Budgets.currentVersionId` → `BudgetVersions.versionNo` | |
| Owner (name + role) | `Budgets.ownerUserId` | |
| Amount | Σ `BudgetVersionLines.totalAmount` of the current version | cost lines |
| Utilised (Q1) bar + % + Rs | `Accounting.getBudgetVsActual` | |
| Status Approved / In review / Draft | `Budgets.status` (APPROVED / IN_REVIEW / DRAFT) | |
| FY 2026-27 / FY 2025-26 toggle | `Budgets.fiscalYearId` | |
| KPIs Budgeted revenue / costs / operating result / Capex utilised | aggregates of lines by class; capex vs `FixedAssets.FixedAssets` additions | |
| Editor grid: Account × Jul…Jun + FY Total | `BudgetVersionLines.accountId`, `m01`…`m12`, `totalAmount` | m01 = Jul; shown in Rs '000 |
| Monthly / Quarterly toggle, Spread evenly, Apply % uplift | client edits of `m01`…`m12` | |
| Save v4 | new `BudgetVersions` (DRAFT) + copied lines | approved versions are frozen (trigger) |
| "Jul–Sep are locked because actuals have been posted" | derived from `Accounting.FiscalPeriods.status` | |
| Version history (v1 12 May, v2 03 Jun, v3 approved by Ahmed Raza 21 Jun) | `BudgetVersions.createdAt`, `status`, `approvedByUserId`, `approvedAt` | |
| Modal: Budget name *, Fiscal year, Type, Department, Owner | `Budgets.name`, `fiscalYearId`, `budgetType`, `department`, `ownerUserId` | |
| Seed from (FY 2025-26 actuals + 10% uplift / Blank / FY 2025-26 budget (v4)) | `seedFrom`, `seedUpliftPct` | lines pre-filled at creation |
| Require approval from CEO before activation | `requiresCeoApproval` | |
| Copy from FY 2025-26 | seeds lines from prior-year actuals | |

**Statuses.** Budget DRAFT → IN_REVIEW → APPROVED. Version DRAFT → IN_REVIEW → APPROVED → SUPERSEDED (one APPROVED per budget).
**Actions → effects.** *New Budget* → `budget` + `BudgetVersions` v1 (+ seeded lines) · *Save vN* → new version · *Approve* → version APPROVED, previous SUPERSEDED, `Budgets.currentVersionId` · *Budget vs Actual* → `app/budgets/variance`.
**Permission.** `budget:view`, `budget:manage`, `budget:approve` · **Approval.** CEO when `requiresCeoApproval` (`Company.Approvals`).

---

### Budget vs Actual — `app/budgets/variance`
*Source:* `src/42-acc-reports.html` (section `app/budgets/variance`)
**Purpose.** Compare a budget version with posted actuals by month, department and account.
**Tables.** Primary: view `Accounting.getBudgetVsActual` · Reads: `Accounting.Budgets`, `Accounting.BudgetVersions`, `Accounting.BudgetVersionLines`, `Accounting.VoucherLines` / `Accounting.Vouchers` (POSTED), `Accounting.CostCentres`, `Accounting.ChartOfAccounts` · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Budget select ("FY 2026-27 Operating Budget (v3)") | `Accounting.Budgets` + `BudgetVersions` | |
| Period select (Q1 · Jul–Sep, Sep 2026, YTD, Full year) | month columns `m01`…`m12` vs `postingDate` | |
| Department chips (All, Sales, Operations, Finance, HR, IT) | `BudgetVersionLines.costCentreId` / `Vouchers.department` | |
| Branch select | `VoucherLines.branchId` | |
| KPIs Revenue actual, Costs actual, Operating result, Lines over budget | view aggregates | |
| Department KPIs (Q1 spend, Q1 budget, Variance, Utilisation) | view grouped by cost centre | |
| Chart Revenue/Costs/Result by month (Budget vs Actual) | view by month | |
| By department bars (4.36M / 3.70M · 17.8% over) | view grouped by cost centre | |
| Variance by account: Account, Budget, Actual, Variance, Variance %, Utilisation | `accountId`, `budgetAmount`, `actualAmount`, `variance`, `variancePct` | favourable positive (income: actual − budget; cost: budget − actual) |
| Insight banner ("COGS running 6.3% over budget") | derived | text **[simulated]** |

**Statuses.** — (read-only).
**Actions → effects.** *Print* · *Export* · *Edit budget* → `app/budgets` · *Review POs* → `app/purchases/orders`.
**Permission.** `budget:view` · **Approval.** —
