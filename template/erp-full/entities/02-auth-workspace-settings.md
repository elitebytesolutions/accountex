# 02 · Auth, workspace & settings (Full)

Page → entity map for the entry screens, the workspace and tenant settings in **erp-full**.
Schema: `database/schema/02-core.sql` (core) · cross-module FKs: `database/fk/02-Company-fks.sql`.
Views named `core.v*` are defined in `90-views.sql`. Report Studio (`Reports` schema, `14-rpt.sql`) is mapped in `07-financial-reports.md` (`app/reports/studio`); its tables are listed at the end of this file for reference.

Screens (24):
- **Entry:** `login` · `login/forgot` · `login/mfa` · `chooser` · `mobile`
- **Workspace:** `app/dashboard` · `app/today` · `app/approvals` · `app/setup` · `app/activity` · `app/notifications` · `app/profile` · `app/import`
- **Settings:** `app/settings` · `app/settings/approvals` · `app/settings/audit` · `app/settings/backup` · `app/settings/integrations` · `app/settings/roles` · `app/settings/templates` · `app/settings/users`
- **Utility:** `app/states` · `app/404` · `app/unauthorized`

Conventions used below: every table has `tenantId` (RLS), and every write is stamped (`createdBy`/`updatedBy`). Tables created with `stdTriggers(…, true)` write `Company.AuditTrailEntries`; `Company.Users`, `Company.UserMfaMethods`, `Company.ApiKeys` and `Company.IntegrationWebhooks` use the redacting audit trigger, which never stores secrets.

---

## Entry

### Sign in — `login`
*Source:* `src/30-entry-admin.html` (section `login`)
**Purpose.** Signs a tenant user in with company code + work email + password, or with Google / Microsoft SSO.
**Tables.** Primary: `Company.Users`, `Company.UserSessions` · Reads: `Platform.Tenants` (code → tenant), `Company.Users`, `Company.CompanySettingValues` (security policy), `Company.TrustedDevices`, `Company.Integrations` (GOOGLE_WORKSPACE / MICROSOFT_365 SSO config) · Writes: `Company.UserSessions`, `Company.Users` (last_login_*, failedLoginCount, lockedUntil), `Company.AuditTrailEntries`
**Functions.** Save → `Company.userAddUpdate` · Open → `Company.getUserInfo`
**Lookups.** `Users.status` → `UserStatus` · `Users.dataScope` → `DataScope` · `Users.mfaMethod` → `UserMfaMethod` · `Users.loginHours` → `LoginHours` · `Users.ssoProvider` → `UserSsoProvider` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Company code (ALNOOR · alnoor.finsoft.pk) | `Platform.Tenants.code` / `.subdomain` | Resolved before any tenant context; the API then sets `app.tenantId`. |
| Work email | `Company.Users.email` | citext; unique per tenant among non-REMOVED users. |
| Password | `Company.Users.passwordHash` | Verified against the hash; `mustChangePassword` forces a reset. |
| Remember me for 30 days | `Company.UserSessions.rememberMe`, `.expiresAt` | expiresAt = now + 30 days when ticked, else `sessionTimeoutMin`. |
| Google / Microsoft buttons | `Company.Users.ssoProvider`, `.ssoSubject`; `Company.UserSessions.authMethod` | SSO_GOOGLE / SSO_MICROSOFT; tenant SSO set up in `Company.Integrations` ("enforced for all staff"). |
| "Two-step verification is on" banner | `Company.Users.mfaEnabled` (+ tenant policy `Platform.Tenants.requireMfa`) | Routes to `login/mfa`. |

**Statuses.** `Users.status`: only ACTIVE may sign in · INVITED (must accept invite) · SUSPENDED / REMOVED → refused. Locked while `lockedUntil > now()`.
**Actions → effects.** *Sign in* → checks status, `ipRestricted`/`PlatformAllowedIps`, `loginHours` window; on success inserts `Company.UserSessions` (tokenHash, deviceLabel, ip, clientType WEB) and `Company.AuditTrailEntries` action LOGIN; on failure increments `failedLoginCount` and writes `AuditTrailEntries` LOGIN_FAILED (`actorEmail` filled, `userId` NULL for unknown email). Five failures set `lockedUntil`.
**Permission.** none (public) · **Approval.** —

### Reset password — `login/forgot`
*Source:* `src/30-entry-admin.html` (section `login/forgot`)
**Purpose.** Sends a single-use reset link (valid 30 minutes) to the user's work email; the company admin is notified.
**Tables.** Primary: `Company.PasswordResets` · Reads: `Platform.Tenants`, `Company.Users` · Writes: `Company.PasswordResets`, `Company.Notifications` (admin), `Company.AuditTrailEntries`

| UI field / column | Table.column | Notes |
|---|---|---|
| Company code | `Platform.Tenants.code` | |
| Work email | `Company.Users.email` | Same response whether or not the email exists (no user enumeration). |
| (link token) | `Company.PasswordResets.tokenHash` | sha-256 only; `purpose` = RESET, `channel` = EMAIL. |
| "valid for 30 minutes and can be used once" | `Company.PasswordResets.expiresAt`, `.usedAt` | expiresAt = createdAt + 30 min; CHECK caps any token at 8 days. |
| "Use a recovery code" (from MFA page) | `Company.Users.mfaRecoveryCodes` | Hashed single-use codes. |

**Statuses.** token: open → used (`usedAt`) · expired (derived `expiresAt < now()`).
**Actions → effects.** *Send reset link* → inserts `PasswordResets` (requestedIp); emails link; `notification` to the tenant Owner (event PASSWORD_RESET_REQUESTED, category SYSTEM). *Choose new password* (from link) → sets `Users.passwordHash`, `passwordChangedAt`, marks `usedAt`, revokes all `UserSessions` rows (revokeReason PASSWORD_CHANGED), `AuditTrailEntries` PASSWORD_RESET.
**Permission.** none (public) · **Approval.** —

### Verify sign in — `login/mfa`
*Source:* `src/30-entry-admin.html` (section `login/mfa`)
**Purpose.** Second factor: 6-digit code from the authenticator app (SMS fallback, recovery codes); optionally trusts the device for 30 days.
**Tables.** Primary: `Company.UserSessions` · Reads: `Company.Users` (mfaMethod, mfaSecretEnc, phone), `Company.UserMfaMethods` (SMS fallback, WebAuthn) · Writes: `Company.UserSessions`, `Company.TrustedDevices`, `Company.UserMfaMethods.lastUsedAt`, `Company.AuditTrailEntries`

| UI field / column | Table.column | Notes |
|---|---|---|
| 6-digit code | verified against `Company.Users.mfaSecretEnc` (TOTP) | Code itself is never stored. |
| "Code to +92 300 ••• 4521" / Resend by SMS | `Company.UserMfaMethods` factor SMS `.phone` (or `Company.Users.phone`) | |
| Recovery codes (10 single-use) | `Company.Users.mfaRecoveryCodes` | A used code is removed from the array. |
| Trust this device for 30 days | `Company.TrustedDevices.trustedUntil` (+ `Company.UserSessions.trustedUntil`) | Device fingerprint hash; later sign-ins from it skip MFA until then. |
| Code expires in 00:48 | — | TOTP window, not stored. |

**Statuses.** session: pending MFA (`mfaVerifiedAt` NULL) → verified.
**Actions → effects.** *Verify & continue* → sets `UserSessions.mfaVerifiedAt` (+ `trustedUntil`), `Users.lastLoginAt/lastLoginIp`, `AuditTrailEntries` LOGIN (changes: `{"mfa": "TOTP"}`); redirect to `UserPreferences.startRoute`.
**Permission.** none (authenticated, pre-MFA) · **Approval.** —

### Welcome to Finsoft — `chooser`
*Source:* `src/30-entry-admin.html` (section `chooser`)
**Purpose.** Portal picker: Platform Admin, Company Workspace, Employee Self-Service and Mobile Apps.
**Tables.** Primary: — · Reads: `Platform.Tenants` (subdomain "alnoor.finsoft.pk"), `Company.Users` / `Platform.PlatformStaff` (signed-in identity line) · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Platform Admin "Signed in as Saim Javed" | `Platform.PlatformStaff.fullName` | staff portal (`admin/*`). |
| Company Workspace "alnoor.finsoft.pk" | `Platform.Tenants.subdomain` | → `login`. |
| Employee Self-Service "Bilal Khan · EMP-0042" | `Company.Users.employeeId` → `HumanResources.Employees.code` | → `ess/dashboard`. |
| Mobile Apps | — | → `mobile`. |
| Marketing stats (128 companies, Rs 42B+, 99.98% uptime) | — | static marketing copy **[simulated]**, not stored. |

**Statuses.** — · **Actions → effects.** Navigation only.
**Permission.** none (public) · **Approval.** —

### Mobile Apps — `mobile`
*Source:* `src/70-mobile.html` (section `mobile`) · `src/9D-mobile.js` (live phones + gallery)
**Purpose.** Design reference for the Employee and Owner companion apps (check-in, leave, payslips, receipt scan; cash, approvals, receivables). The apps use the same tables as the web screens.
**Tables.** Primary: `Company.TrustedDevices`, `Company.UserMfaMethods` (MOBILE_BIOMETRIC) · Reads: `Company.Notifications`, `Company.Approvals`, `Company.getApprovalsInbox`, `Company.getDashboardCashAndBank`, `HumanResources.AttendancePunches`, `HumanResources.LeaveRequests`, `HumanResources.LeaveBalances`, `Payroll.Payslips`, `BankCash.ExpenseClaims`, `Sales.SalesInvoices`, `Sales.CustomerReceipts` · Writes: `Company.TrustedDevices`, `Company.UserSessions` (clientType IOS_APP / ANDROID_APP), `Company.ApprovalActions`, `Company.UserPreferences.language`, plus the module tables above
**Functions.** Save → `Company.userAddUpdate` · Open → `Company.getUserInfo`
**Lookups.** `UserMfaMethods.factorType` → `FactorType` · `UserMfaMethods.status` → `UserMfaMethodStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Face ID / fingerprint unlock, Biometric login | `Company.TrustedDevices.biometricUnlock`; `Company.UserMfaMethods` factor MOBILE_BIOMETRIC | |
| Push alerts ("Your September payslip is ready", "Cash below minimum") | `Company.TrustedDevices.pushToken`; `Company.Notifications.channels` contains PUSH | |
| Works offline, syncs later ("2 actions will sync") | client queue; each synced write is a normal insert | offline queue itself is not stored server-side. |
| Owner app · swipe right to approve / left → reason sheet / Approve all | `Company.ApprovalActions` (APPROVE / REJECT with `reason`, `isBulk`) | |
| Owner app · cash hero, ageing donut, WhatsApp reminder | `Company.getDashboardCashAndBank`; AR ageing view; `Sales.PaymentReminderLogs` | |
| Employee app · geofenced check-in with face + GPS | `HumanResources.AttendancePunches` (owned by hr); branch geofence from `Company.Branches.latitude/longitude/geofenceRadiusM` | |
| Employee app · apply leave / correction / advance / scan expense (OCR) | `HumanResources.LeaveRequests`, `HumanResources.RegularisationRequests`, `Payroll.LoansAndAdvances`, `BankCash.ExpenseClaims` + `Company.Attachments` (RECEIPT) | |
| English / اردو | `Company.UserPreferences.language` | |
| Spec sections (type scale, spacing, colours, motion, a11y) | — | design documentation, no data. |

**Statuses.** As in the owning modules (approval PENDING → APPROVED/REJECTED; leave, claim statuses).
**Actions → effects.** *Register device* → `TrustedDevices` + `UserSessions` (IOS_APP / ANDROID_APP). Other actions are the same as their web counterparts.
**Permission.** per action (`prun:approve`, `vpay:approve` …) · **Approval.** uses `core.approval*`.

---

## Workspace

### Dashboard — `app/dashboard`
*Source:* `src/48-dash-stock.html` (section `app/dashboard`) · `src/92-dash.js` (charts)
**Purpose.** Finance overview: cash & bank balance, monthly revenue and expenses, money flow, recent transactions.
**Tables.** Primary: views only · Reads: `Company.getDashboardCashAndBank`, `Company.getDashboardMonthlyRevenue`, `Company.getDashboardMonthlyExpenses`, `Company.getDashboardMoneyFlow`, `Company.getDashboardRecentTransactions`, `Company.getDashboardBudgetRemaining`, `Company.getApprovalsInbox`, `Payroll.getNextPayrollRun`, `Company.Users` (greeting), `Company.CompanySettings` (fyStartMonth for "FY 2026-27 · Q2") · Writes: —

| UI field / column | Table.column | Notes |
|---|---|---|
| Cash & Bank Balance "Rs 48,215,300 · 4 banks, 3 cash books" | `Company.getDashboardCashAndBank.totalBalance`, `.bankAccountCount`, `.cashAccountCount` | Period select (All time / This month / This quarter / FY) filters the movement pills. |
| Total earned last month / Collections MTD | `Company.getDashboardCashAndBank.earnedLastMonth`, `.collectionsMtd` | |
| Revenue "Rs 18,642,750 · September 2026", Sales / Services / Other | `Company.getDashboardMonthlyRevenue.totalRevenue`, `.salesGoods`, `.services`, `.otherIncome` | MoM % from `.prevMonthTotal`. Daily heat strip = `Company.getDashboardDailyRevenue`. |
| Total expenses · September, "7.4% below plan", gauge "goal of 75%", Saved | `Company.getDashboardMonthlyExpenses.totalExpenses`, `.budgetAmount`, `.budgetUsedPct`, `.varianceAmount` | budget from `Accounting.BudgetVersionLines` (approved version). |
| Money Flow (Income / Expense, Monthly / Quarterly) | `Company.getDashboardMoneyFlow.income`, `.expense`, `.periodStart`, `.grain` | |
| Transaction History (Name, Date, Method, Amount, Status) | `Company.getDashboardRecentTransactions.partyName`, `.docNo`, `.occurredAt`, `.method`, `.amount`, `.direction`, `.status` | Union of `Sales.CustomerReceipts`, `Purchases.VendorPayments`, `Purchases.VendorBills`, `Sales.SalesInvoices`. Filter All / Receipts / Payments = `direction`. |
| Budget Remaining 69%, cost-centre bars (Payroll 89% · Rs 19.1M of Rs 21.5M, Operations, Marketing) | `Company.getDashboardBudgetRemaining.remainingPct`, per cost centre `.costCentreName`, `.actualAmount`, `.budgetAmount`, `.usedPct` | |
| Pending approvals (count, doc no., party/preparer, amount) | `Company.getApprovalsInbox` for the signed-in user | → `app/approvals`. |
| Payroll · October PR-2026-10, estimated net pay, employees, "3 of 6 steps · due 28 Oct" | `Payroll.getNextPayrollRun` (run docNo, estNetPay, employeeCount, stepsDone, stepsTotal, dueDate) | view owned by the payroll module. |

**Statuses.** Transaction status chips Completed / Pending / Failed come from the source document status.
**Actions → effects.** *Today's Work* → `app/today` · *New Invoice* → `app/sales/invoices/new`. Read-only.
**Permission.** `frep:view` for the finance cards; each card is hidden when its module permission (`bank:view`, `sinv:view`, `bill:view`) is missing · **Approval.** —

### Today's Work — `app/today`
*Source:* `src/40-acc-core.html` (section `app/today`, modal `Accounting-new-task`) · `src/9K-calc.js` (calculator + tax calculator)
**Purpose.** The user's day: tasks, approvals queue, items due today, agenda, the business calculator and the tax calculator.
**Tables.** Primary: `Company.Tasks`, `Company.CalculatorTapeLines`, `Company.CalculatorSettings` · Reads: `Company.getTodayKpis`, `Company.getTodayDueItems`, `Company.getApprovalsInbox`, `Company.Users` · Writes: `Company.Tasks`, `Company.ApprovalActions`, `Company.CalculatorTapeLines`, `Company.CalculatorSettings`
**Functions.** Save → `Company.taskAddUpdate` · Open → `Company.getTaskInfo` ‖ Save → `Company.calculatorSettingAddUpdate` · Open → `Company.getCalculatorSettingInfo`
**Lookups.** `Tasks.kind` → `TaskKind` · `Tasks.module` → `TaskModule` · `Tasks.priority` → `TaskPriority` · `Tasks.status` → `TaskStatus` · `Tasks.repeatRule` → `RepeatRule` · `Tasks.source` → `TaskSource` · `CalculatorSettings.numberGrouping` → `NumberGrouping` · `CalculatorSettings.language` → `EnUrLanguage` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Tasks due today / completed | `Company.getTodayKpis.tasksDueToday`, `.tasksDoneToday` | |
| KPI Overdue "since 29 Sep" | `Company.getTodayKpis.overdueTasks`, `.oldestOverdueDate` | derived: due passed and status not DONE/CANCELLED. |
| KPI Awaiting approval "7 · Rs 17.2M" | `Company.getTodayKpis.awaitingApprovalCount`, `.awaitingApprovalValue` | from `Company.getApprovalsInbox` for this user. |
| KPI Due today "Rs 3,860,400" | `Company.getTodayKpis.dueTodayAmount` | sum of `Company.getTodayDueItems.amount`. |
| Daily progress 38% | done / due today | |
| This week strip (Payroll accrual, 2 overdue, Month end, PDC × 3) | `Company.Tasks` by `dueDate`; `Company.getTodayDueItems` by date | |
| My task list: Task (title + sub-line), Module, Priority, Due, Status; chips All / Pending / In progress / Done | `Company.Tasks.title`, `.notes`, `.module`, `.priority`, `.dueTime`, `.status` | Module link = `Tasks.linkRoute`; Overdue chip derived. |
| Task checkbox | `Company.Tasks.status` = DONE, `.completedAt` | |
| Approvals queue (Document, Requested by, Submitted, Amount, Approve / Reject, Approve selected) | `Company.getApprovalsInbox.docLabel`, `.title`, `.requestedByUserId`, `.requestedAt`, `.amount` | |
| Due today: Invoices due / Bills due / Cheques maturing | `Company.getTodayDueItems.kind` (INVOICE_DUE / BILL_DUE / CHEQUE_MATURING), `.docNo`, `.partyName`, `.amount`, `.linkRoute` | from `Sales.SalesInvoices`, `Purchases.VendorBills`, `BankCash.Cheques`. |
| Agenda (09:30 · Finance stand-up, With …; Remind me) | `Company.Tasks` kind MEETING / REMINDER, `.dueTime`, `.participants`, `.remindBeforeMin` | |
| Add task: Title *, Module, Assign to, Due date, Due time, Priority, Repeat, Notes, Remind me 30 minutes before | `Company.Tasks.title`, `.module`, `.assigneeUserId`, `.dueDate`, `.dueTime`, `.priority`, `.repeatRule`, `.notes`, `.remindBeforeMin` | `assignedByUserId` = me when assigning to someone else. |
| Calculator tape (expression, result, time; GST / units / Σ total lines; GT) | `Company.CalculatorTapeLines.expression`, `.result`, `.kind`, `.enteredAt`, `.seq`, `.tapeDate` | optional server sync (today: browser storage). |
| Calculator settings (rounding, lakh / intl grouping, GST rate, English / اردو words, memory M+) | `Company.CalculatorSettings.roundingStep`, `.numberGrouping`, `.gstRatePct`, `.language`, `.memoryValue` | |
| Tax Calculator: Amount + currency, Tax %, Tax type (GST 18%, WHT 153(1)(a) 5%, Further tax 4%, PRA 16%), Net / Tax / Total, amount in words, "To tape" | computed client-side; rates default from `Company.CompanySettings.standardGstRatePct`, `.furtherTaxRatePct`, `.provincialServicesRatePct` and `Tax.TaxCodes`; currencies from `Company.Currencies` | "To tape" → `CalculatorTapeLines` kind GST. |

**Statuses.** task: PENDING → IN_PROGRESS → DONE · CANCELLED · OVERDUE (derived).
**Actions → effects.** *Add task* → INSERT `task` (+ `notification` to the assignee when delegated). *Tick* → status DONE. *Approve / Reject / Approve selected* → `ApprovalActions` (see Approvals Inbox). *Remind me* → `task` kind REMINDER. *Calendar* → same rows by date.
**Permission.** any signed-in user (own tasks); approvals need the document's approve permission · **Approval.** —

### Approvals Inbox — `app/approvals`
*Source:* `src/4A-company-plus.html` (section `app/approvals`) · `src/9A-company-plus.js` (approvals)
**Purpose.** Everything waiting on the user: approve, reject, request changes, delegate, comment, bulk approve.
**Tables.** Primary: `Company.Approvals`, `Company.ApprovalActions` · Reads: `Company.getApprovalsInbox`, `Company.ApprovalWorkflowSteps`, `Company.ApprovalWorkflows`, `Company.Users`, `Company.Comments`, `Company.Attachments`, the source document (via `entityType`/`entityId`) · Writes: `Company.ApprovalActions`, `Company.Approvals`, `Company.Comments`, `Company.Mentions`, `Company.Notifications`, `Company.AuditTrailEntries`
**Functions.** Save → `Company.approvalAddUpdate` · Open → `Company.getApprovalInfo` · Actions → `Company.approvalApprove`, `Company.approvalCancel`
**Lookups.** `Approvals.status` → `ApprovalStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Waiting on you / past SLA | count of `Company.getApprovalsInbox` for me; `.isBreached` | |
| KPI Value pending "across n document types" | sum `.amount`; distinct `.entityType` | |
| KPI SLA breached · oldest | `.isBreached`; max `.ageHours` | |
| KPI Approved today · avg turnaround | `Company.ApprovalActions` APPROVE by me today; avg(actedAt − requestedAt) | |
| Type chips (Vouchers, Purchase orders, Vendor bills, Payments, Leave, Expense claims, Payroll, Credit overrides) | `Approvals.entityType` → `Company.DocumentTypes` (JV/CPV/BPV, PO, BILL, PAY, LV, EXP, PRUN, CO) | via `ApprovalWorkflows.subject`. |
| Card / row: document no., type, title | `Approvals.docLabel`, `.entityType`, `.title` | |
| Amount ("No amount" for leave) | `Approvals.amount` | NULL allowed. |
| Requested by · age | `.requestedByUserId`, `.requestedAt` (age = now − requestedAt) | |
| SLA chip "Due in 4h / 20h left / SLA breached 1d 3h" | `.currentStepDueAt` vs now | from `ApprovalWorkflowSteps.slaHours`. |
| Big card mini-lines (Gross salaries, EOBI …) / drawer document lines | read from the source document's lines | not copied. |
| Approval chain (name, role, Approved at / Waiting on you / Pending after you) | `Company.ApprovalWorkflowSteps` (name, approver) + `Company.ApprovalActions` (APPROVE rows, `actedAt`) + `Approvals.currentStepNo` | |
| Attachments "2 attachments" / "Open full document" | `Company.Attachments` (entityType / entityId) / `linkRoute` | |
| Comments thread, "@ to mention" | `Company.Comments` (entity = the document), `Company.Mentions` | |
| Reject / Request changes reason chips + note | `Company.ApprovalActions.reason`, `.comment` | required by CHECK. |
| Delegate (pick a person) | `Company.ApprovalActions` DELEGATE `.delegateToUserId` | |
| Bulk approve n selected · progress | one `ApprovalActions` per request with `isBulk = true` | |
| Keyboard J/K/A/R/X | — | UI only. |

**Statuses.** request: PENDING → APPROVED (last step) · REJECTED · CHANGES_REQUESTED (back to preparer) · CANCELLED. Per step: done / you / waiting (derived).
**Actions → effects.** *Approve* → `ApprovalActions` APPROVE; next applicable step (skips steps whose `appliesAboveAmount` ≥ amount, logged AUTO_SKIP) sets `currentStepNo` + `currentStepDueAt`, notifies the next approver; after the last step `status` APPROVED, `completedAt`; when `ApprovalWorkflows.onComplete` = AUTO_POST the posting service posts the document (see POSTING_RULES › Approval gate) and the preparer is notified. *Reject* → status REJECTED, document returns to DRAFT. *Request changes* → CHANGES_REQUESTED. *Delegate* → DELEGATE action; the delegate sees it in their inbox. Each action writes `AuditTrailEntries` APPROVE / REJECT / DELEGATE.
**Permission.** the `…:approve` permission of the document's module (`vch:approve`, `po:approve`, `bill:approve`, `vpay:approve`, `lv:approve`, `prun:approve` …) plus being the step's approver; `blockSelfApproval` stops preparers · **Approval.** this is the approval engine.

### Setup Guide — `app/setup`
*Source:* `src/4A-company-plus.html` (section `app/setup`) · `src/9A-company-plus.js` (setup)
**Purpose.** Onboarding checklist with progress ring, next step, tour video and help contacts.
**Tables.** Primary: `Company.SetupGuideSteps` · Reads: `Company.getSetupGuideProgress`, plus auto-detection sources (`Company.CompanySettings`, `Accounting.ChartOfAccounts`, `Accounting.OpeningBalances`, `Inventory.Products`, `BankCash.BankAccounts`, `Tax.TaxCodes`, `Company.Users`, `Sales.SalesInvoices`, `Payroll.SalaryStructures`) · Writes: `Company.SetupGuideSteps`

| UI field / column | Table.column | Notes |
|---|---|---|
| Progress ring %, "n of 9 done", segment bar | `Company.getSetupGuideProgress.progressPct`, `.doneSteps`, `.totalSteps` | weights are product config (10/14/14/10/10/10/8/10/14). |
| Step rows: number, title, group, ~minutes, % of setup, Done / To do | `SetupGuideSteps.stepKey`, `.isDone` | metadata from config. |
| Tips ("NTN 4271839-6 and STRN verified", "16 items imported") | live counts from the module tables | **[simulated]** in the prototype. |
| Mark done / Mark as not done | `SetupGuideSteps.isDone`, `.doneAt`, `.doneByUserId` | |
| Continue: next step, minutes left | first step with `isDone = false` | |
| Tour video, onboarding specialist, WhatsApp / Call / Book a session, guides | — | static content / external links **[simulated]**. |

**Statuses.** To do → Done (manual or `autoDetected`).
**Actions → effects.** *Mark done* → UPSERT `SetupGuideSteps`. Step CTAs navigate to the owning screen.
**Permission.** `comp:edit` · **Approval.** —

### Activity Feed — `app/activity`
*Source:* `src/4A-company-plus.html` (section `app/activity`) · `src/9A-company-plus.js` (activity)
**Purpose.** Team feed of document events and posts with comments, @mentions, reactions and attachments.
**Tables.** Primary: `Company.ActivityEvents`, `Company.Comments`, `Company.Mentions`, `Company.Reactions` · Reads: `Company.Users`, `Company.UserSessions` (online now), `Company.Attachments` · Writes: `Company.ActivityEvents` (kind POST), `Company.Comments`, `Company.Mentions`, `Company.Reactions`, `Company.Attachments`, `Company.Notifications` (mentions)

| UI field / column | Table.column | Notes |
|---|---|---|
| Composer "Share an update…", module select, Post (Ctrl+Enter) | `ActivityEvents.body`, `.module`, `kind` = POST, `.actorUserId` | |
| Attach / Link document | `Company.Attachments.activityEventId`; `ActivityEvents.entityType`/`entityId`/`entityLabel` | |
| @mention autocomplete | `Company.Mentions.mentionedUserId` | + `notification` (isMention). |
| Post header "Zainab Raza created invoice INV-2026-000958 · 12:42 PM" | `.actorUserId`, `.verb`, `.entityLabel`, `.linkRoute`, `.occurredAt` | |
| Document card (amount, sub-line, status badge) | `.amount`, `.summary`, `.statusLabel`, `.statusTone` | |
| Module badge | `.module` | SALES / PURCHASES / ACCOUNTING / BANK / HR / INVENTORY … |
| 👍 / 🎉 reactions, React | `Company.Reactions.emoji` (count per emoji, mine highlighted) | |
| Reply · n, reply box | `Company.Comments.activityEventId`, `.body` | |
| Tabs All activity / Mentions / My activity | `Company.Mentions` for me; `actorUserId` = me or my replies | |
| People / Modules filters with counts | group by `actorUserId` / `module` | |
| Online now "5 of 12 teammates" | `Company.UserSessions.lastActiveAt` within 5 minutes | |
| Day separators Today / Yesterday / Mon 28 Sep | `.occurredAt` | |

**Statuses.** —
**Actions → effects.** *Post* → INSERT `ActivityEvents` (POST) + `mention` + `attachment`. *Reply* → `comment`. *React* → INSERT / remove `reaction`. System events are written by module services on create / post / approve / close.
**Permission.** any signed-in user; document cards respect the document's view permission · **Approval.** —

### Notification Centre — `app/notifications`
*Source:* `src/40-acc-core.html` (section `app/notifications`)
**Purpose.** Approvals, finance alerts, HR events and system messages in one inbox, with delivery-channel preferences.
**Tables.** Primary: `Company.Notifications` · Reads: `Company.getNotificationSummary`, `Company.UserPreferences`, `Company.NotificationPreferences`, `Company.Mentions` · Writes: `Company.Notifications` (readAt), `Company.UserPreferences`, `Company.NotificationPreferences`

| UI field / column | Table.column | Notes |
|---|---|---|
| Tabs All / Approvals / Finance / HR / System (counts) | `Notifications.category` | APPROVALS / FINANCE / HR / SYSTEM |
| Groups Today / Yesterday / Earlier this week | `Notifications.createdAt` | |
| Title ("Hira Ali submitted JV-2026-000045 for approval") | `Notifications.title` | |
| Sub-line ("Payroll accrual · Rs 14,620,000 · 08:42 AM") | `Notifications.body`, `.amount`, `.createdAt` | |
| Link target | `Notifications.linkRoute`, `.entityType`, `.entityId` | |
| Unread / Read | `Notifications.readAt` | |
| Summary: Unread, Needs action, Mentions, Total received (7 days) | `Company.getNotificationSummary.unread`, `.needsAction`, `.mentions`, `.total7d` | from `readAt`, `needsAction`, `isMention`. |
| Delivery channels: In-app, Email digest (daily 08:00), SMS for approvals above Rs 1M, WhatsApp cheque maturity alerts | `Company.UserPreferences.notifyInApp`, `.notifyEmailDigest` + `.emailDigestTime`, `.notifySmsApprovalsAbove`, `.notifyWhatsapp`; per event × channel overrides in `Company.NotificationPreferences` (`eventCode`, `channel`, `minAmount`, `delivery`) | e.g. PDC_MATURING × WHATSAPP, APPROVAL_ASSIGNED × SMS min 1,000,000. |

**Statuses.** Unread → Read · Archived.
**Actions → effects.** *Open* → sets `readAt`. *Mark all read* → UPDATE all unread rows of the user. *Preferences* → `app/profile`.
**Permission.** any signed-in user (own rows only) · **Approval.** —

### My Profile — `app/profile`
*Source:* `src/60-settings-ess.html` (section `app/profile`, tabs prof-profile, prof-security, prof-prefs)
**Purpose.** The signed-in user's personal details, password, MFA, sessions and preferences.
**Tables.** Primary: `Company.Users`, `Company.UserPreferences`, `Company.UserSessions` · Reads: `Company.UserRoles`/`Company.Roles`, `Company.UserBranches`, `Company.AuditTrailEntries` (recent activity) · Writes: `Company.Users`, `Company.UserPreferences`, `Company.UserSessions`, `Company.Attachments` (photo), `Company.AuditTrailEntries`
**Functions.** Save → `Company.userAddUpdate` · Open → `Company.getUserInfo` ‖ Save → `Company.userPreferenceAddUpdate` · Open → `Company.getUserPreferenceInfo`
**Lookups.** `Users.status` → `UserStatus` · `Users.dataScope` → `DataScope` · `Users.mfaMethod` → `UserMfaMethod` · `Users.loginHours` → `LoginHours` · `Users.ssoProvider` → `UserSsoProvider` · `UserPreferences.language` → `EnUrLanguage` · `UserPreferences.dateFormat` → `DateFormat` · `UserPreferences.numberFormat` → `NumberFormat` · `UserPreferences.startRoute` → `StartRoute` · `UserPreferences.theme` → `Theme` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Header: name, role, department, branch, email, "MFA on", "Member since" | `Users.fullName`, role, `.department`, `defaultBranchId` → `Branches.name`, `.email`, `.mfaEnabled`, `.activatedAt` | |
| Change photo | `Users.avatarAttachmentId` → `Company.Attachments` (AVATAR) | |
| First name, Last name, Display name, Job title | `Users.firstName`, `.lastName`, `.fullName`, `.jobTitle` | |
| Email (disabled) | `Users.email` | Changed only by an admin. |
| Mobile | `Users.phone` | |
| Default branch | `Users.defaultBranchId` | must be one of `UserBranches`. |
| Linked employee EMP-0007 (disabled) | `Users.employeeId` → `HumanResources.Employees.code` | set by an admin on Users. |
| Email signature | `Users.emailSignature` | |
| Access summary: Role, Branches, Approval limit, Last sign-in | `UserRoles`, `UserBranches`, `Users.approvalLimit`, `.lastLoginAt` | |
| Recent activity | `Company.AuditTrailEntries` where `userId` = me | |
| Change password (current, new, confirm; "Last changed 64 days ago"; min 12 chars) | `Users.passwordHash`, `.passwordChangedAt` | |
| Two-factor authentication: setup key, 6-digit code, Recovery codes | `Users.mfaSecretEnc`, `.mfaMethod`, `.mfaEnabled`, `.mfaRecoveryCodes`; extra factors in `Company.UserMfaMethods` | |
| Active sessions (Device, Location, IP, Signed in, Last active, Revoke, Revoke all others) | `Company.UserSessions.deviceLabel`, `.locationLabel`, `.ipAddress`, `.signedInAt`, `.lastActiveAt`, `.revokedAt` | |
| Language, Date format, Number format, Start page, Theme, Compact tables, Show account codes | `Company.UserPreferences.language`, `.dateFormat`, `.numberFormat`, `.startRoute`, `.theme`, `.compactTables`, `.showAccountCodes` | |
| Notifications toggles (approvals assigned, vouchers rejected, bank alerts, credit breaches, daily cash email 08:00, tax due, WhatsApp) | `UserPreferences.notifyEvents` (APPROVAL_ASSIGNED, DOC_REJECTED, BANK_ALERT, CREDIT_BREACH, DAILY_CASH_POSITION, TAX_DUE), `.notifyWhatsapp` | |

**Statuses.** —
**Actions → effects.** *Save profile* → UPDATE `Users`. *Update password* → new hash, `passwordChangedAt`, revoke other sessions (PASSWORD_CHANGED), audit PASSWORD_RESET (redacted). *Verify authenticator* → `mfaEnabled = true`. *Recovery codes* → regenerates `mfaRecoveryCodes`. *Revoke / Revoke all others* → `UserSessions.revokedAt` (USER_REVOKED). *Save preferences* → UPSERT `UserPreferences`.
**Permission.** any signed-in user (own record) · **Approval.** —

### Data Import — `app/import`
*Source:* `src/4A-company-plus.html` (section `app/import`) · `src/9A-company-plus.js` (dataImport)
**Purpose.** Five-step wizard to import customers, vendors, items, opening balances, employees or the chart of accounts from Excel/CSV (Tally, QuickBooks, Peachtree).
**Tables.** Primary: `Company.DataImports`, `Company.DataImportErrors` · Reads: `Company.DocumentTypes`, target tables for duplicate checks · Writes: `Company.DataImports`, `Company.DataImportErrors`, `Company.Attachments` (IMPORT_FILE), and the targets `Sales.Customers`, `Purchases.Vendors`, `Inventory.Products`, `Accounting.OpeningBalances/Line`, `HumanResources.Employees`, `Accounting.ChartOfAccounts`; `Company.AuditTrailEntries` (IMPORT)
**Functions.** Save → `Company.dataImportAddUpdate` · Open → `Company.getDataImportInfo` · Actions → `Company.dataImportCancel`
**Lookups.** `DataImports.entity` → `Entity` · `DataImports.sourceSystem` → `SourceSystem` · `DataImports.status` → `DataImportStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| 1 Choose data (Customers, Vendors, Items, Opening balances, Employees, Chart of accounts; "n fields · n required") | `DataImports.entity` | field catalogue is product config. |
| 2 Upload file (.xlsx/.xls/.csv ≤ 10 MB; "1,362 rows · 7 columns detected"); Use sample file; Download template | `DataImports.fileAttachmentId`, `.fileName`, `.fileSizeBytes`, `.totalRows`, `.sourceSystem` | |
| 3 Map columns (drag source column → Finsoft field, confidence %, Auto-map) | `DataImports.columnMap` (`{"field": {"source": "...", "confidence": n}}`) | |
| 4 Validate (errors per row/field, inline fix, "Skip rows with errors", Download error rows) | `Company.DataImportErrors.rowNo`, `.fieldKey`, `.badValue`, `.message`, `.isFixed`, `.fixedValue`; `DataImports.skipErrorRows`, `.errorCount` | e.g. "NTN must look like 1234567-8", "CNIC must be 13 digits", "Duplicate SKU in file". |
| 5 Import: progress "row n", Created / Updated / Skipped / Speed, job number IMP-2026-0… | `DataImports.rowsCreated`, `.rowsUpdated`, `.rowsSkipped`, `.startedAt`, `.finishedAt`, `.jobNo`, `.status` | speed = rows / (finished − started). |
| Recent imports list | `Company.DataImports` latest first | |

**Statuses.** UPLOADED → MAPPED → VALIDATED → IMPORTING → COMPLETED · FAILED · CANCELLED.
**Actions → effects.** *Start import* → status IMPORTING; target rows inserted / updated in one transaction per batch; opening balances create an `Accounting.OpeningBalances` (posted later from Opening Balances); `AuditTrailEntries` IMPORT with counts. *Download template / error rows* → files only.
**Permission.** `bak:create` (Backup & import) plus the target's create permission (`cust:create`, `vend:create`, `item:create`, `emp:create`, `coa:create`) · **Approval.** —

---

## Settings

### Company Settings — `app/settings`
*Source:* `src/60-settings-ess.html` (section `app/settings`, tabs set-profile, set-branches, set-finance, set-sales, set-tax, set-numbering, set-branding)
**Purpose.** Legal profile, branches, finance defaults and account mapping, sales/purchase defaults, tax registration, numbering series and branding.
**Tables.** Primary: `Company.CompanySettings`, `Company.Branches`, `Company.DefaultAccountMappings`, `Company.NumberingSeries`, `Company.CompanySettingValues` · Reads: `Company.Currencies`, `Company.PostingRoles`, `Company.DocumentTypes`, `Company.NumberingSeriesCounters`, `Company.ExchangeRates`, `Accounting.ChartOfAccounts`, `BankCash.BankAccounts`, `Tax.TaxCodes`, `Tax.FbrSettings`, `Company.Users`, `HumanResources.Employees` (manager, headcount) · Writes: same primaries, `Company.Attachments` (logo), `Company.AuditTrailEntries`
**Functions.** Save → `Company.companySettingAddUpdate` · Open → `Company.getCompanySettingInfo` ‖ Save → `Company.branchAddUpdate` · Open → `Company.getBranchInfo` ‖ Save → `Company.defaultAccountMappingAddUpdate` · Open → `Company.getDefaultAccountMappingInfo` ‖ Save → `Company.numberingSeriesAddUpdate` · Open → `Company.getNumberingSeriesInfo`
**Lookups.** `CompanySettings.province` → `Province` · `CompanySettings.industry` → `CompanySettingIndustry` · `CompanySettings.legalStructure` → `LegalStructure` · `CompanySettings.numberFormat` → `NumberFormat` · `CompanySettings.fxRateSource` → `FxRateSource` · `CompanySettings.creditLimitAction` → `CreditLimitAction` · `CompanySettings.salesTaxReturnPeriod` → `SalesTaxReturnPeriod` · `CompanySettings.provincialTaxAuthority` → `ProvincialTaxAuthority` · `CompanySettings.atlStatus` → `CompanySettingAtlStatus` · `CompanySettings.documentFont` → `DocumentFont` · `CompanySettings.paperSize` → `PaperSize` · `CompanySettings.payDayRule` → `PayDayRule` · `CompanySettings.payrollCutoff` → `PayrollCutoff` · `CompanySettings.workingDaysBasis` → `WorkingDaysBasis` · `CompanySettings.workingWeek` → `WorkingWeek` · `CompanySettings.attendanceSource` → `AttendanceSource` · `Branches.province` → `Province` · `Branches.salesTaxAuthority` → `SalesTaxAuthority` · `Branches.status` → `ActiveInactiveStatus` · `NumberingSeries.resetPolicy` → `ResetPolicy` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Tenant code ALNOOR (badge) | `Platform.Tenants.code` | read-only |
| **Company Profile** · Company logo (PNG/SVG ≥400 px, ≤2 MB) | `Company.CompanySettings.logoAttachmentId` → `Company.Attachments` (purpose LOGO) | CHECK ≤ 2 MB. |
| Legal name * / Trading name | `CompanySettings.legalName`, `.tradingName` | |
| Company registration (SECP) | `.secpRegNo` | |
| NTN * / STRN | `.ntn`, `.strn` | NTN `1234567-8`; STRN `NN-NN-NNNN-NNN-NN`, required when GST registered. |
| Registered address, City, Province | `.registeredAddress`, `.city`, `.province` | Province PUNJAB/SINDH/ICT/KPK/BALOCHISTAN (+GB/AJK). |
| Phone, Email, Website | `.phone`, `.email`, `.website` | |
| Industry | `.industry` | TRADING_DISTRIBUTION / MANUFACTURING / SERVICES / RETAIL / CONSTRUCTION … |
| Time zone | `.timezone` | Asia/Karachi |
| Legal structure | `.legalStructure` | PRIVATE_LIMITED / PUBLIC_LIMITED / AOP_PARTNERSHIP / SOLE_PROPRIETOR |
| **Branches** · Code | `Company.Branches.code` | LHR / KHI / ISB / FSD / MUL; `{BR}` numbering token. |
| Branch (name + sub-line "Head office · default") | `Branches.name`, `.description`, `.isHeadOffice`, `.isDefault` | One default per tenant. |
| Manager | `Branches.managerEmployeeId` → `HumanResources.Employees` (and `.managerUserId` → `Company.Users` when the manager signs in) | |
| Address | `Branches.address`, `.city`, `.province` | |
| Sales tax authority "Punjab (PRA)" | `Branches.salesTaxAuthority` | PRA / SRB / KPRA / BRA / ICT / FBR |
| Employees (68 / 31 / 17 / 12) | `HumanResources.getBranchHeadcount.employeeCount` | count of active `HumanResources.Employees` per branch. |
| Status Active / Inactive, "Planned Q4" | `Branches.status`, `.openingDate` | |
| (branch location for ESS geofence) | `Branches.latitude`, `.longitude`, `.geofenceRadiusM` | used with "Geo-fence ESS punches (200 m)". |
| **Finance** · Fiscal year starts | `CompanySettings.fyStartMonth` | 7 (July) / 1 / 4 |
| Base currency | `.baseCurrencyCode` → `Company.Currencies` | PKR |
| Amount decimal places | `.amountDecimals` | 2 / 0 / 3 |
| Number format | `.numberFormat` | WESTERN / SOUTH_ASIAN |
| Lock date (no posting before) | `.booksLockDate` | Used by `Company.getBooksLockDate()` in every posting guard. |
| Exchange rate source | `.fxRateSource` | SBP_DAILY / MANUAL; daily rates in `Company.ExchangeRates`. |
| Allow multi-currency / Require cost centre on expense lines / Allow posting to future periods | `.allowMultiCurrency`, `.requireCostCentreOnExpense`, `.allowFuturePeriodPosting` | |
| Default account mapping (roles from `Company.PostingRoles` where `onSettingsScreen`): (AR control, AP control, Sales revenue, Sales returns, Output GST, Input GST, WHT payable, Salaries payable, Default bank, Retained earnings, Rounding difference, Exchange gain / loss) | `Company.DefaultAccountMappings.role` + `.accountId` → `Accounting.ChartOfAccounts`; Default bank also `.bankAccountId` → `BankCash.BankAccounts` | Roles AR_CONTROL, AP_CONTROL, SALES_REVENUE, SALES_RETURNS, OUTPUT_GST, INPUT_GST, WHT_PAYABLE, SALARIES_PAYABLE, DEFAULT_BANK, RETAINED_EARNINGS, ROUNDING, FX_GAIN_LOSS; the inventory/cash roles (INVENTORY, COGS, GRNI …) are mapped by onboarding from the COA template. |
| Reset to template | reloads from `Platform.ChartOfAccountsTemplateAccounts.defaultRole` | |
| **Sales & Purchases** · Default payment terms | `CompanySettings.defaultCustomerTermsDays` | Net 30 = 30, Due on receipt = 0. |
| Invoice prefix "INV-{YYYY}-" / PO prefix "PO-{YYYY}-" | `Company.NumberingSeries.prefix` + `.pattern` (doc types INV, PO) | Same rows as the Numbering tab. |
| Quotation validity (days) | `.quotationValidityDays` | |
| Default sales tax | `.defaultSalesTaxCodeId` → `Tax.TaxCodes` | GST 18% / 0% / Exempt |
| Invoice terms & conditions | `.invoiceTerms` | |
| On credit limit breach / Overdue tolerance / Block customers overdue > 90 days | `.creditLimitAction`, `.overdueToleranceDays`, `.blockOverdueOver90` | BLOCK_OVERRIDE / WARN / ALLOW |
| Default vendor terms, 3-way match tolerance, Bill approval above | `.defaultVendorTermsDays`, `.threeWayMatchTolerancePct`, `.billApprovalThreshold` | |
| Require approved PO before bill / Auto-deduct WHT u/s 153 / Allow partial goods receipt / Warn on duplicate vendor invoice | `.requireApprovedPoForBill`, `.autoDeductWht153`, `.allowPartialGrn`, `.warnDuplicateVendorInvoice` | |
| (not on this screen) stock adjustment approval threshold | `.stockAdjustmentApprovalThreshold` | Default Rs 25,000; read by the inventory Stock Adjustments screen. |
| **Tax** · "Active taxpayer — FBR ATL · last verified" | `.atlStatus`, `.atlVerifiedAt` | |
| GST registered / STRN / Return period / Standard rate / Further tax / Provincial services tax | `.gstRegistered`, `.strn`, `.salesTaxReturnPeriod`, `.standardGstRatePct`, `.furtherTaxRatePct`, `.provincialTaxAuthority` + `.provincialServicesRatePct` | |
| WHT on goods / services / contracts 153(1)(a)(b)(c) | `Tax.TaxCodes` (WHT codes, filer / non-filer rates) | Managed on Tax Codes; shown here read-only. |
| Default WHT payable account | `DefaultAccountMappings` role WHT_PAYABLE | |
| Report invoices to FBR POS / Digital Invoicing in real time · Print FBR invoice number & QR | `.fbrRealtimeReporting`, `.printFbrQr` | credentials in `Tax.FbrSettings`. |
| **HR & Payroll** · Pay day, Payroll cut-off, Working days basis | `.payDayRule`, `.payrollCutoff`, `.workingDaysBasis` | LAST_WORKING_DAY / FIRST_NEXT_MONTH / DAY_25 · DAY_25 / MONTH_END · CALENDAR_DAYS / FIXED_30 / WORKING_DAYS |
| Salary disbursement bank | `Company.DefaultAccountMappings` role SALARY_BANK (`.bankAccountId`) | |
| EOBI employer share "Rs 1,850 / month", Provident fund "8.33% of basic" | `.eobiEmployerAmount`, `.pfRatePct` | |
| Deduct income tax u/s 149 automatically / Publish payslips to ESS on payroll post | `.autoDeductSalaryTax`, `.publishPayslipsToEss` | |
| Working week, Grace period, Late marks = 1 leave, Half day if hours below, Overtime rate, Attendance source | `.workingWeek`, `.graceMinutes`, `.lateMarksPerLeave`, `.halfDayBelowHours`, `.overtimeMultiplier`, `.attendanceSource` | default General shift 09:00–18:00 lives in `HumanResources.WorkShifts`. |
| Geo-fence ESS punches to branch location (200 m) / Allow punches from personal devices off-site | `.geofenceEssPunch` (+ `Branches.geofenceRadiusM`), `.allowOffsitePersonalPunch` | |
| **Numbering Series** · Document type | `Company.NumberingSeries.docType` → `Company.DocumentTypes.name` | |
| Prefix | `NumberingSeries.prefix` + `.pattern` | Screen's "JV-{YYYY}-" = prefix JV + pattern `{PREFIX}-{YYYY}-{SEQ6}`. Tokens {YYYY} {YY} {MM} {BR} {SEQn}. |
| Padding | `NumberingSeries.padding` | |
| Next number | `Company.NumberingSeriesCounters.nextValue` (current period) | View `Company.getNumberingSeriesPreview`. |
| Preview "JV-2026-000046" | `Company.getNumberingSeriesPreview.preview` | |
| Reset yearly | `NumberingSeries.resetPolicy` | YEARLY / NEVER (MONTHLY also supported). |
| Add series | new `NumberingSeries` row (optionally per `branchId`) | |
| **Branding** · Brand colours / Primary / Accent | `.brandPrimaryColour`, `.brandAccentColour` | hex |
| Document font, Paper size | `.documentFont`, `.paperSize` | INTER / NOTO_NASTALIQ_URDU; A4 / LETTER |
| Email footer, Show "Powered by Finsoft" | `.emailFooter`, `.showPoweredBy` | |

**Statuses.** branch ACTIVE / INACTIVE · NumberingSeries `isActive`.
**Actions → effects.** *Save* (per tab) → UPDATE `CompanySettings` / UPSERT `DefaultAccountMappings` / `branch` / `NumberingSeries`; each change audited with before/after (Audit Trail shows "Settings · Lock date 31 Jul → 31 Aug"). *Add branch* → INSERT `branch`. *Upload logo* → `attachment` + `logoAttachmentId`. *Discard* → no write.
**Permission.** `comp:view`, `comp:edit`, `comp:export` · **Approval.** —

### Approval Workflows — `app/settings/approvals`
*Source:* `src/60-settings-ess.html` (section `app/settings/approvals`)
**Purpose.** Define multi-level approval chains with amount thresholds, SLA, escalation and delegation.
**Tables.** Primary: `Company.ApprovalWorkflows`, `Company.ApprovalWorkflowConditions`, `Company.ApprovalWorkflowSteps` · Reads: `Company.Roles`, `Company.Users`, `Company.DocumentTypes`, `Company.Branches`, `Company.Approvals` (pending counts, avg time) · Writes: the three primaries, `Company.ApprovalDelegations`, `Company.AuditTrailEntries`
**Functions.** Save → `Company.approvalWorkflowAddUpdate` · Open → `Company.getApprovalWorkflowInfo`
**Lookups.** `ApprovalWorkflows.subject` → `Subject` · `ApprovalWorkflows.status` → `ApprovalWorkflowStatus` · `ApprovalWorkflows.onComplete` → `OnComplete` · `ApprovalWorkflows.onReject` → `OnReject` · `ApprovalWorkflowConditions.field` → `ApprovalWorkflowConditionField` · `ApprovalWorkflowConditions.operator` → `ApprovalWorkflowConditionOperator` · `ApprovalWorkflowSteps.approverType` → `ApproverType` · `ApprovalWorkflowSteps.onSlaBreach` → `OnSlaBreach` · `ApprovalWorkflowSteps.approvalMode` → `ApprovalMode` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Workflow card: name, sub-line "JV, CPV, BPV", Active / Draft | `ApprovalWorkflows.name`, DOC_TYPE condition value, `.status` | |
| "3 steps · Finance Manager → CFO → CEO" | `Company.ApprovalWorkflowSteps` names in `stepNo` order | |
| "7 pending · Avg. 4.2 h to approve" / "Not published" | count PENDING `Approvals`; avg(completedAt − requestedAt); `.publishedAt` NULL | |
| Builder › Trigger "Voucher submitted · Amount > Rs 500,000" | `ApprovalWorkflows.subject` + AMOUNT condition | |
| Builder › Step n (approver, name, SLA, "if > Rs 2,000,000") | `ApprovalWorkflowSteps.approverType` / `.approverRoleId` / `.approverUserId`, `.name`, `.slaHours`, `.appliesAboveAmount` | |
| Builder › Outcome "Auto-post · Notify preparer" | `.onComplete` (AUTO_POST / MARK_APPROVED), `.notifyPreparer`, `.onReject` | "Any rejection returns the voucher to the preparer" = RETURN_TO_PREPARER. |
| Conditions table: Field (Voucher total, Voucher type, Branch), Operator (greater than, is any of), Value | `ApprovalWorkflowConditions.field` (AMOUNT / DOC_TYPE / BRANCH …), `.operator` (GT / IN …), `.value` (jsonb) | all AND-ed. |
| Step settings: Approver (Role / Specific user / Preparer's line manager), SLA, On SLA breach, Approval mode | `ApprovalWorkflowSteps.approverType` (ROLE / USER / LINE_MANAGER), `.slaHours`, `.onSlaBreach` (ESCALATE / REMIND), `.approvalMode` (ANY / ALL) | |
| Preparer cannot approve own / Allow delegation when on leave / Require comment on approval | `.blockSelfApproval`, `.allowDelegation`, `.requireComment` | delegations themselves: `Company.ApprovalDelegations`. |
| Notifications: In-app / Email / WhatsApp Business | `ApprovalWorkflows.notifyInApp`, `.notifyEmail`, `.notifyWhatsapp` | |
| Approval log | `Company.ApprovalActions` | |

**Statuses.** workflow DRAFT → ACTIVE (published) ⇄ INACTIVE.
**Actions → effects.** *New workflow* → INSERT DRAFT. *Add step / Add condition* → child rows. *Publish workflow* → status ACTIVE, `publishedAt`, `version` + 1; pending requests keep the version they started with. *Discard* → none.
**Permission.** `wf:view`, `wf:create`, `wf:edit`, `wf:delete` · **Approval.** —

### Audit Trail — `app/settings/audit`
*Source:* `src/60-settings-ess.html` (section `app/settings/audit`, drawer `set-audit-diff`)
**Purpose.** Immutable, hash-chained log of every create, edit, post, delete, login and permission change.
**Tables.** Primary: `Company.AuditTrailEntries` (partitioned by month) · Reads: `Company.getAuditTrail`, `Company.AuditTrailSeals`, `Company.Users`, `Company.UserRoles` · Writes: `Company.AuditTrailEntries` (EXPORT entry only)

| UI field / column | Table.column | Notes |
|---|---|---|
| Banner "Hash chain verified — n entries · last block · SHA-256 verified" | `Company.AuditTrailSeals.blockNo`, `.lastLogId`, `.sealedAt`; count of `AuditTrailEntries` | *Verify chain* recomputes each block's `sealHash`. |
| Search record, user or IP | `AuditTrailEntries.recordLabel`, user name, `.ipAddress` | |
| Module filter (Vouchers, Sales, Payroll, Settings, Users) | `AuditTrailEntries.module` (or derived from `schemaName`) | |
| User filter | `AuditTrailEntries.userId` | |
| Period (Last 7 days / Today / This month / Custom) | `AuditTrailEntries.occurredAt` | Partition pruning. |
| Action chips All / Create / Edit / Post / Delete / Login | `AuditTrailEntries.action` | INSERT / UPDATE / POST / DELETE / LOGIN (+ LOGIN_FAILED, PERMISSION, EXPORT …). |
| Timestamp | `AuditTrailEntries.occurredAt` | |
| User (name, role) | `AuditTrailEntries.userId` → `Users.fullName`; role via `UserRoles`; failed logins show `actorEmail` | |
| Module, Action | `AuditTrailEntries.module`, `.action` | |
| Record (JV-2026-000045) | `AuditTrailEntries.recordLabel` (+ `tableName`, `recordId` for the link) | |
| IP address | `AuditTrailEntries.ipAddress` | |
| Change "Status: Approved → Posted" | summary of `AuditTrailEntries.changes` | |
| Drawer: IP / device, Session | `.ipAddress`, `.userAgent`, `.sessionId` | |
| Drawer: Entry hash / Previous hash | `.entryHash`; previous = `entryHash` of the prior id (`Company.getAuditTrail.prevEntryHash`) | |
| Drawer: Field / Before / After | `AuditTrailEntries.changes` → `{"field": {"before","after"}}` | Secrets show "[redacted]". |
| Showing 1–10 of 3,418 this week | count over the filter | |

**Statuses.** "Chain intact" / break detected (verification result, not stored per row).
**Actions → effects.** *Verify chain* → recomputes seals (read-only). *Export CSV* → file download + `AuditTrailEntries` EXPORT. Rows are never updated or deleted (`triggerAppendOnly`, no DELETE grant).
**Permission.** `aud:view`, `aud:export` · **Approval.** —

### Backup & Restore — `app/settings/backup`
*Source:* `src/60-settings-ess.html` (section `app/settings/backup`, modal `set-restore`)
**Purpose.** Encrypted snapshots, schedule and retention, per-module data export and point-in-time restore.
**Tables.** Primary: `Company.BackupSettings`, `Company.Backups`, `Company.BackupRestoreRequests` · Reads: `Platform.Tenants.code` (confirmation), `Platform.BackupRuns` (platform job status) · Writes: the three primaries, `Company.Attachments` (DATA_EXPORT), `Company.Notifications`, `Company.AuditTrailEntries` (BACKUP / RESTORE / EXPORT)
**Functions.** Save → `Company.backupSettingAddUpdate` · Open → `Company.getBackupSettingInfo` ‖ Save → `Company.backupRestoreRequestAddUpdate` · Open → `Company.getBackupRestoreRequestInfo` · Actions → `Company.backupRestoreRequestCancel`
**Lookups.** `BackupSettings.frequency` → `BackupSettingFrequency` · `BackupRestoreRequests.status` → `BackupRestoreRequestStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Last backup "Today 02:00 · Successful · 4m 12s" | latest `Backups.startedAt`, `.status`, `.finishedAt − .startedAt` | |
| KPI Backup size "3.84 GB · incl. 1.2 GB attachments" | `.sizeBytes`, `.attachmentsBytes` | |
| KPI Retention "35 days + 12 monthly" | `BackupSettings.keepDailyDays`, `.keepMonthlyMonths` | |
| KPI Next scheduled "02 Oct 02:00 · Daily · Asia/Karachi" | `BackupSettings.nextRunAt`, `.frequency`, `.timezone` | |
| Backups table: Snapshot (code + note), Type, Started, Size, Status | `Backups.snapshotCode`, `.note`, `.kind` (SCHEDULED / MANUAL / MONTHLY / YEAR_END / SAFETY), `.startedAt`, `.sizeBytes`, `.status` (COMPLETED / PARTIAL + `.statusNote`) | "Locked" = `.isLocked`. |
| "AES-256 encrypted · stored in Karachi & Singapore" | `.encryption`, `.storageRegions` | |
| Schedule: Frequency, Time, Keep daily for, Monthly snapshots, Include attachments, Email Owner on failure, Copy to my Google Drive | `BackupSettings.frequency`, `.runAt`, `.keepDailyDays`, `.keepMonthlyMonths`, `.includeAttachments`, `.emailOwnerOnFailure`, `.copyToGoogleDrive` | |
| Export data per module (CSV / Excel) | `Company.Attachments` (purpose DATA_EXPORT) + `AuditTrailEntries` EXPORT | export job queue is the platform job runner. |
| Restore modal: Snapshot, Reason *, Type ALNOOR to confirm, Take a safety backup first | `BackupRestoreRequests.snapshotId`, `.reason`, `.confirmText`, `.takeSafetyBackup` → `.safetySnapshotId` | |

**Statuses.** snapshot RUNNING → COMPLETED / PARTIAL / FAILED (+ Locked) · restore REQUESTED → SCHEDULED → RUNNING → COMPLETED / FAILED · CANCELLED.
**Actions → effects.** *Back up now* → `Backups` kind MANUAL (`requestedByUserId`). *Save schedule* → UPDATE `BackupSettings`. *Restore data* → `BackupRestoreRequests` (one open at a time) + optional SAFETY snapshot; all users notified and signed out; `AuditTrailEntries` RESTORE.
**Permission.** `bak:view`, `bak:create`, `bak:export`; restore is Owner only · **Approval.** —

### Integrations — `app/settings/integrations`
*Source:* `src/60-settings-ess.html` (section `app/settings/integrations`, modal `set-new-key`)
**Purpose.** Connect FBR, bank feeds, biometric devices, SSO, messaging, email and e-commerce; manage API keys and webhooks.
**Tables.** Primary: `Company.Integrations`, `Company.ApiKeys`, `Company.IntegrationWebhooks`, `Company.IntegrationWebhookDeliveries` · Reads: `BankCash.BankAccounts`, `Tax.FbrSettings`, `HumanResources.BiometricDevices`, `Company.Users` · Writes: the primaries, `Company.AuditTrailEntries` (API_KEY)
**Functions.** Save → `Company.integrationAddUpdate` · Open → `Company.getIntegrationInfo` ‖ Save → `Company.apiKeyAddUpdate` · Open → `Company.getApiKeyInfo` ‖ Save → `Company.integrationWebhookAddUpdate` · Open → `Company.getIntegrationWebhookInfo`
**Lookups.** `Integrations.category` → `IntegrationCategory` · `Integrations.provider` → `Provider` · `Integrations.status` → `IntegrationStatus` · `ApiKeys.keyPrefix` → `KeyPrefix` · `IntegrationWebhooks.healthStatus` → `HealthStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Filter chips All / Connected / Tax / Banking / HR / Commerce | `Integrations.status`, `.category` | |
| Card title / sub-line ("HBL Bank Feed · A/c 8721", "ZKTeco Biometric · 6 devices") | `Integrations.displayName`, `.provider`, `.referenceLabel`, `.bankAccountId` | |
| Status Connected / Not connected / Re-auth needed | `Integrations.status` | CONNECTED / NOT_CONNECTED / REAUTH_NEEDED / ERROR / DISABLED |
| "1,284 invoices reported this FY. Last sync 08:55" / "Token expired 29 Sep" | `.lastSyncSummary`, `.lastSyncAt`, `.tokenExpiresAt`, `.lastError` | FBR counts come from `Tax.FbrInvoiceSubmissions`; device health from `HumanResources.BiometricDevices`. |
| Google Workspace SSO "Domain … · SAML 2.0 · enforced" / SMTP "host:587 · TLS · from" | `Integrations.config` (non-secret) + `.secretRef` (vault) | |
| Sync now / Reconnect / Connect / Send test | updates `lastSync*` / `status`, `connectedAt`, `connectedByUserId` | |
| API keys table: Name (+ owner), Key fs_live_…9c2a, Scopes, Last used | `ApiKeys.name`, `.ownerUserId`, `.keyPrefix` + `.keyLast4`, `.scopes`, `.lastUsedAt` | |
| Create API key: Key name *, Expires (90 days / 1 year / Never), IP allow-list, Scopes | `ApiKeys.name`, `.expiresAt`, `.ipAllowlist`, `.scopes` (reports:read, accounting:write, sales:write, inventory:write, hr:read, payroll:read) | full key shown once; only `keyHash` stored. |
| Webhooks: Endpoint, Events, Success %, Status Healthy / Failing; Add endpoint | `IntegrationWebhooks.url`, `.events`, `.successRatePct`, `.healthStatus` | success % from `Company.IntegrationWebhookDeliveries`. |

**Statuses.** integration CONNECTED / NOT_CONNECTED / REAUTH_NEEDED / ERROR / DISABLED · ApiKeys active / expired (derived) / revoked · webhook HEALTHY / FAILING / DISABLED.
**Actions → effects.** *Connect* → OAuth / credential flow, secret stored in the vault, `integration` CONNECTED. *Create key* → INSERT `ApiKeys` (audit redacts `keyHash`). *Revoke* → `revokedAt`. *Add endpoint* → INSERT `IntegrationWebhooks` with a generated signing secret.
**Permission.** `intg:view`, `intg:create`, `intg:edit`, `intg:delete` · **Approval.** —

### Roles & Permissions — `app/settings/roles`
*Source:* `src/49-cash-users.html` (section shell) · `src/9E-cash-users.js` (ROLES, GROUPS, ACT, grantDefault, rolesMount, conflicts)
**Purpose.** Define what each role can view, create, edit, approve, post, delete and export, per module.
**Tables.** Primary: `Company.Roles`, `Company.RolePermissions` · Reads: `Company.Permissions`, `Company.SegregationOfDutiesRules`, `Company.UserRoles`, `Company.Users` · Writes: `Company.Roles`, `Company.RolePermissions`, `Company.RoleLimits`, `Company.AuditTrailEntries` (action PERMISSION)
**Functions.** Save → `Company.roleAddUpdate` · Open → `Company.getRoleInfo`
**Lookups.** `Roles.systemKey` → `SystemKey` · `Roles.tone` → `RoleTone` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Roles list (name, icon, "System"/"Custom", user count) | `Company.Roles.name`, `.icon`, `.tone`, `.isSystem`, `.systemKey`; count of `Company.UserRoles` | System roles: OWNER, FINANCE_MANAGER, ACCOUNTANT, HR_MANAGER, PAYROLL_OFFICER, SALES_EXECUTIVE, STOREKEEPER, AUDITOR. |
| Role header: description, users with this role, "Branch-restricted" switch | `Roles.description`; `UserRoles`; `Roles.branchRestricted` | |
| Matrix group tabs (Finance, Sales & Purchases, Inventory, HR & Payroll, System) | `Company.Permissions.module` | FINANCE / SALES_PURCHASES / INVENTORY / HR_PAYROLL / SYSTEM |
| Module rows (Chart of accounts, Journal vouchers, Sales invoices …) | `Company.Permissions.resource`, `.resourceLabel` | coa, vch, cash, bank, recon, fa, bud, tax, close, frep, quo, sinv, rcpt, cust, po, bill, vpay, vend, item, grn, adj, xfer, wh, irep, emp, att, lv, prun, loan, fs, hrep, comp, usr, rol, wf, intg, aud, bak |
| Columns View / Create / Edit / Approve / Post / Delete / Export | `Company.Permissions.action` | VIEW … EXPORT; "—" = no permission row exists for that cell. |
| Ticked cell | `Company.RolePermissions (roleId, permissionCode)` | e.g. `sinv:post`. |
| "Last changed by … · date" | `Company.AuditTrailEntries` (table RolePermissions, latest) | |
| New role / Duplicate role modal: Role name *, Description, Copy permissions from | `Roles.name`, `.description`, `.copiedFromRoleId` + copied `RolePermissions` rows | |
| Segregation-of-duties banners ("Create & approve · Journal vouchers", "Create & post · Cash book", "Create users & edit roles"; "Remove Approve" fix; "Owner bypasses SoD") | `Company.SegregationOfDutiesRules.name`, `.kind`, `.permissionA`, `.permissionB`, `.description`, `.severity`, `.ownerExempt` evaluated against the role's draft `RolePermissions` | BLOCK rules reject the save. |
| Data limits: Max voucher amount (0 = No approvals), Max discount %, Back-dated posting (Not allowed / 3 / 7 / 30 days / Any open period), Salary visibility (Hidden / Masked except own / Full) | `Company.RoleLimits.maxVoucherAmount`, `.maxDiscountPct`, `.backdateDays` (0/3/7/30/365), `.salaryVisibility` | disabled for Owner. |

**Statuses.** —
**Actions → effects.** *Toggle cell / row / column* → draft in the UI; *Save changes* → SoD check, then INSERT/DELETE `RolePermissions` rows and UPSERT `RoleLimits`; one `AuditTrailEntries` PERMISSION entry per change ("+ Post on Payroll"). *Discard* → none. *Create role* → INSERT `role` + copied permissions. System roles cannot be deleted (CHECK `roleSystemNotDeletedChk`).
**Permission.** `rol:view`, `rol:create`, `rol:edit`, `rol:delete`, `rol:export` · **Approval.** —

### Document Templates — `app/settings/templates`
*Source:* `src/60-settings-ess.html` (section `app/settings/templates`)
**Purpose.** Print/PDF layouts for invoices, vouchers, payslips and HR letters, with a merge-field editor and live preview.
**Tables.** Primary: `Company.DocumentTemplates` · Reads: `Company.DocumentTypes`, `Company.CompanySettings` (branding, NTN/STRN for the preview), sample document data · Writes: `Company.DocumentTemplates`, `Company.AuditTrailEntries`
**Functions.** Save → `Company.documentTemplateAddUpdate` · Open → `Company.getDocumentTemplateInfo`
**Lookups.** `DocumentTemplates.category` → `DocumentTemplateCategory` · `DocumentTemplates.letterKind` → `LetterKind` · `DocumentTemplates.paper` → `Paper` · `DocumentTemplates.headerLayout` → `HeaderLayout` · `DocumentTemplates.language` → `DocumentTemplateLanguage` · `DocumentTemplates.status` → `DocumentTemplateStatus` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| Search; chips All / Finance / Payroll / HR letters (counts) | `DocumentTemplates.name`, `.category` | FINANCE / SALES / PURCHASE / PAYROLL / HR_LETTER |
| Card: name, sub-line ("Standard GST · A4", "BPV / CPV", "Monthly · bilingual", "HR letter · bank use"), Default / v3 | `.name`, `.docType`, `.paper`, `.language`, `.letterKind`, `.isDefault`, `.version` | |
| Editor: Template name, Paper (A4 portrait / A5 / Thermal 80mm), Header (Logo left / Centered letterhead), Language (English / English + Urdu) | `.name`, `.paper`, `.headerLayout`, `.language` | |
| Show on document: NTN & STRN, FBR invoice no. & QR, Item HS codes, Item images, Amount in words, Bank details | `.showNtnStrn`, `.showFbrQr`, `.showHsCodes`, `.showItemImages`, `.showAmountInWords`, `.showBankDetails` | |
| Merge fields {{customer.name}} {{invoice.number}} {{fbr.irn}} {{company.ntn}} … / HTML tab | `.bodyHtml` | |
| Live preview / Test print | rendered from `bodyHtml` + sample data | not stored. |

**Statuses.** DRAFT → ACTIVE → ARCHIVED; one default per category / doc type / letter kind.
**Actions → effects.** *New template* → INSERT DRAFT. *Save template* → UPDATE, `version` + 1. *Import* → INSERT from file. *Reset* → reload the last saved version.
**Permission.** `comp:edit` · **Approval.** —

### Users — `app/settings/users`
*Source:* `src/49-cash-users.html` (section shell) · `src/9E-cash-users.js` (USERS, renderUsers, openUser, openWizard)
**Purpose.** Everyone who can sign in: roles, branches, devices, MFA, invitations and suspension.
**Tables.** Primary: `Company.Users`, `Company.UserRoles`, `Company.UserBranches`, `Company.UserWarehouses` · Reads: `Company.Roles`, `Company.Branches`, `Inventory.Warehouses`, `HumanResources.Employees`, `Company.UserSessions`, `Company.AuditTrailEntries` (activity tab), `Company.getUserKpis`, `Platform.Subscriptions.seats` · Writes: `Company.Users`, `Company.UserRoles`, `Company.UserBranches`, `Company.UserWarehouses`, `Company.UserInvites`, `Company.PasswordResets`, `Company.UserMfaMethods`, `Company.TrustedDevices`, `Company.UserSessions` (revoke), `Company.AuditTrailEntries`
**Functions.** Save → `Company.userAddUpdate` · Open → `Company.getUserInfo`
**Lookups.** `Users.status` → `UserStatus` · `Users.dataScope` → `DataScope` · `Users.mfaMethod` → `UserMfaMethod` · `Users.loginHours` → `LoginHours` · `Users.ssoProvider` → `UserSsoProvider` (values in `Lookups.Lookups`)

| UI field / column | Table.column | Notes |
|---|---|---|
| KPI Active users / suspended / external | `Company.getUserKpis.activeUsers`, `.suspendedUsers`, `.externalUsers` | |
| KPI Pending invites "1 expires today" | `Company.getUserKpis.pendingInvites`, `Company.UserInvites.expiresAt` | PENDING `UserInvites` rows. |
| KPI MFA coverage | `Company.getUserKpis.mfaCoveragePct` | active users with `mfaEnabled`. |
| KPI Seats used "n / 25 · Business plan" | `Company.getUserKpis.seatsUsed`, `Platform.Subscriptions.seats` | |
| User (avatar, name, "You", "External", title · EMP id) | `Users.fullName`, `.avatarAttachmentId`, `.isExternal`, `.jobTitle`, `.employeeId` → `HumanResources.Employees.code` | |
| Email | `Users.email` | |
| Role pill | `Company.UserRoles` (isPrimary) → `Company.Roles.name`, `.icon`, `.tone` | |
| Branch access chips ("All branches") | `Company.UserBranches` | |
| MFA On / Off | `Users.mfaEnabled` | |
| Last active + device | `Users.lastActiveAt`; latest `Company.UserSessions.deviceLabel` | |
| Status Active / Invited / Suspended | `Users.status` | |
| Filters: search, branch, status chips (All / Active / Invited / Suspended / No MFA), role chips | `Users.fullName/email`, `UserBranches.branchId`, `Users.status`, `mfaEnabled`, `UserRoles.roleId` | `appUserNameTrgmIdx` for search. |
| Pending invites panel (email, role, branch, via Email/WhatsApp, by, sent, "Expires today / 4 Oct", Resend with cool-down, Copy link, Revoke) | `Company.UserInvites.email`, `.roleId`, `.branchId`, `.channels`, `.invitedByUserId`, `.sentAt`, `.expiresAt`, `.resendCount`, `.lastResentAt`, `.status`; token in `Company.PasswordResets` (INVITE) | |
| Security posture (MFA by role) | `Company.getUserKpis` per role / `Users.mfaEnabled` grouped by `UserRoles` | |
| Drawer › Profile: Email, Phone, Employee (link or "External — not on payroll"), Branches, Approval limit, Data scope, Last active, Member since | `Users.email`, `.phone`, `.employeeId`, `UserBranches`, `.approvalLimit` (capped by `Company.RoleLimits.maxVoucherAmount`), `.dataScope`, `.lastActiveAt`, `.activatedAt` | |
| Drawer › Permissions "Inherited from role" | `Company.getUserEffectivePermissions` | |
| Drawer › Sessions (device, location, IP, last, Unusual location, Revoke, Sign out of all devices) | `Company.UserSessions.deviceLabel`, `.locationLabel`, `.ipAddress`, `.lastActiveAt`, `.isUnusualLocation`, `.revokedAt` | |
| Drawer › Activity | `Company.AuditTrailEntries` where `userId` = user | |
| Wizard › Method: Invite by email / WhatsApp, Create account now (temporary password, require new password at first sign-in) | `Company.PasswordResets` (purpose INVITE, `channel`); `Users.passwordHash`, `.mustChangePassword` | |
| Wizard › Identity: Link existing employee (search, "Has access" / "Invite pending") or Enter manually; Full name *, Work email *, Mobile, Department, Job title | `Users.employeeId` → `HumanResources.Employees` (name, email, phone, department, designation copied); `Users.fullName`, `.email`, `.phone`, `.department`, `.jobTitle` | role suggested from the job title. |
| Wizard › Role | `Company.UserRoles.roleId` | |
| Wizard › Access: Branches, Warehouses, Modules, Approval limit, Data scope | `Company.UserBranches`, `Company.UserWarehouses` → `Inventory.Warehouses`, `Users.moduleAccess`, `.approvalLimit`, `.dataScope` | OWN / BRANCH / ALL |
| Wizard › Security: Require MFA (Authenticator / SMS), IP restriction, Session timeout, Login hours (Anytime / Business / Custom from–to) | `Users.mfaEnabled`, `.mfaMethod`, `.ipRestricted`, `.ipAllowlist`, `.sessionTimeoutMin`, `.loginHours`, `.loginFrom`, `.loginTo` | |

**Statuses.** INVITED → ACTIVE (invite accepted) · ACTIVE ⇄ SUSPENDED (Suspend / Reactivate) · REMOVED (soft, `deletedAt`).
**Actions → effects.** *Add user / Send invite* → INSERT `Users` (INVITED) + `UserRoles` + `UserBranches` + `UserWarehouses` + `UserInvites` (channels, 7 days) + `PasswordResets` (INVITE); *Resend* → new token, `resendCount` + 1; *Revoke invite* → `UserInvites` REVOKED, user REMOVED; *Create account now* → `Users` ACTIVE with temporary hash. *Edit access* → updates the same rows. *Suspend* → status SUSPENDED, `suspendedAt`, revokes all sessions (revokeReason SUSPENDED); cannot suspend yourself. *Reset MFA* → clears `mfaSecretEnc`, `mfaRecoveryCodes`, revokes `UserMfaMethods` factors and `TrustedDevices` rows, audit MFA_RESET. *Send password reset* → `PasswordResets` ADMIN_RESET. *Revoke session* → `UserSessions.revokedAt` (ADMIN_REVOKED), audit SESSION_REVOKED. *Enforce MFA* → `mfaEnabled = true` for the selected users (enrolment at next sign-in). *Export* → audit EXPORT. *Transfer ownership* → moves the OWNER role (confirmation by email).
**Permission.** `usr:view`, `usr:create`, `usr:edit`, `usr:delete`, `usr:export` · **Approval.** —

---

## Utility

### UI States — `app/states`
*Source:* `src/60-settings-ess.html` (section `app/states`)
**Purpose.** Showcase of empty states, skeletons, banners, confirmation modals and toasts.
**Tables.** no data (pure UI reference; examples mirror vouchers, approvals and imports but nothing is read or written).
**Statuses.** — · **Actions → effects.** none.
**Permission.** — · **Approval.** —

### Page not found — `app/404`
*Source:* `src/60-settings-ess.html` (section `app/404`)
**Purpose.** Pure UI error page ("Error reference NF-…", links to dashboard / Today's work).
**Tables.** no data (the error reference is a client-side correlation id; nothing is stored).
**Statuses.** — · **Actions → effects.** *Report a problem* → opens Audit Trail (no write).
**Permission.** — · **Approval.** —

### No access — `app/unauthorized`
*Source:* `src/60-settings-ess.html` (section `app/unauthorized`)
**Purpose.** Explains the missing permission and lets the user request access from an administrator.
**Tables.** Primary: `Company.Notifications` · Reads: `Company.UserRoles`/`Company.Roles`, `Company.getUserEffectivePermissions`, `Company.Users` (admins holding `rol:edit`) · Writes: `Company.Notifications`

| UI field / column | Table.column | Notes |
|---|---|---|
| "Your role Sales Executive doesn't include … Payroll › Run Payroll" | `Company.Roles.name`; missing `Company.Permissions.code` (e.g. `prun:view`) | |
| Request access from (Owner / HR Manager) | `Company.Users` with `rol:edit` | |
| Reason | `Company.Notifications.body` | |

**Statuses.** —
**Actions → effects.** *Request access* → INSERT `notification` for the chosen admin (category SYSTEM, eventCode ACCESS_REQUEST, `needsAction` = true, `linkRoute` = `app/settings/roles`).
**Permission.** any signed-in user · **Approval.** —

---

## Reference — Report Studio tables (`Reports`, Full)
Used by `app/reports/studio`, the six built-in studios and the Reports Centre (mapped in `07-financial-reports.md`).

| Table | Holds | Key columns |
|---|---|---|
| `Reports.SavedReports` | saved report: CUSTOM builder report or PRESET of a studio tab | `name`, `folder`, `kind`, `studio` + `studioTab` / `sourceEntity`, `dateRange` (+ `dateFrom`/`dateTo`), `filters`, `groupBy`, `sortField`/`sortDir`, `rowLimit`, `showTotals`, `viewMode`, `display`/`chartType`, `options`, `defaultFormat`, `visibility`, `ownerUserId`, `isFavourite` |
| `Reports.SavedReportColumns` | columns of a saved report ("2. Columns") | `seq`, `fieldKey`, `label`, `isVisible`, `aggregate`, `format` |
| `Reports.SavedReportShares` | roles / users a SHARED report is visible to | `shareType` ROLE/USER, `roleId`, `userId`, `canEdit` |
| `Reports.ReportSchedules` | "Email on a schedule" / Scheduled reports table | `frequency`, `dayOfWeek`, `dayOfMonth`, `runTime`, `format` XLSX/PDF/CSV, `recipientEmails`, `recipientUserIds`, `onlyIfRows`, `status`, `nextRunAt`, `lastRowCount` |
| `Reports.ReportRuns` | Recent runs / every generation | `title`, `studio`/`studioTab`, `parameters`, `format`, `triggerType`, `runByUserId`, `status`, `rowCount`, `outputAttachmentId` |
