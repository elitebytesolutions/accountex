# 13 · Payroll — page → entity map (FULL edition only)

Schema: `database/schema/12-payroll.sql` · cross-module FKs: `database/fk/12-Payroll-fks.sql` · posting: POSTING_RULES §Payroll.
Screens: 8. Shared with ESS: `Payroll.Payslips`, `Payroll.LoansAndAdvances`, `Payroll.TaxDeclarations` (see `14-ess.md`).

Doc types: `PRUN` (off-cycle / bonus runs `PR-2026-OFF-02`; regular runs are numbered `PR-YYYY-MM` by `Payroll.getNextPayrollRunNo`), `PS` (`PS-2026-09-0047`, pattern `{PREFIX}-{YYYY}-{MM}-{SEQ4}`, monthly reset), `LN` (loans incl. medical), `ADV` (salary advances), `FS` (`FS-2026-007`).

---

### Payroll Overview — `app/hr/payroll`
*Source:* `src/48-dash-stock.html` (section `data-route="app/humanresources/Payroll"`)
**Purpose.** Dashboard of the last posted run, the next run's timeline and recent runs.
**Tables.** Primary: views · Reads: `Payroll.PayrollRuns`, `Payroll.PayrollRunLines`, `Payroll.PayrollRunLineComponents`, `HumanResources.Departments`, `Accounting.Vouchers`, `Accounting.BudgetVersionLines` (budget series) · Writes: —
| UI field / column | Table.column | Notes |
|---|---|---|
| Header "September 2026 run PR-2026-09 · 186 employees across 4 branches · posted via JV-2026-000412" | `PayrollRuns.docNo`, `.employeeCount`, `PayrollRunBranches`, `.journalEntryId` → `Accounting.Vouchers.docNo` | latest run with status POSTED/PAID |
| KPI Gross salary · vs Aug · paid | `PayrollRuns.grossAmount`, `.employeeCount` | vs previous REGULAR run |
| KPI Net pay · Paid 30 Sep · Of gross · Avg | `PayrollRuns.netAmount`, `.paidAt` | avg = net ÷ employeeCount |
| KPI Income tax u/s 149 · Due 15 Oct · Taxable 132 | `PayrollRuns.taxAmount`; count of `PayrollRunLines.taxAmount > 0` | due date = 15th of next month (rule) |
| KPI EOBI (employee + employer) · Insured · Employer | `sum(PayrollRunLines.eobiAmount + employerEobiAmount)` | `Payroll.getEobiStatement` |
| Payroll cost · 12 months (Salaries / Allowances & bonus / Budget, Monthly/Quarterly) | `Payroll.getMonthlyPayrollCost` | budget from `Accounting.BudgetVersionLines` on salary accounts |
| October 2026 run timeline (cut-off 25 Oct, inputs freeze, review, approval, post, deposit 15 Nov) | `PayrollRuns.attendanceCutoffDate`, `.inputsFrozenAt`, `.checkedAt`, `.approvalRequestId`, `.postedAt`, `.status` (DRAFT) | deposit step = `createDepositReminders` |
| Cost by department (share %, heads, Rs, avg) | `Payroll.getPayrollCostByDepartment` | from `PayrollRunLines.departmentId` |
| September breakdown Gross → CTC (tax, EOBI 1%, PF 8%, loans, net, employer EOBI·PESSI·PF, total CTC) | `PayrollRuns.grossAmount, taxAmount, eobiEmployeeAmount, pfEmployeeAmount, loanAmount, netAmount, employerContributionAmount` | CTC = gross + employerContributionAmount |
| Recent payroll runs: Run #, Period, Employees, Gross, Deductions, Net, Journal, Status | `PayrollRuns.docNo, payrollMonth, employeeCount, grossAmount, deductionAmount, netAmount, journalEntryId, status` | off-cycle row links to `FinalSettlements` |
**Statuses.** run badges: Draft · Posted · Pending approval (= AWAITING_APPROVAL).
**Actions → effects.** *Run Payroll* → `app/hr/payroll/run` · *Statutory Reports* → `app/hr/payroll/reports` · *Salary Structures* → structures.
**Permission.** `Payroll:view` · **Approval.** —

---

### Run Payroll — `app/hr/payroll/run`
*Source:* `src/51-hr-pay-talent.html` (section `data-route="app/humanresources/Payroll/run"`, 5-step wizard)
**Purpose.** Create, calculate, approve and post a monthly (or off-cycle / bonus) payroll run.
**Tables.** Primary: `Payroll.PayrollRuns`, `Payroll.PayrollRunBranches`, `Payroll.PayrollAdjustments`, `Payroll.PayrollRunLines`, `Payroll.PayrollRunLineComponents`, `Payroll.PayrollRunChecklistItems`, `Payroll.SalaryPaymentBatches` · Reads: `Payroll.EmployeeSalaries`, `Payroll.SalaryStructures(Component)`, `Payroll.SalaryComponents`, `Payroll.LoanInstallments`, `Payroll.TaxDeclarations`, `Payroll.SalaryTaxSlabs`, `HumanResources.Employees`, `HumanResources.AttendanceRegister`, `HumanResources.OvertimeClaims`, `HumanResources.LeaveRequests`, `HumanResources.Offboardings`, `BankCash.ExpenseClaims`, `Company.Branches`, `Accounting.ChartOfAccounts` · Writes: `Payroll.*` above, `Payroll.Payslips`, `Payroll.LoanInstallments` (RECOVERED), `Accounting.Vouchers`/`VoucherLines`, `Company.Approvals`, `Company.Notifications`, `HumanResources.AttendanceRegister` (missing-punch "Treat as"; on post `lockedAt` + `payrollRunId` → "locked for payroll PR-2026-09"), `HumanResources.OvertimeClaims.payrollRunId` ("Push to payroll"), `HumanResources.LeaveAdjustments.payrollRunId` (encashment) — those HR → payroll FKs live in `fk/11-HumanResources-fks.sql`
**Functions.** Save → `Payroll.payrollRunAddUpdate` · Open → `Payroll.getPayrollRunInfo` · Actions → `Payroll.payrollRunApprove`, `Payroll.payrollRunPost`, `Payroll.payrollRunCancel`, `Payroll.payrollRunReverse`
**Lookups.** `PayrollRuns.runType` → `RunType` · `PayrollRuns.status` → `PayrollRunStatus` · `PayrollAdjustments.inputSource` → `InputSource` · `PayrollRunLines.taxStatus` → `TaxStatus` · `PayrollRunLines.payMode` → `BankTransferChequeCashPayMode` · `PayrollRunLineComponents.componentType` → `ComponentType` · `SalaryPaymentBatches.paymentMethod` → `SalaryPaymentBatchPaymentMethod` · `SalaryPaymentBatches.fileFormat` → `FileFormat` · `SalaryPaymentBatches.status` → `SalaryPaymentBatchStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Header "PR-2026-10 · Period 01–31 Oct · Pay date 31 Oct · Draft saved by Ayesha Noor, 01 Oct 10:42" | `PayrollRuns.docNo, periodFrom, periodTo, payDate, status, updatedBy, updatedAt` | *Save draft* = UPDATE |
| **Step 1** Payroll month * | `PayrollRuns.payrollMonth` | 1st of month; docNo `PR-2026-10` |
| Period from / Period to | `PayrollRuns.periodFrom / periodTo` | |
| Pay date * | `PayrollRuns.payDate` | |
| Attendance cut-off | `PayrollRuns.attendanceCutoffDate` | settings default "25th of month" (`Company.CompanySettingValues`) |
| Run type Regular / Off-cycle / Bonus only | `PayrollRuns.runType` REGULAR / OFF_CYCLE / BONUS_ONLY | |
| Pay group | `PayrollRuns.payGroupId` → `Payroll.PayGroups` | NULL = All pay groups |
| Salary payable account (2140) | `PayrollRuns.salaryPayableAccountId` → `Accounting.ChartOfAccounts` | |
| Branch checkboxes Lahore HQ (98) … | `PayrollRunBranches.branchId, employeeCount, isIncluded` | |
| Include employees on notice period / exited in period | `PayrollRuns.includeNoticePeriod / includeExited` | exits go to `FinalSettlements` |
| Run Summary: employees in scope, new joiners, exits, on notice, revisions, working days, public holidays | `PayrollRuns.workingDays, publicHolidays`; counts from `HumanResources.Employees`, `Payroll.EmployeeSalaries.effectiveFrom`, `HumanResources.Offboardings` | counts [derived] |
| Banner "Previous period locked — PR-2026-09 is posted" | previous `PayrollRuns.status IN (POSTED, PAID)` | changes need reversal |
| **Step 2** KPIs Attendance Sync 183/187, Approved Overtime hrs/Rs, Unpaid Leave days/Rs, Loan Installments Rs/count | `HumanResources.AttendanceRegister`, `HumanResources.OvertimeClaims`, `HumanResources.LeaveRequests` (LWP), `Payroll.LoanInstallments` (dueMonth = payrollMonth) | |
| Input Sources list (Attendance register, Overtime, Leave without pay, Loans & advances, Salary revisions) + badges | `PayrollAdjustments.inputSource` ATTENDANCE / OVERTIME / LEAVE_WITHOUT_PAY / LOAN / SALARY_REVISION | *Re-sync* rebuilds auto inputs |
| Missing Punches: Employee, Date, Treat as Present / Absent (LWP) / Half day | `HumanResources.AttendanceRegister` (HR owned) | adds flag MISSING_PUNCH on `PayrollRunLines.flags` |
| Arrears, Bonuses & One-time Adjustments: Employee, Component, Type, Amount (Rs), Taxable, Remarks | `PayrollAdjustments.employeeId, componentId, (SalaryComponents.componentType), amount, isTaxable, remarks` | *Import CSV* → `inputSource = CSV_IMPORT`; *Add line*; delete row |
| Net one-time adjustments / Earnings / Deductions | sums of `PayrollAdjustments.amount` by componentType | [derived] |
| **Step 3** warnings banner (variance >15%, missing IBAN, negative-net risk, pro-rata joiners) | `PayrollRunLines.flags` VARIANCE_ABOVE_15 / MISSING_IBAN / NEGATIVE_NET_RISK / PRO_RATA | *Show only flagged* |
| KPIs Gross, Income Tax, EOBI + PF (Emp.), Loans, Net Pay with ▲ vs Sep | `PayrollRuns.grossAmount, taxAmount, eobiEmployeeAmount + pfEmployeeAmount, loanAmount, netAmount` | via `Payroll.refreshPayrollRunTotals` |
| Lines: Employee, Dept, Paid days, Gross, Tax, EOBI, PF, Loan, Net, vs Sep | `PayrollRunLines.employeeId, departmentId, paidDays, grossAmount, taxAmount, eobiAmount, pfAmount, loanAmount, netAmount, variancePct` | chips All / Flagged / New (`isNewJoiner`) / Revised (`isRevised`) |
| Department filter, search | `PayrollRunLines.departmentId`, `HumanResources.Employees` | |
| *Payroll register* (XLSX) | `Payroll.getPayrollRegister` | |
| **Step 4** Approval Workflow timeline (Prepared — Ayesha Noor, Checked — Hira Ali, Finance approval — Sana Javed, Final approval — CEO > Rs 20M) | `PayrollRuns.preparedByUserId/preparedAt`, `checkedByUserId/checkedAt`, `approvalRequestId` → `Company.Approvals` / `ApprovalActions` | "Payroll > Rs 10M requires two-level approval" = `Company.ApprovalWorkflowConditions` |
| Approver comment | `Company.ApprovalActions.comment` | |
| *Approve* / *Send back* / *Reject* | `PayrollRuns.status` AWAITING_APPROVAL → APPROVED / REVIEW / REJECTED | |
| Pre-posting Checklist 8 of 10 | `Payroll.PayrollRunChecklistItems.itemKey, label, isDone, doneByUserId, doneAt` | |
| **Step 5** GL Journal Preview JV-2026-000451 (Account, Cost centre, Debit, Credit, Balanced) | built from `PayrollRunLineComponents` × `SalaryComponents.debitAccountId/creditAccountId`, `PayrollRunLines.costCentreId/departmentId`; posted to `Accounting.Vouchers` | see POSTING_RULES §Payroll run |
| Bank Transfer Files (Meezan 0123 · 142 · .txt; HBL 8721 IBFT · 38 · .csv; Cheque/Cash · 7) | `Payroll.SalaryPaymentBatches.paymentMethod, bankAccountId, fileFormat, employeeCount, totalAmount`; `PayrollRunLines.paymentBatchId` | *Meezan file* / *HBL IBFT file* → `fileAttachmentId`; *Bank advice* → `adviceAttachmentId` |
| After posting switches: Email payslips (password = CNIC last 5), Publish to ESS, SMS net-pay alert, Create tax & EOBI deposit reminders | `PayrollRuns.emailPayslips, publishToEss, smsNetPayAlert, createDepositReminders` | |
| Banner "Posting will lock PR-2026-10, create JV-2026-000451 and mark 31 loan installments as recovered" | `PayrollRuns.status` POSTED, `.journalEntryId`, `LoanInstallments.status = RECOVERED, payrollLineId` | |
**Statuses.** DRAFT → REVIEW (calculated) → AWAITING_APPROVAL → APPROVED → POSTED → PAID · REJECTED · CANCELLED · REVERSED. `wizardStep` 1–5 mirrors the stepper. Lines/inputs are frozen once the run leaves DRAFT/REVIEW (`Payroll.triggerGuardRunChildren`).
**Actions → effects.** *Continue to inputs* → persist step 1, create `PayrollRunBranches` · *Calculate & review* → build `PayrollRunLines` + `PayrollRunLineComponents`, `refreshPayrollRunTotals`, status REVIEW · *Submit for approval* → `Company.Approvals`, status AWAITING_APPROVAL · *Post & Pay* → `Accounting.Vouchers` (POSTING_RULES §Payroll run), `Payroll.Payslips` rows (status GENERATED → EMAILED), `LoanInstallments` RECOVERED, `SalaryPaymentBatches` GENERATED, `Company.Notifications` (ESS), status POSTED; bank confirmation → PAID + payment JV (§Salary payment).
**Permission.** `Payroll:run` (steps 1–3), `Payroll:approve` (step 4), `Payroll:post` (step 5) · **Approval.** workflow `PAYROLL_RUN` (Payroll Officer → HR Manager → Finance Manager; CEO when gross > Rs 20,000,000).

---

### Salary Structures — `app/hr/payroll/structures`
*Source:* `src/51-hr-pay-talent.html` (section `data-route="app/humanresources/Payroll/structures"`, modal `#pay-component`)
**Purpose.** Maintain salary components and grade-wise structures.
**Tables.** Primary: `Payroll.SalaryComponents`, `Payroll.SalaryStructures`, `Payroll.SalaryStructureComponents`, `Payroll.SalaryStructureCommissionTiers` · Reads: `Accounting.ChartOfAccounts`, `HumanResources.Grades`, `Payroll.EmployeeSalaries` (employee counts) · Writes: same
**Functions.** Save → `Payroll.salaryComponentAddUpdate` · Open → `Payroll.getSalaryComponentInfo` ‖ Save → `Payroll.salaryStructureAddUpdate` · Open → `Payroll.getSalaryStructureInfo`
**Lookups.** `SalaryComponents.componentType` → `ComponentType` · `SalaryComponents.calcMethod` → `SalaryComponentCalcMethod` · `SalaryComponents.baseBasis` → `BaseBasis` · `SalaryComponents.taxTreatment` → `TaxTreatment` · `SalaryComponents.systemRole` → `SystemRole` · `SalaryComponents.status` → `ActiveInactiveStatus` · `SalaryStructures.structureKind` → `StructureKind` · `SalaryStructures.status` → `SalaryStructureStatus` · `SalaryStructureComponents.calcMethod` → `SalaryComponentCalcMethod` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Tab Components (17), chips All / Earnings 8 / Deductions 5 / Employer 4 | `SalaryComponents.componentType` | |
| Code | `SalaryComponents.code` | BAS, HRA, MED, UTL, CNV, FUL, COM, OVT, ITX, EOB, PFE, LON, ADV, EOR, PSI, PFR, GRT |
| Component | `SalaryComponents.name` | |
| Type badge Earning / Deduction / Employer | `SalaryComponents.componentType` EARNING / DEDUCTION / EMPLOYER_CONTRIBUTION | |
| Calculation ("45% of Basic", "FBR slab on projected annual taxable", "From loan schedule") | `SalaryComponents.calcMethod, percent, baseComponentId, formula, calcDescription` | SYSTEM for ITX/LON/ADV |
| Taxable (Yes / "Exempt ≤ 10% basic" / "Exempt ≤ Rs 150,000 p.a." / —) | `SalaryComponents.taxTreatment, exemptLimitPercentOfBasic, exemptLimitAnnualAmount` | |
| GL account (5110 · 2152 · "5115 / 2155") | `SalaryComponents.debitAccountId`, `creditAccountId` | |
| Payslip checkbox | `SalaryComponents.showOnPayslip` | |
| Modal: Code *, Name *, Type * | `code, name, componentType` | |
| Calculation (Percentage of component / Fixed amount / Formula / Monthly input) | `calcMethod` PERCENT_OF / FIXED / FORMULA / MONTHLY_INPUT | |
| Percentage · Of component (Basic Salary (BAS) / Gross) | `percent`, `baseBasis` (COMPONENT / GROSS), `baseComponentId` | EOB/PSI use `baseBasis = EOBI_WAGE`, `wageCeiling` 37,000 |
| Formula (advanced) `ROUND(BAS * 0.45, 0)` | `formula` | |
| Debit account | `debitAccountId` | |
| Tax treatment (Fully taxable / Exempt up to limit / Exempt) | `taxTreatment` | |
| Pro-rate on paid days | `prorateOnPaidDays` | |
| Show on payslip · Include in gratuity base · Include in EOBI wage | `showOnPayslip, includeInGratuityBase, includeInEobiWage` | |
| Tab Structures & Grades (6): badge G1…G5 / S1, title | `SalaryStructures.code, name, structureKind, gradeId` | |
| "Basic Rs 32,000 – 45,000 · 48 employees" | `SalaryStructures.basicMin, basicMax`; count of current `EmployeeSalaries` | |
| Rows Basic B · HRA B × 45% · Conveyance Rs 3,000 · Fuel 120 L × OGRA · Car & Fuel Company maintained | `SalaryStructureComponents.componentId, percent, fixedAmount, quantity, displayText` | |
| Gross (mid) | `SalaryStructures.grossMid` | |
| S1 tiers Below 90% 0% · 90–100% 1.0% · Above 100% 1.5% · Cap 50% of Basic | `SalaryStructureCommissionTiers.achievementFromPct, achievementToPct, commissionRatePct`; `SalaryStructures.commissionCapPercentOfBasic` | |
| Formula example banner (G2 at Basic 85,000 = 145,250) | computed from structure | [derived] |
**Statuses.** component ACTIVE / INACTIVE · structure DRAFT → ACTIVE → RETIRED.
**Actions → effects.** *New Component* / pencil → INSERT/UPDATE `SalaryComponents` (audited) · *Duplicate structure* → copy `SalaryStructures` (+ components, tiers) as DRAFT with `copiedFromStructureId` · *Export* → XLSX of components.
**Permission.** `Payroll:structure` · **Approval.** —

---

### Payslips — `app/hr/payroll/payslips`
*Source:* `src/51-hr-pay-talent.html` (section `data-route="app/humanresources/Payroll/payslips"`, modal `#pay-email-slips`)
**Purpose.** List, email, print and download the payslips of a run.
**Tables.** Primary: `Payroll.Payslips` · Reads: `Payroll.PayrollRuns`, `Payroll.PayrollRunLines`, `HumanResources.Employees`, `HumanResources.Departments`, `HumanResources.EmployeeBankAccounts`, `Company.Branches` · Writes: `Payroll.Payslips` (status, emailedAt…), `Company.Notifications`, `Company.Attachments` (ZIP/PDF)
**Functions.** Save → `Payroll.payslipAddUpdate` · Open → `Payroll.getPayslipInfo`
**Lookups.** `Payslips.status` → `PayslipStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Header "Run PR-2026-09 · 186 payslips · Posted 29 Sep · Paid 30 Sep" | `PayrollRuns.docNo, postedAt, paidAt`; count(`payslip`) | |
| KPIs Generated / Emailed (% delivered) / Viewed in ESS (open rate) / Bounced-No email | count by `Payslips.status`, `generatedAt`, `emailedAt`, `viewedAt` | `Payroll.getPayslipDeliverySummary` |
| Filters: run (month · PR), department, branch, search | `Payslips.payrollRunId`, `PayrollRunLines.departmentId`, `PayrollRunLines.branchId`, `HumanResources.Employees` | |
| Chips All / Emailed / Viewed / Not sent | `Payslips.status` (Not sent = GENERATED + NO_EMAIL) | |
| Employee · EMP code · designation | `Payslips.employeeId` → `HumanResources.Employees` | |
| Department · branch | `PayrollRunLines.departmentId, branchId` | snapshot |
| Bank (Meezan ••4567 / Cash) | `PayrollRunLines.bankName, ibanMasked, payMode` | |
| Gross / Deductions / Net Pay | `Payslips.grossAmount, deductionAmount, netAmount` | |
| Status Viewed / Emailed / On hold / No email / Bounced + time/reason | `Payslips.status`, `viewedAt` / `emailedAt` / `holdReason` / `printedAt` / `bounceReason` | |
| Email modal: Recipients (Not yet emailed / Selected / All), Subject, Message, Password-protect PDF, Also notify in ESS | `Payslips.emailTo, emailedAt, emailCount, isPasswordProtected, publishedToEssAt`; message → `Company.Notifications` | template `Company.DocumentTemplates` |
**Statuses.** GENERATED → EMAILED → VIEWED · NO_EMAIL · BOUNCED · ON_HOLD (line on hold, e.g. paid in final settlement).
**Actions → effects.** *Download all (ZIP)* → `Company.Attachments` · *Email payslips / Email selected* → queue mail, status EMAILED or BOUNCED/NO_EMAIL · *Print selected* → `printedAt` · eye → payslip view.
**Permission.** `payslip:view`, `payslip:email` · **Approval.** —

---

### Payslip view — `app/hr/payroll/payslip`
*Source:* `src/51-hr-pay-talent.html` (section `data-route="app/humanresources/Payroll/payslip"`)
**Purpose.** Printable salary slip of one employee for one month.
**Tables.** Primary: `Payroll.Payslips`, `Payroll.PayrollRunLines`, `Payroll.PayrollRunLineComponents` · Reads: `Company.CompanySettings` (name, address, NTN, EOBI Reg., PESSI), `HumanResources.Employees`, `HumanResources.EmployeeStatutoryDetails`, `HumanResources.Designations`, `HumanResources.Departments`, `HumanResources.Grades`, `HumanResources.LeaveBalances`, `Payroll.SalaryStructures`, `Payroll.LoansAndAdvances`, `Payroll.SalaryTaxSlabs`, `Payroll.getEmployeePayYearToDate`, `Payroll.getProvidentFundRegister` · Writes: `Payroll.Payslips` (emailedAt, printedAt)
**Functions.** Save → `Payroll.payslipAddUpdate` · Open → `Payroll.getPayslipInfo` ‖ Save → `Payroll.payrollRunAddUpdate` · Open → `Payroll.getPayrollRunInfo` · Actions → `Payroll.payrollRunApprove`, `Payroll.payrollRunPost`, `Payroll.payrollRunCancel`, `Payroll.payrollRunReverse`
**Lookups.** `Payslips.status` → `PayslipStatus` · `PayrollRunLines.taxStatus` → `TaxStatus` · `PayrollRunLines.payMode` → `BankTransferChequeCashPayMode` · `PayrollRunLineComponents.componentType` → `ComponentType` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Company header (name, address, NTN, EOBI Reg., PESSI) | `Company.CompanySettings` | |
| Slip # PS-2026-09-0047, month | `Payslips.docNo, payrollMonth` | |
| Employee, code, designation, department, CNIC, branch, date of joining, EOBI No. | `HumanResources.Employees`, `HumanResources.EmployeeStatutoryDetails`; `PayrollRunLines.departmentId, branchId` | |
| Grade "G2 + Commission Plan S1" | `PayrollRunLines.structureId` / `EmployeeSalaries.structureId + addonStructureId` | |
| Tax status Filer (ATL) | `PayrollRunLines.taxStatus` | |
| Days in month, Paid days, Leave taken, LWP, Overtime hrs | `PayrollRunLines.daysInMonth, paidDays, leaveTakenDays, lwpDays, overtimeHours` | |
| Earnings rows (Basic, HRA (45%), Medical (10%), Utilities, Conveyance, Fuel, Sales Commission (Aug sales)) | `PayrollRunLineComponents` (EARNING) `.label, basisText, amount` | |
| Deductions rows (Income Tax u/s 149, EOBI (1%), PF (8% of Basic), Loan Installment (LN-2026-014 · 3/12), Salary Advance) | `PayrollRunLineComponents` (DEDUCTION) `.label, amount, loanId` | |
| Gross Earnings / Total Deductions / Net Pay / Amount in words | `Payslips.grossAmount, deductionAmount, netAmount, netAmountWords` | |
| Year-to-Date (gross, tax, EOBI, PF, loan recovered, net) | `Payroll.getEmployeePayYearToDate` | FY from `Company.getFiscalYearLabel` |
| Tax Computation (projected annual salary, medical exempt, taxable income, slab, annual liability, monthly) | `PayrollRunLines.projectedAnnualSalary, annualExemptAmount, annualTaxableIncome, taxSlabId, annualTaxLiability, taxAmount` | |
| Payment: Mode, Bank, IBAN, Transfer ref | `PayrollRunLines.payMode, bankName, ibanMasked, paymentRef` | |
| Loan outstanding / PF balance (emp + er) | `Payroll.LoansAndAdvances.outstandingAmount`; `Payroll.getProvidentFundRegister` | |
| Footer leave balance (Annual 11, Casual 6, Sick 8) | `HumanResources.LeaveBalances` | |
| "Viewed by employee 30 Sep 2026 18:12" | `Payslips.viewedAt` | |
**Statuses.** as Payslips.
**Actions → effects.** *Email* → `emailedAt`, `emailCount` · *PDF* → `pdfAttachmentId` · *Print* → `printedAt` · *Profile* → `app/hr/employees/view`.
**Permission.** `payslip:view` · **Approval.** —

---

### Payroll Reports — `app/hr/payroll/reports`
*Source:* `src/45-studios.html` (`data-studio="Payroll" data-tab="register"`) · `src/96-studio.js` (studio `Payroll`: regCols, advCols, eobiCols, pessiCols, s149Cols, pfCols)
**Purpose.** Payroll Report Studio: register, bank advice and statutory returns from posted runs.
**Tables.** Primary: views (below) · Reads: `Payroll.PayrollRuns`, `Payroll.PayrollRunLines`, `Payroll.PayrollRunLineComponents`, `Payroll.SalaryPaymentBatches`, `HumanResources.Employees`, `HumanResources.EmployeeStatutoryDetails`, `HumanResources.EmployeeBankAccounts`, `HumanResources.Departments`, `Company.Branches`, `Reports.SavedReports` (saved presets) · Writes: `Reports.ReportRuns` (exports)
| UI field / column | Table.column | Notes |
|---|---|---|
| Filters Pay Month (run), Department, Branch, Pay Group (All / Management / Staff), search, sort | `PayrollRuns.id`, `PayrollRunLines.departmentId, branchId`, `HumanResources.Employees.payGroup` (MANAGEMENT / STAFF) | not `Payroll.PayGroups` (run scope) |
| **Payroll Register**: Employee, Basic, Allowances, Gross, Tax, EOBI, PF, Net Pay (group by department) | `Payroll.getPayrollRegister` | KPIs employees, gross, net |
| **Bank Advice**: Employee, Bank / Mode, Account / IBAN, Amount (group by bank); Instruction ref BA-2026-09, Sent, Value date | `Payroll.getSalaryBankAdvice` | `SalaryPaymentBatches.instructionRef, sentAt, valueDate` |
| **EOBI PR-01**: EOBI No., Employee, CNIC, Days, Wages, Employee 1%, Employer 5%, Total (group by branch); minimum wage, due date | `Payroll.getEobiStatement` | |
| **PESSI**: Employee, PESSI No., Contributory Wages, Employer 6% (Punjab branches; Karachi under SESSI) | `Payroll.getPessiStatement` | |
| **Salary Tax u/s 149**: Employee, CNIC / NTN, Taxable Salary, Annual Projection, Tax · month, Tax YTD; IRIS status, CPR due | `Payroll.getSalaryTaxStatement` | CPR from `Tax.WhtChallans` |
| **PF Register**: Employee, Opening, Employee 8%, Employer 8%, Profit, Closing | `Payroll.getProvidentFundRegister` | profit rate is [simulated] (PF trust data not modelled) |
| Presets (Monthly register, Bank upload, EOBI filing, Management only) | `Reports.SavedReports` | |
**Statuses.** —
**Actions → effects.** Export / print / schedule → `Reports.ReportRuns`, `Reports.ReportSchedules`.
**Permission.** `payrollReport:view` · **Approval.** —

---

### Loans & Advances — `app/hr/loans`
*Source:* `src/51-hr-pay-talent.html` (section `data-route="app/humanresources/loans"`, drawer `#pay-loan-review`, modal `#pay-new-loan`)
**Purpose.** Manage staff loans and salary advances recovered through payroll.
**Tables.** Primary: `Payroll.LoansAndAdvances`, `Payroll.LoanInstallments` · Reads: `HumanResources.Employees`, `HumanResources.Departments`, `Payroll.EmployeeSalaries`, `Payroll.getProvidentFundRegister`, `BankCash.BankAccounts`, `BankCash.CashAccounts`, `Company.Approvals` · Writes: `Payroll.LoansAndAdvances`, `Payroll.LoanInstallments`, `Company.ApprovalActions`, `Accounting.Vouchers` (disbursement BPV)
**Functions.** Save → `Payroll.loanAddUpdate` · Open → `Payroll.getLoanInfo` · Actions → `Payroll.loanApprove`, `Payroll.loanDisburse`
**Lookups.** `LoansAndAdvances.loanType` → `LoanType` · `LoansAndAdvances.purpose` → `LoanPurpose` · `LoansAndAdvances.requestChannel` → `RequestChannel` · `LoansAndAdvances.markupType` → `MarkupType` · `LoansAndAdvances.status` → `LoanStatus` · `LoanInstallments.installmentType` → `InstallmentType` · `LoanInstallments.status` → `LoanInstallmentStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Active Loans & Advances (23 loans · 8 advances) | count `LoansAndAdvances.status = ACTIVE` by `loanType` | |
| KPI Outstanding Balance · "GL 1340 + 1341 reconciled" | sum `LoansAndAdvances.outstandingAmount` | `Payroll.getOutstandingLoans` vs GL |
| KPI Monthly Recovery (scheduled in October payroll) | sum `LoanInstallments.amount` where `dueMonth` = next run month, status SCHEDULED | |
| KPI Pending Requests · Rs requested | `LoansAndAdvances.status = PENDING`, sum `requestedAmount` | |
| Filters search, type (Loan / Advance), chips All / Pending / Active / Closed, Filters menu | `LoansAndAdvances.docNo, loanType, status` | |
| Loan # · Req./Disb. date | `LoansAndAdvances.docNo, docDate, disbursementDate` | LN-… / ADV-… (admin "AD-" normalised) |
| Employee · department | `LoansAndAdvances.employeeId` → `HumanResources.Employees` | |
| Type badge Loan / Advance + purpose (Medical, Motorcycle, House, Marriage, Eid, Salary, Laptop) | `LoansAndAdvances.loanType`, `LoansAndAdvances.purpose` | |
| Amount | `LoansAndAdvances.approvedAmount` (else `requestedAmount`) | |
| Installments "12,500 × 20" | `LoansAndAdvances.installmentAmount × installmentCount` | |
| Deducted / Outstanding | `LoansAndAdvances.recoveredAmount / outstandingAmount` | |
| Progress "3 / 12", "Recover in F&F" | count `LoanInstallments` RECOVERED / `installmentCount`; status SETTLEMENT | |
| Status Pending / Active / Settlement / Closed | `LoansAndAdvances.status` | |
| Review drawer: Type / purpose, Requested amount, Installments × from month, Gross salary, Installment % of gross (limit 30%), Service length, Eligible limit (3 × gross), Existing loans, PF balance | `LoansAndAdvances.loanType, purposeDetail, requestedAmount, installmentCount, installmentAmount, firstDeductionMonth, grossSalarySnapshot, installmentPctOfGross, eligibleLimitAmount, pfBalanceSnapshot`; service from `HumanResources.Employees` | "Within policy" = `isWithinPolicy` |
| Approval trail (Requested via ESS, Line manager, HR, Finance — disbursement from Meezan 0123) | `LoansAndAdvances.requestChannel`, `approvalRequestId` → `Company.ApprovalActions` | |
| Approved amount / Installments / Comment | `LoansAndAdvances.approvedAmount, installmentCount, decisionComment` | |
| New Loan modal: Employee *, Type * (Loan / Salary advance), Purpose, Amount *, Installments, First deduction (month), Disburse from (Meezan / HBL / Cash in hand), Disbursement date, Markup (Interest-free) | `LoansAndAdvances.employeeId, loanType, purpose, requestedAmount, installmentCount, firstDeductionMonth, disbursedFromBankAccountId / disbursedFromCashAccountId, disbursementDate, markupType` | |
| Installment schedule preview (#, Payroll month, Installment, Balance after) | `LoanInstallments.installmentNo, dueMonth, amount, balanceAfter` | generated on approval |
| "Installment = 10.4% of gross · Policy limit 30%" | `LoansAndAdvances.installmentPctOfGross` | |
**Statuses.** PENDING → APPROVED → ACTIVE (disbursed) → CLOSED · SETTLEMENT (employee exiting; recovered in F&F) · REJECTED · WITHDRAWN. Installments SCHEDULED → RECOVERED (payroll) / SETTLED (F&F) · REQUESTED (prepayment) · SKIPPED · CANCELLED; "Next" derived.
**Actions → effects.** *Create & submit* → `loan` PENDING + `Company.Approvals` · *Approve* → `approvedAmount`, schedule rows, status APPROVED → Finance disbursement → `Accounting.Vouchers` (POSTING_RULES §Loan disbursement), status ACTIVE · *Reject* → REJECTED · *Export* → XLSX. Recovery happens in payroll post (`LoanInstallments.payrollLineId`); `Payroll.triggerLoanInstallmentSync` maintains recovered/outstanding and closes the loan.
**Permission.** `loan:view`, `loan:create`, `loan:approve`, `loan:disburse` · **Approval.** workflow `LOAN` (Line manager → HR → Finance).

---

### Final Settlement — `app/hr/settlement`
*Source:* `src/51-hr-pay-talent.html` (section `data-route="app/humanresources/settlement"`)
**Purpose.** Compute, approve and pay the full & final settlement of an exiting employee.
**Tables.** Primary: `Payroll.FinalSettlements` (one live per `HumanResources.Offboardings` case), `Payroll.FinalSettlementLines` · Reads: `HumanResources.Employees`, `HumanResources.Offboardings`, `HumanResources.ExitInterviews`, `HumanResources.ClearanceItems`, `HumanResources.LeaveBalances`, `HumanResources.EmployeeBankAccounts`, `Payroll.EmployeeSalaries`, `Payroll.LoansAndAdvances`, `Payroll.SalaryComponents` · Writes: `Payroll.FinalSettlements`, `Payroll.FinalSettlementLines`, `Payroll.PayrollRuns` (off-cycle PR-2026-OFF-02), `Payroll.LoanInstallments` (SETTLED), `Payroll.LoansAndAdvances` (CLOSED), `Accounting.Vouchers` (JV + BPV), `HumanResources.EmployeeLetters` (experience letter), `Company.Approvals`
**Functions.** Save → `Payroll.finalSettlementAddUpdate` · Open → `Payroll.getFinalSettlementInfo` · Actions → `Payroll.finalSettlementApprove`, `Payroll.finalSettlementCancel`, `Payroll.finalSettlementPay` ‖ Save → `HumanResources.offboardingAddUpdate` · Open → `HumanResources.getOffboardingInfo`
**Lookups.** `FinalSettlements.status` → `FinalSettlementStatus` · `Offboardings.exitType` → `ExitType` · `Offboardings.reasonCategory` → `OffboardingReasonCategory` · `Offboardings.status` → `OffboardingStatus` · `FinalSettlementLines.componentKind` → `FinalSettlementLineComponentKind` · `FinalSettlementLines.direction` → `FinalSettlementLineDirection` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Header FS-2026-007 · Off-cycle run PR-2026-OFF-02 · Prepared by Ayesha Noor on 30 Sep | `FinalSettlements.docNo, payrollRunId, preparedByUserId, preparedAt` | |
| Profile: name, designation · department · branch · EMP, badges Resigned / service / Clearance 3/4 | `HumanResources.Employees`; `HumanResources.Offboardings.exitType`; `FinalSettlements.serviceMonths`; `HumanResources.ClearanceItems` (cleared / total) | |
| "Last basic Rs 60,000 · Last gross Rs 108,000 · Per-day gross Rs 3,600" | `lastBasicAmount, lastGrossAmount, perDayGrossAmount` | `perDayBasicAmount` for encashment |
| Computation rows: Component, Basis, Earnings, Deductions | `FinalSettlementLines.label, basisText, quantity, rate, amount, direction, componentKind` | |
| Pending salary — September (30 days × 3,600) | `componentKind = PENDING_SALARY` | |
| Leave encashment (14 annual days × 2,000) | `LEAVE_ENCASHMENT` | days from `HumanResources.LeaveBalances` |
| Gratuity (7 years × last basic) | `GRATUITY`, `taxableAmount` above Rs 300,000 exemption | |
| Notice period shortfall (30 req., 20 served · 10 × 3,600) | `NOTICE_SHORTFALL`; `FinalSettlements.noticeShortfallDays` (from `HumanResources.Offboardings` required − served, 0 if `noticeWaived`) | |
| Advance recovery (AD-2026-019 outstanding) | `ADVANCE_RECOVERY`, `loanId` | |
| Income tax u/s 149 / EOBI — employee | `INCOME_TAX`, `EOBI` | |
| Totals / Net payable / amount in words | `earningsAmount, deductionAmount, netAmount, netAmountWords` | `Payroll.refreshFinalSettlementTotals` |
| PF Trust banner (balance Rs 512,340 incl. profit, released by trust in 30 days) | `FinalSettlements.pfTrustBalanceAmount` | informational, not posted |
| Accounting on approval (Dr Salaries/Gratuity/Leave provision, Cr Notice pay recovery, Cr Advances 1341, Cr Tax/EOBI payable, Cr Bank Alfalah — BPV) | `FinalSettlements.journalEntryId`, `paymentJournalEntryId`, `FinalSettlementLines.accountId`, `payFromBankAccountId` | POSTING_RULES §Final settlement |
| Employee & Exit: CNIC, joining date | `HumanResources.Employees.cnic, joiningDate` | |
| Resignation submitted, Last working day, Notice required / served, Exit reason | `FinalSettlements.offboardingId` → `HumanResources.Offboardings.resignationDate, lastWorkingDay, noticeDaysRequired, noticeDaysServed, reasonCategory / reasonDetail` | read, not copied; `noticeShortfallDays` is the computation snapshot |
| Badge "Resigned" | `HumanResources.Offboardings.exitType` (RESIGNATION …) | |
| Rehire eligible | `HumanResources.ExitInterviews` (eligible for rehire) | |
| Payment to (Bank Alfalah ••2210) | `FinalSettlements.employeeBankId` → `HumanResources.EmployeeBankAccounts` | |
| Clearance Checklist (IT, Admin, Warehouse, Finance) + Remind Finance | `HumanResources.ClearanceItems` (HR owned) | reminder → `Company.Notifications` |
| Approvals timeline (HR prepared, Finance pending, experience letter & EOBI exit PR-04 on approval) | `approvalRequestId`, `approvedByUserId, approvedAt` | letter → `HumanResources.EmployeeLetters` |
**Statuses.** DRAFT → PENDING_APPROVAL → APPROVED → PAID · CANCELLED.
**Actions → effects.** *Recalculate* → rebuild `FinalSettlementLines` + totals · *Approve settlement* → status APPROVED, JV posted, BPV-2026-000318 drafted, advance `LoanInstallments` SETTLED (loan CLOSED), payslip of the regular run kept ON_HOLD · *Print settlement* → PDF · *Offboarding* → `app/hr/offboarding`.
**Permission.** `settlement:create`, `settlement:approve` · **Approval.** workflow `FINAL_SETTLEMENT` (HR → Finance).
