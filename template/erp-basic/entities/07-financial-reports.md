# 07 · Financial Reports — page → entity map (Basic)

Report screens are **views** over the single ledger (`Accounting.Vouchers` + `Accounting.VoucherLines`, POSTED and REVERSED entries only); nothing is stored. Views are defined in `database/schema/90-views.sql`.
Screens: 6 — `app/reports`, `app/reports/trial-balance`, `app/reports/pnl`, `app/reports/balance-sheet`, `app/reports/gl`, `app/reports/day-book`.

**Shared "Financial Report Studio" frame** (`src/45-studios.html` shells `data-studio="finance"` · `src/96-studio.js` `STUDIOS.finance`). Every statement screen has the same controls, which become view predicates / client options:

| UI control | Maps to | Notes |
|---|---|---|
| Period (Q1 FY 2026-27, September 2026, Year to date, Custom range; as-at date) | `postingDate` range; FY from `Accounting.FiscalYears` | |
| Branch (All branches (consolidated), Lahore HQ …) | `Accounting.VoucherLines.branchId` | |
| Comparison (Same period last year, Previous period, Budget (v3), None) | second call of the same view with the comparison range | Budget comparison is Full (`Accounting.getBudgetVsActual`) |
| Account Level (Level 2 (groups), Level 3, Level 4 (posting)) | roll-up level via `Accounting.ChartOfAccounts.parentAccountId` | |
| Zero Balances toggle / Include zero balances | filter `balance <> 0` | |
| Search (account, voucher or narration), Sort | view predicates | |
| Options: Show comparative columns, Group by account type, Show codes & notes | presentation | |
| Presets (Board pack · Q1, Month-end TB, Bank summary, Lender covenant) | client presets | saved definitions are Full (`Reports.SavedReports`) |
| Detail / Summary view, Export, Print | client | |

---

### Reports Centre — `app/reports`
*Source:* `src/45-studios.html` (section `app/reports`)
**Purpose.** Hub to find and open every report, with headline KPIs from the live books.
**Tables.** Primary: — (catalogue is static) · Reads: `Accounting.getProfitAndLoss`, `Accounting.getBalanceSheet`, `Accounting.getTrialBalance` · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Revenue YTD (▲ % vs last year) | `Accounting.getProfitAndLoss` (section REVENUE, FY to date vs prior FY) | |
| Total Assets / Total Liabilities (▲ % vs 30 Jun) | `Accounting.getBalanceSheet` | |
| Net Profit · Q1 (margin) | `Accounting.getProfitAndLoss` | |
| Status "Books balanced · TB difference Rs 0.00" | `Accounting.getTrialBalance` Σ closing Dr − Σ closing Cr | |
| Category chips (All, Financial, Sales & Purchases, Inventory, People) / report cards / search | static catalogue | links to studio routes |
| Recent runs (report, time, user, format) | — | Full only (`Reports.ReportRuns`) |
| Scheduled reports (Report, Frequency, Next run, Recipients, Format, Status) | — | Full only (`Reports.ReportSchedules`) |

**Statuses.** —
**Actions → effects.** *Generate Report* → `app/reports/pnl` · cards → studio routes · *Template Library* → Report Studio (Full).
**Permission.** `reports:view` · **Approval.** —

---

### Trial Balance — `app/reports/trial-balance`
*Source:* `src/45-studios.html` (shell `data-tab="tb"`) · `src/96-studio.js` (`tbCols`, `tbRows`)
**Purpose.** All ledger balances with movement and closing debit/credit; proves Dr = Cr.
**Tables.** Primary: view `Accounting.getTrialBalance` · Reads: `Accounting.ChartOfAccounts`, `Accounting.VoucherLines`, `Accounting.Vouchers`, `Accounting.FiscalPeriods` · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Group "Account type" (Assets, Liabilities, Equity, Income, Expenses) | `Accounting.ChartOfAccounts.accountClass` | |
| Code | `Accounting.ChartOfAccounts.code` | at the chosen level |
| Account | `Accounting.ChartOfAccounts.name` | |
| Movement Dr / Movement Cr | Σ `VoucherLines.debit` / `credit` in range | |
| Closing Debit / Closing Credit | net balance to range end, shown on its side | opening = before range start |
| Stats Closing Debits / Closing Credits / Difference | Σ of the columns | |
| Summary Opening (Dr = Cr) / Movement / Closing | view aggregates | |

**Statuses.** —
**Actions → effects.** Export / Print · row → `app/accounting/ledger`.
**Permission.** `reports.fin:view` · **Approval.** —

---

### Profit & Loss — `app/reports/pnl`
*Source:* `src/45-studios.html` (shell `data-tab="pnl"`) · `src/96-studio.js` (`plCols`, `plRows`)
**Purpose.** Income statement for a period with comparative and variance.
**Tables.** Primary: view `Accounting.getProfitAndLoss` · Reads: `Accounting.ChartOfAccounts` (class 4–5, `subType`), `Accounting.VoucherLines`, `Accounting.Vouchers`; inventory valuation for opening/closing stock lines · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Particulars (section headings, rows, subtotals) | `section`, `lineLabel` | sections from `Accounting.ChartOfAccounts.subType`: SALES → Revenue; COST_OF_SALES → Cost of sales; EMPLOYEE_COST, PREMISES, DEPRECIATION, GENERAL_EXPENSE → Operating expenses; OTHER_INCOME, FINANCE_INCOME → Other income; FINANCE_COST → Finance cost; TAXATION → Taxation |
| Less: sales returns & discounts | contra-revenue accounts (class 4, nature DR) | |
| Cost of sales: Opening stock, Purchases, Freight inward, Less: closing stock | COST_OF_SALES accounts; stock lines from `Inventory` valuation | periodic presentation **[simulated]** — perpetual ledger posts COGS directly |
| Q1 FY 2026-27 (current) | `amountCy` | |
| % Rev | `amountCy / net revenue` | |
| Q1 FY 2025-26 (comparative) | `amountPy` | |
| Variance | `amountCy − amountPy` (favourable sign per section) | |
| Gross profit / Operating profit / Profit before tax / Net profit | computed subtotals | |
| Stats Net Revenue / Gross Profit / Net Profit; Summary margins | view aggregates | |

**Statuses.** —
**Actions → effects.** Export / Print.
**Permission.** `reports.fin:view` · **Approval.** —

---

### Balance Sheet — `app/reports/balance-sheet`
*Source:* `src/45-studios.html` (shell `data-tab="bs"`) · `src/96-studio.js` (`bsCols`, `bsRows`)
**Purpose.** Statement of financial position as at a date with comparative and change.
**Tables.** Primary: view `Accounting.getBalanceSheet` · Reads: `Accounting.ChartOfAccounts` (class 1–3), `Accounting.VoucherLines`, `Accounting.Vouchers`, `Accounting.getProfitAndLoss` (profit for the period) · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Particulars (Non-current assets, Current assets, Equity, Non-current liabilities, Current liabilities) | `section` from `accountClass` + `subType` (FIXED_ASSET, DEPOSIT → non-current; BORROWING → non-current liabilities, others current) | grouping rules **[simulated]** — the prototype's own COA numbering differs |
| Note | `noteNo` | static note numbering **[simulated]** |
| 30 Sep 2026 / 30 Jun 2026 / Change | `amountCy`, `amountPy`, `change` | |
| Retained earnings — brought forward / Profit for the period | equity accounts + current-year P&L | before year-end close |
| Stats Total Assets / Total Equity / Total Liabilities; Summary Current ratio, Working capital, Assets = Equity + Liabilities | aggregates | |

**Statuses.** —
**Actions → effects.** Export / Print.
**Permission.** `reports.fin:view` · **Approval.** —

---

### General Ledger — `app/reports/gl`
*Source:* `src/45-studios.html` (shell `data-tab="gl"`) · `src/96-studio.js` (`glCols`, `glRows`)
**Purpose.** Transactions per account with running balances.
**Tables.** Primary: view `Accounting.getGeneralLedger` · Reads: `Accounting.ChartOfAccounts`, `Accounting.Vouchers`, `Accounting.VoucherLines` · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Group "Account" (1512 · HBL — 8721) | `accountCode`, `accountName` | |
| Date | `Vouchers.postingDate` | |
| Voucher | `Vouchers.docNo` (or `sourceDocNo`) | |
| Narration + detail (cheque, bill, payroll ref) | `VoucherLines.particulars` / `Vouchers.narration`; `referenceNo`, `instrumentNo` | |
| Debit / Credit | `VoucherLines.debit` / `credit` | |
| Balance ("8,010,000 Dr") | running balance | window `SUM(debit − credit) OVER (PARTITION BY account ORDER BY postingDate, docNo, lineNo)` + opening |
| Opening balance row | Σ before range start | |
| Stats Accounts / Entries / Total Debits; Summary Total credits, Accounts listed | aggregates | |

**Statuses.** —
**Actions → effects.** Voucher link → `app/accounting/vouchers/view`.
**Permission.** `reports.fin:view` · **Approval.** —

---

### Day Book — `app/reports/day-book`
*Source:* `src/45-studios.html` (shell `data-tab="daybook"`) · `src/96-studio.js` (`dbCols`, `dbRows`)
**Purpose.** Every voucher posted on a single day, by voucher category.
**Tables.** Primary: view `Accounting.getDayBook` · Reads: `Accounting.Vouchers`, `Accounting.VoucherLines`, `Accounting.ChartOfAccounts`, `Company.Users` · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Group "Voucher type" (Cash, Bank, Purchases, Sales, Journal) | `book` derived from `voucherType` / `sourceDocType` (CPV/CRV → Cash; BPV/BRV/CON → Bank; BILL/PV/GRN/DN → Purchases; INV/SV/CN/RCPT → Sales; else Journal) | |
| Time | `Vouchers.postedAt` (local time) | |
| Voucher | `docNo` / `sourceDocNo` | INV-…, BILL-…, CN-… for system postings |
| Debit account(s) | string_agg of debit-line accounts | |
| Credit account(s) (detail line "Cr 4101 Sales · 2210 Sales tax") | string_agg of credit-line accounts | |
| Narration | `Vouchers.narration` | |
| By | `Vouchers.preparedByUserId` / `postedByUserId` | |
| Debit / Credit | `totalDebit` / `totalCredit` | |
| Stats Vouchers Posted / Total Debits / Sales Invoiced; Status Balanced | aggregates | |

**Statuses.** —
**Actions → effects.** Voucher link → voucher view / source document.
**Permission.** `reports.fin:view` · **Approval.** —
