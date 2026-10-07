# 14 · Employee Self-Service — page → entity map (FULL edition only)

Schema: `database/schema/13-ess.sql` · cross-module FKs: `database/fk/13-EmployeeSelfService-fks.sql`.
Screens: 17. Engine: `src/9C-ess.js` (route parts 01–16); section shells in `src/6A-ess.html`; `ess/dashboard` in `src/48-dash-stock.html`.
The signed-in employee ("me") is `HumanResources.Employees` linked to `Company.Users`; every ESS query is filtered to that employee (or to direct reports on `ess/team`).
Many ESS screens reuse back-office tables owned by HR, payroll and treasury; they are marked *(owned by …)*.

Doc types: `RQ` (letter request `RQ-2026-0142`), `HD` (ticket `HD-2026-0436`), `SW` (shift swap `SW-2026-014`). Open shifts use a plain `code` (`OS-31`); policies use `code` + `version` (`POL-014`, `HR-POL-07`).

**Unified numbering with HR (ESS labels → stored doc type).** ESS shows its own prefixes for documents that live in HR tables; the schema keeps one series per document:
- Attendance corrections "AC-2026-0104" = `HumanResources.RegularisationRequests`, doc type **REG** (`REG-2026-0418`).
- Leave requests "LR-2026-0441" (and team inbox "LV-2026-0533") = `HumanResources.LeaveRequests`, doc type **LV** (`LV-2026-0612`).
- Expense claims "EX-2026-0231" / "EXP-2026-0871" = `BankCash.ExpenseClaims`, doc type **EXP**.
- Advances "ADV-2026-0141" and medical loans "MED-2026-…" = `Payroll.LoansAndAdvances`, doc types **ADV** / **LN** (medical loans use LN).
The ESS UI should display the stored `docNo`.

---

### My Day — `ess/dashboard`
*Source:* `src/48-dash-stock.html` (section `data-route="EmployeeSelfService/dashboard"`)
**Purpose.** Employee home: punch clock, leave balance, latest payslip, month attendance, holidays, announcements.
**Tables.** Primary: `EmployeeSelfService.getMyDay` · Reads: `HumanResources.Employees`, `HumanResources.WorkShifts`/`HumanResources.ShiftRosters`, `HumanResources.AttendancePunches`, `HumanResources.AttendanceRegister`, `HumanResources.LeaveBalances`, `HumanResources.Holidays`, `Payroll.Payslips`, `Payroll.PayrollRunLines(Component)`, `EmployeeSelfService.CompanyAnnouncements`, `EmployeeSelfService.CompanyAnnouncementReads`, `Company.Approvals` · Writes: `HumanResources.AttendancePunches` (Check In) *(owned by HR)*
| UI field / column | Table.column | Notes |
|---|---|---|
| Greeting, date · branch, designation · EMP · shift, "1 pending request" | `HumanResources.Employees`, `HumanResources.ShiftRosters`/`HumanResources.WorkShifts`; open requests count | |
| Attendance card: clock, Check In button, geofence line, Check in / Check out / Worked | `HumanResources.AttendancePunches` (source MOBILE, geo) *(HR)* | |
| Leave balance: days available, Annual / Casual left, gauge 14 of 24, next holiday | `HumanResources.LeaveBalances`, `HumanResources.Holidays` | |
| Latest payslip: Net pay, credited date · bank, vs Aug, Commission, bar Basic / Allowances / Commission / Deductions | `Payroll.Payslips.netAmount`, `Payroll.PayrollRuns.paidAt`, `Payroll.PayrollRunLineComponents` | |
| Attendance · September calendar (Present / Late / Leave / Holiday / Weekend), Present 21/22 | `HumanResources.AttendanceRegister` | |
| Upcoming holidays | `HumanResources.Holidays` | |
| Announcements (title, author · age) | `EmployeeSelfService.CompanyAnnouncements.title, authorLabel/authorEmployeeId, publishedAt` | |
**Statuses.** —
**Actions → effects.** *Check In* → `HumanResources.AttendancePunches` · *Apply leave* → `ess/leave` · *Latest payslip* → `ess/payslips`.
**Permission.** `EmployeeSelfService:self` · **Approval.** —

---

### My Attendance — `ess/attendance`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (01-attendance)
**Purpose.** Selfie + geofence check-in/out, month calendar, correction requests.
**Tables.** Primary: `HumanResources.AttendancePunches`, `HumanResources.AttendanceRegister`, `HumanResources.RegularisationRequests` *(owned by HR)* · Reads: `HumanResources.WorkShifts`, `HumanResources.ShiftRosters`, `HumanResources.Holidays`, `HumanResources.LeaveRequests`, `Company.Branches` (geofence) · Writes: `HumanResources.AttendancePunches`, `HumanResources.RegularisationRequests`
**Functions.** Save → `HumanResources.regularisationRequestAddUpdate` · Open → `HumanResources.getRegularisationRequestInfo` · Actions → `HumanResources.regularisationRequestApprove`
**Lookups.** `RegularisationRequests.requestType` → `RegularisationRequestType` · `RegularisationRequests.punchDirection` → `RegularisationRequestPunchDirection` · `RegularisationRequests.channel` → `EssWebEssMobileHrChannel` · `RegularisationRequests.status` → `ProfileChangeRequestStatus` · `RegularisationRequests.stage` → `RegularisationRequestStage` · `RegularisationRequests.rejectionReason` → `RegularisationRequestRejectionReason` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Geofence card (Lahore HQ · 150 m radius, "You are 42 m inside", GPS ±6 m, Wi-Fi, mock location off) | `Company.Branches` geofence; punch geo fields on `HumanResources.AttendancePunches` | |
| Selfie check-in checks (face detected, liveness, identity match 98%, inside geofence) | `HumanResources.AttendancePunches` verification fields *(HR)* | |
| Today: Check in / Check out / Worked, timer | `HumanResources.AttendancePunches`, `HumanResources.AttendanceRegister` | |
| Calendar day states P / LT / L / A / H; popover check-in/out, worked, overtime, location, source | `HumanResources.AttendanceRegister` | |
| Month at a glance: on-time %, Present x/y, Late marks, Avg check-in, Overtime | aggregate of `HumanResources.AttendanceRegister` | |
| Hours · last 7 days | `HumanResources.AttendanceRegister` | |
| Correction sheet: Date, What happened (Missed punch-in / Missed punch-out / Late arrival / On-duty / field visit / Work from home), Actual check in / out, Reason *, Attachment | `HumanResources.RegularisationRequests.attDate, requestType` (MISSED_PUNCH + `punchDirection` IN / OUT, LATE_ARRIVAL, ON_DUTY, WFH), `requestedIn, requestedOut`, reason, `channel` ESS_WEB / ESS_MOBILE; `Company.Attachments` | |
| My correction requests: Request (AC-2026-0104), Type, Reason, Approver, Status, Withdraw | `HumanResources.RegularisationRequests.docNo` (doc type REG), `requestType`, `currentApproverEmployeeId`, `status`, `rejectionReason` | ESS label "AC-" = REG series |
**Statuses.** `HumanResources.RegularisationRequests.status` PENDING → APPROVED / REJECTED · WITHDRAWN; `stage` LINE_MANAGER → HR → COMPLETED *(HR enum)*.
**Actions → effects.** *Check in/out* → punch · *Submit request* → `HumanResources.RegularisationRequests` + `Company.Approvals` · *Withdraw* · *Export* XLSX.
**Permission.** `EmployeeSelfService:self` · **Approval.** line manager (SLA 24 h).

---

### My Leave — `ess/leave`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (02-leave)
**Purpose.** Leave balances, apply/withdraw/cancel leave, team calendar.
**Tables.** Primary: `HumanResources.LeaveRequests`, `HumanResources.LeaveBalances` *(owned by HR)* · Reads: `HumanResources.LeaveTypes`, `HumanResources.Holidays`, `HumanResources.Employees` (team, handover) · Writes: `HumanResources.LeaveRequests`, `Company.Approvals`, `Company.Attachments`
**Functions.** Save → `HumanResources.leaveRequestAddUpdate` · Open → `HumanResources.getLeaveRequestInfo` · Actions → `HumanResources.leaveRequestApprove`, `HumanResources.leaveRequestCancel`
**Lookups.** `LeaveRequests.duration` → `LeaveRequestDuration` · `LeaveRequests.channel` → `EssWebEssMobileHrChannel` · `LeaveRequests.status` → `LeaveRequestStatus` · `LeaveRequests.stage` → `LeaveRequestStage` · `LeaveRequests.rejectionReason` → `LeaveRequestRejectionReason` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Balance cards Annual / Casual / Sick / Comp-off (free of entitlement, Used, Booked, accrual note, expiry) | `HumanResources.LeaveBalances`, `HumanResources.LeaveTypes` | |
| Apply sheet: Leave type, From, To, working days, Half day (First / Second half), Reason *, Handover to, Contact during leave, Attachment (medical certificate if sick > 2 days), Approval route | `HumanResources.LeaveRequests.leaveTypeId, fromDate, toDate, days, duration` (FULL / HALF_AM / HALF_PM), reason, `handoverEmployeeId`, contact, `channel`; `Company.Attachments` | |
| My requests (type · days · range · id, reason, handover, tracker Submitted → Manager → HR → Approved, note) | `HumanResources.LeaveRequests.docNo` (doc type LV; ESS label "LR-"), `status`, `stage`, `rejectionReason` | |
| Team calendar (Oct) / out list | `HumanResources.LeaveRequests` of team | |
| Upcoming holidays | `HumanResources.Holidays` | |
| Leave policy drawer (HR-POL-07) | `EmployeeSelfService.CompanyPolicies` | |
**Statuses.** `HumanResources.LeaveRequests.status` PENDING → APPROVED / REJECTED · CANCELLED; `stage` LINE_MANAGER → HR_REVIEW → CEO → COMPLETED *(HR enum)*. ESS "Withdrawn" (pending) and "Cancelled" (approved, future) both store CANCELLED.
**Actions → effects.** *Submit request* → `HumanResources.LeaveRequests` (`Company.getNextDocNo('LV')`) · *Withdraw* / *Cancel leave* → status CANCELLED, `cancelledAt`, balance restored · *Leave policy* → `EmployeeSelfService.CompanyPolicies`.
**Permission.** `EmployeeSelfService:self` · **Approval.** manager; HR for > 3 days.

---

### My Payslips — `ess/payslips`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (03-payslips)
**Purpose.** Employee's payslips, YTD, net-pay trend, compare months, tax certificates u/s 149.
**Tables.** Primary: `Payroll.Payslips`, `Payroll.PayrollRunLines`, `Payroll.PayrollRunLineComponents` *(owned by payroll)* · Reads: `Payroll.PayrollRuns`, `Payroll.getEmployeePayYearToDate`, `Payroll.getSalaryTaxCertificate`, `Payroll.getProvidentFundRegister`, `Company.CompanySettings` · Writes: `Payroll.Payslips.viewedAt, status = VIEWED, shareToken, shareExpiresAt`
**Functions.** Save → `Payroll.payslipAddUpdate` · Open → `Payroll.getPayslipInfo` ‖ Save → `Payroll.payrollRunAddUpdate` · Open → `Payroll.getPayrollRunInfo` · Actions → `Payroll.payrollRunApprove`, `Payroll.payrollRunPost`, `Payroll.payrollRunCancel`, `Payroll.payrollRunReverse`
**Lookups.** `Payslips.status` → `PayslipStatus` · `PayrollRunLines.taxStatus` → `TaxStatus` · `PayrollRunLines.payMode` → `BankTransferChequeCashPayMode` · `PayrollRunLineComponents.componentType` → `ComponentType` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Month chips (12 months) | `Payroll.Payslips.payrollMonth` | own payslips only, `publishedToEssAt IS NOT NULL` |
| Net pay hero, "Credited 30 Sep to Meezan ****4417 · PR-2026-09", Paid badge | `Payslips.netAmount`, `PayrollRuns.paidAt, docNo`, `PayrollRunLines.bankName, ibanMasked` | |
| Pills vs previous month, Gross, Commission | `Payslips.grossAmount`; `PayrollRunLineComponents` (COM) | |
| Stack bar Basic / Allowances / Commission / Deductions | `PayrollRunLineComponents` | |
| Accordion Earnings (Basic salary, HRA, Medical (exempt up to 10%), Fuel & conveyance, Sales commission) / Deductions (Income tax u/s 149, Provident fund, EOBI, Loan recovery LN-2026-0031) / Net | `PayrollRunLineComponents.label, basisText, amount, loanId` | |
| FY to date: Gross, Net, Income tax, PF balance (+ % of projection) | `Payroll.getEmployeePayYearToDate`, `Payroll.getProvidentFundRegister` | |
| Tax certificates FY 2025-26 / 2024-25 (issued, tax) + certificate paper (quarters, CPR no., deposited, amount) | `Payroll.getSalaryTaxCertificate` | CPR from `Tax.WhtChallans` |
| Net pay · last 12 months chart, Compare months table | `Payroll.Payslips` | |
| Payslip paper (letterhead, earnings/deductions, totals, in words, working days, leave, late marks, OT) | `payslip`, `PayrollRunLines`, `PayrollRunLineComponents` | |
**Statuses.** shown only when posted (Paid).
**Actions → effects.** *View / Download PDF* → `viewedAt` (first view sets status VIEWED), `pdfAttachmentId` · *Share with bank* → `shareToken`, `shareExpiresAt` (+7 days) · *Tax certificate* → PDF.
**Permission.** `EmployeeSelfService:self` · **Approval.** —

---

### Expense Claims — `ess/expenses`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (06-expenses)
**Purpose.** Scan-to-claim expenses with policy checks; reimbursed with payroll or IBFT.
**Tables.** Primary: `BankCash.ExpenseClaims`, `BankCash.ExpenseClaimLines`, `BankCash.ExpenseClaimActions` *(owned by treasury)* · Reads: `BankCash.ExpenseCategories` (limits), `Accounting.CostCentres`/`Accounting.Projects` · Writes: same + `Company.Attachments` (receipt), `Payroll.PayrollAdjustments` (`inputSource = EXPENSE_CLAIM`, when reimbursed with payroll)
**Functions.** Save → `BankCash.expenseClaimAddUpdate` · Open → `BankCash.getExpenseClaimInfo` · Actions → `BankCash.expenseClaimApprove`, `BankCash.expenseClaimPay`
**Lookups.** `ExpenseClaims.source` → `ExpenseClaimSource` · `ExpenseClaims.policyLimitPeriod` → `PolicyLimitPeriod` · `ExpenseClaims.status` → `ExpenseClaimStatus` · `ExpenseClaims.workflowStage` → `WorkflowStage` · `ExpenseClaims.rejectionReason` → `ExpenseClaimRejectionReason` · `ExpenseClaims.paymentMethod` → `ExpenseClaimPaymentMethod` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Pending, Approved this month, Reimbursed · FY, Fuel used · Sep of Rs 15,000 | aggregates of `BankCash.ExpenseClaims` | |
| My claims: merchant, EX-2026-0231 · date · category, cost centre, tracker Sent → Manager → Finance → Paid, amount, status | `BankCash.ExpenseClaims(Line)` | |
| New claim sheet: receipt scan (OCR confidence), Merchant, Date, Amount, Category, Project / cost centre, Purpose, policy check banner | `BankCash.ExpenseClaimLines` + `Company.Attachments` | OCR values [simulated] |
| Policy limits (Fuel 15,000/month, Mobile 3,000/month, Client meal 2,500/meal, Lodging 12,000/night) | `BankCash.ExpenseCategories` | |
| Detail drawer: rejection reason, payment "Reimburse with payroll" | `BankCash.ExpenseClaimActions`; `Payroll.PayrollAdjustments` | |
**Statuses.** Pending · Approved · Reimbursed · Rejected (+ draft) *(treasury enum)*.
**Actions → effects.** *Submit claim* → claim + approval · *Save draft* · *Withdraw* · *Resubmit*. Reimbursement via payroll → `Payroll.PayrollAdjustments` in the next run.
**Permission.** `EmployeeSelfService:self` · **Approval.** manager → Finance.

---

### Loans & Advances (ESS) — `ess/loans`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (05-loans)
**Purpose.** Employee view of active loan, schedule, eligibility and advance requests.
**Tables.** Primary: `Payroll.LoansAndAdvances`, `Payroll.LoanInstallments` *(owned by payroll)* · Reads: `Payroll.Payslips` (net pay for 40% cap), `Payroll.EmployeeSalaries` (50% of basic), `HumanResources.Employees` (tenure) · Writes: `Payroll.LoansAndAdvances` (requestChannel = ESS), `Payroll.LoanInstallments` (PREPAYMENT, REQUESTED), `Company.Approvals`
**Functions.** Save → `Payroll.loanAddUpdate` · Open → `Payroll.getLoanInfo` · Actions → `Payroll.loanApprove`, `Payroll.loanDisburse`
**Lookups.** `LoansAndAdvances.loanType` → `LoanType` · `LoansAndAdvances.purpose` → `LoanPurpose` · `LoansAndAdvances.requestChannel` → `RequestChannel` · `LoansAndAdvances.markupType` → `MarkupType` · `LoansAndAdvances.status` → `LoanStatus` · `LoanInstallments.installmentType` → `InstallmentType` · `LoanInstallments.status` → `LoanInstallmentStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| KPIs Outstanding, Monthly deduction, Eligible advance (50% of basic), Repaid to date | `LoansAndAdvances.outstandingAmount, installmentAmount, recoveredAmount`; `EmployeeSalaries.basicAmount` | |
| Active loan card: name, LN-2026-0031 · disbursed · interest-free, ring outstanding of principal, Monthly EMI, Next deduction (PR-2026-10), Instalments 7 of 24, ends | `LoansAndAdvances.docNo, purpose, disbursementDate, markupType, approvedAmount, outstandingAmount, installmentAmount, installmentCount`; `LoanInstallments` | |
| Repayment schedule (#, Month, Payroll run, Instalment, Balance after, Status Recovered / Next / Scheduled) | `LoanInstallments.installmentNo, dueMonth, payrollLineId → PayrollRuns.docNo, amount, balanceAfter, status` | |
| Request sheet: Salary advance / Staff loan / Medical emergency, Amount slider, Monthly EMI, Repay over (months), Eligibility checks, deductions vs net-pay meter (40% cap), Purpose, Repayment preview | `LoansAndAdvances.loanType` (SALARY_ADVANCE / LOAN / MEDICAL), `requestedAmount, installmentCount, installmentAmount, purposeDetail, firstDeductionMonth`; `isWithinPolicy` | |
| Requests & history (type · amount, status, tracker Submitted → Manager → HR → Finance → Disbursed) | `LoansAndAdvances.status`, `Company.ApprovalActions` | |
| Statement paper | `loan` + `LoanInstallments` | |
**Statuses.** Pending · Active · Closed · Withdrawn (`LoansAndAdvances.status`).
**Actions → effects.** *Submit request* → `loan` PENDING · *Withdraw* → WITHDRAWN · *Prepay* → `LoanInstallments` (PREPAYMENT, REQUESTED) · *Statement* → PDF · *Loan policy* → `EmployeeSelfService.CompanyPolicies`.
**Permission.** `EmployeeSelfService:self` · **Approval.** workflow `LOAN`.

---

### Letters & Requests — `ess/requests`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (10-requests)
**Purpose.** Self-serve HR letters signed digitally by HR and verifiable by QR.
**Tables.** Primary: `EmployeeSelfService.LetterRequests` · Reads: `HumanResources.Employees`, `Payroll.EmployeeSalaries`, `Payroll.Payslips` (salary figures), `HumanResources.LeaveRequests`, `Company.DocumentTemplates`, `Company.CompanySettings` · Writes: `EmployeeSelfService.LetterRequests`, `Company.Attachments` (PDF), `HumanResources.EmployeeLetters` (issued register), `Company.Notifications`
**Functions.** Save → `EmployeeSelfService.letterRequestAddUpdate` · Open → `EmployeeSelfService.getLetterRequestInfo`
**Lookups.** `LetterRequests.letterType` → `LetterRequestLetterType` · `LetterRequests.outputFormat` → `OutputFormat` · `LetterRequests.language` → `EnUrLanguage` · `LetterRequests.stage` → `LetterRequestStage` · `LetterRequests.status` → `LetterRequestStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Type cards (Salary certificate · Experience letter · NOC for visa · Bank letter · Employment verification) + SLA | `LetterRequests.letterType` SALARY_CERTIFICATE / EXPERIENCE / NOC_VISA / BANK_LETTER / EMPLOYMENT_VERIFICATION; `dueAt` | SLA per type in `Company.DocumentTemplates` / config |
| Addressed to * | `addressedTo` | |
| Purpose * | `purpose` | |
| Country / Leave approved? / Travel from / Travel till (NOC) | `travelCountry, leaveRequestId, travelFrom, travelTill` | |
| Include salary breakdown | `includeSalary`; `salaryGrossSnapshot, salaryNetSnapshot` | |
| Key responsibilities (experience) | `responsibilities` | |
| Format Digital PDF + QR / Printed & stamped · Language English / Urdu | `outputFormat, language` | |
| My requests: type, RQ-2026-0142 · date · purpose, badge, tracker Submitted → HR review → Signed → Ready, reason | `docNo, docDate, stage, status, rejectedReason` | |
| Letter paper: Ref ALN/HR/…, date, signature, stamp, QR code | `referenceNo, signedByUserId, signedAt, verificationCode, pdfAttachmentId` | |
| Turnaround stats (avg, issued this year, same-day %) | aggregates of `LetterRequests` | [derived] |
**Statuses.** stage SUBMITTED → HR_REVIEW → SIGNED → READY · status OPEN / COMPLETED / REJECTED / WITHDRAWN (badges In review / Approved / Rejected / Withdrawn).
**Actions → effects.** *Submit request* → `LetterRequests` (`Company.getNextDocNo('RQ')`) · *Withdraw* → WITHDRAWN · *View letter / PDF* · *Request again*.
**Permission.** `EmployeeSelfService:self`; HR signing `EmployeeLetters:sign` · **Approval.** HR Manager signs.

---

### Helpdesk — `ess/helpdesk`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (11-helpdesk)
**Purpose.** Tickets to HR / Payroll / IT / Admin with SLA countdown, chat and CSAT.
**Tables.** Primary: `EmployeeSelfService.HelpdeskTickets`, `EmployeeSelfService.HelpdeskTicketMessages`, `EmployeeSelfService.HelpdeskCategories`, `EmployeeSelfService.HelpdeskFaqs` · Reads: `HumanResources.Employees` · Writes: tickets, messages, `Company.Attachments`, `Company.Notifications`
**Functions.** Save → `EmployeeSelfService.helpdeskTicketAddUpdate` · Open → `EmployeeSelfService.getHelpdeskTicketInfo` ‖ Save → `EmployeeSelfService.helpdeskCategoryAddUpdate` · Open → `EmployeeSelfService.getHelpdeskCategoryInfo` ‖ Save → `EmployeeSelfService.helpdeskFaqAddUpdate` · Open → `EmployeeSelfService.getHelpdeskFaqInfo`
**Lookups.** `HelpdeskTickets.priority` → `HelpdeskTicketPriority` · `HelpdeskTickets.status` → `HelpdeskTicketStatus` · `HelpdeskTickets.contactChannel` → `ContactChannel` · `HelpdeskTicketMessages.authorRole` → `AuthorRole` · `HelpdeskCategories.status` → `ActiveInactiveStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Category cards: name, description, open count, Avg reply | `HelpdeskCategories.name, description`; counts; `EmployeeSelfService.getHelpdeskServiceLevels` | |
| My tickets: HD-2026-0436 · category, High badge, subject, agent, messages, Opened, SLA bar / countdown / "Met SLA · 3h 12m", status, Rate / stars | `HelpdeskTickets.docNo, categoryId, priority, subject, agentEmployeeId, openedAt, dueAt, slaHours, slaMet, status, csatRating` | |
| Chips All / Open / In progress / Resolved / Closed | `HelpdeskTickets.status` | |
| New ticket: Category (auto-routed by keywords), "Routed to … · SLA 48h", Subject *, FAQ suggestions, Priority Low / Normal / High, Contact me on WhatsApp / Email, Describe the issue *, Attachments | `categoryId` (via `HelpdeskCategories.routingKeywords`), `ownerEmployeeId`, `subject`, `HelpdeskFaqs.keywords`, `priority`, `contactChannel, contactValue`, `description`; first `HelpdeskTicketMessages` | High priority SLA × `highPrioritySlaFactor` |
| Chat drawer: bubbles (you / agent, time, attachment), compose | `HelpdeskTicketMessages.authorRole, authorEmployeeId, body, attachmentId, sentAt` | |
| CSAT "How did … do?" 1–5 stars | `csatRating, csatAt` → status CLOSED | |
| Reopen | `reopenedCount`, status OPEN, new `dueAt` | |
| Service levels (on-time %, tickets raised, first reply, avg rating) | `EmployeeSelfService.getHelpdeskServiceLevels` | |
| Quick answers (category badge, question, answer, search) | `HelpdeskFaqs.categoryId, question, answer` | |
**Statuses.** OPEN → IN_PROGRESS → RESOLVED → CLOSED (reopen → OPEN). Priority LOW / NORMAL / HIGH.
**Actions → effects.** *Submit ticket* → `HelpdeskTickets` (`Company.getNextDocNo('HD')`) + message + notification to agent · *Send* reply → `HelpdeskTicketMessages` (`firstResponseAt` on first agent reply) · *Submit rating* · *Reopen*.
**Permission.** `EmployeeSelfService:self`; agents `helpdesk:agent` · **Approval.** —

---

### Kudos & Pulse — `ess/kudos`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (13-kudos)
**Purpose.** Public recognition wall, weekly anonymous pulse, company poll.
**Tables.** Primary: `EmployeeSelfService.Kudos`, `EmployeeSelfService.KudosReactions`, `EmployeeSelfService.PulseSurveys`, `EmployeeSelfService.PulseSurveyQuestions`, `EmployeeSelfService.PulseSurveyResponses`, `EmployeeSelfService.Polls`, `EmployeeSelfService.PollOptions`, `EmployeeSelfService.PollVotes` · Reads: `HumanResources.Employees`, `HumanResources.Departments` · Writes: same, `Company.Comments` (kudos comments), `Company.Notifications`
**Functions.** Save → `EmployeeSelfService.kudosAddUpdate` · Open → `EmployeeSelfService.getKudosInfo` ‖ Save → `EmployeeSelfService.pulseSurveyAddUpdate` · Open → `EmployeeSelfService.getPulseSurveyInfo` ‖ Save → `EmployeeSelfService.pollAddUpdate` · Open → `EmployeeSelfService.getPollInfo`
**Lookups.** `Kudos.badge` → `Badge` · `KudosReactions.reaction` → `Reaction` · `PulseSurveys.status` → `DraftOpenClosedStatus` · `PulseSurveyQuestions.metricKey` → `MetricKey` · `Polls.status` → `DraftOpenClosedStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Give kudos: To (search colleague), Badge (Customer Hero / Team Player / Go-Getter / Problem Solver / Mentor), Message 0/280, Share on company wall, "+20 points to them" | `Kudos.toEmployeeId, badge, message, shareOnWall, pointsToRecipient`; `fromEmployeeId` = me, `pointsToGiver` | |
| Wall filters Everyone / For me / By me / per badge | `Kudos.toEmployeeId / fromEmployeeId / badge` | |
| Card: badge, age, from → to, message, reactions 👏 ❤️ 🔥 🎉 counts, comment | `Kudos.givenAt`; `KudosReactions.reaction, isActive` counts; `Company.Comments` | |
| Your recognition: Received / Given / Points, earned badges × n | `EmployeeSelfService.getKudosSummary` | |
| Weekly pulse: question 1 of 3, faces 1–5, scale labels, thanks + results (Workload / Manager support / eNPS), "78% of Sales responded" | `PulseSurveyQuestions.questionText, lowLabel, highLabel, metricKey`; `PulseSurveyResponses.score, respondentHash, departmentId`; `EmployeeSelfService.getPulseSurveyResults` | anonymous |
| Poll: question, owner "Admin · Ahmed Raza", options with % after voting, votes, closes | `Polls.question, createdByEmployeeId, closesAt`; `PollOptions.label`; `PollVotes`; `EmployeeSelfService.getPollResults` | one vote per employee |
**Statuses.** PulseSurveys DRAFT / OPEN / CLOSED · poll DRAFT / OPEN / CLOSED.
**Actions → effects.** *Send kudos* → `kudos` + notification to recipient · reaction toggle → `KudosReactions` (isActive) · face tap → `PulseSurveyResponses` · *vote* → `PollVotes`.
**Permission.** `EmployeeSelfService:self`; create surveys/polls `EmployeeSelfService:admin` · **Approval.** —

---

### Goals & Reviews — `ess/goals`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (12-goals)
**Purpose.** OKR check-ins, H1 self-assessment, 1:1 notes and feedback.
**Tables.** Primary: `HumanResources.Goals`, `HumanResources.KeyResults`, `HumanResources.PerformanceReviews`, `HumanResources.CompetencyRatings`, `HumanResources.OneOnOneMeetings`, `HumanResources.PerformanceFeedback` *(owned by HR)* · Reads: `HumanResources.PerformanceCycles`, `HumanResources.Employees` · Writes: same, `Company.Tasks` (1:1 action items)
**Functions.** Save → `HumanResources.goalAddUpdate` · Open → `HumanResources.getGoalInfo` ‖ Save → `HumanResources.performanceReviewAddUpdate` · Open → `HumanResources.getPerformanceReviewInfo` ‖ Save → `HumanResources.oneOnOneMeetingAddUpdate` · Open → `HumanResources.getOneOnOneMeetingInfo` ‖ Save → `HumanResources.performanceFeedbackAddUpdate` · Open → `HumanResources.getPerformanceFeedbackInfo`
**Lookups.** `Goals.goalKind` → `GoalKind` · `Goals.unit` → `GoalUnit` · `Goals.status` → `GoalStatus` · `KeyResults.unit` → `GoalUnit` · `PerformanceReviews.ratingLabel` → `RatingLabel` · `PerformanceReviews.performanceBand` → `PerformanceBand` · `PerformanceReviews.potentialBand` → `PotentialBand` · `PerformanceReviews.stage` → `PerformanceReviewStage` · `CompetencyRatings.raterRole` → `RaterRole` · `PerformanceFeedback.relationship` → `Relationship` · `PerformanceFeedback.tag` → `Tag` · `PerformanceFeedback.status` → `PerformanceFeedbackStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Hero H1 progress (weighted), "3 objectives · 8 key results", self-review due | `HumanResources.Goals` (weight), `HumanResources.KeyResults` (progress), `HumanResources.PerformanceCycles` | |
| Review cycle tracker Goals set → Self-review → Manager → Calibration → Sign-off | `HumanResources.PerformanceReviews` stage | |
| Objective cards (weight, status On track / Needs focus / At risk), KR sliders and formatted values | `HumanResources.Goals`, `HumanResources.KeyResults` | *Save check-in* |
| 1:1 notes (topic, date, with, notes, action items ✓) | `HumanResources.OneOnOneMeetings` + `Company.Tasks` | |
| Feedback received (quote, from, role, date, Strength / Growth) + Request feedback | `HumanResources.PerformanceFeedback` | |
| Self-assessment: 5 competencies × stars + evidence, overall self-rating 1–5 (step 0.5), key achievements | `HumanResources.CompetencyRatings`, `HumanResources.PerformanceReviews` | |
**Statuses.** *(HR enums)*.
**Actions → effects.** *Save check-in*, *Add 1:1 note*, *Request feedback*, *Save draft*, *Submit to manager* — all HR tables.
**Permission.** `EmployeeSelfService:self` · **Approval.** manager review.

---

### Tax Declarations — `ess/tax`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (04-tax)
**Purpose.** FY salary-tax projection and Zakat / VPS / donation / health-insurance declarations that reduce withholding u/s 149.
**Tables.** Primary: `Payroll.TaxDeclarations` · Reads: `Payroll.SalaryTaxSlabs`, `Payroll.getSalaryTaxProjection`, `Payroll.PayrollRunLines` (YTD tax, taxable salary) · Writes: `Payroll.TaxDeclarations`, `Company.Attachments` (proof)
**Functions.** Save → `Payroll.taxDeclarationAddUpdate` · Open → `Payroll.getTaxDeclarationInfo` · Actions → `Payroll.taxDeclarationApprove`
**Lookups.** `TaxDeclarations.declarationType` → `DeclarationType` · `TaxDeclarations.itoSection` → `ItoSection` · `TaxDeclarations.reliefKind` → `ReliefKind` · `TaxDeclarations.status` → `TaxDeclarationStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| FY 2026-27 projection: Projected taxable income (gross − exempt medical), Annual tax, Effective rate, Monthly from Oct, Deducted so far | `Payroll.getSalaryTaxProjection` (from `PayrollRunLines.annualTaxableIncome, taxAmount`, declarations, slabs) | |
| Slab bars (Rs 0 – 0.6M exempt … Above 4.1M 35%, "You · Rs 1.68M") | `Payroll.SalaryTaxSlabs.incomeFrom, incomeTo, fixedTax, ratePercent` (taxYear 2026-27) | |
| Tax saved this year, n/4 declared, withholding drop, credits (Zakat allowance, VPS, donation, health) | `Payroll.getSalaryTaxProjection`; `TaxDeclarations.estimatedTaxSaving` | |
| Declaration cards: type, section (u/s 60 / 63 / 61 / 62A), badge, amount, "Saves Rs …", paid to, proof file, "Verified by Nida Shah · Payroll" / "Proof due 15 Oct" | `TaxDeclarations.declarationType, itoSection, reliefKind, status, amount, estimatedTaxSaving, paidTo, proofAttachmentId, verifiedByUserId, proofDueDate` | |
| Add/Edit sheet: Type, Amount (Rs), Paid to, Proof upload, preview "saves / new monthly tax" | `declarationType, amount, paidTo, proofAttachmentId` | |
| Monthly deduction schedule (month · PR, taxable salary, tax u/s 149, Deducted / Next / Scheduled) | `Payroll.PayrollRunLines` (actual) + `Payroll.getSalaryTaxProjection` (projected) | |
**Statuses.** NOT_DECLARED → PENDING (no proof) → IN_REVIEW (proof uploaded) → APPROVED · REJECTED.
**Actions → effects.** *Save declaration* → upsert `TaxDeclarations` (`effectiveFromMonth` = next payroll after verification) · *Upload proof* → IN_REVIEW · Payroll verifies → APPROVED (applies in next run's tax calc) · *Export* XLSX.
**Permission.** `EmployeeSelfService:self`; verify `Payroll:taxVerify` · **Approval.** Payroll verification.

---

### Shifts & Swaps — `ess/shifts`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (14-shifts)
**Purpose.** Weekly roster for me and my team, swap/cover requests, open shifts.
**Tables.** Primary: `EmployeeSelfService.ShiftSwapRequests`, `EmployeeSelfService.OpenShifts`, `EmployeeSelfService.OpenShiftClaims` · Reads: `HumanResources.ShiftRosters`, `HumanResources.WorkShifts`, `HumanResources.Holidays`, `HumanResources.LeaveRequests`, `HumanResources.Employees`, `EmployeeSelfService.CompanyPolicies` (HR-ATT-04) · Writes: `EmployeeSelfService.*` above, `HumanResources.ShiftRosters` (on approval/confirmation) *(HR)*, `Payroll.PayrollAdjustments` (open-shift allowance)
**Functions.** Save → `EmployeeSelfService.shiftSwapRequestAddUpdate` · Open → `EmployeeSelfService.getShiftSwapRequestInfo` · Actions → `EmployeeSelfService.shiftSwapRequestApprove` ‖ Save → `EmployeeSelfService.openShiftAddUpdate` · Open → `EmployeeSelfService.getOpenShiftInfo` · Actions → `EmployeeSelfService.openShiftCancel`
**Lookups.** `ShiftSwapRequests.swapMode` → `SwapMode` · `ShiftSwapRequests.reasonCategory` → `ShiftSwapRequestReasonCategory` · `ShiftSwapRequests.status` → `ShiftSwapRequestStatus` · `OpenShifts.status` → `OpenShiftStatus` · `OpenShiftClaims.status` → `OpenShiftClaimStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| On shift card (today's shift, location, check-in, break, check-out, time left) | `HumanResources.ShiftRosters`, `HumanResources.WorkShifts`, `HumanResources.AttendancePunches` | |
| My week: scheduled h, worked h, overtime, rest days, swaps left 1 of 2 | `HumanResources.ShiftRosters`, `HumanResources.AttendanceRegister`; count `ShiftSwapRequests` this month | policy max 2/month |
| Weekly roster grid (people × days, General / Morning field / Evening dispatch / Activation / Stock count / Off / Leave / Holiday, pending badges, coverage x/5 on) | `HumanResources.ShiftRosters`, `HumanResources.WorkShifts`; pending from `ShiftSwapRequests` / `OpenShiftClaims` | |
| Swap wizard: 1 Shift (my upcoming shift), 2 Colleague (Off · can cover / their shift / On leave / Same shift disabled), 3 Reason (Family event / Medical appointment / Client visit / Training / Personal) + note | `ShiftSwapRequests.swapDate, requesterShiftId, counterpartEmployeeId, counterpartShiftId, swapMode` (SWAP / COVER), `reasonCategory, noteToCounterpart` | |
| Swap requests list (Swap with / Cover by, my shift ⇄ theirs, reason, badge, tracker Requested → Accepted → Manager → Approved, Withdraw) | `ShiftSwapRequests.docNo, status, acceptedAt, approverEmployeeId, decidedAt` | |
| Team-lead card "Imran ⇄ Salman · Sat 03 Oct · Needs you" Approve / Decline (reason) | `ShiftSwapRequests` where `approverEmployeeId` = me; `decisionReason` | |
| Open shifts (date, title, shift time · hours · slots left, perk, Pick up / Requested) | `OpenShifts.code, shiftDate, shiftId, title, slotsTotal, perkText, allowanceAmount, overtimeMultiplier`; `OpenShiftClaims.status` | slots guarded by `EmployeeSelfService.triggerOpenShiftClaimSlots` |
| Shift rules (grace 10 min, 48 h notice, 11 h rest, open-shift pay) | `EmployeeSelfService.CompanyPolicies` | |
**Statuses.** swap REQUESTED → ACCEPTED → APPROVED · DECLINED (colleague / manager declines) · REJECTED · WITHDRAWN · OpenShifts OPEN / FILLED / CANCELLED · claim REQUESTED → CONFIRMED / DECLINED / WITHDRAWN.
**Actions → effects.** *Submit request* → `ShiftSwapRequests` (`Company.getNextDocNo('SW')`) · *Approve swap* → APPROVED + `HumanResources.ShiftRosters` rows exchanged · *Decline* · *Pick up* → `OpenShiftClaims` · *Add to calendar* → .ics.
**Permission.** `EmployeeSelfService:self`; approve `EmployeeSelfService:team` · **Approval.** colleague accepts, then line manager.

---

### My Team — `ess/team`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (09-team)
**Purpose.** Manager view: team attendance today, swipe-approval inbox, team calendar, team stats.
**Tables.** Primary: `Company.Approvals`, `Company.ApprovalActions` · Reads: `HumanResources.Employees` (direct reports), `HumanResources.AttendanceRegister`, `HumanResources.AttendancePunches`, `HumanResources.LeaveRequests`, `HumanResources.RegularisationRequests`, `BankCash.ExpenseClaims`, `Payroll.LoansAndAdvances`, `EmployeeSelfService.PresenceStatuses`, `Distribution.SalesmanTargets` (orders vs target) · Writes: decisions on `HumanResources.LeaveRequests`, `HumanResources.RegularisationRequests`, `BankCash.ExpenseClaims`, `Payroll.LoansAndAdvances` via `Company.ApprovalActions`; `Company.Notifications` (Nudge)
**Functions.** Save → `Company.approvalAddUpdate` · Open → `Company.getApprovalInfo` · Actions → `Company.approvalApprove`, `Company.approvalCancel`
**Lookups.** `Approvals.status` → `ApprovalStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Team today groups In / Late / On leave / Not checked in + people (time, location, Nudge / Call) | `EmployeeSelfService.getMyTeamToday` | |
| Approvals deck: label (Leave request / Attendance correction / Expense claim / Salary advance), id · age, Pending, who, title, details rows, note | `Company.Approvals` (entityType LV / REQ / EXP / ADV → source docs) | |
| Approve / Reject (reason chips + message), Approve all, Undo, Decided today | `Company.ApprovalActions` (decision, comment) | |
| Team calendar · October (leave, pending, sick, training, weekend) | `EmployeeSelfService.getMyTeamCalendar` | |
| Team stats: on-time %, orders booked vs target, overtime; per person on-time, target %, avg check-in | `HumanResources.AttendanceRegister`, `Distribution.SalesmanTargets` | |
**Statuses.** request Pending → Approved / Rejected.
**Actions → effects.** swipe right / *Approve* → ApprovalActions APPROVE (leave & advance forwarded to HR) · left / *Reject* → REJECT with reason · *Nudge* → WhatsApp `Company.Notifications`.
**Permission.** `EmployeeSelfService:team` · **Approval.** acts as approver step.

---

### Directory — `ess/company`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (08-company)
**Purpose.** People directory and org chart, announcements, policies with acknowledgement, holidays.
**Tables.** Primary: `EmployeeSelfService.PresenceStatuses`, `EmployeeSelfService.CompanyAnnouncements`, `EmployeeSelfService.CompanyAnnouncementReads`, `EmployeeSelfService.CompanyPolicies`, `EmployeeSelfService.PolicyAcknowledgements` · Reads: `HumanResources.Employees`, `HumanResources.Departments`, `HumanResources.Designations`, `Company.Branches`, `HumanResources.Holidays` · Writes: `EmployeeSelfService.CompanyAnnouncementReads`, `EmployeeSelfService.PolicyAcknowledgements`
**Functions.** Save → `EmployeeSelfService.companyAnnouncementAddUpdate` · Open → `EmployeeSelfService.getCompanyAnnouncementInfo` ‖ Save → `EmployeeSelfService.companyPolicyAddUpdate` · Open → `EmployeeSelfService.getCompanyPolicyInfo`
**Lookups.** `CompanyAnnouncements.kind` → `CompanyAnnouncementKind` · `CompanyAnnouncements.status` → `CompanyAnnouncementStatus` · `CompanyAnnouncementReads.rsvp` → `Rsvp` · `CompanyPolicies.category` → `CompanyPolicyCategory` · `CompanyPolicies.status` → `CompanyPolicyStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Search name/role/department/branch, department chips with counts | `EmployeeSelfService.getEmployeeDirectory` (`HumanResources.Employees` + `HumanResources.Departments` + `Company.Branches`) | |
| Person card: avatar, status dot + text (Available / Busy / In the field / Away), role, department, branch, Call / WhatsApp / Email | `PresenceStatuses.status, message, locationLabel`; `HumanResources.Employees` phone/email | |
| Profile drawer: Employee ID, department, branch, mobile, email, local time, reporting line (manager ↑, reports ↓) | `HumanResources.Employees` (manager) | |
| Org chart tree (expand/collapse, path to me) | `HumanResources.Employees` manager hierarchy | |
| Announcements "4 new" (icon, title, sub, age) + drawer *Got it* | `CompanyAnnouncements.kind, title, summary, publishedAt`; `CompanyAnnouncementReads` | |
| Policies "4 of 5 acknowledged" (title, version · date, Read / Acknowledge) | `CompanyPolicies.title, version, effectiveDate`; `PolicyAcknowledgements` | |
| Next holidays | `HumanResources.Holidays` | |
**Statuses.** presence AVAILABLE / BUSY / IN_FIELD / AWAY · announcement DRAFT / PUBLISHED / ARCHIVED · policy DRAFT / PUBLISHED / RETIRED.
**Actions → effects.** *Acknowledge* → `PolicyAcknowledgements` (timestamped) · *Got it* → `CompanyAnnouncementReads` · Call / WhatsApp / Email → client actions.
**Permission.** `EmployeeSelfService:self`; publish `EmployeeSelfService:admin` · **Approval.** —

---

### Onboarding — `ess/onboarding`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (15-onboarding)
**Purpose.** Role onboarding checklist (documents, policies, IT, buddy, training) with progress.
**Tables.** Primary: `HumanResources.Onboardings`, `HumanResources.OnboardingTasks` *(owned by HR)* · Reads: `HumanResources.Employees`, `HumanResources.TrainingEnrolments`, `EmployeeSelfService.CompanyPolicies` · Writes: `HumanResources.OnboardingTasks` (done), `HumanResources.EmployeeDocuments` (signed appointment letter), `EmployeeSelfService.PolicyAcknowledgements` (Read & agree), `HumanResources.Employees.emergency*` (Emergency contact step), `HumanResources.TrainingEnrolments` (progress), `Company.Tasks` / calendar invite (buddy coffee)
**Functions.** Save → `HumanResources.onboardingAddUpdate` · Open → `HumanResources.getOnboardingInfo` · Actions → `HumanResources.onboardingCancel`
**Lookups.** `Onboardings.track` → `Track` · `Onboardings.status` → `OnboardingStatus` · `OnboardingTasks.taskGroup` → `TaskGroup` · `OnboardingTasks.ownerFunction` → `OwnerFunction` · `OnboardingTasks.actionKind` → `ActionKind` · `OnboardingTasks.status` → `OnboardingTaskStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| CEO note + 90-sec welcome video | `HumanResources.Onboardings` (welcome message / media) | |
| Progress ring %, steps done, left · minutes, started / target | `HumanResources.Onboardings`, `HumanResources.OnboardingTasks` | |
| Groups Documents / Policies / IT setup / Meet your buddy / Training modules with items (title, detail, due, Done) | `HumanResources.OnboardingTasks` | |
| Upload signed appointment letter | `HumanResources.EmployeeDocuments` + `Company.Attachments` | |
| Policy reader (HR-POL-014 · v3 · effective · owner, sections, scroll-to-end, "I agree") | `EmployeeSelfService.CompanyPolicies`; `EmployeeSelfService.PolicyAcknowledgements.readToEnd, signatureText, onboardingTaskId` | |
| Buddy coffee (slot pick, topic) | `HumanResources.OnboardingTasks` + `Company.Tasks` | |
| Training module player (chapters, progress %) | `HumanResources.TrainingEnrolments` | |
| Key contacts / First 30 days | `HumanResources.OnboardingTasks` | |
**Statuses.** task pending / done *(HR)*.
**Actions → effects.** *Upload*, *Read & agree*, *Book a slot*, *Resume* → mark tasks done; 100% → notification "Ready to lead".
**Permission.** `EmployeeSelfService:self` · **Approval.** —

---

### My Profile — `ess/profile`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (07-profile)
**Purpose.** Personal, job and payroll details; change requests to HR; emergency contacts; documents with expiry.
**Tables.** Primary: `EmployeeSelfService.ProfileChangeRequests` · Reads: `HumanResources.Employees`, `HumanResources.EmployeeBankAccounts`, `HumanResources.EmployeeStatutoryDetails`, `HumanResources.EmployeeDocuments`, `HumanResources.Designations`, `HumanResources.Departments`, `HumanResources.Grades`, `Payroll.EmployeeSalaries` · Writes: `EmployeeSelfService.ProfileChangeRequests`, `HumanResources.Employees.emergency*` (self-service), `HumanResources.EmployeeDocuments` (upload/replace) *(HR)*, `Company.Attachments`
**Functions.** Save → `EmployeeSelfService.profileChangeRequestAddUpdate` · Open → `EmployeeSelfService.getProfileChangeRequestInfo` · Actions → `EmployeeSelfService.profileChangeRequestApprove`
**Lookups.** `ProfileChangeRequests.fieldKey` → `FieldKey` · `ProfileChangeRequests.status` → `ProfileChangeRequestStatus` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Header: name, role · department · branch, Active, EMP, joined, reports to, completeness 92% | `HumanResources.Employees` | completeness [derived] |
| Personal tab (Full name, Father's name, DOB, Gender, Marital status ✎, CNIC, Blood group ✎, Personal email ✎, Mobile ✎, Home address ✎) | `HumanResources.Employees` | ✎ = editable via change request |
| Job tab (Employee ID, Designation, Department, Grade, Reports to, Work location, Date of joining, Employment type, Shift, Direct reports) | `HumanResources.Employees`, `HumanResources.Designations`, `HumanResources.Departments`, `HumanResources.Grades`, `HumanResources.ShiftRosters`/`HumanResources.WorkShifts` | locked "Managed by HR" |
| Bank & Payroll tab (Salary bank ✎, Account number ✎, IBAN ✎ masked, Pay mode, NTN / tax status ✎, EOBI number, Provident fund, Basic salary, Gross, Zakat exemption ✎) | `HumanResources.EmployeeBankAccounts`, `HumanResources.EmployeeStatutoryDetails`, `Payroll.EmployeeSalaries.basicAmount, grossAmount, payMode` | |
| Request a change: Field, Current value, New value *, Reason, Supporting proof, OTP | `ProfileChangeRequests.fieldKey, fieldLabel, currentValue, requestedValue, reason, proofAttachmentId, otpVerifiedAt` | |
| Pending changes (In review · Submitted → HR review → Updated), Withdraw | `ProfileChangeRequests.status, reviewedByUserId, reviewedAt` | |
| Emergency tab: contacts (name, relation · city, phone), Add, Edit, medical notes | `HumanResources.Employees.emergencyContactName, emergencyRelation, emergencyPhone` (primary) and `emergencyAltName, emergencyAltRelation, emergencyAltPhone` (alternate); blood group `HumanResources.Employees.bloodGroup` | UI allows "up to 3" — schema holds 2 (primary + alternate); contact city not stored. See open question |
| Documents tab: name, issuer/no, expiry chip (Valid / Expires in n days / Expired), Preview, Replace, Upload | `HumanResources.EmployeeDocuments` *(HR)* | |
| Expiring soon alerts (police certificate, driving licence) | `HumanResources.EmployeeDocuments` expiry | |
**Statuses.** change request PENDING → APPROVED / REJECTED · WITHDRAWN.
**Actions → effects.** *Submit for approval* → `ProfileChangeRequests` (one pending per field) → HR approves → value applied to `HumanResources.Employees` / `HumanResources.EmployeeBankAccounts` (bank changes from next payroll) · *Save contact* → `HumanResources.Employees.emergency*` · *Upload* document → `HumanResources.EmployeeDocuments`.
**Permission.** `EmployeeSelfService:self`; review `HumanResources:employeeEdit` · **Approval.** HR (Ayesha Noor), 2 working days.

---

### Notifications — `ess/notifications`
*Source:* `src/6A-ess.html` · `src/9C-ess.js` (16-notifications)
**Purpose.** Grouped inbox of approvals, payroll, leave, attendance and social notifications with delivery preferences.
**Tables.** Primary: `Company.Notifications`, `Company.NotificationPreferences` *(owned by core)* · Reads: — · Writes: same
**Functions.** Save → `Company.notificationPreferenceAddUpdate` · Open → `Company.getNotificationPreferenceInfo`
**Lookups.** `NotificationPreferences.channel` → `NotificationPreferenceChannel` · `NotificationPreferences.delivery` → `Delivery` (values in `Lookups.Lookups`)
| UI field / column | Table.column | Notes |
|---|---|---|
| Inbox groups Today / This week / Earlier; unread count | `Company.Notifications` (createdAt, readAt) | |
| Chips All / Unread / Approvals / Payroll & tax / Leave & work / Attendance / Kudos & news | `Company.Notifications` category | |
| Item: icon, title, body, time, CTA link (route), toggle read, dismiss / swipe | `Company.Notifications` title, body, link/route, readAt, dismissedAt | |
| This week bars, approvals waiting, actioned | aggregates | |
| Delivery channels per group (In-app / Email / WhatsApp) | `Company.NotificationPreferences` | |
| Quiet hours 22:00 – 08:00 · Fridays 13:00 – 14:30 | `Company.NotificationPreferences` | |
**Statuses.** unread / read / dismissed.
**Actions → effects.** *Mark all read*, toggle, dismiss (undo), channel chips, quiet hours.
**Permission.** `EmployeeSelfService:self` · **Approval.** —
