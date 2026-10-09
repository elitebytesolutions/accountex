# Accountex delivery roadmap

> Generated from `docs/delivery/roadmap/*.ts` by `npm run delivery:roadmap`. Edit the data files, not this document.
> Phase progress is the `status` of each phase in the data files (planned / in-progress / done), updated when a phase is accepted.

**45 phases** · **187 entities** (82 masters, 105 transactional) · 424 tables assigned · 21 tables deliberately not entities · checked against the live DB and `template/src`.

Say **"next phase"** to plan the next pending phase (skill `next-phase`). Nothing is implemented without approval of that phase's plan.

## Standards for every entity

**Pages:** Next.js + Tailwind, faithful to the listed template (typography, spacing, colours, icons, tables, forms, drawers, responsive).
- List page with search, filters, pagination and loading / empty / error states.
- Create and edit as the template shows them: drawer, modal or page.
- Detail view with a **History** tab (audit trail).
- Actions are hidden or disabled without permission.
- Validation, success and error toasts.

Next routes mirror the template without `app/` (`#/app/accounting/coa` → `/accounting/coa`; `.../view` → `.../[id]`). The Super Admin portal is under `/admin/*`.

**Backend (Clean Architecture):** UI → server adapter (Nest controller) → application use case → domain rules + repository port → Prisma repository → response DTO.
- Contracts are Zod schemas in `src/shared/<module>`.
- Each module lives at `src/server/modules/<module>/<entity>/{domain,application,infrastructure,presentation}`.

**Every insert, update and delete from the application:**
- Runs inside `PrismaService.withContext` (Phase 0), which tells the database who the user is, in the same transaction as the change.
- The DB audit trigger then keeps that row's history: one `Company.AuditTrailEntries` row per change with who (user id + name/email snapshot), what (action, table, record), the changed fields (before/after), the full row at that version, IP, user agent, session, correlation ID and time.
- Each entity's detail page shows this as a **History** tab (`GET …/:id/history` → `Company.getRecordHistory`).
- Returns catalogue error codes with HTTP status and `correlationId` (Phase 0).
- Never trusts a client-supplied actor.

**Masters:** deactivate rather than delete. Delete is allowed only when unreferenced.

**Transactions:**
- Lifecycle: draft → submit → approve → post. Posting is one transaction: document, GL/stock effects and audit together.
- Posted documents are immutable; corrections are reversal or void only.

**Audit:** every table listed for an entity must carry `Company.triggerAudit` before that phase is done (each entity below shows which tables still lack it).

**Acceptance:** working CRUD per entity (persisted after reload), validation, permissions, relationships, audit rows, error codes, and a visual comparison against the template.

## Phase summary

| Phase | Title | Kind | Portal | Status | Entities |
|---:|---|---|---|---|---|
| 0 | Foundation | Foundation | foundation | done | — |
| 1 | Company core | Masters | workspace | done | Branches · Currencies & Exchange Rates · Company Settings & Setup Guide · Numbering Series |
| 2 | Access & security | Masters | workspace | done | Users · Roles & Permissions · Approval Workflows · Document Types & Templates · Account & Security |
| 3 | Finance structure | Masters | workspace | done | Fiscal Years & Periods · Chart of Accounts · Cost Centres & Projects · Account Mappings & Posting Roles |
| 4 | Tax & treasury setup | Masters | workspace | done | Tax Codes · Banks & Bank Accounts · Cash Accounts & Categories · Cheque Books · Expense Categories |
| 5 | Treasury rules & compliance setup | Masters | workspace | done | Bank Rules · Petty Cash Funds · Fixed Asset Categories · FBR Settings · Segregation-of-Duties Rules |
| 6 | Product setup | Masters | workspace | done | Units of Measure · Brands / Companies · Product Classes · Warehouses & Bins · Stock Movement Reasons |
| 7 | Parties | Masters | workspace | done | Customer Groups · Customers · Vendor Categories · Vendors |
| 8 | Products | Masters | workspace | done | Products · Kits & Bundles · Barcode Labels · Reorder Rules |
| 9 | Pricing & collections setup | Masters | workspace | done | Price Lists · Sales Schemes · Payment Reminder Setup · Price Tiers |
| 10 | Organisation | Masters | workspace | done | Departments · Designations · Grades · Work Shifts · Holidays |
| 11 | HR policies & people | Masters | workspace | done | Leave Types & Eligibility · Overtime Policies · Biometric Devices · Employees |
| 12 | Payroll setup | Masters | workspace | done | Salary Components · Salary Structures · Pay Groups · Salary Tax Slabs · Employee Salaries |
| 13 | Talent & policy setup | Masters | workspace | done | Onboarding Templates · Performance Cycles · Training Programs · Company Policies |
| 14 | Distribution setup | Masters | workspace | done | Shop Areas · Routes · Vans · Commission Slabs |
| 15 | Self-service & reporting setup | Masters | workspace | done | Helpdesk Categories & FAQs · Company Announcements · Polls & Pulse Surveys · Saved Reports |
| 16 | General ledger | Transactions | workspace | done | Approvals Inbox · Journal Vouchers · Opening Balances · Recurring Vouchers |
| 17 | Banking | Transactions | workspace | done | Bank Transactions · Statement Imports · Bank Reconciliation · Cheques & Batches |
| 18 | Cash | Transactions | workspace | done | Cash Book Entries · Cash Day Close · Petty Cash Vouchers & Replenishment · Expense Claims |
| 19 | Purchasing | Transactions | workspace | done | Purchase Orders · Goods Received Notes · Vendor Bills · Landed Cost |
| 20 | Payables | Transactions | workspace | done | Purchase Returns · Debit Notes · Vendor Payments |
| 21 | Stock operations | Transactions | workspace | done | Stock In/Out · Stock Transfers · Stock Adjustments · Stock Counts |
| 22 | Stock vouchers & demand | Transactions | workspace | done | Stock Vouchers · Assembly Vouchers · Goods Demands · Principal Claims & Targets · Bulk Price Updates |
| 23 | Sales documents | Transactions | workspace | done | Quotations · Sales Orders · Delivery Challans · Sales Invoices |
| 24 | Sales completion | Transactions | workspace | done | Sales Returns · Credit Notes · Customer Receipts · Recurring Invoices · POS Shifts & Payments |
| 25 | Wholesale | Transactions | workspace | done | Order Bookings · Order Templates · Quick Wholesale Entry (Held Bills) · Bulk Invoice Runs · Back-orders |
| 26 | Distribution | Transactions | workspace | done | Load Sheets & Delivery · Route Settlements · Recovery Sheets · Salesman Targets & Commissions · Credit Control |
| 27 | Assets & budgets | Transactions | workspace | done | Fixed Asset Register · Depreciation · Asset Transfers & Disposals · Budgets |
| 28 | Tax compliance | Transactions | workspace | done | Sales Tax Returns · WHT Deductions & Challans · WHT Certificates & Statements · FBR Submissions |
| 29 | Period close | Transactions | workspace | done | Period Reopen Requests · Year-End Close · Payment Reminder Runs |
| 30 | Time & attendance | Transactions | workspace | done | Attendance · Regularisation Requests · Rosters & Shift Swaps · Overtime Claims |
| 31 | Leave & lifecycle | Transactions | workspace | done | Leave Requests · Leave Balances · Onboardings · Offboardings |
| 32 | Payroll | Transactions | workspace | done | Payroll Runs · Payroll Adjustments · Loans & Advances · Payslips & Salary Payments · Tax Declarations |
| 33 | Talent & exits | Transactions | workspace | done | Final Settlements · Recruitment · Performance · Training · Employee Letters & Assets |
| 34 | Self-service requests | Transactions | workspace | done | Letter Requests · Profile Change Requests · Helpdesk Tickets · Kudos, Survey Responses, Reads & Presence · Policy Acknowledgements |
| 35 | Data & collaboration | Transactions | workspace | in-progress | Data Imports · Integrations & API Keys · Backup & Restore · Report Runs · Activity, Comments & Attachments |
| 44 | Work queue & sign-in recovery | Transactions | workspace | in-progress | Tasks & Today's Work · Notifications & Preferences · Sign-in Recovery & MFA |
| 36 | Plans & catalogue | Masters | admin | done | Subscription Plans · Platform Modules · Add-ons · Coupons |
| 37 | Seed templates & tax master | Masters | admin | done | COA Templates · Tenant Seed Templates · Tax Master · Communication Templates |
| 38 | Platform configuration | Masters | admin | done | Dunning Policies · Tenant Segments · Resellers · Platform Security & Backups |
| 39 | Feature flags & alerting | Masters | admin | done | Feature Flags · Maintenance Windows · Usage Alert Rules · Audit Alert Rules |
| 40 | Tenant lifecycle | Transactions | admin | done | Tenants · Subscriptions · Usage · Impersonation Sessions |
| 41 | Platform billing | Transactions | admin | done | Platform Invoices · Platform Payments · Dunning Cases · Reseller Payouts |
| 42 | Growth & support | Transactions | admin | done | Leads · Support Tickets · Announcements & Broadcasts · Communication Logs |
| 43 | Platform operations | Transactions | admin | done | Service Incidents · Flag Change Requests · Privacy Requests · Entitlement Change Log |

## Phase 0: Foundation

_User-attributed row history for every insert/update/delete from the application, error catalogue and log, shared CRUD contracts, permission guard and the template-faithful workspace shell._ This is an approved exception: Phase 0 has no business entities.

1. Who changed it: PrismaService.withContext({ userId, tenantId, correlationId, clientIp, userAgent, sessionId }) runs every insert/update/delete from the application in one transaction after setting those values as app.* session settings. The user always comes from the verified session (JWT), never from the request body. Seed/maintenance scripts set app.actorLabel and are logged as 'system: <script>'.
2. Row history (prisma/sql/005-row-history.sql): Company.AuditTrailEntries gains rowData (the complete row after the change; the old row for DELETE), rowVersion, actorName, correlationId, with actorEmail/userAgent/sessionId now filled. Company.triggerAudit (same name, so all existing triggers pick it up) snapshots the user's name and email from Company.Users at the moment of the change, keeps field-level before/after in changes, and no longer skips rows without tenantId (tenantId becomes nullable). Platform.PlatformAuditLogs gets the same rowData/actor snapshot. Company.getRecordHistory(schema, table, recordId) returns every version newest-first (who, when, action, changed fields, full row). Audit rows are append-only.
3. History in the app: GET …/:id/history on every entity and a History tab on each detail page; Settings › Audit Trail filters by user, table, record and date (indexes auditLogUserTimeIdx, auditLogRecordIdx).
4. Error catalogue Platform.ErrorCodes (code, httpStatus, ErrorCategory lookup, module, userMessage, isLogged) and append-only Platform.ErrorLogs (user, correlationId, status, code, path, SQLSTATE, redacted details); the exception filter maps SQLSTATE and trigger HINT codes; every error response carries correlationId.
5. Audit coverage: every table an entity uses must have Company.triggerAudit before its phase is done (ROADMAP.md lists the missing ones per entity); attach it to Lookups in Phase 0.
6. Shared contracts: list query (search, filters, page, pageSize, sort) and { items, total } response schemas; rowVersion optimistic concurrency (409 on stale); @RequirePermission API guard reading Company.Permissions codes.
7. Workspace shell in Tailwind, faithful to template/src: 20-shell-open.html, 10-styles.css, 15-polish.css, 95-ui.js; sidebar, topbar (search, create, notifications, user menu), page head, data table, drawer, form fields, badges, tabs, toasts, empty/loading/error states; 404 / unauthorised / states screens (60-settings-ess.html).
8. Fix: server-side session calls over loopback must not share one rate-limit bucket.
9. Tenant-first provisioning (rev 2, prisma/sql/006-tenant-provisioning.sql): the tenant is the main record and no user exists without one. Platform.provisionTenant creates tenant → system roles with default grants (Platform.SystemRoleGrants, synced from prisma/catalog.ts) → the default user (Tenants.defaultUserId) holding every role. Locked by triggers: the default user keeps all roles (new roles are auto-assigned), stays ACTIVE, cannot be deleted; error TENANT_DEFAULT_USER_LOCKED (409).

## Phase 1: Company core

**Masters** · workspace · 4 entities. Branches, currencies, company profile/settings and document numbering: referenced by every later entity.

### 1.1 Branches `branches`

- **Tables:** `Company.Branches`
- **Audit trigger:** present on all tables
- **Template:** `app/settings` (tab `set-branches`) — `template/src/60-settings-ess.html`
- **Pages:** `/settings › tab `set-branches`` (tab)
- **Permissions:** `comp`: view, edit, export
- **API:**
  - `GET /api/settings/branches?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/branches/:id`: detail
  - `POST /api/settings/branches`: create
  - `PATCH /api/settings/branches/:id`: update with rowVersion (409 when stale)
  - `POST /api/settings/branches/:id/deactivate | /activate`
  - `DELETE /api/settings/branches/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/settings/branches/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Code unique per tenant; Cannot deactivate the last active branch or a branch with open documents.

### 1.2 Currencies & Exchange Rates `currencies`

- **Tables:** `Company.Currencies`, `Company.ExchangeRates`
- **Audit trigger:** present on all tables
- **Template:** `app/settings` (tab `set-finance`) — `template/src/60-settings-ess.html`
- **Pages:** `/settings › tab `set-finance`` (tab)
- **Permissions:** `comp`: view, edit, export
- **API:**
  - `GET /api/settings/currencies?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/currencies/:id`: detail
  - `POST /api/settings/currencies`: create
  - `PATCH /api/settings/currencies/:id`: update with rowVersion (409 when stale)
  - `POST /api/settings/currencies/:id/deactivate | /activate`
  - `DELETE /api/settings/currencies/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/settings/currencies/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/settings/currencies/:code/rates?from&to: rate history
  - POST /api/settings/currencies/:code/rates: add a dated rate
- **Business rules:** Base currency (Tenants.baseCurrency) cannot be deactivated; One rate per currency per date; rates are history (no edit after use).

### 1.3 Company Settings & Setup Guide `company-settings`

- **Tables:** `Company.CompanySettings`, `Company.CompanySettingValues`, `Company.SetupGuideSteps`
- **Audit trigger:** present on all tables
- **Template:** `app/settings` (tab `set-profile`) — `template/src/60-settings-ess.html`; `app/settings` (tab `set-branding`) — `template/src/60-settings-ess.html`; `app/settings` (tab `set-sales`) — `template/src/60-settings-ess.html`; `app/settings` (tab `set-hr`) — `template/src/60-settings-ess.html`; `app/settings` (tab `set-tax`) — `template/src/60-settings-ess.html`; `app/setup` — `template/src/4A-company-plus.html`
- **Pages:** `/settings › tab `set-profile`` (tab), `/settings › tab `set-branding`` (tab), `/settings › tab `set-sales`` (tab), `/settings › tab `set-hr`` (tab), `/settings › tab `set-tax`` (tab), `/setup` (list/screen)
- **Permissions:** `comp`: view, edit, export
- **API:**
  - `GET /api/settings/company?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/company/:id`: detail
  - `POST /api/settings/company`: create
  - `PATCH /api/settings/company/:id`: update with rowVersion (409 when stale)
  - `POST /api/settings/company/:id/deactivate | /activate`
  - `DELETE /api/settings/company/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/settings/company/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/settings/company: all setting groups
  - PATCH /api/settings/company/:group: update one group
  - GET /api/settings/setup-guide, POST /api/settings/setup-guide/:step/complete
- **Business rules:** Settings are key/value with typed validation per key; Logo upload via Attachments (Phase 35 storage; temporary URL field until then).
- **Depends on:** `branches` (phase 1)

### 1.4 Numbering Series `numbering-series`

- **Tables:** `Company.NumberingSeries`, `Company.NumberingSeriesCounters`
- **Audit trigger:** missing on `Company.NumberingSeriesCounters`; add it in this phase
- **Template:** `app/settings` (tab `set-numbering`) — `template/src/60-settings-ess.html`
- **Pages:** `/settings › tab `set-numbering`` (tab)
- **Permissions:** `comp`: view, edit, export
- **API:**
  - `GET /api/settings/numbering-series?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/numbering-series/:id`: detail
  - `POST /api/settings/numbering-series`: create
  - `PATCH /api/settings/numbering-series/:id`: update with rowVersion (409 when stale)
  - `POST /api/settings/numbering-series/:id/deactivate | /activate`
  - `DELETE /api/settings/numbering-series/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/settings/numbering-series/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/settings/numbering-series/:id/preview: next number (Company.getNumberingSeriesPreview)
- **Business rules:** Counters are advanced only inside the posting transaction (no gaps on rollback); Prefix/format immutable once a number is issued.
- **Depends on:** `branches` (phase 1)

## Phase 2: Access & security

**Masters** · workspace · 5 entities. Users (with the Employee role trigger), roles/permissions, approval workflows, document templates and the user's own account security.

### 2.1 Users `users`

- **Tables:** `Company.Users`, `Company.UserBranches`, `Company.UserWarehouses`, `Company.UserRoles`
- **Audit trigger:** missing on `Company.Users`; add it in this phase
- **Template:** `app/settings/users` — `template/src/49-cash-users.html`
- **Pages:** `/settings/users` (list/screen)
- **Permissions:** `usr`: view, create, edit, delete, export
- **API:**
  - `GET /api/settings/users?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/users/:id`: detail
  - `POST /api/settings/users`: create
  - `PATCH /api/settings/users/:id`: update with rowVersion (409 when stale)
  - `POST /api/settings/users/:id/deactivate | /activate`
  - `DELETE /api/settings/users/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/settings/users/:id/history`: audit trail (Company.AuditTrailEntries)
  - Create now with a temporary password (must change at first sign-in); invites are Phase 15
  - POST /api/settings/users/:id/suspend|reactivate|remove
  - PUT /api/settings/users/:id/roles: replace job roles (Employee is kept by trigger)
  - POST /api/settings/users/:id/reset-password
- **Business rules:** Every user always holds EMPLOYEE (DB trigger); Email unique per tenant (appUserEmailUidx); Cannot suspend yourself or the last Admin.
- **Depends on:** `branches` (phase 1)

### 2.2 Roles & Permissions `roles`

- **Tables:** `Company.Roles`, `Company.RolePermissions`, `Company.RoleLimits`, `Company.Permissions`
- **Audit trigger:** present on all tables
- **Template:** `app/settings/roles` — `template/src/49-cash-users.html`
- **Pages:** `/settings/roles` (list/screen)
- **Permissions:** `rol`: view, create, edit, delete, export
- **API:**
  - `GET /api/settings/roles?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/roles/:id`: detail
  - `POST /api/settings/roles`: create
  - `PATCH /api/settings/roles/:id`: update with rowVersion (409 when stale)
  - `POST /api/settings/roles/:id/deactivate | /activate`
  - `DELETE /api/settings/roles/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/settings/roles/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/settings/permissions: permission catalogue (read-only)
  - PUT /api/settings/roles/:id/permissions: replace grants
  - POST /api/settings/roles/:id/copy
- **Business rules:** System roles (isSystem) cannot be deleted or renamed; Admin keeps all permissions; Role limits (approval amounts) validated against currency.

### 2.3 Approval Workflows `approval-workflows`

- **Tables:** `Company.ApprovalWorkflows`, `Company.ApprovalWorkflowSteps`, `Company.ApprovalWorkflowConditions`, `Company.ApprovalDelegations`
- **Audit trigger:** present on all tables
- **Template:** `app/settings/approvals` — `template/src/60-settings-ess.html`
- **Pages:** `/settings/approvals` (list/screen)
- **Permissions:** `wf`: view, create, edit, delete, export
- **API:**
  - `GET /api/settings/approval-workflows?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/approval-workflows/:id`: detail
  - `POST /api/settings/approval-workflows`: create
  - `PATCH /api/settings/approval-workflows/:id`: update with rowVersion (409 when stale)
  - `POST /api/settings/approval-workflows/:id/deactivate | /activate`
  - `DELETE /api/settings/approval-workflows/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/settings/approval-workflows/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/settings/approval-workflows/:id/test: dry-run a document against conditions
  - CRUD /api/settings/approval-delegations
- **Business rules:** One active workflow per document type and condition set; Steps ordered; approver = role or user; Segregation of duties: requester cannot approve own document.
- **Depends on:** `roles` (phase 2), `users` (phase 2)

### 2.4 Document Types & Templates `document-templates`

- **Tables:** `Company.DocumentTypes`, `Company.DocumentTemplates`
- **Audit trigger:** present on all tables
- **Template:** `app/settings/templates` — `template/src/60-settings-ess.html`
- **Pages:** `/settings/templates` (list/screen)
- **Permissions:** `comp`: view, edit, export
- **API:**
  - `GET /api/settings/document-templates?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/document-templates/:id`: detail
  - `POST /api/settings/document-templates`: create
  - `PATCH /api/settings/document-templates/:id`: update with rowVersion (409 when stale)
  - `POST /api/settings/document-templates/:id/deactivate | /activate`
  - `DELETE /api/settings/document-templates/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/settings/document-templates/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/settings/document-templates/:id/preview: render sample PDF
  - POST /api/settings/document-templates/:id/set-default
- **Business rules:** One default template per document type.

### 2.5 Account & Security `account-security`

- **Tables:** `Company.UserSessions`, `Company.UserPreferences`
- **Audit trigger:** missing on `Company.UserSessions`; add it in this phase
- **Template:** `app/profile/security` — `template/src/60-settings-ess.html`; `login` — `template/src/30-entry-admin.html`
- **Pages:** `/profile/security` (list/screen), `/login` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/me?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/me/:id`: detail
  - `POST /api/me`: create
  - `PATCH /api/me/:id`: update with rowVersion (409 when stale)
  - `POST /api/me/:id/deactivate | /activate`
  - `DELETE /api/me/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/me/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/me/password
  - GET|DELETE /api/me/sessions/:id
  - GET|PATCH /api/me/profile
  - GET|PATCH /api/me/preferences
  - POST /api/auth/login {companyCode,email,password}, POST /api/auth/logout
- **Business rules:** Always own data only; no permission needed; Sessions are server-side (Company.UserSessions); revoke takes effect on the next request; Sign-in screen rebuilt from the template (login) with the company code; it is public.
- **Depends on:** `users` (phase 2)

## Phase 3: Finance structure

**Masters** · workspace · 4 entities. Fiscal calendar, chart of accounts, cost centres/projects and the account mappings that posting uses.

### 3.1 Fiscal Years & Periods `fiscal-periods`

- **Tables:** `Accounting.FiscalYears`, `Accounting.FiscalPeriods`, `Accounting.PeriodModuleLocks`
- **Audit trigger:** present on all tables
- **Template:** `app/periods` — `template/src/42-acc-reports.html`
- **Pages:** `/periods` (list/screen)
- **Permissions:** `close`: view, approve, post, export
- **API:**
  - `GET /api/accounting/fiscal-years?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/accounting/fiscal-years/:id`: detail
  - `POST /api/accounting/fiscal-years`: create
  - `PATCH /api/accounting/fiscal-years/:id`: update with rowVersion (409 when stale)
  - `POST /api/accounting/fiscal-years/:id/deactivate | /activate`
  - `DELETE /api/accounting/fiscal-years/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/accounting/fiscal-years/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/accounting/fiscal-years/:id/generate-periods
  - POST /api/accounting/periods/:id/lock|unlock (per module)
- **Business rules:** Periods contiguous, no overlap; year starts at Tenants.fiscalYearStartMonth; Locked period rejects postings (DB check).

### 3.2 Chart of Accounts `chart-of-accounts`

- **Tables:** `Accounting.ChartOfAccounts`, `Accounting.AccountBranches`, `Accounting.SavedLedgerViews`
- **Audit trigger:** present on all tables
- **Template:** `app/accounting/coa` — `template/src/46-coa.html`; `app/accounting/ledger` — `template/src/46-coa.html`
- **Pages:** `/accounting/coa` (list/screen), `/accounting/ledger` (list/screen)
- **Permissions:** `coa`: view, create, edit, delete, export
- **API:**
  - `GET /api/accounting/accounts?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/accounting/accounts/:id`: detail
  - `POST /api/accounting/accounts`: create
  - `PATCH /api/accounting/accounts/:id`: update with rowVersion (409 when stale)
  - `POST /api/accounting/accounts/:id/deactivate | /activate`
  - `DELETE /api/accounting/accounts/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/accounting/accounts/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/accounting/accounts/tree
  - POST /api/accounting/accounts/import-template: from Platform COA template
  - GET /api/accounting/accounts/:id/ledger (read; postings arrive in Phase 16)
  - CRUD /api/accounting/ledger-views
- **Business rules:** Code unique; parent/child hierarchy; only leaf accounts are postable; Cannot delete an account with postings; deactivate instead.
- **Depends on:** `branches` (phase 1), `currencies` (phase 1)

### 3.3 Cost Centres & Projects `cost-centres`

- **Tables:** `Accounting.CostCentres`, `Accounting.Projects`, `Accounting.ProjectTags`, `Accounting.CostAllocationRules`, `Accounting.CostAllocationSplits`
- **Audit trigger:** present on all tables
- **Template:** `app/accounting/cost-centres` — `template/src/4A-company-plus.html`
- **Pages:** `/accounting/cost-centres` (list/screen)
- **Permissions:** `coa`: view, create, edit, delete, export
- **API:**
  - `GET /api/accounting/cost-centres?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/accounting/cost-centres/:id`: detail
  - `POST /api/accounting/cost-centres`: create
  - `PATCH /api/accounting/cost-centres/:id`: update with rowVersion (409 when stale)
  - `POST /api/accounting/cost-centres/:id/deactivate | /activate`
  - `DELETE /api/accounting/cost-centres/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/accounting/cost-centres/:id/history`: audit trail (Company.AuditTrailEntries)
  - CRUD /api/accounting/projects
  - CRUD /api/accounting/cost-allocation-rules (splits must total 100%)
- **Business rules:** Allocation splits sum to 100%.
- **Depends on:** `chart-of-accounts` (phase 3)

### 3.4 Account Mappings & Posting Roles `account-mappings`

- **Tables:** `Company.DefaultAccountMappings`, `Company.PostingRoles`
- **Audit trigger:** present on all tables
- **Template:** `app/settings` (tab `set-finance`) — `template/src/60-settings-ess.html`
- **Pages:** `/settings › tab `set-finance`` (tab)
- **Permissions:** `coa`: view, create, edit, delete, export; `comp`: view, edit, export
- **API:**
  - `GET /api/settings/account-mappings?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/account-mappings/:id`: detail
  - `POST /api/settings/account-mappings`: create
  - `PATCH /api/settings/account-mappings/:id`: update with rowVersion (409 when stale)
  - `POST /api/settings/account-mappings/:id/deactivate | /activate`
  - `DELETE /api/settings/account-mappings/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/settings/account-mappings/:id/history`: audit trail (Company.AuditTrailEntries)
  - PUT /api/settings/account-mappings: bulk save
- **Business rules:** Every posting role used by a module must map to a postable account before that module posts.
- **Depends on:** `chart-of-accounts` (phase 3)

## Phase 4: Tax & treasury setup

**Masters** · workspace · 5 entities. Tax codes and the bank/cash/cheque/expense masters treasury transactions need.

### 4.1 Tax Codes `tax-codes`

- **Tables:** `Tax.TaxCodes`, `Tax.TaxCodeRates`
- **Audit trigger:** present on all tables
- **Template:** `app/tax/codes` — `template/src/42-acc-reports.html`
- **Pages:** `/tax/codes` (list/screen)
- **Permissions:** `tax`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/tax/codes?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/tax/codes/:id`: detail
  - `POST /api/tax/codes`: create
  - `PATCH /api/tax/codes/:id`: update with rowVersion (409 when stale)
  - `POST /api/tax/codes/:id/deactivate | /activate`
  - `DELETE /api/tax/codes/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/tax/codes/:id/history`: audit trail (Company.AuditTrailEntries)
  - Rates edited as a dated list on the tax code (no overlapping periods)
- **Business rules:** Rates are effective-dated history; GL accounts must be postable; Manual entry; import from the Platform Tax Master arrives with Phase 37.
- **Depends on:** `chart-of-accounts` (phase 3)

### 4.2 Banks & Bank Accounts `bank-accounts`

- **Tables:** `BankCash.Banks`, `BankCash.BankAccounts`
- **Audit trigger:** present on all tables
- **Template:** `app/bank/accounts` — `template/src/40-acc-core.html`
- **Pages:** `/bank/accounts` (list/screen)
- **Permissions:** `bank`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/bank/accounts?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/bank/accounts/:id`: detail
  - `POST /api/bank/accounts`: create
  - `PATCH /api/bank/accounts/:id`: update with rowVersion (409 when stale)
  - `POST /api/bank/accounts/:id/deactivate | /activate`
  - `DELETE /api/bank/accounts/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/bank/accounts/:id/history`: audit trail (Company.AuditTrailEntries)
  - CRUD /api/bank/banks (common Pakistani banks seeded per company; add inline)
- **Business rules:** Each bank account linked to one postable GL account (created or linked); IBAN format validation; At most one Primary account.
- **Depends on:** `chart-of-accounts` (phase 3), `currencies` (phase 1), `branches` (phase 1)

### 4.3 Cash Accounts & Categories `cash-accounts`

- **Tables:** `BankCash.CashAccounts`, `BankCash.CashCategories`
- **Audit trigger:** present on all tables
- **Template:** **none**, design needed (see open questions)
- **Pages:** to be designed
- **Permissions:** `cash`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/cash/accounts?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/cash/accounts/:id`: detail
  - `POST /api/cash/accounts`: create
  - `PATCH /api/cash/accounts/:id`: update with rowVersion (409 when stale)
  - `POST /api/cash/accounts/:id/deactivate | /activate`
  - `DELETE /api/cash/accounts/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/cash/accounts/:id/history`: audit trail (Company.AuditTrailEntries)
  - CRUD /api/cash/categories
- **Business rules:** One cash account per GL account; its code is the GL code (created or linked); Petty / imprest accounts need an imprest amount.
- **Depends on:** `chart-of-accounts` (phase 3), `branches` (phase 1)
- **Open questions:** No setup template: template-styled panels on /cash/setup (decided 2026-10-05); the Cash Book phase opens the same drawers

### 4.4 Cheque Books `cheque-books`

- **Tables:** `BankCash.ChequeBooks`
- **Audit trigger:** present on all tables
- **Template:** **none**, design needed (see open questions)
- **Pages:** to be designed
- **Permissions:** `bank`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/bank/cheque-books?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/bank/cheque-books/:id`: detail
  - `POST /api/bank/cheque-books`: create
  - `PATCH /api/bank/cheque-books/:id`: update with rowVersion (409 when stale)
  - `POST /api/bank/cheque-books/:id/deactivate | /activate`
  - `DELETE /api/bank/cheque-books/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/bank/cheque-books/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Leaf range must not overlap per bank account; One active book per bank account.
- **Depends on:** `bank-accounts` (phase 4)
- **Open questions:** No setup template (the Cheques Issued tab lists cheques): template-styled tab in the bank account drawer (decided 2026-10-05)

### 4.5 Expense Categories `expense-categories`

- **Tables:** `BankCash.ExpenseCategories`
- **Audit trigger:** present on all tables
- **Template:** **none**, design needed (see open questions)
- **Pages:** to be designed
- **Permissions:** `cash`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/cash/expense-categories?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/cash/expense-categories/:id`: detail
  - `POST /api/cash/expense-categories`: create
  - `PATCH /api/cash/expense-categories/:id`: update with rowVersion (409 when stale)
  - `POST /api/cash/expense-categories/:id/deactivate | /activate`
  - `DELETE /api/cash/expense-categories/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/cash/expense-categories/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Each category maps to a postable expense account.
- **Depends on:** `chart-of-accounts` (phase 3)
- **Open questions:** No setup template: template-styled panel on /cash/setup (decided 2026-10-05); Expense Claims opens the same drawer later

## Phase 5: Treasury rules & compliance setup

**Masters** · workspace · 5 entities. Bank matching rules, petty cash funds, fixed asset categories and FBR (POS integration) settings.

### 5.1 Bank Rules `bank-rules`

- **Tables:** `BankCash.BankRules`, `BankCash.BankRuleConditions`
- **Audit trigger:** present on all tables
- **Template:** `app/bank/rules` — `template/src/4A-company-plus.html`
- **Pages:** `/bank/rules` (list/screen)
- **Permissions:** `bank`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/bank/rules?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/bank/rules/:id`: detail
  - `POST /api/bank/rules`: create
  - `PATCH /api/bank/rules/:id`: update with rowVersion (409 when stale)
  - `POST /api/bank/rules/:id/deactivate | /activate`
  - `DELETE /api/bank/rules/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/bank/rules/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/bank/rules/:id/test: run against sample statement lines
  - PUT /api/bank/rules/order
- **Business rules:** Statement import and invoice matching on this screen arrive with Banking (Phase 17).
- **Depends on:** `bank-accounts` (phase 4), `chart-of-accounts` (phase 3)

### 5.2 Petty Cash Funds `petty-cash-funds`

- **Tables:** `BankCash.PettyCashFunds`
- **Audit trigger:** present on all tables
- **Template:** `app/cash/petty` — `template/src/40-acc-core.html`
- **Pages:** `/cash/petty` (list/screen)
- **Permissions:** `cash`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/cash/petty-funds?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/cash/petty-funds/:id`: detail
  - `POST /api/cash/petty-funds`: create
  - `PATCH /api/cash/petty-funds/:id`: update with rowVersion (409 when stale)
  - `POST /api/cash/petty-funds/:id/deactivate | /activate`
  - `DELETE /api/cash/petty-funds/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/cash/petty-funds/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Imprest amount > 0; custodian is an active user; The fund drives its petty cash account: created with it (or an unused petty account linked); imprest and custodian copied onto the account.
- **Depends on:** `cash-accounts` (phase 4), `users` (phase 2)

### 5.3 Fixed Asset Categories `asset-categories`

- **Tables:** `FixedAssets.FixedAssetCategories`
- **Audit trigger:** present on all tables
- **Template:** **none**, design needed (see open questions)
- **Pages:** to be designed
- **Permissions:** `fa`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/assets/categories?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/assets/categories/:id`: detail
  - `POST /api/assets/categories`: create
  - `PATCH /api/assets/categories/:id`: update with rowVersion (409 when stale)
  - `POST /api/assets/categories/:id/deactivate | /activate`
  - `DELETE /api/assets/categories/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/assets/categories/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Depreciation method and rate required unless NONE; cost / accumulated depreciation / expense accounts postable.
- **Depends on:** `chart-of-accounts` (phase 3)
- **Open questions:** No setup template (app/assets is the asset register): template-styled page /assets/categories (decided 2026-10-05)

### 5.4 FBR Settings `fbr-settings`

- **Tables:** `Tax.FbrSettings`, `Tax.FbrBranchMappings`, `Company.TenantSecrets`
- **Audit trigger:** missing on `Company.TenantSecrets`; add it in this phase
- **Template:** `app/tax/fbr` — `template/src/42-acc-reports.html`
- **Pages:** `/tax/fbr` (list/screen)
- **Permissions:** `tax`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/tax/fbr?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/tax/fbr/:id`: detail
  - `POST /api/tax/fbr`: create
  - `PATCH /api/tax/fbr/:id`: update with rowVersion (409 when stale)
  - `POST /api/tax/fbr/:id/deactivate | /activate`
  - `DELETE /api/tax/fbr/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/tax/fbr/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Credentials encrypted at rest (AES-256-GCM, APP_ENCRYPTION_KEY) in Company.TenantSecrets; never returned by the API; Test connection and sync arrive with FBR Submissions (Phase 28).
- **Depends on:** `branches` (phase 1)

### 5.5 Segregation-of-Duties Rules `sod-rules`

- **Tables:** `Company.SegregationOfDutiesRules`
- **Audit trigger:** present on all tables
- **Template:** `app/settings/roles` — `template/src/49-cash-users.html`
- **Pages:** `/settings/roles` (list/screen)
- **Permissions:** `rol`: view, create, edit, delete, export
- **API:**
  - `GET /api/settings/sod-rules?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/sod-rules/:id`: detail
  - `POST /api/settings/sod-rules`: create
  - `PATCH /api/settings/sod-rules/:id`: update with rowVersion (409 when stale)
  - `POST /api/settings/sod-rules/:id/deactivate | /activate`
  - `DELETE /api/settings/sod-rules/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/settings/sod-rules/:id/history`: audit trail (Company.AuditTrailEntries)
  - CRUD /api/settings/sod-rules; Roles & Permissions reads conflicts from these rules
- **Business rules:** Moved from Phase 3: until then the Phase 2 rules in src/shared/access/sod.ts apply; Default rules seeded per company (same as the Phase 2 code rules), all WARN; BLOCK rules refuse saving a role.
- **Depends on:** `roles` (phase 2)
- **Open questions:** No template for managing rules (Roles only shows conflicts): template-styled tab on /settings/roles (decided 2026-10-05)

## Phase 6: Product setup

**Masters** · workspace · 5 entities. Units, brands, classes, warehouses and stock movement reasons needed before products and stock.

### 6.1 Units of Measure `units`

- **Tables:** `Inventory.UnitsOfMeasure`
- **Audit trigger:** present on all tables
- **Template:** **none**, design needed (see open questions)
- **Pages:** to be designed
- **Permissions:** `item`: view, create, edit, delete, export
- **API:**
  - `GET /api/inventory/units?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/units/:id`: detail
  - `POST /api/inventory/units`: create
  - `PATCH /api/inventory/units/:id`: update with rowVersion (409 when stale)
  - `POST /api/inventory/units/:id/deactivate | /activate`
  - `DELETE /api/inventory/units/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/inventory/units/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** System units seeded per company (PCS, PKT, BOX, CTN, DZN, KG, G, L, ML, M); system rows can't be deleted.
- **Open questions:** No dedicated template: template-styled page /inventory/units (decided 2026-10-05)

### 6.2 Brands / Companies `brands`

- **Tables:** `Inventory.ProductCompanies`
- **Audit trigger:** present on all tables
- **Template:** `app/inventory/companies` — `template/src/4B-products.html`
- **Pages:** `/inventory/companies` (list/screen)
- **Permissions:** `item`: view, create, edit, delete, export
- **API:**
  - `GET /api/inventory/companies?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/companies/:id`: detail
  - `POST /api/inventory/companies`: create
  - `PATCH /api/inventory/companies/:id`: update with rowVersion (409 when stale)
  - `POST /api/inventory/companies/:id/deactivate | /activate`
  - `DELETE /api/inventory/companies/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/inventory/companies/:id/history`: audit trail (Company.AuditTrailEntries)

### 6.3 Product Classes `product-classes`

- **Tables:** `Inventory.ProductClasses`, `Inventory.ProductSubclasses`
- **Audit trigger:** present on all tables
- **Template:** `app/inventory/classes` — `template/src/4B-products.html`
- **Pages:** `/inventory/classes` (list/screen)
- **Permissions:** `item`: view, create, edit, delete, export
- **API:**
  - `GET /api/inventory/classes?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/classes/:id`: detail
  - `POST /api/inventory/classes`: create
  - `PATCH /api/inventory/classes/:id`: update with rowVersion (409 when stale)
  - `POST /api/inventory/classes/:id/deactivate | /activate`
  - `DELETE /api/inventory/classes/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/inventory/classes/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Subclass names unique within a class.

### 6.4 Warehouses & Bins `warehouses`

- **Tables:** `Inventory.Warehouses`, `Inventory.WarehouseBins`
- **Audit trigger:** present on all tables
- **Template:** `app/inventory/warehouses` — `template/src/41-acc-trade.html`
- **Pages:** `/inventory/warehouses` (list/screen)
- **Permissions:** `wh`: view, create, edit, delete, export
- **API:**
  - `GET /api/inventory/warehouses?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/warehouses/:id`: detail
  - `POST /api/inventory/warehouses`: create
  - `PATCH /api/inventory/warehouses/:id`: update with rowVersion (409 when stale)
  - `POST /api/inventory/warehouses/:id/deactivate | /activate`
  - `DELETE /api/inventory/warehouses/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/inventory/warehouses/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Warehouse belongs to a branch; cannot deactivate with stock on hand; One primary warehouse: making another primary moves the flag; Bins managed inside the warehouse drawer; VAN type hidden until Distribution vans exist.
- **Depends on:** `branches` (phase 1)

### 6.5 Stock Movement Reasons `movement-reasons`

- **Tables:** `Inventory.StockMovementReasons`
- **Audit trigger:** present on all tables
- **Template:** **none**, design needed (see open questions)
- **Pages:** to be designed
- **Permissions:** `adj`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/inventory/movement-reasons?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/movement-reasons/:id`: detail
  - `POST /api/inventory/movement-reasons`: create
  - `PATCH /api/inventory/movement-reasons/:id`: update with rowVersion (409 when stale)
  - `POST /api/inventory/movement-reasons/:id/deactivate | /activate`
  - `DELETE /api/inventory/movement-reasons/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/inventory/movement-reasons/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** System reasons seeded per company (opening, found, damaged, expired, theft / loss, internal use, samples, count variance); system rows can't be deleted.
- **Depends on:** `chart-of-accounts` (phase 3)
- **Open questions:** No dedicated template (adjustments only shows a by-reason report): template-styled page /inventory/reasons (decided 2026-10-05)

## Phase 7: Parties

**Masters** · workspace · 4 entities. Customers and vendors with their groups, contacts, addresses and bank accounts.

### 7.1 Customer Groups `customer-groups`

- **Tables:** `Sales.CustomerGroups`
- **Audit trigger:** present on all tables
- **Template:** `app/customers` — `template/src/41-acc-trade.html`
- **Pages:** `/customers` (list/screen)
- **Permissions:** `cust`: view, create, edit, delete, export
- **API:**
  - `GET /api/sales/customer-groups?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/customer-groups/:id`: detail
  - `POST /api/sales/customer-groups`: create
  - `PATCH /api/sales/customer-groups/:id`: update with rowVersion (409 when stale)
  - `POST /api/sales/customer-groups/:id/deactivate | /activate`
  - `DELETE /api/sales/customer-groups/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/sales/customer-groups/:id/history`: audit trail (Company.AuditTrailEntries)
- **Open questions:** No template (only a filter on app/customers): template-styled drawer from /customers (decided 2026-10-05)

### 7.2 Customers `customers`

- **Tables:** `Sales.Customers`, `Sales.CustomerAddresses`, `Sales.CustomerContacts`, `Sales.CustomerNotes`
- **Audit trigger:** present on all tables
- **Template:** `app/customers` — `template/src/41-acc-trade.html`; `app/customers/view` — `template/src/41-acc-trade.html`
- **Pages:** `/customers` (list/screen), `/customers/[id]` (detail)
- **Permissions:** `cust`: view, create, edit, delete, export
- **API:**
  - `GET /api/sales/customers?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/customers/:id`: detail
  - `POST /api/sales/customers`: create
  - `PATCH /api/sales/customers/:id`: update with rowVersion (409 when stale)
  - `POST /api/sales/customers/:id/deactivate | /activate`
  - `DELETE /api/sales/customers/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/sales/customers/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/sales/customers/:id/statement (read; data from Phase 23+)
  - CRUD /api/sales/customers/:id/contacts|addresses|notes
  - POST /api/sales/customers/import (Phase 35 importer reuses the use case)
- **Business rules:** NTN/STRN/CNIC format checks; Credit limit >= 0; Receivable account postable; Price list / price tier offered from Phase 9; opening balance entered and posted in Phase 16 (decided 2026-10-05).
- **Depends on:** `customer-groups` (phase 7), `chart-of-accounts` (phase 3), `tax-codes` (phase 4)

### 7.3 Vendor Categories `vendor-categories`

- **Tables:** `Purchases.VendorCategories`
- **Audit trigger:** present on all tables
- **Template:** `app/vendors` — `template/src/41-acc-trade.html`
- **Pages:** `/vendors` (list/screen)
- **Permissions:** `vend`: view, create, edit, delete, export
- **API:**
  - `GET /api/purchases/vendor-categories?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/purchases/vendor-categories/:id`: detail
  - `POST /api/purchases/vendor-categories`: create
  - `PATCH /api/purchases/vendor-categories/:id`: update with rowVersion (409 when stale)
  - `POST /api/purchases/vendor-categories/:id/deactivate | /activate`
  - `DELETE /api/purchases/vendor-categories/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/purchases/vendor-categories/:id/history`: audit trail (Company.AuditTrailEntries)
- **Open questions:** No template (only a filter on app/vendors): template-styled drawer from /vendors (decided 2026-10-05)

### 7.4 Vendors `vendors`

- **Tables:** `Purchases.Vendors`, `Purchases.VendorContacts`, `Purchases.VendorBankAccounts`
- **Audit trigger:** present on all tables
- **Template:** `app/vendors` — `template/src/41-acc-trade.html`; `app/vendors/view` — `template/src/41-acc-trade.html`
- **Pages:** `/vendors` (list/screen), `/vendors/[id]` (detail)
- **Permissions:** `vend`: view, create, edit, delete, export
- **API:**
  - `GET /api/purchases/vendors?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/purchases/vendors/:id`: detail
  - `POST /api/purchases/vendors`: create
  - `PATCH /api/purchases/vendors/:id`: update with rowVersion (409 when stale)
  - `POST /api/purchases/vendors/:id/deactivate | /activate`
  - `DELETE /api/purchases/vendors/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/purchases/vendors/:id/history`: audit trail (Company.AuditTrailEntries)
  - CRUD /api/purchases/vendors/:id/contacts|bank-accounts
  - GET /api/purchases/vendors/:id/statement (read)
- **Business rules:** WHT status from FBR active-taxpayer check (manual flag until integration); The vendor row's bank / IBAN mirror its primary bank account.
- **Depends on:** `vendor-categories` (phase 7), `chart-of-accounts` (phase 3), `tax-codes` (phase 4)

## Phase 8: Products

**Masters** · workspace · 4 entities. The product catalogue with units, barcodes, suppliers and batches, plus kits, label templates and reorder rules.

### 8.1 Products `products`

- **Tables:** `Inventory.Products`, `Inventory.ProductUnits`, `Inventory.ProductBarcodes`, `Inventory.ProductSuppliers`, `Inventory.ProductBatches`, `Inventory.ProductPriceLogs`
- **Audit trigger:** present on all tables
- **Template:** `app/inventory/items` — `template/src/4B-products.html`; `app/inventory/products/view` — `template/src/4B-products.html`; `app/inventory/batches` — `template/src/4C-stock-ops.html`
- **Pages:** `/inventory/items` (list/screen), `/inventory/products/[id]` (detail), `/inventory/batches` (list/screen)
- **Permissions:** `item`: view, create, edit, delete, export
- **API:**
  - `GET /api/inventory/products?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/products/:id`: detail
  - `POST /api/inventory/products`: create
  - `PATCH /api/inventory/products/:id`: update with rowVersion (409 when stale)
  - `POST /api/inventory/products/:id/deactivate | /activate`
  - `DELETE /api/inventory/products/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/inventory/products/:id/history`: audit trail (Company.AuditTrailEntries)
  - CRUD /api/inventory/products/:id/units|barcodes|suppliers
  - GET /api/inventory/products/:id/price-log (read-only)
  - GET /api/inventory/products/lookup?barcode=
- **Business rules:** SKU and barcode unique per tenant; Base unit required; conversion factors > 0; Price changes write ProductPriceLogs; Batches: register with manual add and disposition changes; stock moves from Phase 20 (decided 2026-10-06); No product images until a shared file-storage feature (decided 2026-10-06).
- **Depends on:** `units` (phase 6), `brands` (phase 6), `product-classes` (phase 6), `vendors` (phase 7), `tax-codes` (phase 4)

### 8.2 Kits & Bundles `kits`

- **Tables:** `Inventory.KitsAndBundles`, `Inventory.KitComponents`
- **Audit trigger:** present on all tables
- **Template:** `app/inventory/kits` — `template/src/4B-products.html`
- **Pages:** `/inventory/kits` (list/screen)
- **Permissions:** `item`: view, create, edit, delete, export
- **API:**
  - `GET /api/inventory/kits?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/kits/:id`: detail
  - `POST /api/inventory/kits`: create
  - `PATCH /api/inventory/kits/:id`: update with rowVersion (409 when stale)
  - `POST /api/inventory/kits/:id/deactivate | /activate`
  - `DELETE /api/inventory/kits/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/inventory/kits/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** A kit cannot contain itself (cycle check).
- **Depends on:** `products` (phase 8)

### 8.3 Barcode Labels `barcode-labels`

- **Tables:** `Inventory.BarcodeLabelTemplates`, `Inventory.BarcodeLabelJobs`, `Inventory.BarcodeLabelJobLines`
- **Audit trigger:** present on all tables
- **Template:** `app/inventory/labels` — `template/src/4B-products.html`
- **Pages:** `/inventory/labels` (list/screen)
- **Permissions:** `item`: view, create, edit, delete, export
- **API:**
  - `GET /api/inventory/label-templates?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/label-templates/:id`: detail
  - `POST /api/inventory/label-templates`: create
  - `PATCH /api/inventory/label-templates/:id`: update with rowVersion (409 when stale)
  - `POST /api/inventory/label-templates/:id/deactivate | /activate`
  - `DELETE /api/inventory/label-templates/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/inventory/label-templates/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/inventory/label-jobs: records a printed job (printing is browser print of the preview; no server PDF, decided 2026-10-06)
- **Depends on:** `products` (phase 8)

### 8.4 Reorder Rules `reorder-rules`

- **Tables:** `Inventory.ReorderRules`
- **Audit trigger:** present on all tables
- **Template:** `app/inventory/demand` — `template/src/4C-stock-ops.html`
- **Pages:** `/inventory/demand` (list/screen)
- **Permissions:** `item`: view, create, edit, delete, export
- **API:**
  - `GET /api/inventory/reorder-rules?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/reorder-rules/:id`: detail
  - `POST /api/inventory/reorder-rules`: create
  - `PATCH /api/inventory/reorder-rules/:id`: update with rowVersion (409 when stale)
  - `POST /api/inventory/reorder-rules/:id/deactivate | /activate`
  - `DELETE /api/inventory/reorder-rules/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/inventory/reorder-rules/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Low <= high level; one rule per product per warehouse (null = all); Rules edited on the product detail; /inventory/demand shows only the Reorder Suggestions tab until Phase 22 adds Demand of Goods (decided 2026-10-06).
- **Depends on:** `products` (phase 8), `warehouses` (phase 6)

## Phase 9: Pricing & collections setup

**Masters** · workspace · 4 entities. Price lists, schemes, reminder templates/rules and wholesale price tiers used by sales.

### 9.1 Price Lists `price-lists`

- **Tables:** `Sales.PriceLists`, `Sales.PriceListItems`, `Sales.PriceListQuantityBreaks`
- **Audit trigger:** present on all tables
- **Template:** `app/sales/price-lists` — `template/src/4A-company-plus.html`
- **Pages:** `/sales/price-lists` (list/screen)
- **Permissions:** `quo`: view, create, edit, approve, delete, export
- **API:**
  - `GET /api/sales/price-lists?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/price-lists/:id`: detail
  - `POST /api/sales/price-lists`: create
  - `PATCH /api/sales/price-lists/:id`: update with rowVersion (409 when stale)
  - `POST /api/sales/price-lists/:id/deactivate | /activate`
  - `DELETE /api/sales/price-lists/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/sales/price-lists/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/sales/price-lists/:id/items/bulk
  - POST /api/sales/price-lists/:id/copy
  - GET /api/sales/price-lists/resolve?customer&product&qty
- **Business rules:** Effective-dated; quantity breaks ascending; Writes need quo:approve (approvers), views quo:view; assigned via customer group / customer priceListId (decided 2026-10-07).
- **Depends on:** `products` (phase 8), `customer-groups` (phase 7), `currencies` (phase 1)

### 9.2 Sales Schemes `sales-schemes`

- **Tables:** `Sales.SalesSchemes`, `Sales.SalesSchemeItems`, `Sales.SalesSchemeEligibilities`
- **Audit trigger:** present on all tables
- **Template:** `app/sales/price-lists` — `template/src/4A-company-plus.html`
- **Pages:** `/sales/price-lists` (list/screen)
- **Permissions:** `quo`: view, create, edit, approve, delete, export
- **API:**
  - `GET /api/sales/schemes?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/schemes/:id`: detail
  - `POST /api/sales/schemes`: create
  - `PATCH /api/sales/schemes/:id`: update with rowVersion (409 when stale)
  - `POST /api/sales/schemes/:id/deactivate | /activate`
  - `DELETE /api/sales/schemes/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/sales/schemes/:id/history`: audit trail (Company.AuditTrailEntries)
  - Schemes are the template's Schemes tab on /api/sales/price-lists (decided 2026-10-07)
- **Business rules:** Buy/free item rules validated; date window required.
- **Depends on:** `products` (phase 8), `customer-groups` (phase 7)

### 9.3 Payment Reminder Setup `reminder-setup`

- **Tables:** `Sales.PaymentReminderTemplates`, `Sales.PaymentReminderRules`
- **Audit trigger:** present on all tables
- **Template:** `app/receivables/reminders` — `template/src/4A-company-plus.html`
- **Pages:** `/receivables/reminders` (list/screen)
- **Permissions:** `rcpt`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/receivables/reminder-rules?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/receivables/reminder-rules/:id`: detail
  - `POST /api/receivables/reminder-rules`: create
  - `PATCH /api/receivables/reminder-rules/:id`: update with rowVersion (409 when stale)
  - `POST /api/receivables/reminder-rules/:id/deactivate | /activate`
  - `DELETE /api/receivables/reminder-rules/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/receivables/reminder-rules/:id/history`: audit trail (Company.AuditTrailEntries)
  - CRUD /api/receivables/reminder-templates
  - POST /api/receivables/reminder-templates/:id/preview
- **Business rules:** Seeded per company: 4 templates (EN + UR) and 4 rules (-3, 0, +7, +15 days); sending, logs and KPIs arrive with receivables (decided 2026-10-07).

### 9.4 Price Tiers `price-tiers`

- **Tables:** `Distribution.PriceTiers`
- **Audit trigger:** present on all tables
- **Template:** `app/sales/price-lists` — `template/src/4A-company-plus.html`
- **Pages:** `/sales/price-lists` (list/screen)
- **Permissions:** `pricetier`: view, create, edit, delete, export
- **API:**
  - `GET /api/distribution/price-tiers?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/price-tiers/:id`: detail
  - `POST /api/distribution/price-tiers`: create
  - `PATCH /api/distribution/price-tiers/:id`: update with rowVersion (409 when stale)
  - `POST /api/distribution/price-tiers/:id/deactivate | /activate`
  - `DELETE /api/distribution/price-tiers/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/distribution/price-tiers/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Added 'Price tiers' tab on /sales/price-lists; the three tiers (PriceTierCode lookup) are seeded per company and edited, not added (decided 2026-10-07).

## Phase 10: Organisation

**Masters** · workspace · 5 entities. HR organisation structure, shifts and holidays.

### 10.1 Departments `departments`

- **Tables:** `HumanResources.Departments`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/departments` — `template/src/50-hr-core.html`; `app/hr/org` — `template/src/50-hr-core.html`
- **Pages:** `/hr/departments` (list/screen), `/hr/org` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/hr/departments?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/departments/:id`: detail
  - `POST /api/hr/departments`: create
  - `PATCH /api/hr/departments/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/departments/:id/deactivate | /activate`
  - `DELETE /api/hr/departments/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/departments/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Hierarchy without cycles; /hr/org shows the Departments and Positions views now; People view from Phase 11; cost centre = pick an existing one (decided 2026-10-07).
- **Depends on:** `branches` (phase 1)

### 10.2 Designations `designations`

- **Tables:** `HumanResources.Designations`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/departments` — `template/src/50-hr-core.html`
- **Pages:** `/hr/departments` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/hr/designations?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/designations/:id`: detail
  - `POST /api/hr/designations`: create
  - `PATCH /api/hr/designations/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/designations/:id/deactivate | /activate`
  - `DELETE /api/hr/designations/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/designations/:id/history`: audit trail (Company.AuditTrailEntries)
- **Depends on:** `departments` (phase 10)

### 10.3 Grades `grades`

- **Tables:** `HumanResources.Grades`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/departments` — `template/src/50-hr-core.html`
- **Pages:** `/hr/departments` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/hr/grades?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/grades/:id`: detail
  - `POST /api/hr/grades`: create
  - `PATCH /api/hr/grades/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/grades/:id/deactivate | /activate`
  - `DELETE /api/hr/grades/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/grades/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** On the template's Designations & Grades tab of /hr/departments; no seed (decided 2026-10-07).

### 10.4 Work Shifts `work-shifts`

- **Tables:** `HumanResources.WorkShifts`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/shifts` — `template/src/50-hr-core.html`
- **Pages:** `/hr/shifts` (list/screen)
- **Permissions:** `att`: view, create, edit, approve, export
- **API:**
  - `GET /api/hr/shifts?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/shifts/:id`: detail
  - `POST /api/hr/shifts`: create
  - `PATCH /api/hr/shifts/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/shifts/:id/deactivate | /activate`
  - `DELETE /api/hr/shifts/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/shifts/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Overnight shifts allowed; grace minutes >= 0; Default General shift seeded per company; delete needs att:approve (no att:delete); weekly roster with attendance (decided 2026-10-07).

### 10.5 Holidays `holidays`

- **Tables:** `HumanResources.Holidays`, `HumanResources.HolidayBranches`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/holidays` — `template/src/50-hr-core.html`
- **Pages:** `/hr/holidays` (list/screen)
- **Permissions:** `att`: view, create, edit, approve, export
- **API:**
  - `GET /api/hr/holidays?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/holidays/:id`: detail
  - `POST /api/hr/holidays`: create
  - `PATCH /api/hr/holidays/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/holidays/:id/deactivate | /activate`
  - `DELETE /api/hr/holidays/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/holidays/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** FY 2026-27 Pakistan public holidays seeded per company (moon-dependent ones tentative) (decided 2026-10-07).
- **Depends on:** `branches` (phase 1)

## Phase 11: HR policies & people

**Masters** · workspace · 4 entities. Leave and overtime policies, biometric devices and the employee master (linked to Company.Users.employeeId).

### 11.1 Leave Types & Eligibility `leave-types`

- **Tables:** `HumanResources.LeaveTypes`, `HumanResources.LeaveEligibilityRules`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/leave/policies` — `template/src/50-hr-core.html`
- **Pages:** `/hr/leave/policies` (list/screen)
- **Permissions:** `lv`: view, create, edit, approve, delete, export
- **API:**
  - `GET /api/hr/leave-types?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/leave-types/:id`: detail
  - `POST /api/hr/leave-types`: create
  - `PATCH /api/hr/leave-types/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/leave-types/:id/deactivate | /activate`
  - `DELETE /api/hr/leave-types/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/leave-types/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Accrual and carry-forward rules validated; The template's 7 Pakistan leave types seeded per company, editable (decided 2026-10-07).
- **Depends on:** `grades` (phase 10), `branches` (phase 1)

### 11.2 Overtime Policies `overtime-policies`

- **Tables:** `HumanResources.OvertimePolicies`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/overtime` — `template/src/50-hr-core.html`
- **Pages:** `/hr/overtime` (list/screen)
- **Permissions:** `att`: view, create, edit, approve, export
- **API:**
  - `GET /api/hr/overtime-policies?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/overtime-policies/:id`: detail
  - `POST /api/hr/overtime-policies`: create
  - `PATCH /api/hr/overtime-policies/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/overtime-policies/:id/deactivate | /activate`
  - `DELETE /api/hr/overtime-policies/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/overtime-policies/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** One active policy per company; the template policy seeded; overtime claims arrive with attendance (decided 2026-10-07).

### 11.3 Biometric Devices `biometric-devices`

- **Tables:** `HumanResources.BiometricDevices`, `HumanResources.DeviceSyncLogs`
- **Audit trigger:** missing on `HumanResources.BiometricDevices`; add it in this phase
- **Template:** `app/hr/devices` — `template/src/50-hr-core.html`
- **Pages:** `/hr/devices` (list/screen)
- **Permissions:** `att`: view, create, edit, approve, export
- **API:**
  - `GET /api/hr/devices?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/devices/:id`: detail
  - `POST /api/hr/devices`: create
  - `PATCH /api/hr/devices/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/devices/:id/deactivate | /activate`
  - `DELETE /api/hr/devices/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/devices/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/devices/:id/sync: pull punches (writes DeviceSyncLogs)
  - GET /api/hr/devices/:id/sync-logs
- **Business rules:** No device connector yet: sync and test connection disabled until attendance (decided 2026-10-07).
- **Depends on:** `branches` (phase 1)

### 11.4 Employees `employees`

- **Tables:** `HumanResources.Employees`, `HumanResources.EmployeeStatutoryDetails`, `HumanResources.EmployeeBankAccounts`, `HumanResources.EmployeeDocuments`, `HumanResources.EmployeePositionHistory`, `HumanResources.BranchHrSettings`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/employees` — `template/src/50-hr-core.html`; `app/hr/employees/view` — `template/src/50-hr-core.html`; `app/hr/employees/new` — `template/src/50-hr-core.html`; `app/hr/org` — `template/src/50-hr-core.html`
- **Pages:** `/hr/employees` (list/screen), `/hr/employees/[id]` (detail), `/hr/employees/new` (create), `/hr/org` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/hr/employees?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/employees/:id`: detail
  - `POST /api/hr/employees`: create
  - `PATCH /api/hr/employees/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/employees/:id/deactivate | /activate`
  - `DELETE /api/hr/employees/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/employees/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/employees/:id/link-user: set Company.Users.employeeId
  - POST /api/hr/employees/:id/transfer|promote (writes position history)
  - CRUD /api/hr/employees/:id/documents|bank-accounts
  - GET /api/hr/org-chart
- **Business rules:** CNIC unique; employee code from numbering series; Position changes are history rows, not edits; Salary data visible only with salary permission (Phase 12); Wizard step 3 = statutory switches only until Phase 12; HR links an existing user (no login creation); documents are a checklist until uploads (Phase 35) (decided 2026-10-07).
- **Depends on:** `departments` (phase 10), `designations` (phase 10), `grades` (phase 10), `work-shifts` (phase 10), `branches` (phase 1), `numbering-series` (phase 1)

## Phase 12: Payroll setup

**Masters** · workspace · 5 entities. Salary components and structures, pay groups, tax slabs and each employee's salary.

### 12.1 Salary Components `salary-components`

- **Tables:** `Payroll.SalaryComponents`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/payroll/structures` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/payroll/structures` (list/screen)
- **Permissions:** `prun`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/payroll/components?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payroll/components/:id`: detail
  - `POST /api/payroll/components`: create
  - `PATCH /api/payroll/components/:id`: update with rowVersion (409 when stale)
  - `POST /api/payroll/components/:id/deactivate | /activate`
  - `DELETE /api/payroll/components/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/payroll/components/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/payroll/components/import-template: from Platform templates
- **Business rules:** Formula components validated (no cycles); The template's 17 components seeded per company with GL from its chart; Platform templates are empty so no import endpoint (decided 2026-10-07).
- **Depends on:** `chart-of-accounts` (phase 3)

### 12.2 Salary Structures `salary-structures`

- **Tables:** `Payroll.SalaryStructures`, `Payroll.SalaryStructureComponents`, `Payroll.SalaryStructureCommissionTiers`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/payroll/structures` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/payroll/structures` (list/screen)
- **Permissions:** `prun`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/payroll/structures?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payroll/structures/:id`: detail
  - `POST /api/payroll/structures`: create
  - `PATCH /api/payroll/structures/:id`: update with rowVersion (409 when stale)
  - `POST /api/payroll/structures/:id/deactivate | /activate`
  - `DELETE /api/payroll/structures/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/payroll/structures/:id/history`: audit trail (Company.AuditTrailEntries)
- **Depends on:** `salary-components` (phase 12)

### 12.3 Pay Groups `pay-groups`

- **Tables:** `Payroll.PayGroups`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/payroll/structures` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/payroll/structures` (list/screen)
- **Permissions:** `prun`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/payroll/pay-groups?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payroll/pay-groups/:id`: detail
  - `POST /api/payroll/pay-groups`: create
  - `PATCH /api/payroll/pay-groups/:id`: update with rowVersion (409 when stale)
  - `POST /api/payroll/pay-groups/:id/deactivate | /activate`
  - `DELETE /api/payroll/pay-groups/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/payroll/pay-groups/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Added 'Pay groups' tab on /hr/payroll/structures (no template); STAFF and MANAGEMENT seeded; Payroll Overview waits for payroll runs (decided 2026-10-07).

### 12.4 Salary Tax Slabs `tax-slabs`

- **Tables:** `Payroll.SalaryTaxSlabs`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/payroll/structures` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/payroll/structures` (list/screen)
- **Permissions:** `prun`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/payroll/tax-slabs?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payroll/tax-slabs/:id`: detail
  - `POST /api/payroll/tax-slabs`: create
  - `PATCH /api/payroll/tax-slabs/:id`: update with rowVersion (409 when stale)
  - `POST /api/payroll/tax-slabs/:id/deactivate | /activate`
  - `DELETE /api/payroll/tax-slabs/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/payroll/tax-slabs/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/payroll/tax-slabs/import-master: from Platform Tax Master salary slabs
- **Business rules:** Slabs contiguous per tax year; Added 'Tax slabs' tab on /hr/payroll/structures; Finance Act 2025 slabs seeded for 2025-26 and copied as 2026-27 to verify (decided 2026-10-07).

### 12.5 Employee Salaries `employee-salaries`

- **Tables:** `Payroll.EmployeeSalaries`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/employees/view` — `template/src/50-hr-core.html`
- **Pages:** `/hr/employees/[id]` (detail)
- **Permissions:** `prun`: view, create, edit, approve, post, export; `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/payroll/employee-salaries?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payroll/employee-salaries/:id`: detail
  - `POST /api/payroll/employee-salaries`: create
  - `PATCH /api/payroll/employee-salaries/:id`: update with rowVersion (409 when stale)
  - `POST /api/payroll/employee-salaries/:id/deactivate | /activate`
  - `DELETE /api/payroll/employee-salaries/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/payroll/employee-salaries/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/payroll/employee-salaries/:employeeId/revise: effective-dated revision
- **Business rules:** Effective-dated history; never overwrite a past salary; prun:approve users save salaries directly (recorded as approver); previous salary closed the day before (decided 2026-10-07).
- **Depends on:** `employees` (phase 11), `salary-structures` (phase 12), `pay-groups` (phase 12)

## Phase 13: Talent & policy setup

**Masters** · workspace · 4 entities. Templates and programmes that onboarding, performance and training transactions use, plus company policies.

### 13.1 Onboarding Templates `onboarding-templates`

- **Tables:** `HumanResources.OnboardingTemplates`, `HumanResources.OnboardingTemplateTasks`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/onboarding` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/onboarding` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/hr/onboarding-templates?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/onboarding-templates/:id`: detail
  - `POST /api/hr/onboarding-templates`: create
  - `PATCH /api/hr/onboarding-templates/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/onboarding-templates/:id/deactivate | /activate`
  - `DELETE /api/hr/onboarding-templates/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/onboarding-templates/:id/history`: audit trail (Company.AuditTrailEntries)

### 13.2 Performance Cycles `performance-cycles`

- **Tables:** `HumanResources.PerformanceCycles`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/performance` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/performance` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/hr/performance-cycles?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/performance-cycles/:id`: detail
  - `POST /api/hr/performance-cycles`: create
  - `PATCH /api/hr/performance-cycles/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/performance-cycles/:id/deactivate | /activate`
  - `DELETE /api/hr/performance-cycles/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/performance-cycles/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/performance-cycles/:id/open|advance|close
- **Business rules:** One ACTIVE cycle per company; stages advance in order; a CLOSED cycle is read-only.

### 13.3 Training Programs `training-programs`

- **Tables:** `HumanResources.TrainingPrograms`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/training` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/training` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/hr/training-programs?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/training-programs/:id`: detail
  - `POST /api/hr/training-programs`: create
  - `PATCH /api/hr/training-programs/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/training-programs/:id/deactivate | /activate`
  - `DELETE /api/hr/training-programs/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/training-programs/:id/history`: audit trail (Company.AuditTrailEntries)

### 13.4 Company Policies `company-policies`

- **Tables:** `EmployeeSelfService.CompanyPolicies`
- **Audit trigger:** present on all tables
- **Template:** `app/profile/onboarding` — `template/src/6A-ess.html`
- **Pages:** `/profile/onboarding` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export; `myonb`: view, edit
- **API:**
  - `GET /api/hr/policies?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/policies/:id`: detail
  - `POST /api/hr/policies`: create
  - `PATCH /api/hr/policies/:id`: update with rowVersion (409 when stale)
  - `POST /api/hr/policies/:id/deactivate | /activate`
  - `DELETE /api/hr/policies/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/hr/policies/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/policies/:id/publish (new version requires re-acknowledgement)
- **Business rules:** Published versions are immutable.

## Phase 14: Distribution setup

**Masters** · workspace · 4 entities. Shop areas, routes with stops and visit days, vans and commission slabs.

### 14.1 Shop Areas `shop-areas`

- **Tables:** `Distribution.ShopAreas`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/routes` — `template/src/4E-distribution.html`
- **Pages:** `/wholesale/routes` (list/screen)
- **Permissions:** `route`: view, create, edit, delete, export
- **API:**
  - `GET /api/distribution/shop-areas?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/shop-areas/:id`: detail
  - `POST /api/distribution/shop-areas`: create
  - `PATCH /api/distribution/shop-areas/:id`: update with rowVersion (409 when stale)
  - `POST /api/distribution/shop-areas/:id/deactivate | /activate`
  - `DELETE /api/distribution/shop-areas/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/distribution/shop-areas/:id/history`: audit trail (Company.AuditTrailEntries)

### 14.2 Routes `routes`

- **Tables:** `Distribution.Routes`, `Distribution.RouteStops`, `Distribution.RouteVisitDays`, `Distribution.ShopRouteProfiles`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/routes` — `template/src/4E-distribution.html`
- **Pages:** `/wholesale/routes` (list/screen)
- **Permissions:** `route`: view, create, edit, delete, export
- **API:**
  - `GET /api/distribution/routes?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/routes/:id`: detail
  - `POST /api/distribution/routes`: create
  - `PATCH /api/distribution/routes/:id`: update with rowVersion (409 when stale)
  - `POST /api/distribution/routes/:id/deactivate | /activate`
  - `DELETE /api/distribution/routes/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/distribution/routes/:id/history`: audit trail (Company.AuditTrailEntries)
  - PUT /api/distribution/routes/:id/stops: reorder stops
  - PUT /api/distribution/routes/:id/assignment: booker, salesman, van, driver
- **Business rules:** A customer is on at most one route per visit day; Assigned staff must hold the matching role (ORDER_BOOKER / SALESMAN / DELIVERYMAN).
- **Depends on:** `shop-areas` (phase 14), `customers` (phase 7), `users` (phase 2)

### 14.3 Vans `vans`

- **Tables:** `Distribution.Vans`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/routes` — `template/src/4E-distribution.html`
- **Pages:** `/wholesale/routes` (list/screen)
- **Permissions:** `van`: view, create, edit, delete, export
- **API:**
  - `GET /api/distribution/vans?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/vans/:id`: detail
  - `POST /api/distribution/vans`: create
  - `PATCH /api/distribution/vans/:id`: update with rowVersion (409 when stale)
  - `POST /api/distribution/vans/:id/deactivate | /activate`
  - `DELETE /api/distribution/vans/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/distribution/vans/:id/history`: audit trail (Company.AuditTrailEntries)
- **Depends on:** `warehouses` (phase 6)
- **Open questions:** Vans have no dedicated template: confirm tab on Routes & Salesmen

### 14.4 Commission Slabs `commission-slabs`

- **Tables:** `Distribution.CommissionSlabs`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/routes` — `template/src/4E-distribution.html`
- **Pages:** `/wholesale/routes` (list/screen)
- **Permissions:** `target`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/distribution/commission-slabs?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/commission-slabs/:id`: detail
  - `POST /api/distribution/commission-slabs`: create
  - `PATCH /api/distribution/commission-slabs/:id`: update with rowVersion (409 when stale)
  - `POST /api/distribution/commission-slabs/:id/deactivate | /activate`
  - `DELETE /api/distribution/commission-slabs/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/distribution/commission-slabs/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Slabs contiguous and ascending.
- **Open questions:** Commission slabs have no dedicated template

## Phase 15: Self-service & reporting setup

**Masters** · workspace · 4 entities. Helpdesk, company announcements, polls & surveys, and saved report definitions with a live preview.

### 15.1 Helpdesk Categories & FAQs `helpdesk-setup`

- **Tables:** `EmployeeSelfService.HelpdeskCategories`, `EmployeeSelfService.HelpdeskFaqs`
- **Audit trigger:** present on all tables
- **Template:** `app/profile/helpdesk` — `template/src/6A-ess.html`
- **Pages:** `/profile/helpdesk` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/helpdesk/categories?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/helpdesk/categories/:id`: detail
  - `POST /api/helpdesk/categories`: create
  - `PATCH /api/helpdesk/categories/:id`: update with rowVersion (409 when stale)
  - `POST /api/helpdesk/categories/:id/deactivate | /activate`
  - `DELETE /api/helpdesk/categories/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/helpdesk/categories/:id/history`: audit trail (Company.AuditTrailEntries)
  - CRUD /api/helpdesk/faqs

### 15.2 Company Announcements `announcements`

- **Tables:** `EmployeeSelfService.CompanyAnnouncements`
- **Audit trigger:** present on all tables
- **Template:** `app/profile/directory` — `template/src/6A-ess.html`
- **Pages:** `/profile/directory` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export; `dir`: view
- **API:**
  - `GET /api/company/announcements?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/company/announcements/:id`: detail
  - `POST /api/company/announcements`: create
  - `PATCH /api/company/announcements/:id`: update with rowVersion (409 when stale)
  - `POST /api/company/announcements/:id/deactivate | /activate`
  - `DELETE /api/company/announcements/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/company/announcements/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/company/announcements/:id/publish|archive|pin

### 15.3 Polls & Pulse Surveys `surveys`

- **Tables:** `EmployeeSelfService.Polls`, `EmployeeSelfService.PollOptions`, `EmployeeSelfService.PulseSurveys`, `EmployeeSelfService.PulseSurveyQuestions`
- **Audit trigger:** present on all tables
- **Template:** `app/profile/kudos` — `template/src/6A-ess.html`
- **Pages:** `/profile/kudos` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export; `mykudos`: view, create
- **API:**
  - `GET /api/company/surveys?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/company/surveys/:id`: detail
  - `POST /api/company/surveys`: create
  - `PATCH /api/company/surveys/:id`: update with rowVersion (409 when stale)
  - `POST /api/company/surveys/:id/deactivate | /activate`
  - `DELETE /api/company/surveys/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/company/surveys/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/company/polls/:id/open|close
  - POST /api/company/pulse-surveys/:id/open|close
- **Business rules:** Anonymous surveys never expose respondent identity in results.

### 15.4 Saved Reports `saved-reports`

- **Tables:** `Reports.SavedReports`, `Reports.SavedReportColumns`, `Reports.SavedReportShares`, `Reports.ReportSchedules`
- **Audit trigger:** present on all tables
- **Template:** `app/reports/studio` — `template/src/42-acc-reports.html`
- **Pages:** `/reports/studio` (list/screen)
- **Permissions:** `rpt`: view, create, edit, delete, export
- **API:**
  - `GET /api/reports/saved?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/reports/saved/:id`: detail
  - `POST /api/reports/saved`: create
  - `PATCH /api/reports/saved/:id`: update with rowVersion (409 when stale)
  - `POST /api/reports/saved/:id/deactivate | /activate`
  - `DELETE /api/reports/saved/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/reports/saved/:id/history`: audit trail (Company.AuditTrailEntries)
  - PUT /api/reports/saved/:id/columns
  - PUT /api/reports/saved/:id/shares
  - CRUD /api/reports/saved/:id/schedules
  - POST /api/reports/preview (allow-listed fields; needs the source's own view permission)
- **Business rules:** Schedules are stored now; sending starts with report runs (Phase 35).

## Phase 16: General ledger

**Transactions** · workspace · 4 entities. The approval engine and the core journal: vouchers, opening balances and recurring vouchers.

Read-only reports delivered with this phase: Trial Balance, General Ledger, Day Book, Account Ledger.

### 16.1 Approvals Inbox `approvals`

- **Tables:** `Company.Approvals`, `Company.ApprovalActions`
- **Audit trigger:** present on all tables
- **Template:** `app/approvals` — `template/src/4A-company-plus.html`
- **Pages:** `/approvals` (list/screen)
- **Permissions:** `wf`: view, create, edit, delete, export
- **API:**
  - `GET /api/approvals?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/approvals/:id`: detail
  - `POST /api/approvals`: create (draft)
  - `PATCH /api/approvals/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/approvals/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/approvals/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/approvals/inbox (Company.getApprovalsInbox)
  - POST /api/approvals/:id/approve|reject|request-changes|delegate
  - POST /api/approvals/bulk
- **Business rules:** Engine used by every later document type; Requester cannot approve own document (segregation of duties); Every action is an ApprovalActions row; Full Phase 2 workflow steps (role/user/line manager, ANY/ALL, amount thresholds, delegation); inbox open to every signed-in user for their own items; SLA reminders later (decided 2026-10-07).
- **Depends on:** `approval-workflows` (phase 2), `users` (phase 2)

### 16.2 Journal Vouchers `vouchers`

- **Tables:** `Accounting.Vouchers`, `Accounting.VoucherLines`, `Accounting.VoucherActivities`
- **Audit trigger:** present on all tables
- **Template:** `app/accounting/vouchers` — `template/src/40-acc-core.html`; `app/accounting/vouchers/new` — `template/src/44-purchase-docs.html`; `app/accounting/vouchers/view` — `template/src/40-acc-core.html`
- **Pages:** `/accounting/vouchers` (list/screen), `/accounting/vouchers/new` (create), `/accounting/vouchers/[id]` (detail)
- **Permissions:** `vch`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/accounting/vouchers?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/accounting/vouchers/:id`: detail
  - `POST /api/accounting/vouchers`: create (draft)
  - `PATCH /api/accounting/vouchers/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/accounting/vouchers/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/accounting/vouchers/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/accounting/vouchers/:id/submit|post|reverse
  - POST /api/accounting/vouchers/:id/duplicate
  - GET /api/accounting/vouchers/:id/pdf
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Debits equal credits; Postings only into open periods and postable accounts; No matching workflow: vch:post posts directly; tests run in a separate Test Co; PDF = browser print (decided 2026-10-07).
- **Depends on:** `chart-of-accounts` (phase 3), `fiscal-periods` (phase 3), `cost-centres` (phase 3), `numbering-series` (phase 1), `approvals` (phase 16)

### 16.3 Opening Balances `opening-balances`

- **Tables:** `Accounting.OpeningBalances`, `Accounting.OpeningBalanceLines`
- **Audit trigger:** present on all tables
- **Template:** `app/accounting/opening` — `template/src/40-acc-core.html`
- **Pages:** `/accounting/opening` (list/screen)
- **Permissions:** `vch`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/accounting/opening-balances?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/accounting/opening-balances/:id`: detail
  - `POST /api/accounting/opening-balances`: create (draft)
  - `PATCH /api/accounting/opening-balances/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/accounting/opening-balances/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/accounting/opening-balances/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/accounting/opening-balances/:id/post
  - POST /api/accounting/opening-balances/import
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; One opening batch per fiscal year start; must balance.
- **Depends on:** `chart-of-accounts` (phase 3), `fiscal-periods` (phase 3)

### 16.4 Recurring Vouchers `recurring-vouchers`

- **Tables:** `Accounting.RecurringVoucherTemplates`, `Accounting.RecurringVoucherTemplateLines`, `Accounting.RecurringVoucherRuns`
- **Audit trigger:** present on all tables
- **Template:** `app/accounting/recurring` — `template/src/40-acc-core.html`
- **Pages:** `/accounting/recurring` (list/screen)
- **Permissions:** `vch`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/accounting/recurring-vouchers?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/accounting/recurring-vouchers/:id`: detail
  - `POST /api/accounting/recurring-vouchers`: create (draft)
  - `PATCH /api/accounting/recurring-vouchers/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/accounting/recurring-vouchers/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/accounting/recurring-vouchers/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/accounting/recurring-vouchers/:id/run-now
  - POST /api/accounting/recurring-vouchers/:id/pause|resume
  - Scheduled job creates vouchers (actor = SERVICE)
- **Business rules:** Each run creates a draft or posted voucher per template setting; runs are history; Hourly in-app job + Run now (decided 2026-10-07).
- **Depends on:** `vouchers` (phase 16)

## Phase 17: Banking

**Transactions** · workspace · 4 entities. Bank transactions, statement import, reconciliation and cheques (received, issued, bounced, batched).

Read-only reports delivered with this phase: Bank Book.

### 17.1 Bank Transactions `bank-transactions`

- **Tables:** `BankCash.BankTransactions`
- **Audit trigger:** present on all tables
- **Template:** `app/bank/transactions` — `template/src/40-acc-core.html`
- **Pages:** `/bank/transactions` (list/screen)
- **Permissions:** `bank`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/bank/transactions?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/bank/transactions/:id`: detail
  - `POST /api/bank/transactions`: create (draft)
  - `PATCH /api/bank/transactions/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/bank/transactions/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/bank/transactions/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/bank/transactions/:id/categorise
  - POST /api/bank/transactions/:id/post|reverse
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Generated from posted vouchers on a bank GL account and from categorised statement lines (BPV/BRV); never typed (decided 2026-10-07).
- **Depends on:** `bank-accounts` (phase 4), `vouchers` (phase 16)

### 17.2 Statement Imports `statement-imports`

- **Tables:** `BankCash.BankStatementImports`, `BankCash.BankStatementLines`
- **Audit trigger:** present on all tables
- **Template:** `app/bank/rules` — `template/src/4A-company-plus.html`
- **Pages:** `/bank/rules` (list/screen)
- **Permissions:** `bank`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/bank/statement-imports?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/bank/statement-imports/:id`: detail
  - `POST /api/bank/statement-imports`: create (draft)
  - `PATCH /api/bank/statement-imports/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/bank/statement-imports/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/bank/statement-imports/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/bank/statement-imports (CSV/XLSX upload)
  - POST /api/bank/statement-imports/:id/apply-rules
- **Business rules:** Duplicate statement lines detected by date+amount+reference; CSV with a saved column mapping per bank account; Excel / MT940 later (decided 2026-10-07).
- **Depends on:** `bank-rules` (phase 5)

### 17.3 Bank Reconciliation `bank-reconciliation`

- **Tables:** `BankCash.BankReconciliations`, `BankCash.BankReconciliationMatches`
- **Audit trigger:** present on all tables
- **Template:** `app/bank/reconciliation` — `template/src/40-acc-core.html`
- **Pages:** `/bank/reconciliation` (list/screen)
- **Permissions:** `recon`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/bank/reconciliations?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/bank/reconciliations/:id`: detail
  - `POST /api/bank/reconciliations`: create (draft)
  - `PATCH /api/bank/reconciliations/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/bank/reconciliations/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/bank/reconciliations/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/bank/reconciliations/:id/match|unmatch
  - POST /api/bank/reconciliations/:id/auto-match
  - POST /api/bank/reconciliations/:id/complete
- **Business rules:** Completed reconciliation is locked; difference must be zero.
- **Depends on:** `bank-transactions` (phase 17), `statement-imports` (phase 17)

### 17.4 Cheques & Batches `cheques`

- **Tables:** `BankCash.Cheques`, `BankCash.ChequeBounces`, `BankCash.ChequeBatches`, `BankCash.ChequeBatchLines`
- **Audit trigger:** present on all tables
- **Template:** `app/bank/cheques` — `template/src/40-acc-core.html`; `app/bank/cheque-register` — `template/src/40-acc-core.html`; `app/bank/cheque-voucher` — `template/src/44-purchase-docs.html`
- **Pages:** `/bank/cheques` (list/screen), `/bank/cheque-register` (list/screen), `/bank/cheque-voucher` (list/screen)
- **Permissions:** `bank`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/bank/cheques?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/bank/cheques/:id`: detail
  - `POST /api/bank/cheques`: create (draft)
  - `PATCH /api/bank/cheques/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/bank/cheques/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/bank/cheques/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/bank/cheques/:id/deposit|clear|bounce|cancel
  - POST /api/bank/cheque-batches (bulk cheque voucher)
  - GET /api/bank/cheques/pdc?maturing=
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Cheque state machine: received → deposited → cleared | bounced; Issued leaf numbers come from cheque books; Clearing accounts: received Dr Cheques in hand / Cr customer, cleared Dr Bank / Cr Cheques in hand; issued Dr vendor / Cr PDC payable, cleared Dr PDC payable / Cr Bank; invoice / bill allocation in Phase 24 (decided 2026-10-07).
- **Depends on:** `bank-accounts` (phase 4), `cheque-books` (phase 4), `customers` (phase 7), `vendors` (phase 7)

## Phase 18: Cash

**Transactions** · workspace · 4 entities. Cash book, daily cash close, petty cash and expense claims (also used by My Profile › Expense Claims).

Read-only reports delivered with this phase: Cash Book, Cash Ledger.

### 18.1 Cash Book Entries `cash-book`

- **Tables:** `BankCash.CashBookEntries`
- **Audit trigger:** present on all tables
- **Template:** `app/cash/book` — `template/src/47-books.html`; `app/cash/ledger` — `template/src/49-cash-users.html`
- **Pages:** `/cash/book` (list/screen), `/cash/ledger` (list/screen)
- **Permissions:** `cash`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/cash/entries?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/cash/entries/:id`: detail
  - `POST /api/cash/entries`: create (draft)
  - `PATCH /api/cash/entries/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/cash/entries/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/cash/entries/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/cash/entries/:id/post|reverse
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Quick entry: cash in/out, bank in/out, transfer and cheque mode; each entry is a voucher under the normal approval rules (decided 2026-10-07).
- **Depends on:** `cash-accounts` (phase 4), `vouchers` (phase 16)

### 18.2 Cash Day Close `cash-day-close`

- **Tables:** `BankCash.CashDayCloses`, `BankCash.CashDayCloseDenominations`
- **Audit trigger:** present on all tables
- **Template:** `app/cash/book` — `template/src/47-books.html`
- **Pages:** `/cash/book` (list/screen)
- **Permissions:** `cash`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/cash/day-closes?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/cash/day-closes/:id`: detail
  - `POST /api/cash/day-closes`: create (draft)
  - `PATCH /api/cash/day-closes/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/cash/day-closes/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/cash/day-closes/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/cash/day-closes/:id/close|reopen
- **Business rules:** Closed day blocks cash entries for that date; reopen needs approval.
- **Depends on:** `cash-book` (phase 18)

### 18.3 Petty Cash Vouchers & Replenishment `petty-cash`

- **Tables:** `BankCash.PettyCashVouchers`, `BankCash.PettyCashReplenishments`
- **Audit trigger:** present on all tables
- **Template:** `app/cash/petty` — `template/src/40-acc-core.html`
- **Pages:** `/cash/petty` (list/screen)
- **Permissions:** `cash`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/cash/petty?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/cash/petty/:id`: detail
  - `POST /api/cash/petty`: create (draft)
  - `PATCH /api/cash/petty/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/cash/petty/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/cash/petty/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/cash/petty/vouchers/:id/post
  - POST /api/cash/petty/funds/:id/replenish
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Vouchers cannot exceed fund balance; Receipts: count + missing flag; files with document storage in Phase 35 (decided 2026-10-07).
- **Depends on:** `petty-cash-funds` (phase 5), `expense-categories` (phase 4)

### 18.4 Expense Claims `expense-claims`

- **Tables:** `BankCash.ExpenseClaims`, `BankCash.ExpenseClaimLines`, `BankCash.ExpenseClaimActions`
- **Audit trigger:** present on all tables
- **Template:** `app/cash/expenses` — `template/src/40-acc-core.html`; `app/profile/expenses` — `template/src/6A-ess.html`
- **Pages:** `/cash/expenses` (list/screen), `/profile/expenses` (list/screen)
- **Permissions:** `cash`: view, create, edit, approve, post, delete, export; `myexp`: view, create, edit
- **API:**
  - `GET /api/cash/expense-claims?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/cash/expense-claims/:id`: detail
  - `POST /api/cash/expense-claims`: create (draft)
  - `PATCH /api/cash/expense-claims/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/cash/expense-claims/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/cash/expense-claims/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/cash/expense-claims/:id/submit|approve|reject|pay
  - Own claims: GET/POST /api/me/expense-claims (myexp)
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Employee sees only own claims; receipts as attachments; Approval engine with a seeded editable workflow Line manager → Finance; paid by cash or bank now, with payroll later; receipt files in Phase 35 (decided 2026-10-07).
- **Depends on:** `expense-categories` (phase 4), `employees` (phase 11), `approvals` (phase 16)

## Phase 19: Purchasing

**Transactions** · workspace · 4 entities. Purchase orders through goods receipt and vendor bills, with landed cost.

### 19.1 Purchase Orders `purchase-orders`

- **Tables:** `Purchases.PurchaseOrders`, `Purchases.PurchaseOrderLines`
- **Audit trigger:** present on all tables
- **Template:** `app/purchases/orders` — `template/src/41-acc-trade.html`
- **Pages:** `/purchases/orders` (list/screen)
- **Permissions:** `po`: view, create, edit, approve, delete, export
- **API:**
  - `GET /api/purchases/orders?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/purchases/orders/:id`: detail
  - `POST /api/purchases/orders`: create (draft)
  - `PATCH /api/purchases/orders/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/purchases/orders/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/purchases/orders/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/purchases/orders/:id/submit|approve|close|cancel
  - GET /api/purchases/orders/:id/pdf
- **Business rules:** Ordered ≥ received ≥ billed quantities enforced; Approval engine when a PO workflow exists, else po:approve approves directly; nothing seeded (decided 2026-10-08).
- **Depends on:** `vendors` (phase 7), `products` (phase 8), `warehouses` (phase 6), `approvals` (phase 16)

### 19.2 Goods Received Notes `grn`

- **Tables:** `Purchases.GoodsReceivedNotes`, `Purchases.GoodsReceivedNoteLines`
- **Audit trigger:** present on all tables
- **Template:** `app/purchases/grn` — `template/src/44-purchase-docs.html`; `app/purchases/voucher` — `template/src/44-purchase-docs.html`
- **Pages:** `/purchases/grn` (list/screen), `/purchases/voucher` (list/screen)
- **Permissions:** `grn`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/purchases/grns?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/purchases/grns/:id`: detail
  - `POST /api/purchases/grns`: create (draft)
  - `PATCH /api/purchases/grns/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/purchases/grns/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/purchases/grns/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/purchases/grns/:id/post (stock in: StockMovements/StockBalances)
  - POST /api/purchases/grns/:id/reverse
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Batch/expiry captured for batch-tracked products (fields added beyond the template, decided 2026-10-08).
- **Depends on:** `purchase-orders` (phase 19), `warehouses` (phase 6)

### 19.3 Vendor Bills `vendor-bills`

- **Tables:** `Purchases.VendorBills`, `Purchases.VendorBillLines`
- **Audit trigger:** present on all tables
- **Template:** `app/purchases/bills` — `template/src/41-acc-trade.html`; `app/purchases/bills/new` — `template/src/41-acc-trade.html`
- **Pages:** `/purchases/bills` (list/screen), `/purchases/bills/new` (create)
- **Permissions:** `bill`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/purchases/bills?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/purchases/bills/:id`: detail
  - `POST /api/purchases/bills`: create (draft)
  - `PATCH /api/purchases/bills/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/purchases/bills/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/purchases/bills/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/purchases/bills/:id/submit|approve|post|void
  - POST /api/purchases/bills/from-grn/:grnId
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Vendor invoice number unique per vendor (billVendorInvoiceIdx); WHT computed from tax codes; Purchase voucher = counter bill with pay-now; approval engine or bill:approve; bill payments in Phase 20 (decided 2026-10-08).
- **Depends on:** `grn` (phase 19), `tax-codes` (phase 4)

### 19.4 Landed Cost `landed-cost`

- **Tables:** `Purchases.LandedCostShipments`, `Purchases.LandedCostItems`, `Purchases.LandedCostCharges`
- **Audit trigger:** present on all tables
- **Template:** `app/purchases/landed-cost` — `template/src/4A-company-plus.html`
- **Pages:** `/purchases/landed-cost` (list/screen)
- **Permissions:** `bill`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/purchases/landed-cost?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/purchases/landed-cost/:id`: detail
  - `POST /api/purchases/landed-cost`: create (draft)
  - `PATCH /api/purchases/landed-cost/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/purchases/landed-cost/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/purchases/landed-cost/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/purchases/landed-cost/:id/allocate (by value/qty/weight)
  - POST /api/purchases/landed-cost/:id/post
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Allocated charges revalue stock cost.
- **Depends on:** `grn` (phase 19), `vendor-bills` (phase 19)

## Phase 20: Payables

**Transactions** · workspace · 3 entities. Purchase returns, debit notes and vendor payments with allocation.

Read-only reports delivered with this phase: AP Ageing, Vendor Statement.

### 20.1 Purchase Returns `purchase-returns`

- **Tables:** `Purchases.PurchaseReturns`, `Purchases.PurchaseReturnLines`
- **Audit trigger:** present on all tables
- **Template:** `app/purchases/returns` — `template/src/44-purchase-docs.html`
- **Pages:** `/purchases/returns` (list/screen)
- **Permissions:** `grn`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/purchases/returns?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/purchases/returns/:id`: detail
  - `POST /api/purchases/returns`: create (draft)
  - `PATCH /api/purchases/returns/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/purchases/returns/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/purchases/returns/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/purchases/returns/:id/post|reverse
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Return qty ≤ received qty.
- **Depends on:** `grn` (phase 19)

### 20.2 Debit Notes `debit-notes`

- **Tables:** `Purchases.DebitNotes`, `Purchases.DebitNoteLines`
- **Audit trigger:** present on all tables
- **Template:** `app/purchases/debit-notes` — `template/src/41-acc-trade.html`
- **Pages:** `/purchases/debit-notes` (list/screen)
- **Permissions:** `bill`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/purchases/debit-notes?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/purchases/debit-notes/:id`: detail
  - `POST /api/purchases/debit-notes`: create (draft)
  - `PATCH /api/purchases/debit-notes/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/purchases/debit-notes/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/purchases/debit-notes/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/purchases/debit-notes/:id/post|void|refund|apply
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Refund-requested notes get a refund-received step (decided 2026-10-08).
- **Depends on:** `vendor-bills` (phase 19), `purchase-returns` (phase 20)

### 20.3 Vendor Payments `vendor-payments`

- **Tables:** `Purchases.VendorPayments`, `Purchases.VendorPaymentAllocations`
- **Audit trigger:** present on all tables
- **Template:** `app/payables/payments` — `template/src/41-acc-trade.html`
- **Pages:** `/payables/payments` (list/screen)
- **Permissions:** `vpay`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/payables/payments?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payables/payments/:id`: detail
  - `POST /api/payables/payments`: create (draft)
  - `PATCH /api/payables/payments/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/payables/payments/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/payables/payments/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/payables/payments/:id/submit|approve|post|void
  - PUT /api/payables/payments/:id/allocations
  - GET /api/payables/open-items?vendor=
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Allocations ≤ open bill amounts; WHT deducted at payment; Approval engine when a Vendor payment workflow exists, else vpay:post posts directly; nothing seeded (decided 2026-10-08); Cheques via PDC payable clearing, cleared in the cheque register; purchase-voucher cheque pay-now aligned (decided 2026-10-08); Payment run: bills of many vendors → one payment per vendor; Vendor Bills 'Pay selected' opens it (decided 2026-10-08); AP Ageing + Vendor Statement on the Payables studio; other studio tabs disabled (decided 2026-10-08).
- **Depends on:** `vendor-bills` (phase 19), `bank-accounts` (phase 4), `cheques` (phase 17)

## Phase 21: Stock operations

**Transactions** · workspace · 4 entities. Manual stock in/out, transfers, adjustments and stock counts. The stock ledger (StockMovements, StockBalances, StockReservations) is produced by posting.

Read-only reports delivered with this phase: Whole Stock, Stock In View, Stock Movements.

### 21.1 Stock In/Out `stock-in-out`

- **Tables:** `Inventory.StockInOut`, `Inventory.StockInOutEntryLines`
- **Audit trigger:** missing on `Inventory.StockInOutEntryLines`; add it in this phase
- **Template:** `app/inventory/stock-in-out` — `template/src/4C-stock-ops.html`
- **Pages:** `/inventory/stock-in-out` (list/screen)
- **Permissions:** `adj`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/inventory/stock-in-out?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/stock-in-out/:id`: detail
  - `POST /api/inventory/stock-in-out`: create (draft)
  - `PATCH /api/inventory/stock-in-out/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/inventory/stock-in-out/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/inventory/stock-in-out/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/inventory/stock-in-out/:id/post|reverse
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit.
- **Depends on:** `products` (phase 8), `warehouses` (phase 6), `movement-reasons` (phase 6)

### 21.2 Stock Transfers `stock-transfers`

- **Tables:** `Inventory.StockTransfers`, `Inventory.StockTransferLines`, `Inventory.StockTransferReceiptLines`
- **Audit trigger:** missing on `Inventory.StockTransferLines`; add it in this phase
- **Template:** `app/inventory/transfer` — `template/src/4C-stock-ops.html`
- **Pages:** `/inventory/transfer` (list/screen)
- **Permissions:** `xfer`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/inventory/transfers?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/transfers/:id`: detail
  - `POST /api/inventory/transfers`: create (draft)
  - `PATCH /api/inventory/transfers/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/inventory/transfers/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/inventory/transfers/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/inventory/transfers/:id/dispatch|receive|reverse
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; In-transit stock tracked between dispatch and receipt; Two-step dispatch → receive; receipt variance to stock loss / gain (decided 2026-10-08).
- **Depends on:** `warehouses` (phase 6), `products` (phase 8)

### 21.3 Stock Adjustments `stock-adjustments`

- **Tables:** `Inventory.StockAdjustments`, `Inventory.StockAdjustmentLines`
- **Audit trigger:** missing on `Inventory.StockAdjustmentLines`; add it in this phase
- **Template:** `app/inventory/adjustments` — `template/src/41-acc-trade.html`
- **Pages:** `/inventory/adjustments` (list/screen)
- **Permissions:** `adj`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/inventory/adjustments?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/adjustments/:id`: detail
  - `POST /api/inventory/adjustments`: create (draft)
  - `PATCH /api/inventory/adjustments/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/inventory/adjustments/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/inventory/adjustments/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/inventory/adjustments/:id/submit|approve|post|reverse
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Write-offs need approval; Approval engine when a Stock adjustment workflow exists, else adj:post / cnt:approve posts directly; nothing seeded (decided 2026-10-08).
- **Depends on:** `movement-reasons` (phase 6), `approvals` (phase 16)

### 21.4 Stock Counts `stock-counts`

- **Tables:** `Inventory.StockCounts`, `Inventory.StockCountLines`
- **Audit trigger:** missing on `Inventory.StockCountLines`; add it in this phase
- **Template:** `app/inventory/count` — `template/src/4C-stock-ops.html`
- **Pages:** `/inventory/count` (list/screen)
- **Permissions:** `cnt`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/inventory/counts?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/counts/:id`: detail
  - `POST /api/inventory/counts`: create (draft)
  - `PATCH /api/inventory/counts/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/inventory/counts/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/inventory/counts/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/inventory/counts/:id/freeze|submit|approve|post (variance → adjustment)
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Frozen snapshot of book quantity at count start.
- **Depends on:** `stock-adjustments` (phase 21)

## Phase 22: Stock vouchers & demand

**Transactions** · workspace · 5 entities. Stock vouchers, assembly, demand planning, principal claims/targets and bulk price updates.

Read-only reports delivered with this phase: Inventory Reports.

### 22.1 Stock Vouchers `stock-vouchers`

- **Tables:** `Inventory.StockVouchers`, `Inventory.StockVoucherLines`
- **Audit trigger:** missing on `Inventory.StockVoucherLines`; add it in this phase
- **Template:** `app/inventory/stock-vouchers` — `template/src/44-purchase-docs.html`
- **Pages:** `/inventory/stock-vouchers` (list/screen)
- **Permissions:** `adj`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/inventory/stock-vouchers?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/stock-vouchers/:id`: detail
  - `POST /api/inventory/stock-vouchers`: create (draft)
  - `PATCH /api/inventory/stock-vouchers/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/inventory/stock-vouchers/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/inventory/stock-vouchers/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/inventory/stock-vouchers/:id/post|reverse
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit.
- **Depends on:** `products` (phase 8), `warehouses` (phase 6)

### 22.2 Assembly Vouchers `assembly-vouchers`

- **Tables:** `Inventory.AssemblyVouchers`, `Inventory.AssemblyVoucherLines`
- **Audit trigger:** missing on `Inventory.AssemblyVoucherLines`; add it in this phase
- **Template:** **none**, design needed (see open questions)
- **Pages:** to be designed
- **Permissions:** `adj`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/inventory/assembly-vouchers?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/assembly-vouchers/:id`: detail
  - `POST /api/inventory/assembly-vouchers`: create (draft)
  - `PATCH /api/inventory/assembly-vouchers/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/inventory/assembly-vouchers/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/inventory/assembly-vouchers/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/inventory/assembly-vouchers/:id/post|reverse (consume components, produce kit)
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit.
- **Depends on:** `kits` (phase 8)
- **Open questions:** No template for assembly vouchers: built in template style (decided 2026-10-08)

### 22.3 Goods Demands `goods-demands`

- **Tables:** `Inventory.GoodsDemands`, `Inventory.GoodsDemandLines`
- **Audit trigger:** missing on `Inventory.GoodsDemandLines`; add it in this phase
- **Template:** `app/inventory/demand` — `template/src/4C-stock-ops.html`
- **Pages:** `/inventory/demand` (list/screen)
- **Permissions:** `item`: view, create, edit, delete, export
- **API:**
  - `GET /api/inventory/demands?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/demands/:id`: detail
  - `POST /api/inventory/demands`: create (draft)
  - `PATCH /api/inventory/demands/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/inventory/demands/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/inventory/demands/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/inventory/demands/generate (from reorder rules)
  - POST /api/inventory/demands/:id/convert-to-po
- **Business rules:** Convert to PO creates a draft purchase order for the demand's vendor (decided 2026-10-08).
- **Depends on:** `reorder-rules` (phase 8), `purchase-orders` (phase 19)

### 22.4 Principal Claims & Targets `principal-claims`

- **Tables:** `Inventory.PrincipalClaims`, `Inventory.PrincipalTargets`
- **Audit trigger:** present on all tables
- **Template:** **none**, design needed (see open questions)
- **Pages:** to be designed
- **Permissions:** `item`: view, create, edit, delete, export
- **API:**
  - `GET /api/inventory/principal-claims?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/principal-claims/:id`: detail
  - `POST /api/inventory/principal-claims`: create (draft)
  - `PATCH /api/inventory/principal-claims/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/inventory/principal-claims/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/inventory/principal-claims/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/inventory/principal-claims/:id/submit|settle
- **Depends on:** `brands` (phase 6)
- **Open questions:** No template for principal claims/targets: built in template style (decided 2026-10-08)

### 22.5 Bulk Price Updates `bulk-price-updates`

- **Tables:** `Inventory.BulkPriceUpdates`, `Inventory.BulkPriceUpdateLines`
- **Audit trigger:** missing on `Inventory.BulkPriceUpdateLines`; add it in this phase
- **Template:** **none**, design needed (see open questions)
- **Pages:** to be designed
- **Permissions:** `item`: view, create, edit, delete, export
- **API:**
  - `GET /api/inventory/bulk-price-updates?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/inventory/bulk-price-updates/:id`: detail
  - `POST /api/inventory/bulk-price-updates`: create (draft)
  - `PATCH /api/inventory/bulk-price-updates/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/inventory/bulk-price-updates/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/inventory/bulk-price-updates/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/inventory/bulk-price-updates/:id/preview|apply (writes ProductPriceLogs)
- **Depends on:** `products` (phase 8), `price-lists` (phase 9)
- **Open questions:** No template for bulk price updates: built in template style (decided 2026-10-08)

## Phase 23: Sales documents

**Transactions** · workspace · 4 entities. Quotation → order → delivery challan → invoice, with FBR submission on posting.

### 23.1 Quotations `quotations`

- **Tables:** `Sales.Quotations`, `Sales.QuotationLines`
- **Audit trigger:** present on all tables
- **Template:** `app/sales/quotations` — `template/src/41-acc-trade.html`
- **Pages:** `/sales/quotations` (list/screen)
- **Permissions:** `quo`: view, create, edit, approve, delete, export
- **API:**
  - `GET /api/sales/quotations?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/quotations/:id`: detail
  - `POST /api/sales/quotations`: create (draft)
  - `PATCH /api/sales/quotations/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/sales/quotations/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/sales/quotations/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/sales/quotations/:id/send|accept|reject|revise|convert-to-order
  - Print from the browser (no server PDF; decided 2026-10-08)
- **Depends on:** `customers` (phase 7), `products` (phase 8), `price-lists` (phase 9), `sales-schemes` (phase 9), `approvals` (phase 16)

### 23.2 Sales Orders `sales-orders`

- **Tables:** `Sales.SalesOrders`, `Sales.SalesOrderLines`
- **Audit trigger:** present on all tables
- **Template:** `app/sales/orders` — `template/src/41-acc-trade.html`
- **Pages:** `/sales/orders` (list/screen)
- **Permissions:** `quo`: view, create, edit, approve, delete, export
- **API:**
  - `GET /api/sales/orders?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/orders/:id`: detail
  - `POST /api/sales/orders`: create (draft)
  - `PATCH /api/sales/orders/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/sales/orders/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/sales/orders/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/sales/orders/:id/submit|approve|close|cancel
  - POST /api/sales/orders/:id/reserve-stock
- **Business rules:** Credit limit checked on approval (override needs permission); Stock reservation via StockReservations; Over limit / on hold → 409 unless the approver holds crovr:approve and overrides; the credit override workflow is Phase 26 (decided 2026-10-08).
- **Depends on:** `quotations` (phase 23), `approvals` (phase 16)

### 23.3 Delivery Challans `delivery-challans`

- **Tables:** `Sales.DeliveryChallans`, `Sales.DeliveryChallanLines`
- **Audit trigger:** present on all tables
- **Template:** `app/sales/challans` — `template/src/43-sales-docs.html`
- **Pages:** `/sales/challans` (list/screen)
- **Permissions:** `sinv`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/sales/challans?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/challans/:id`: detail
  - `POST /api/sales/challans`: create (draft)
  - `PATCH /api/sales/challans/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/sales/challans/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/sales/challans/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/sales/challans/:id/dispatch (stock out at cost, Dr GDNI / Cr inventory)|deliver|cancel
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Packed → dispatched → delivered → invoiced.
- **Depends on:** `sales-orders` (phase 23), `warehouses` (phase 6)

### 23.4 Sales Invoices `sales-invoices`

- **Tables:** `Sales.SalesInvoices`, `Sales.SalesInvoiceLines`
- **Audit trigger:** present on all tables
- **Template:** `app/sales/invoices` — `template/src/41-acc-trade.html`; `app/sales/invoices/new` — `template/src/41-acc-trade.html`; `app/sales/invoices/view` — `template/src/41-acc-trade.html`; `app/sales/voucher` — `template/src/43-sales-docs.html`
- **Pages:** `/sales/invoices` (list/screen), `/sales/invoices/new` (create), `/sales/invoices/[id]` (detail), `/sales/voucher` (list/screen)
- **Permissions:** `sinv`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/sales/invoices?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/invoices/:id`: detail
  - `POST /api/sales/invoices`: create (draft)
  - `PATCH /api/sales/invoices/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/sales/invoices/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/sales/invoices/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/sales/invoices/:id/submit|approve|post|void
  - POST /api/sales/invoices/from-challan/:id
  - POST /api/sales/vouchers (counter sale, posted on account; receipts in Phase 24)
  - Print from the browser (no server PDF)
  - Posting queues the FBR submission (FbrInvoiceSubmissions PENDING); the FBR client, retries and IRN/QR are Phase 28 (decided 2026-10-08)
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Tax from tax codes; scheme free items as zero-price lines.
- **Depends on:** `delivery-challans` (phase 23), `tax-codes` (phase 4), `fbr-settings` (phase 5), `approvals` (phase 16)

## Phase 24: Sales completion

**Transactions** · workspace · 5 entities. Returns, credit notes, customer receipts with allocation, recurring invoices and POS.

Read-only reports delivered with this phase: AR Ageing, Customer Statement.

### 24.1 Sales Returns `sales-returns`

- **Tables:** `Sales.SalesReturns`, `Sales.SalesReturnLines`
- **Audit trigger:** present on all tables
- **Template:** `app/sales/returns` — `template/src/43-sales-docs.html`
- **Pages:** `/sales/returns` (list/screen)
- **Permissions:** `sinv`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/sales/returns?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/returns/:id`: detail
  - `POST /api/sales/returns`: create (draft)
  - `PATCH /api/sales/returns/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/sales/returns/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/sales/returns/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/sales/returns/:id/post|reverse (stock back in)
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Return qty ≤ invoiced qty.
- **Depends on:** `sales-invoices` (phase 23)

### 24.2 Credit Notes `credit-notes`

- **Tables:** `Sales.CreditNotes`, `Sales.CreditNoteLines`
- **Audit trigger:** present on all tables
- **Template:** `app/sales/credit-notes` — `template/src/41-acc-trade.html`
- **Pages:** `/sales/credit-notes` (list/screen)
- **Permissions:** `sinv`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/sales/credit-notes?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/credit-notes/:id`: detail
  - `POST /api/sales/credit-notes`: create (draft)
  - `PATCH /api/sales/credit-notes/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/sales/credit-notes/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/sales/credit-notes/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/sales/credit-notes/:id/post|void
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit.
- **Depends on:** `sales-invoices` (phase 23), `sales-returns` (phase 24)

### 24.3 Customer Receipts `customer-receipts`

- **Tables:** `Sales.CustomerReceipts`, `Sales.CustomerReceiptAllocations`, `BankCash.ChequeAllocations`
- **Audit trigger:** present on all tables
- **Template:** `app/receivables/receipts` — `template/src/41-acc-trade.html`
- **Pages:** `/receivables/receipts` (list/screen)
- **Permissions:** `rcpt`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/receivables/receipts?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/receivables/receipts/:id`: detail
  - `POST /api/receivables/receipts`: create (draft)
  - `PATCH /api/receivables/receipts/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/receivables/receipts/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/receivables/receipts/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/receivables/receipts/:id/post|void
  - PUT /api/receivables/receipts/:id/allocations
  - GET /api/receivables/open-items?customer=
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Allocations ≤ open invoice amounts; Customer cheques go to Cheques in hand; cleared in the cheque register; a bounce reverses the settlement (decided 2026-10-08); No approval engine: rcpt:post posts (decided 2026-10-08); Cheque allocations to invoices / bills and Raast-IBFT invoice matching moved here from Phase 17 (decided 2026-10-07).
- **Depends on:** `sales-invoices` (phase 23), `bank-accounts` (phase 4), `cash-accounts` (phase 4), `cheques` (phase 17)

### 24.4 Recurring Invoices `recurring-invoices`

- **Tables:** `Sales.RecurringInvoices`, `Sales.RecurringInvoiceLines`
- **Audit trigger:** present on all tables
- **Template:** `app/sales/recurring` — `template/src/4A-company-plus.html`
- **Pages:** `/sales/recurring` (list/screen)
- **Permissions:** `sinv`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/sales/recurring-invoices?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/recurring-invoices/:id`: detail
  - `POST /api/sales/recurring-invoices`: create (draft)
  - `PATCH /api/sales/recurring-invoices/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/sales/recurring-invoices/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/sales/recurring-invoices/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/sales/recurring-invoices/:id/run-now|pause|resume
  - Scheduled job (actor = SERVICE)
- **Business rules:** Hourly scheduled job + Run now / pause / resume; each template posts or keeps drafts (decided 2026-10-08).
- **Depends on:** `sales-invoices` (phase 23)

### 24.5 POS Shifts & Payments `pos`

- **Tables:** `Sales.PosShifts`, `Sales.PosShiftDenominations`, `Sales.PosPayments`
- **Audit trigger:** present on all tables
- **Template:** `app/sales/pos` — `template/src/43-sales-docs.html`
- **Pages:** `/sales/pos` (list/screen)
- **Permissions:** `pos`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/sales/pos?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/sales/pos/:id`: detail
  - `POST /api/sales/pos`: create (draft)
  - `PATCH /api/sales/pos/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/sales/pos/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/sales/pos/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/sales/pos/shifts/open|:id/close
  - POST /api/sales/pos/sales (invoice + payment in one transaction)
  - POST /api/sales/pos/sales/:id/hold|resume
- **Business rules:** One open shift per terminal/user; Shift close reconciles denominations; Full POS: shift open/close with cash count, sale = invoice + payment (cash / card / wallet / split), hold / resume, shift report (decided 2026-10-08).
- **Depends on:** `sales-invoices` (phase 23), `cash-accounts` (phase 4)

## Phase 25: Wholesale

**Transactions** · workspace · 5 entities. Order bookings from the field, quick wholesale entry, bulk invoicing and back-orders.

### 25.1 Order Bookings `order-bookings`

- **Tables:** `Distribution.OrderBookings`, `Distribution.OrderBookingLines`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/bookings` — `template/src/4D-wholesale.html`
- **Pages:** `/wholesale/bookings` (list/screen)
- **Permissions:** `booking`: view, create, edit, approve, delete, export
- **API:**
  - `GET /api/distribution/bookings?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/bookings/:id`: detail
  - `POST /api/distribution/bookings`: create (draft)
  - `PATCH /api/distribution/bookings/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/distribution/bookings/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/distribution/bookings/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/distribution/bookings/:id/approve|cancel
  - Order Booker sees own route bookings only
- **Depends on:** `routes` (phase 14), `order-templates` (phase 25), `price-tiers` (phase 9)

### 25.2 Order Templates `order-templates`

- **Tables:** `Distribution.OrderTemplates`, `Distribution.OrderTemplateLines`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/entry` — `template/src/4D-wholesale.html`
- **Pages:** `/wholesale/entry` (list/screen)
- **Permissions:** `booking`: view, create, edit, approve, delete, export
- **API:**
  - `GET /api/distribution/order-templates?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/order-templates/:id`: detail
  - `POST /api/distribution/order-templates`: create (draft)
  - `PATCH /api/distribution/order-templates/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/distribution/order-templates/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/distribution/order-templates/:id/history`: audit trail (Company.AuditTrailEntries)
  - Templates dropdown and 'Save as template' on Quick Wholesale Entry
- **Depends on:** `customers` (phase 7), `products` (phase 8)

### 25.3 Quick Wholesale Entry (Held Bills) `held-bills`

- **Tables:** `Distribution.HeldBills`, `Distribution.HeldBillLines`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/entry` — `template/src/4D-wholesale.html`
- **Pages:** `/wholesale/entry` (list/screen)
- **Permissions:** `wsentry`: view, create, edit, delete, export
- **API:**
  - `GET /api/distribution/held-bills?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/held-bills/:id`: detail
  - `POST /api/distribution/held-bills`: create (draft)
  - `PATCH /api/distribution/held-bills/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/distribution/held-bills/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/distribution/held-bills/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/distribution/held-bills/:id/convert-to-invoice
- **Depends on:** `sales-invoices` (phase 23)

### 25.4 Bulk Invoice Runs `bulk-invoicing`

- **Tables:** `Distribution.BulkInvoiceRuns`, `Distribution.BulkInvoiceRunCells`, `Distribution.BulkInvoiceSkippedShops`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/bulk` — `template/src/4D-wholesale.html`
- **Pages:** `/wholesale/bulk` (list/screen)
- **Permissions:** `bulkinv`: view, create, approve, post, export
- **API:**
  - `GET /api/distribution/bulk-invoice-runs?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/bulk-invoice-runs/:id`: detail
  - `POST /api/distribution/bulk-invoice-runs`: create (draft)
  - `PATCH /api/distribution/bulk-invoice-runs/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/distribution/bulk-invoice-runs/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/distribution/bulk-invoice-runs/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/distribution/bulk-invoice-runs/:id/preview|approve|post (creates invoices, records skipped shops)
- **Business rules:** Run is atomic per shop; skipped shops recorded with reason.
- **Depends on:** `order-bookings` (phase 25), `sales-invoices` (phase 23)

### 25.5 Back-orders `back-orders`

- **Tables:** `Distribution.BackOrders`, `Distribution.BackOrderAllocations`, `Distribution.BackOrderCancellations`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/backorders` — `template/src/4D-wholesale.html`
- **Pages:** `/wholesale/backorders` (list/screen)
- **Permissions:** `backord`: view, create, edit, approve, export
- **API:**
  - `GET /api/distribution/back-orders?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/back-orders/:id`: detail
  - `POST /api/distribution/back-orders`: create (draft)
  - `PATCH /api/distribution/back-orders/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/distribution/back-orders/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/distribution/back-orders/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/distribution/back-orders/:id/allocate|cancel
- **Depends on:** `order-bookings` (phase 25), `grn` (phase 19)

## Phase 26: Distribution

**Transactions** · workspace · 5 entities. Load sheets and delivery, route settlement, recovery, salesman targets/commissions and credit control.

### 26.1 Load Sheets & Delivery `load-sheets`

- **Tables:** `Distribution.LoadSheets`, `Distribution.LoadSheetLines`, `Distribution.LoadSheetInvoices`, `Distribution.VanStockCounts`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/load-sheet` — `template/src/4E-distribution.html`
- **Pages:** `/wholesale/load-sheet` (list/screen)
- **Permissions:** `loadsht`: view, create, edit, approve, post, export; `delivery`: view, edit
- **API:**
  - `GET /api/distribution/load-sheets?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/load-sheets/:id`: detail
  - `POST /api/distribution/load-sheets`: create (draft)
  - `PATCH /api/distribution/load-sheets/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/distribution/load-sheets/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/distribution/load-sheets/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/distribution/load-sheets/:id/approve|post (stock to van)
  - GET /api/distribution/load-sheets/:id/pick-list
  - PATCH /api/distribution/load-sheets/:id/invoices/:invoiceId/delivery (delivered|returned; Deliveryman)
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Deliveryman updates delivery status only on own load sheets; Paperwork only: invoices issue stock at posting; no van stock / transfer / count; route returns via sales returns (decided 2026-10-08).
- **Depends on:** `sales-invoices` (phase 23), `vans` (phase 14), `routes` (phase 14)

### 26.2 Route Settlements `route-settlements`

- **Tables:** `Distribution.RouteSettlements`, `Distribution.RouteSettlementLines`, `Distribution.RouteSettlementCashCounts`, `Distribution.RouteSettlementCheques`, `Distribution.RouteSettlementReturns`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/settlement` — `template/src/4E-distribution.html`
- **Pages:** `/wholesale/settlement` (list/screen)
- **Permissions:** `settle`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/distribution/settlements?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/settlements/:id`: detail
  - `POST /api/distribution/settlements`: create (draft)
  - `PATCH /api/distribution/settlements/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/distribution/settlements/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/distribution/settlements/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/distribution/settlements/:id/count-cash (Cashier)|submit|approve|post
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Cash short/excess posted to mapped accounts; Receipts and returns through the Phase 24 services; approval by settle:approve, no engine (decided 2026-10-08).
- **Depends on:** `load-sheets` (phase 26), `customer-receipts` (phase 24), `cheques` (phase 17)

### 26.3 Recovery Sheets `recovery-sheets`

- **Tables:** `Distribution.RecoverySheets`, `Distribution.RecoverySheetLines`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/recovery` — `template/src/4E-distribution.html`
- **Pages:** `/wholesale/recovery` (list/screen)
- **Permissions:** `recov`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/distribution/recovery-sheets?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/recovery-sheets/:id`: detail
  - `POST /api/distribution/recovery-sheets`: create (draft)
  - `PATCH /api/distribution/recovery-sheets/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/distribution/recovery-sheets/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/distribution/recovery-sheets/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/distribution/recovery-sheets/generate?route&date
  - POST /api/distribution/recovery-sheets/:id/post (creates receipts)
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit.
- **Depends on:** `customer-receipts` (phase 24), `routes` (phase 14)

### 26.4 Salesman Targets & Commissions `salesman-targets`

- **Tables:** `Distribution.SalesmanTargets`, `Distribution.SalesmanCommissions`
- **Audit trigger:** present on all tables
- **Template:** `app/wholesale/routes` — `template/src/4E-distribution.html`
- **Pages:** `/wholesale/routes` (list/screen)
- **Permissions:** `target`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/distribution/targets?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/distribution/targets/:id`: detail
  - `POST /api/distribution/targets`: create (draft)
  - `PATCH /api/distribution/targets/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/distribution/targets/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/distribution/targets/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/distribution/commissions/calculate?period
  - POST /api/distribution/commissions/:id/approve|post (to payroll adjustments)
- **Business rules:** Post = JV commission expense / payable (ACCRUED); Send to payroll adds a COMMISSION adjustment to the draft payroll run of the month (decided 2026-10-08).
- **Depends on:** `commission-slabs` (phase 14), `sales-invoices` (phase 23)

### 26.5 Credit Control `credit-control`

- **Tables:** `Sales.CreditOverrides`, `Sales.CreditHoldEvents`, `Distribution.CreditOverrideLogs`
- **Audit trigger:** present on all tables
- **Template:** `app/receivables/credit` — `template/src/41-acc-trade.html`
- **Pages:** `/receivables/credit` (list/screen)
- **Permissions:** `crovr`: view, approve, export; `rcpt`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/receivables/credit?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/receivables/credit/:id`: detail
  - `POST /api/receivables/credit`: create (draft)
  - `PATCH /api/receivables/credit/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/receivables/credit/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/receivables/credit/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/receivables/credit/holds/:customerId/place|release
  - POST /api/receivables/credit/overrides/:id/approve|reject
- **Business rules:** Every override is logged with its approver; Approved by crovr:approve (not the requester), no engine (decided 2026-10-08).
- **Depends on:** `customers` (phase 7), `approvals` (phase 16)

## Phase 27: Assets & budgets

**Transactions** · workspace · 4 entities. Fixed asset register, depreciation, transfers/disposals and budgets.

Read-only reports delivered with this phase: Budget vs Actual, Asset Register report.

### 27.1 Fixed Asset Register `fixed-assets`

- **Tables:** `FixedAssets.FixedAssets`
- **Audit trigger:** present on all tables
- **Template:** `app/assets` — `template/src/42-acc-reports.html`; `app/assets/view` — `template/src/42-acc-reports.html`
- **Pages:** `/assets` (list/screen), `/assets/[id]` (detail)
- **Permissions:** `fa`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/assets?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/assets/:id`: detail
  - `POST /api/assets`: create (draft)
  - `PATCH /api/assets/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/assets/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/assets/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/assets/:id/capitalise (from bill line)
  - GET /api/assets/:id/schedule
- **Business rules:** Capitalisation posts to the asset account; register entries are not deleted after capitalisation.
- **Depends on:** `asset-categories` (phase 5), `vendor-bills` (phase 19)

### 27.2 Depreciation `depreciation`

- **Tables:** `FixedAssets.DepreciationRuns`, `FixedAssets.DepreciationRunLines`, `FixedAssets.DepreciationSchedules`
- **Audit trigger:** present on all tables
- **Template:** `app/assets/depreciation` — `template/src/42-acc-reports.html`
- **Pages:** `/assets/depreciation` (list/screen)
- **Permissions:** `fa`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/assets/depreciation-runs?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/assets/depreciation-runs/:id`: detail
  - `POST /api/assets/depreciation-runs`: create (draft)
  - `PATCH /api/assets/depreciation-runs/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/assets/depreciation-runs/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/assets/depreciation-runs/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/assets/depreciation-runs/preview?period
  - POST /api/assets/depreciation-runs/:id/post|reverse
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; One run per period.
- **Depends on:** `fixed-assets` (phase 27), `fiscal-periods` (phase 3)

### 27.3 Asset Transfers & Disposals `asset-movements`

- **Tables:** `FixedAssets.AssetTransfers`, `FixedAssets.AssetDisposals`
- **Audit trigger:** present on all tables
- **Template:** `app/assets/disposals` — `template/src/42-acc-reports.html`
- **Pages:** `/assets/disposals` (list/screen)
- **Permissions:** `fa`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/assets/movements?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/assets/movements/:id`: detail
  - `POST /api/assets/movements`: create (draft)
  - `PATCH /api/assets/movements/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/assets/movements/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/assets/movements/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/assets/:id/transfer
  - POST /api/assets/:id/dispose (gain/loss posting)
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit.
- **Depends on:** `fixed-assets` (phase 27), `depreciation` (phase 27)

### 27.4 Budgets `budgets`

- **Tables:** `Accounting.Budgets`, `Accounting.BudgetVersions`, `Accounting.BudgetVersionLines`
- **Audit trigger:** present on all tables
- **Template:** `app/budgets` — `template/src/42-acc-reports.html`; `app/budgets/variance` — `template/src/42-acc-reports.html`
- **Pages:** `/budgets` (list/screen), `/budgets/variance` (list/screen)
- **Permissions:** `bud`: view, create, edit, approve, delete, export
- **API:**
  - `GET /api/accounting/budgets?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/accounting/budgets/:id`: detail
  - `POST /api/accounting/budgets`: create (draft)
  - `PATCH /api/accounting/budgets/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/accounting/budgets/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/accounting/budgets/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/accounting/budgets/:id/versions
  - POST /api/accounting/budgets/versions/:id/submit|approve
  - GET /api/accounting/budgets/:id/variance
- **Business rules:** One approved version per budget (budgetVersionOneApprovedUk).
- **Depends on:** `chart-of-accounts` (phase 3), `cost-centres` (phase 3), `fiscal-periods` (phase 3)

## Phase 28: Tax compliance

**Transactions** · workspace · 4 entities. Sales tax returns, withholding tax lifecycle and FBR invoice submissions.

### 28.1 Sales Tax Returns `sales-tax-returns`

- **Tables:** `Tax.SalesTaxReturns`, `Tax.SalesTaxReturnLines`
- **Audit trigger:** present on all tables
- **Template:** `app/tax/sales-tax` — `template/src/42-acc-reports.html`
- **Pages:** `/tax/sales-tax` (list/screen)
- **Permissions:** `tax`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/tax/sales-tax-returns?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/tax/sales-tax-returns/:id`: detail
  - `POST /api/tax/sales-tax-returns`: create (draft)
  - `PATCH /api/tax/sales-tax-returns/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/tax/sales-tax-returns/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/tax/sales-tax-returns/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/tax/sales-tax-returns/prepare?period
  - POST /api/tax/sales-tax-returns/:id/approve|file|pay
  - GET /api/tax/sales-tax-returns/:id/annex-c.csv|annex-a.csv (IRIS CSV, no xlsx library; decided 2026-10-08)
- **Business rules:** A filed return locks the period's tax documents; Annex-A lines default MATCHED; the user flags UNMATCHED (no FBR supplier feed; decided 2026-10-08); Pay posts a BPV: Dr OUTPUT_GST + FURTHER_TAX_PAYABLE, Cr INPUT_GST + bank.
- **Depends on:** `sales-invoices` (phase 23), `vendor-bills` (phase 19)

### 28.2 WHT Deductions & Challans `wht`

- **Tables:** `Tax.WhtDeductions`, `Tax.WhtChallans`
- **Audit trigger:** present on all tables
- **Template:** `app/tax/wht` — `template/src/42-acc-reports.html`
- **Pages:** `/tax/wht` (list/screen)
- **Permissions:** `tax`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/tax/wht?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/tax/wht/:id`: detail
  - `POST /api/tax/wht`: create (draft)
  - `PATCH /api/tax/wht/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/tax/wht/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/tax/wht/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/tax/wht/challans (pay a period's sections)
  - POST /api/tax/wht/challans/:id/post|cancel
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Register filled by posting triggers: vendor payments / purchase vouchers (DEDUCTED), receipts (SUFFERED), invoice advance tax (COLLECTED); payroll 149 via Tax.whtRegister from Phase 32 (decided 2026-10-08).
- **Depends on:** `vendor-payments` (phase 20)

### 28.3 WHT Certificates & Statements `wht-certificates`

- **Tables:** `Tax.WhtCertificates`, `Tax.WhtStatements`
- **Audit trigger:** present on all tables
- **Template:** `app/tax/wht` — `template/src/42-acc-reports.html`
- **Pages:** `/tax/wht` (list/screen)
- **Permissions:** `tax`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/tax/wht/certificates?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/tax/wht/certificates/:id`: detail
  - `POST /api/tax/wht/certificates`: create (draft)
  - `PATCH /api/tax/wht/certificates/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/tax/wht/certificates/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/tax/wht/certificates/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/tax/wht/certificates/generate
  - GET /api/tax/wht/certificates/:id/print (browser print, no server PDF)
  - POST /api/tax/wht/statements/prepare?period
- **Depends on:** `wht` (phase 28)

### 28.4 FBR Submissions `fbr-submissions`

- **Tables:** `Tax.FbrInvoiceSubmissions`, `Tax.FbrConnectionEvents`
- **Audit trigger:** present on all tables
- **Template:** `app/tax/fbr` — `template/src/42-acc-reports.html`
- **Pages:** `/tax/fbr` (list/screen)
- **Permissions:** `tax`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/tax/fbr/submissions?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/tax/fbr/submissions/:id`: detail
  - `POST /api/tax/fbr/submissions`: create (draft)
  - `PATCH /api/tax/fbr/submissions/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/tax/fbr/submissions/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/tax/fbr/submissions/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/tax/fbr/submissions/:id/retry
  - GET /api/tax/fbr/connection-events
  - POST /api/tax/fbr/test-connection and Sync now (moved from Phase 5)
- **Business rules:** One submission row per document; each retry increments attempts and the audit trail keeps every attempt; Sending OFF by default (FbrSettings.sendingEnabled); simulator only for FBR_SIMULATE_TENANTS; going live offers send backlog or mark NOT_REPORTED (decided 2026-10-08, rev 2).
- **Depends on:** `sales-invoices` (phase 23), `fbr-settings` (phase 5)

## Phase 29: Period close

**Transactions** · workspace · 3 entities. Period reopen, year-end close and payment reminder runs; completes the financial statements. Tasks, notifications, sign-in recovery and the dashboard moved to Phase 44 (decided 2026-10-08).

Read-only reports delivered with this phase: Profit & Loss, Balance Sheet, Cash Flow.

### 29.1 Period Reopen Requests `period-reopen`

- **Tables:** `Accounting.PeriodReopenRequests`
- **Audit trigger:** present on all tables
- **Template:** `app/periods` — `template/src/42-acc-reports.html`
- **Pages:** `/periods` (list/screen)
- **Permissions:** `close`: view, approve, post, export
- **API:**
  - `GET /api/accounting/period-reopen-requests?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/accounting/period-reopen-requests/:id`: detail
  - `POST /api/accounting/period-reopen-requests`: create (draft)
  - `PATCH /api/accounting/period-reopen-requests/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/accounting/period-reopen-requests/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/accounting/period-reopen-requests/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/accounting/period-reopen-requests/:id/approve|reject
- **Business rules:** Reopen always needs approval; auto-relock after the window; Approved by close:approve, never the requester, no engine; locked periods need MFA (later phase), so only closed periods reopen (decided 2026-10-08).
- **Depends on:** `fiscal-periods` (phase 3), `approvals` (phase 16)

### 29.2 Year-End Close `year-end`

- **Tables:** `Accounting.YearEndAdjustments`, `Accounting.YearEndCloses`
- **Audit trigger:** present on all tables
- **Template:** `app/periods/close` — `template/src/42-acc-reports.html`
- **Pages:** `/periods/close` (list/screen)
- **Permissions:** `close`: view, approve, post, export
- **API:**
  - `GET /api/accounting/year-end?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/accounting/year-end/:id`: detail
  - `POST /api/accounting/year-end`: create (draft)
  - `PATCH /api/accounting/year-end/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/accounting/year-end/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/accounting/year-end/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/accounting/year-end/:fiscalYearId/checklist
  - POST /api/accounting/year-end/:fiscalYearId/close (retained earnings transfer)
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; All periods locked and checklist complete before close; Dry run stores the figures; final close (close:approve) posts the closing JE and locks every period; cancel reverses (decided 2026-10-08).
- **Depends on:** `vouchers` (phase 16), `fiscal-periods` (phase 3)

### 29.3 Payment Reminder Runs `reminder-runs`

- **Tables:** `Sales.PaymentReminderLogs`
- **Audit trigger:** present on all tables
- **Template:** `app/receivables/reminders` — `template/src/4A-company-plus.html`
- **Pages:** `/receivables/reminders` (list/screen)
- **Permissions:** `rcpt`: view, create, edit, approve, post, delete, export
- **API:**
  - `GET /api/receivables/reminder-runs?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/receivables/reminder-runs/:id`: detail
  - `POST /api/receivables/reminder-runs`: create (draft)
  - `PATCH /api/receivables/reminder-runs/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/receivables/reminder-runs/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/receivables/reminder-runs/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/receivables/reminder-runs (run rules now)
  - Scheduled job (actor = SERVICE)
- **Business rules:** Outbox only: messages are rendered and logged as QUEUED; an email/SMS provider plugs in later (decided 2026-10-08).
- **Depends on:** `reminder-setup` (phase 9), `sales-invoices` (phase 23)

## Phase 30: Time & attendance

**Transactions** · workspace · 4 entities. Punches and the attendance register, regularisation, rosters and shift swaps, overtime; also My Profile › Attendance/Shifts.

### 30.1 Attendance `attendance`

- **Tables:** `HumanResources.AttendancePunches`, `HumanResources.AttendanceRegister`
- **Audit trigger:** missing on `HumanResources.AttendancePunches`; add it in this phase
- **Template:** `app/hr/attendance` — `template/src/50-hr-core.html`; `app/hr/attendance/register` — `template/src/50-hr-core.html`; `app/profile/attendance` — `template/src/6A-ess.html`; `app/profile` — `template/src/48-dash-stock.html`
- **Pages:** `/hr/attendance` (list/screen), `/hr/attendance/register` (list/screen), `/profile/attendance` (list/screen), `/profile` (list/screen)
- **Permissions:** `att`: view, create, edit, approve, export; `myatt`: view, create
- **API:**
  - `GET /api/hr/attendance?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/attendance/:id`: detail
  - `POST /api/hr/attendance`: create (draft)
  - `PATCH /api/hr/attendance/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/attendance/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/attendance/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/me/attendance/punch (check-in/out with location)
  - POST /api/hr/attendance/process?date (build register)
  - GET /api/hr/attendance/register?month
- **Business rules:** Punches append-only; register derived and lockable per payroll period.
- **Depends on:** `employees` (phase 11), `work-shifts` (phase 10), `biometric-devices` (phase 11), `holidays` (phase 10)

### 30.2 Regularisation Requests `regularisation`

- **Tables:** `HumanResources.RegularisationRequests`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/attendance/requests` — `template/src/50-hr-core.html`; `app/profile/attendance` — `template/src/6A-ess.html`
- **Pages:** `/hr/attendance/requests` (list/screen), `/profile/attendance` (list/screen)
- **Permissions:** `att`: view, create, edit, approve, export; `myatt`: view, create
- **API:**
  - `GET /api/hr/regularisation-requests?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/regularisation-requests/:id`: detail
  - `POST /api/hr/regularisation-requests`: create (draft)
  - `PATCH /api/hr/regularisation-requests/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/regularisation-requests/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/regularisation-requests/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/me/regularisation-requests
  - POST /api/hr/regularisation-requests/:id/approve|reject
- **Depends on:** `attendance` (phase 30), `approvals` (phase 16)

### 30.3 Rosters & Shift Swaps `rosters`

- **Tables:** `HumanResources.ShiftRosters`, `EmployeeSelfService.ShiftSwapRequests`, `EmployeeSelfService.OpenShifts`, `EmployeeSelfService.OpenShiftClaims`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/shifts` — `template/src/50-hr-core.html`; `app/profile/shifts` — `template/src/6A-ess.html`
- **Pages:** `/hr/shifts` (list/screen), `/profile/shifts` (list/screen)
- **Permissions:** `att`: view, create, edit, approve, export; `myshift`: view, create
- **API:**
  - `GET /api/hr/rosters?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/rosters/:id`: detail
  - `POST /api/hr/rosters`: create (draft)
  - `PATCH /api/hr/rosters/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/rosters/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/rosters/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/rosters/publish?week
  - POST /api/me/shift-swaps, POST /api/hr/shift-swaps/:id/approve|reject
  - POST /api/me/open-shifts/:id/claim
- **Depends on:** `work-shifts` (phase 10), `employees` (phase 11)

### 30.4 Overtime Claims `overtime-claims`

- **Tables:** `HumanResources.OvertimeClaims`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/overtime` — `template/src/50-hr-core.html`
- **Pages:** `/hr/overtime` (list/screen)
- **Permissions:** `att`: view, create, edit, approve, export
- **API:**
  - `GET /api/hr/overtime-claims?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/overtime-claims/:id`: detail
  - `POST /api/hr/overtime-claims`: create (draft)
  - `PATCH /api/hr/overtime-claims/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/overtime-claims/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/overtime-claims/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/overtime-claims/:id/approve|reject
- **Business rules:** Within overtime policy limits.
- **Depends on:** `overtime-policies` (phase 11), `attendance` (phase 30)

## Phase 31: Leave & lifecycle

**Transactions** · workspace · 4 entities. Leave requests and balances, onboarding and offboarding; also My Profile › Leave.

### 31.1 Leave Requests `leave-requests`

- **Tables:** `HumanResources.LeaveRequests`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/leave` — `template/src/50-hr-core.html`; `app/hr/leave/requests` — `template/src/50-hr-core.html`; `app/profile/leave` — `template/src/6A-ess.html`
- **Pages:** `/hr/leave` (list/screen), `/hr/leave/requests` (list/screen), `/profile/leave` (list/screen)
- **Permissions:** `lv`: view, create, edit, approve, delete, export; `mylv`: view, create
- **API:**
  - `GET /api/hr/leave-requests?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/leave-requests/:id`: detail
  - `POST /api/hr/leave-requests`: create (draft)
  - `PATCH /api/hr/leave-requests/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/leave-requests/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/leave-requests/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/me/leave-requests, POST /api/me/leave-requests/:id/cancel
  - POST /api/hr/leave-requests/:id/approve|reject
- **Business rules:** Balance checked; overlapping requests rejected.
- **Depends on:** `leave-types` (phase 11), `employees` (phase 11), `approvals` (phase 16)

### 31.2 Leave Balances `leave-balances`

- **Tables:** `HumanResources.LeaveBalances`, `HumanResources.LeaveAdjustments`, `HumanResources.LeaveYearEndClosings`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/leave/balances` — `template/src/50-hr-core.html`
- **Pages:** `/hr/leave/balances` (list/screen)
- **Permissions:** `lv`: view, create, edit, approve, delete, export
- **API:**
  - `GET /api/hr/leave-balances?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/leave-balances/:id`: detail
  - `POST /api/hr/leave-balances`: create (draft)
  - `PATCH /api/hr/leave-balances/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/leave-balances/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/leave-balances/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/leave-balances/accrue?month
  - POST /api/hr/leave-adjustments
  - POST /api/hr/leave-year-end/:year/close (carry forward/encash)
- **Business rules:** Balances change only through accrual, approved requests or adjustments.
- **Depends on:** `leave-requests` (phase 31)

### 31.3 Onboardings `onboardings`

- **Tables:** `HumanResources.Onboardings`, `HumanResources.OnboardingTasks`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/onboarding` — `template/src/51-hr-pay-talent.html`; `app/profile/onboarding` — `template/src/6A-ess.html`
- **Pages:** `/hr/onboarding` (list/screen), `/profile/onboarding` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export; `myonb`: view, edit
- **API:**
  - `GET /api/hr/onboardings?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/onboardings/:id`: detail
  - `POST /api/hr/onboardings`: create (draft)
  - `PATCH /api/hr/onboardings/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/onboardings/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/onboardings/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/onboardings (from template)
  - POST /api/me/onboarding/tasks/:id/complete
- **Depends on:** `onboarding-templates` (phase 13), `employees` (phase 11)

### 31.4 Offboardings `offboardings`

- **Tables:** `HumanResources.Offboardings`, `HumanResources.ClearanceItems`, `HumanResources.ExitInterviews`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/offboarding` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/offboarding` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/hr/offboardings?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/offboardings/:id`: detail
  - `POST /api/hr/offboardings`: create (draft)
  - `PATCH /api/hr/offboardings/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/offboardings/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/offboardings/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/offboardings/:id/clearance/:itemId/clear
  - POST /api/hr/offboardings/:id/complete (deactivates the user)
- **Business rules:** Completion requires every clearance item.
- **Depends on:** `employees` (phase 11)

## Phase 32: Payroll

**Transactions** · workspace · 5 entities. Payroll runs end to end, adjustments, loans, payslips/payments and tax declarations; also My Profile › Payslips/Tax/Loans.

Read-only reports delivered with this phase: Payroll Overview, Statutory Reports.

### 32.1 Payroll Runs `payroll-runs`

- **Tables:** `Payroll.PayrollRuns`, `Payroll.PayrollRunLines`, `Payroll.PayrollRunLineComponents`, `Payroll.PayrollRunBranches`, `Payroll.PayrollRunChecklistItems`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/payroll` — `template/src/48-dash-stock.html`; `app/hr/payroll/run` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/payroll` (list/screen), `/hr/payroll/run` (list/screen)
- **Permissions:** `prun`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/payroll/runs?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payroll/runs/:id`: detail
  - `POST /api/payroll/runs`: create (draft)
  - `PATCH /api/payroll/runs/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/payroll/runs/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/payroll/runs/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/payroll/runs (snapshot eligible employees)
  - POST /api/payroll/runs/:id/calculate|submit|approve|post|reverse
  - GET /api/payroll/runs/:id/variance
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit; Preparer cannot approve own run; Attendance/leave locked for the period on approval.
- **Depends on:** `employee-salaries` (phase 12), `attendance` (phase 30), `leave-requests` (phase 31), `tax-slabs` (phase 12)

### 32.2 Payroll Adjustments `payroll-adjustments`

- **Tables:** `Payroll.PayrollAdjustments`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/payroll/run` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/payroll/run` (list/screen)
- **Permissions:** `prun`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/payroll/adjustments?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payroll/adjustments/:id`: detail
  - `POST /api/payroll/adjustments`: create (draft)
  - `PATCH /api/payroll/adjustments/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/payroll/adjustments/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/payroll/adjustments/:id/history`: audit trail (Company.AuditTrailEntries)
- **Depends on:** `payroll-runs` (phase 32)

### 32.3 Loans & Advances `loans`

- **Tables:** `Payroll.LoansAndAdvances`, `Payroll.LoanInstallments`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/loans` — `template/src/51-hr-pay-talent.html`; `app/profile/loans` — `template/src/6A-ess.html`
- **Pages:** `/hr/loans` (list/screen), `/profile/loans` (list/screen)
- **Permissions:** `loan`: view, create, edit, approve, post, delete, export; `myloan`: view, create
- **API:**
  - `GET /api/payroll/loans?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payroll/loans/:id`: detail
  - `POST /api/payroll/loans`: create (draft)
  - `PATCH /api/payroll/loans/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/payroll/loans/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/payroll/loans/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/me/loans (request)
  - POST /api/payroll/loans/:id/approve|disburse|reschedule
- **Business rules:** Installments are deducted by payroll runs.
- **Depends on:** `employees` (phase 11), `approvals` (phase 16)

### 32.4 Payslips & Salary Payments `payslips`

- **Tables:** `Payroll.Payslips`, `Payroll.SalaryPaymentBatches`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/payroll/payslips` — `template/src/51-hr-pay-talent.html`; `app/hr/payroll/payslip` — `template/src/51-hr-pay-talent.html`; `app/profile/payslips` — `template/src/6A-ess.html`
- **Pages:** `/hr/payroll/payslips` (list/screen), `/hr/payroll/payslip` (list/screen), `/profile/payslips` (list/screen)
- **Permissions:** `prun`: view, create, edit, approve, post, export; `mypay`: view, export
- **API:**
  - `GET /api/payroll/payslips?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payroll/payslips/:id`: detail
  - `POST /api/payroll/payslips`: create (draft)
  - `PATCH /api/payroll/payslips/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/payroll/payslips/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/payroll/payslips/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/payroll/runs/:id/publish-payslips
  - GET /api/me/payslips, GET /api/me/payslips/:id/pdf
  - POST /api/payroll/payment-batches (bank file)
- **Business rules:** Employees see own payslips only.
- **Depends on:** `payroll-runs` (phase 32), `bank-accounts` (phase 4)

### 32.5 Tax Declarations `tax-declarations`

- **Tables:** `Payroll.TaxDeclarations`
- **Audit trigger:** present on all tables
- **Template:** `app/profile/tax` — `template/src/6A-ess.html`
- **Pages:** `/profile/tax` (list/screen)
- **Permissions:** `prun`: view, create, edit, approve, post, export; `mytax`: view, create, edit
- **API:**
  - `GET /api/payroll/tax-declarations?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payroll/tax-declarations/:id`: detail
  - `POST /api/payroll/tax-declarations`: create (draft)
  - `PATCH /api/payroll/tax-declarations/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/payroll/tax-declarations/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/payroll/tax-declarations/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/me/tax-declarations, POST /api/payroll/tax-declarations/:id/verify|reject
- **Depends on:** `employees` (phase 11), `tax-slabs` (phase 12)

## Phase 33: Talent & exits

**Transactions** · workspace · 5 entities. Final settlements, recruitment, performance, training, employee letters and assets.

Read-only reports delivered with this phase: HR Reports.

### 33.1 Final Settlements `final-settlements`

- **Tables:** `Payroll.FinalSettlements`, `Payroll.FinalSettlementLines`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/settlement` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/settlement` (list/screen)
- **Permissions:** `fs`: view, create, edit, approve, post, export
- **API:**
  - `GET /api/payroll/final-settlements?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/payroll/final-settlements/:id`: detail
  - `POST /api/payroll/final-settlements`: create (draft)
  - `PATCH /api/payroll/final-settlements/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/payroll/final-settlements/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/payroll/final-settlements/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/payroll/final-settlements/:id/calculate|approve|post
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit.
- **Depends on:** `offboardings` (phase 31), `loans` (phase 32), `leave-balances` (phase 31)

### 33.2 Recruitment `recruitment`

- **Tables:** `HumanResources.JobOpenings`, `HumanResources.Candidates`, `HumanResources.CandidateActivities`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/recruitment` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/recruitment` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/hr/recruitment?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/recruitment/:id`: detail
  - `POST /api/hr/recruitment`: create (draft)
  - `PATCH /api/hr/recruitment/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/recruitment/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/recruitment/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/recruitment/candidates/:id/move-stage
  - POST /api/hr/recruitment/candidates/:id/hire (creates employee + onboarding)
- **Depends on:** `designations` (phase 10), `onboardings` (phase 31)

### 33.3 Performance `performance`

- **Tables:** `HumanResources.PerformanceReviews`, `HumanResources.Goals`, `HumanResources.PerformanceFeedback`, `HumanResources.OneOnOneMeetings`, `HumanResources.CompetencyRatings`, `HumanResources.KeyResults`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/performance` — `template/src/51-hr-pay-talent.html`; `app/profile/goals` — `template/src/6A-ess.html`
- **Pages:** `/hr/performance` (list/screen), `/profile/goals` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export; `mygoal`: view, edit
- **API:**
  - `GET /api/hr/performance?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/performance/:id`: detail
  - `POST /api/hr/performance`: create (draft)
  - `PATCH /api/hr/performance/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/performance/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/performance/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/me/goals, POST /api/me/reviews/:id/self-assessment
  - POST /api/hr/performance/reviews/:id/calibrate|finalise
- **Depends on:** `performance-cycles` (phase 13), `employees` (phase 11)

### 33.4 Training `training`

- **Tables:** `HumanResources.TrainingSessions`, `HumanResources.TrainingEnrolments`, `HumanResources.Certifications`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/training` — `template/src/51-hr-pay-talent.html`
- **Pages:** `/hr/training` (list/screen)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/hr/training?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/training/:id`: detail
  - `POST /api/hr/training`: create (draft)
  - `PATCH /api/hr/training/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/training/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/training/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/training/sessions/:id/enrol|complete
- **Depends on:** `training-programs` (phase 13), `employees` (phase 11)

### 33.5 Employee Letters & Assets `employee-letters-assets`

- **Tables:** `HumanResources.EmployeeLetters`, `HumanResources.EmployeeAssets`
- **Audit trigger:** present on all tables
- **Template:** `app/hr/employees/view` — `template/src/50-hr-core.html`
- **Pages:** `/hr/employees/[id]` (detail)
- **Permissions:** `emp`: view, create, edit, delete, export
- **API:**
  - `GET /api/hr/employee-records?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/hr/employee-records/:id`: detail
  - `POST /api/hr/employee-records`: create (draft)
  - `PATCH /api/hr/employee-records/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/hr/employee-records/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/hr/employee-records/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/hr/employees/:id/letters (generate from template)
  - POST /api/hr/employees/:id/assets/:assetId/issue|return
- **Depends on:** `employees` (phase 11), `document-templates` (phase 2)

## Phase 34: Self-service requests

**Transactions** · workspace · 5 entities. Employee requests and engagement from My Profile.

Read-only reports delivered with this phase: My Day (getMyDay), My Team (getMyTeamToday).

### 34.1 Letter Requests `letter-requests`

- **Tables:** `EmployeeSelfService.LetterRequests`
- **Audit trigger:** present on all tables
- **Template:** `app/profile/requests` — `template/src/6A-ess.html`
- **Pages:** `/profile/requests` (list/screen)
- **Permissions:** `myreq`: view, create
- **API:**
  - `GET /api/me/letter-requests?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/me/letter-requests/:id`: detail
  - `POST /api/me/letter-requests`: create (draft)
  - `PATCH /api/me/letter-requests/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/me/letter-requests/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/me/letter-requests/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/me/letter-requests
  - POST /api/hr/letter-requests/:id/issue|reject
- **Depends on:** `employee-letters-assets` (phase 33)

### 34.2 Profile Change Requests `profile-change-requests`

- **Tables:** `EmployeeSelfService.ProfileChangeRequests`
- **Audit trigger:** present on all tables
- **Template:** `app/profile/details` — `template/src/6A-ess.html`
- **Pages:** `/profile/details` (list/screen)
- **Permissions:** `myprof`: view, edit
- **API:**
  - `GET /api/me/profile-change-requests?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/me/profile-change-requests/:id`: detail
  - `POST /api/me/profile-change-requests`: create (draft)
  - `PATCH /api/me/profile-change-requests/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/me/profile-change-requests/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/me/profile-change-requests/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/me/profile-change-requests
  - POST /api/hr/profile-change-requests/:id/approve|reject (applies to the employee record)
- **Business rules:** An employee never edits the HR master directly.
- **Depends on:** `employees` (phase 11)

### 34.3 Helpdesk Tickets `helpdesk-tickets`

- **Tables:** `EmployeeSelfService.HelpdeskTickets`, `EmployeeSelfService.HelpdeskTicketMessages`
- **Audit trigger:** present on all tables
- **Template:** `app/profile/helpdesk` — `template/src/6A-ess.html`
- **Pages:** `/profile/helpdesk` (list/screen)
- **Permissions:** `myhelp`: view, create
- **API:**
  - `GET /api/helpdesk/tickets?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/helpdesk/tickets/:id`: detail
  - `POST /api/helpdesk/tickets`: create (draft)
  - `PATCH /api/helpdesk/tickets/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/helpdesk/tickets/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/helpdesk/tickets/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/helpdesk/tickets/:id/messages
  - POST /api/helpdesk/tickets/:id/assign|resolve|reopen
- **Depends on:** `helpdesk-setup` (phase 15)

### 34.4 Kudos, Survey Responses, Reads & Presence `engagement`

- **Tables:** `EmployeeSelfService.Kudos`, `EmployeeSelfService.KudosReactions`, `EmployeeSelfService.PollVotes`, `EmployeeSelfService.PulseSurveyResponses`, `EmployeeSelfService.CompanyAnnouncementReads`, `EmployeeSelfService.PresenceStatuses`
- **Audit trigger:** present on all tables
- **Template:** `app/profile/kudos` — `template/src/6A-ess.html`; `app/profile/directory` — `template/src/6A-ess.html`
- **Pages:** `/profile/kudos` (list/screen), `/profile/directory` (list/screen)
- **Permissions:** `mykudos`: view, create; `dir`: view
- **API:**
  - `GET /api/me/engagement?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/me/engagement/:id`: detail
  - `POST /api/me/engagement`: create (draft)
  - `PATCH /api/me/engagement/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/me/engagement/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/me/engagement/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/me/kudos, POST /api/me/kudos/:id/react
  - POST /api/me/polls/:id/vote
  - POST /api/me/pulse-surveys/:id/respond
  - POST /api/company/announcements/:id/read (RSVP)
  - PUT /api/me/presence
- **Business rules:** One vote/response per user per poll/survey.
- **Depends on:** `surveys` (phase 15), `announcements` (phase 15), `employees` (phase 11)

### 34.5 Policy Acknowledgements `policy-acknowledgements`

- **Tables:** `EmployeeSelfService.PolicyAcknowledgements`
- **Audit trigger:** present on all tables
- **Template:** `app/profile/onboarding` — `template/src/6A-ess.html`; `app/profile/team` — `template/src/6A-ess.html`
- **Pages:** `/profile/onboarding` (list/screen), `/profile/team` (list/screen)
- **Permissions:** `myonb`: view, edit; `myteam`: view, approve
- **API:**
  - `GET /api/me/policy-acknowledgements?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/me/policy-acknowledgements/:id`: detail
  - `POST /api/me/policy-acknowledgements`: create (draft)
  - `PATCH /api/me/policy-acknowledgements/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/me/policy-acknowledgements/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/me/policy-acknowledgements/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/me/policies/:id/acknowledge
  - GET /api/hr/policies/:id/acknowledgements
- **Depends on:** `company-policies` (phase 13)

## Phase 35: Data & collaboration

**Transactions** · workspace · 5 entities. Imports, integrations/API keys, backups, report runs and the cross-cutting activity/comments/attachments layer.

Read-only reports delivered with this phase: Audit Trail, Reports Hub.

### 35.1 Data Imports `data-imports`

- **Tables:** `Company.DataImports`, `Company.DataImportErrors`
- **Audit trigger:** present on all tables
- **Template:** `app/import` — `template/src/4A-company-plus.html`
- **Pages:** `/import` (list/screen)
- **Permissions:** `bak`: view, create, export
- **API:**
  - `GET /api/imports?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/imports/:id`: detail
  - `POST /api/imports`: create (draft)
  - `PATCH /api/imports/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/imports/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/imports/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/imports (upload + map)
  - POST /api/imports/:id/validate|run
  - GET /api/imports/:id/errors.csv
- **Business rules:** Each row goes through the target entity's own use case (same validation and audit).
- **Depends on:** `customers` (phase 7), `vendors` (phase 7), `products` (phase 8), `employees` (phase 11)

### 35.2 Integrations & API Keys `integrations`

- **Tables:** `Company.Integrations`, `Company.IntegrationWebhooks`, `Company.IntegrationWebhookDeliveries`, `Company.ApiKeys`
- **Audit trigger:** missing on `Company.IntegrationWebhooks`, `Company.IntegrationWebhookDeliveries`, `Company.ApiKeys`; add it in this phase
- **Template:** `app/settings/integrations` — `template/src/60-settings-ess.html`
- **Pages:** `/settings/integrations` (list/screen)
- **Permissions:** `intg`: view, create, edit, delete, export
- **API:**
  - `GET /api/settings/integrations?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/integrations/:id`: detail
  - `POST /api/settings/integrations`: create (draft)
  - `PATCH /api/settings/integrations/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/settings/integrations/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/settings/integrations/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/settings/api-keys (secret shown once, stored hashed)
  - POST /api/settings/integrations/webhooks/:id/test
  - POST /api/settings/integrations/webhooks/deliveries/:id/redeliver

### 35.3 Backup & Restore `backups`

- **Tables:** `Company.Backups`, `Company.BackupSettings`, `Company.BackupRestoreRequests`
- **Audit trigger:** present on all tables
- **Template:** `app/settings/backup` — `template/src/60-settings-ess.html`
- **Pages:** `/settings/backup` (list/screen)
- **Permissions:** `bak`: view, create, export
- **API:**
  - `GET /api/settings/backups?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/settings/backups/:id`: detail
  - `POST /api/settings/backups`: create (draft)
  - `PATCH /api/settings/backups/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/settings/backups/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/settings/backups/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/settings/backups/run
  - POST /api/settings/backups/:id/restore-request (needs approval)

### 35.4 Report Runs `report-runs`

- **Tables:** `Reports.ReportRuns`
- **Audit trigger:** present on all tables
- **Template:** `app/reports` — `template/src/45-studios.html`; `app/reports/studio` — `template/src/42-acc-reports.html`
- **Pages:** `/reports` (list/screen), `/reports/studio` (list/screen)
- **Permissions:** `rpt`: view, create, edit, delete, export
- **API:**
  - `GET /api/reports/runs?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/reports/runs/:id`: detail
  - `POST /api/reports/runs`: create (draft)
  - `PATCH /api/reports/runs/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/reports/runs/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/reports/runs/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/reports/saved/:id/run
  - GET /api/reports/runs/:id/download
- **Depends on:** `saved-reports` (phase 15)

### 35.5 Activity, Comments & Attachments `collaboration`

- **Tables:** `Company.ActivityEvents`, `Company.Comments`, `Company.Mentions`, `Company.Reactions`, `Company.Attachments`, `Company.Tags`, `Company.TaggedRecords`
- **Audit trigger:** present on all tables
- **Template:** `app/activity` — `template/src/4A-company-plus.html`
- **Pages:** `/activity` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/collaboration?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/collaboration/:id`: detail
  - `POST /api/collaboration`: create (draft)
  - `PATCH /api/collaboration/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/collaboration/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/collaboration/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/collaboration/feed
  - POST /api/collaboration/comments, POST /api/collaboration/reactions, POST /api/collaboration/attachments (upload)
  - PUT /api/collaboration/tags/:recordType/:recordId
- **Business rules:** Visibility follows the target record's permission.
- **Depends on:** `users` (phase 2)

## Phase 44: Work queue & sign-in recovery

**Transactions** · workspace · 3 entities. Tasks and notifications, user invites and password reset, and the workspace dashboard (split from Phase 29, decided 2026-10-08).

Read-only reports delivered with this phase: Workspace Dashboard.

### 44.1 Tasks & Today's Work `tasks`

- **Tables:** `Company.Tasks`
- **Audit trigger:** present on all tables
- **Template:** `app/today` — `template/src/40-acc-core.html`
- **Pages:** `/today` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/work?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/work/:id`: detail
  - `POST /api/work`: create (draft)
  - `PATCH /api/work/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/work/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/work/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/work/today (Company.getTodayDueItems, getTodayKpis)
  - CRUD /api/work/tasks
- **Business rules:** Own tasks only unless assigned.
- **Depends on:** `users` (phase 2)

### 44.2 Notifications & Preferences `notifications`

- **Tables:** `Company.Notifications`, `Company.NotificationPreferences`
- **Audit trigger:** present on all tables
- **Template:** `app/notifications` — `template/src/40-acc-core.html`
- **Pages:** `/notifications` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/me/notifications?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/me/notifications/:id`: detail
  - `POST /api/me/notifications`: create (draft)
  - `PATCH /api/me/notifications/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/me/notifications/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/me/notifications/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/me/notifications, POST /api/me/notifications/read-all
  - PUT /api/me/notification-preferences
- **Business rules:** Own notifications only.
- **Depends on:** `users` (phase 2)

### 44.3 Sign-in Recovery & MFA `sign-in-recovery`

- **Tables:** `Company.UserInvites`, `Company.UserMfaMethods`, `Company.TrustedDevices`, `Company.PasswordResets`
- **Audit trigger:** missing on `Company.UserMfaMethods`, `Company.TrustedDevices`, `Company.PasswordResets`; add it in this phase
- **Template:** `login/mfa` — `template/src/30-entry-admin.html`; `login/forgot` — `template/src/30-entry-admin.html`
- **Pages:** `/login/mfa` (list/screen), `/login/forgot` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/me/mfa?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/me/mfa/:id`: detail
  - `POST /api/me/mfa`: create (draft)
  - `PATCH /api/me/mfa/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/me/mfa/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/me/mfa/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/settings/users/invite (email/WhatsApp link) + accept page
  - POST /api/me/mfa/enrol|verify|disable
  - DELETE /api/me/trusted-devices/:id
  - POST /api/auth/forgot, POST /api/auth/reset
- **Business rules:** Deferred from Phase 2 and Phase 15: needs an email/SMS provider (shared with reminder runs); Invites and password reset only (outbox links); MFA / trusted devices in a later phase (decided 2026-10-08); Reset and invite tokens hashed and single-use; MFA secrets encrypted; recovery codes hashed.
- **Depends on:** `users` (phase 2), `account-security` (phase 2)

## Phase 36: Plans & catalogue

**Masters** · admin · 4 entities. What tenants can buy: plans with features/limits, modules, add-ons and coupons.

### 36.1 Subscription Plans `subscription-plans`

- **Tables:** `Platform.SubscriptionPlans`, `Platform.SubscriptionPlanFeatures`, `Platform.SubscriptionPlanLimits`
- **Audit trigger:** present on all tables
- **Template:** `admin/plans` — `template/src/30-entry-admin.html`
- **Pages:** `/admin/plans` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/plans?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/plans/:id`: detail
  - `POST /api/admin/plans`: create
  - `PATCH /api/admin/plans/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/plans/:id/deactivate | /activate`
  - `DELETE /api/admin/plans/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/plans/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/plans/:id/publish|archive
  - PUT /api/admin/plans/:id/features|limits
- **Business rules:** Published plan prices are history: changes create a new version for new subscriptions.

### 36.2 Platform Modules `platform-modules`

- **Tables:** `Platform.PlatformModules`, `Platform.PlatformModulePlans`
- **Audit trigger:** present on all tables
- **Template:** `admin/entitlements` — `template/src/3B-flags.html`
- **Pages:** `/admin/entitlements` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/modules?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/modules/:id`: detail
  - `POST /api/admin/modules`: create
  - `PATCH /api/admin/modules/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/modules/:id/deactivate | /activate`
  - `DELETE /api/admin/modules/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/modules/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Module keys = ModuleKey lookup codes.
- **Depends on:** `subscription-plans` (phase 36)

### 36.3 Add-ons `addons`

- **Tables:** `Platform.Addons`, `Platform.AddonPlans`
- **Audit trigger:** present on all tables
- **Template:** `admin/plans` — `template/src/30-entry-admin.html`
- **Pages:** `/admin/plans` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/addons?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/addons/:id`: detail
  - `POST /api/admin/addons`: create
  - `PATCH /api/admin/addons/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/addons/:id/deactivate | /activate`
  - `DELETE /api/admin/addons/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/addons/:id/history`: audit trail (Company.AuditTrailEntries)
- **Depends on:** `subscription-plans` (phase 36)

### 36.4 Coupons `coupons`

- **Tables:** `Platform.SubscriptionCoupons`, `Platform.SubscriptionCouponPlans`, `Platform.SubscriptionCouponRedemptions`
- **Audit trigger:** present on all tables
- **Template:** `admin/partners` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/partners` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/coupons?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/coupons/:id`: detail
  - `POST /api/admin/coupons`: create
  - `PATCH /api/admin/coupons/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/coupons/:id/deactivate | /activate`
  - `DELETE /api/admin/coupons/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/coupons/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/admin/coupons/:id/redemptions
- **Business rules:** Redemptions are append-only; limits enforced at redemption.
- **Depends on:** `subscription-plans` (phase 36)

## Phase 37: Seed templates & tax master

**Masters** · admin · 4 entities. Data copied into a new tenant at onboarding, and the national tax master.

### 37.1 COA Templates `coa-templates`

- **Tables:** `Platform.ChartOfAccountsTemplates`, `Platform.ChartOfAccountsTemplateAccounts`
- **Audit trigger:** present on all tables
- **Template:** `admin/templates` — `template/src/30-entry-admin.html`
- **Pages:** `/admin/templates` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/coa-templates?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/coa-templates/:id`: detail
  - `POST /api/admin/coa-templates`: create
  - `PATCH /api/admin/coa-templates/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/coa-templates/:id/deactivate | /activate`
  - `DELETE /api/admin/coa-templates/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/coa-templates/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/coa-templates/:id/import (CSV)
  - POST /api/admin/coa-templates/:id/publish

### 37.2 Tenant Seed Templates `seed-templates`

- **Tables:** `Platform.TemplateLeaveTypes`, `Platform.TemplateSalaryComponents`, `Platform.TemplateTaxCodes`, `Platform.SystemRoleGrants`
- **Audit trigger:** present on all tables
- **Template:** `admin/templates` — `template/src/30-entry-admin.html`
- **Pages:** `/admin/templates` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/seed-templates?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/seed-templates/:id`: detail
  - `POST /api/admin/seed-templates`: create
  - `PATCH /api/admin/seed-templates/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/seed-templates/:id/deactivate | /activate`
  - `DELETE /api/admin/seed-templates/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/seed-templates/:id/history`: audit trail (Company.AuditTrailEntries)

### 37.3 Tax Master `tax-master`

- **Tables:** `Platform.TaxMasterAuthorities`, `Platform.TaxMasterSalesTaxRates`, `Platform.TaxMasterWithholdingRates`, `Platform.TaxMasterSalarySlabs`
- **Audit trigger:** missing on `Platform.TaxMasterAuthorities`; add it in this phase
- **Template:** `admin/tax-master` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/tax-master` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/tax-master?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/tax-master/:id`: detail
  - `POST /api/admin/tax-master`: create
  - `PATCH /api/admin/tax-master/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/tax-master/:id/deactivate | /activate`
  - `DELETE /api/admin/tax-master/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/tax-master/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/tax-master/publish
  - POST /api/api/tax/codes/import-master: tenants import tax codes from the published master (moved from Phase 4)
- **Business rules:** Effective-dated; published rates never edited, only superseded.

### 37.4 Communication Templates `communication-templates`

- **Tables:** `Platform.CommunicationTemplates`
- **Audit trigger:** present on all tables
- **Template:** `admin/comms` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/comms` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/communication-templates?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/communication-templates/:id`: detail
  - `POST /api/admin/communication-templates`: create
  - `PATCH /api/admin/communication-templates/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/communication-templates/:id/deactivate | /activate`
  - `DELETE /api/admin/communication-templates/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/communication-templates/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/communication-templates/:id/preview|test-send

## Phase 38: Platform configuration

**Masters** · admin · 4 entities. Dunning policy, tenant segments, resellers and platform security/backups.

### 38.1 Dunning Policies `dunning-policies`

- **Tables:** `Platform.DunningPolicies`
- **Audit trigger:** present on all tables
- **Template:** `admin/dunning` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/dunning` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/dunning-policies?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/dunning-policies/:id`: detail
  - `POST /api/admin/dunning-policies`: create
  - `PATCH /api/admin/dunning-policies/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/dunning-policies/:id/deactivate | /activate`
  - `DELETE /api/admin/dunning-policies/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/dunning-policies/:id/history`: audit trail (Company.AuditTrailEntries)
- **Business rules:** Only one active policy (dunningPolicyOneActive).

### 38.2 Tenant Segments `tenant-segments`

- **Tables:** `Platform.TenantSegments`, `Platform.TenantSegmentRules`, `Platform.SegmentTenants`
- **Audit trigger:** present on all tables
- **Template:** `admin/segments` — `template/src/3B-flags.html`
- **Pages:** `/admin/segments` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/segments?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/segments/:id`: detail
  - `POST /api/admin/segments`: create
  - `PATCH /api/admin/segments/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/segments/:id/deactivate | /activate`
  - `DELETE /api/admin/segments/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/segments/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/segments/:id/evaluate (refresh membership)

### 38.3 Resellers `resellers`

- **Tables:** `Platform.Resellers`
- **Audit trigger:** missing on `Platform.Resellers`; add it in this phase
- **Template:** `admin/partners` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/partners` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/resellers?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/resellers/:id`: detail
  - `POST /api/admin/resellers`: create
  - `PATCH /api/admin/resellers/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/resellers/:id/deactivate | /activate`
  - `DELETE /api/admin/resellers/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/resellers/:id/history`: audit trail (Company.AuditTrailEntries)

### 38.4 Platform Security & Backups `platform-security`

- **Tables:** `Platform.PlatformSecuritySettings`, `Platform.PlatformAllowedIps`, `Platform.PlatformApiKeys`, `Platform.WebhookEndpoints`, `Platform.WebhookDeliveries`, `Platform.BackupRuns`
- **Audit trigger:** missing on `Platform.PlatformApiKeys`, `Platform.WebhookEndpoints`, `Platform.WebhookDeliveries`; add it in this phase
- **Template:** `admin/security` — `template/src/3A-admin-plus.html`; `admin/integrations` — `template/src/3A-admin-plus.html`; `admin/system` — `template/src/30-entry-admin.html`
- **Pages:** `/admin/security` (list/screen), `/admin/integrations` (list/screen), `/admin/system` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/security?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/security/:id`: detail
  - `POST /api/admin/security`: create
  - `PATCH /api/admin/security/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/security/:id/deactivate | /activate`
  - `DELETE /api/admin/security/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/security/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/api-keys (secret shown once)
  - POST /api/admin/webhooks/:id/test
  - POST /api/admin/backups/run
- **Business rules:** Secrets hashed/encrypted; never returned.

## Phase 39: Feature flags & alerting

**Masters** · admin · 4 entities. Feature flags with targeting, maintenance windows and alert rules.

### 39.1 Feature Flags `feature-flags`

- **Tables:** `Platform.FeatureFlags`, `Platform.FlagEnvironments`, `Platform.FlagVariations`, `Platform.FlagRules`, `Platform.FlagTargets`, `Platform.FlagPrerequisites`, `Platform.FlagDefaultRules`, `Platform.FlagSdkKeys`
- **Audit trigger:** missing on `Platform.FlagSdkKeys`; add it in this phase
- **Template:** `admin/features` — `template/src/3B-flags.html`; `admin/features/view` — `template/src/3B-flags.html`
- **Pages:** `/admin/features` (list/screen), `/admin/features/[id]` (detail)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/flags?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/flags/:id`: detail
  - `POST /api/admin/flags`: create
  - `PATCH /api/admin/flags/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/flags/:id/deactivate | /activate`
  - `DELETE /api/admin/flags/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/flags/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/flags/:id/toggle?env
  - GET /api/admin/flags/:id/evaluate?tenant
  - POST /api/admin/flags/sdk-keys
- **Business rules:** Prerequisites without cycles; every change written to FlagAuditLogs.

### 39.2 Maintenance Windows `maintenance-windows`

- **Tables:** `Platform.MaintenanceWindows`
- **Audit trigger:** present on all tables
- **Template:** `admin/status` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/status` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/maintenance-windows?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/maintenance-windows/:id`: detail
  - `POST /api/admin/maintenance-windows`: create
  - `PATCH /api/admin/maintenance-windows/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/maintenance-windows/:id/deactivate | /activate`
  - `DELETE /api/admin/maintenance-windows/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/maintenance-windows/:id/history`: audit trail (Company.AuditTrailEntries)

### 39.3 Usage Alert Rules `usage-alert-rules`

- **Tables:** `Platform.UsageAlertRules`
- **Audit trigger:** present on all tables
- **Template:** `admin/usage` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/usage` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/usage-alert-rules?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/usage-alert-rules/:id`: detail
  - `POST /api/admin/usage-alert-rules`: create
  - `PATCH /api/admin/usage-alert-rules/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/usage-alert-rules/:id/deactivate | /activate`
  - `DELETE /api/admin/usage-alert-rules/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/usage-alert-rules/:id/history`: audit trail (Company.AuditTrailEntries)

### 39.4 Audit Alert Rules `audit-alert-rules`

- **Tables:** `Platform.AuditAlertRules`
- **Audit trigger:** present on all tables
- **Template:** `admin/audit` — `template/src/30-entry-admin.html`
- **Pages:** `/admin/audit` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/audit-alert-rules?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/audit-alert-rules/:id`: detail
  - `POST /api/admin/audit-alert-rules`: create
  - `PATCH /api/admin/audit-alert-rules/:id`: update with rowVersion (409 when stale)
  - `POST /api/admin/audit-alert-rules/:id/deactivate | /activate`
  - `DELETE /api/admin/audit-alert-rules/:id`: only when unreferenced (409 *_IN_USE)
  - `GET /api/admin/audit-alert-rules/:id/history`: audit trail (Company.AuditTrailEntries)

## Phase 40: Tenant lifecycle

**Transactions** · admin · 4 entities. Onboard and manage tenants, their subscriptions and usage, and audited impersonation.

Read-only reports delivered with this phase: Platform Overview (admin/dashboard), SaaS Analytics.

### 40.1 Tenants `tenants`

- **Tables:** `Platform.Tenants`, `Platform.TenantContacts`, `Platform.TenantModules`, `Platform.TenantAddons`, `Platform.TenantNotes`
- **Audit trigger:** present on all tables
- **Template:** `admin/tenants` — `template/src/3A-admin-plus.html`; `admin/tenants/new` — `template/src/30-entry-admin.html`; `admin/tenants/view` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/tenants` (list/screen), `/admin/tenants/new` (create), `/admin/tenants/[id]` (detail)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/tenants?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/tenants/:id`: detail
  - `POST /api/admin/tenants`: create (draft)
  - `PATCH /api/admin/tenants/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/tenants/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/tenants/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/tenants (onboard: calls Platform.provisionTenant → tenant + system roles + default user with every role, then seed templates; one transaction; form asks the default user's name, email, password)
  - POST /api/admin/tenants/:id/suspend|reactivate|churn
  - PUT /api/admin/tenants/:id/modules
- **Business rules:** Code and subdomain unique; Status follows the TenantStatus lookup lifecycle; Onboarding is idempotent and fully audited.
- **Depends on:** `subscription-plans` (phase 36), `coa-templates` (phase 37), `seed-templates` (phase 37)

### 40.2 Subscriptions `subscriptions`

- **Tables:** `Platform.Subscriptions`, `Platform.SubscriptionEvents`
- **Audit trigger:** present on all tables
- **Template:** `admin/subscriptions` — `template/src/30-entry-admin.html`
- **Pages:** `/admin/subscriptions` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/subscriptions?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/subscriptions/:id`: detail
  - `POST /api/admin/subscriptions`: create (draft)
  - `PATCH /api/admin/subscriptions/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/subscriptions/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/subscriptions/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/subscriptions/:id/change-plan|cancel|renew
  - Scheduled renewal job (actor = SERVICE)
- **Business rules:** Every change is a SubscriptionEvents row; entitlement changes logged.
- **Depends on:** `tenants` (phase 40), `coupons` (phase 36)

### 40.3 Usage `usage`

- **Tables:** `Platform.UsageMeters`, `Platform.UsageSnapshots`, `Platform.UsageLimitOverrides`
- **Audit trigger:** present on all tables
- **Template:** `admin/usage` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/usage` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/usage?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/usage/:id`: detail
  - `POST /api/admin/usage`: create (draft)
  - `PATCH /api/admin/usage/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/usage/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/usage/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/admin/usage?tenant (Platform.getCurrentUsage)
  - POST /api/admin/usage/overrides
- **Depends on:** `tenants` (phase 40), `usage-alert-rules` (phase 39)

### 40.4 Impersonation Sessions `impersonation`

- **Tables:** `Platform.ImpersonationSessions`
- **Audit trigger:** present on all tables
- **Template:** `admin/tenants/view` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/tenants/[id]` (detail)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/impersonation?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/impersonation/:id`: detail
  - `POST /api/admin/impersonation`: create (draft)
  - `PATCH /api/admin/impersonation/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/impersonation/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/impersonation/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/tenants/:id/impersonate (time-boxed, reason required)
  - POST /api/admin/impersonation/:id/end
- **Business rules:** Every action during impersonation audited with both identities; Tenant can see impersonation history.
- **Depends on:** `tenants` (phase 40)

## Phase 41: Platform billing

**Transactions** · admin · 4 entities. Platform invoices and payments, dunning, and reseller payouts.

### 41.1 Platform Invoices `platform-invoices`

- **Tables:** `Platform.PlatformInvoices`, `Platform.PlatformInvoiceLines`
- **Audit trigger:** present on all tables
- **Template:** `admin/invoices` — `template/src/30-entry-admin.html`
- **Pages:** `/admin/invoices` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/invoices?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/invoices/:id`: detail
  - `POST /api/admin/invoices`: create (draft)
  - `PATCH /api/admin/invoices/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/invoices/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/invoices/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/invoices/generate?period
  - POST /api/admin/invoices/:id/issue|void
  - GET /api/admin/invoices/:id/pdf
- **Business rules:** Draft → submitted → approved → posted; posted documents are immutable; Corrections only by reversal (reverse/void), never edit or delete; Posting is one transaction: document + GL/stock effects + audit.
- **Depends on:** `subscriptions` (phase 40)

### 41.2 Platform Payments `platform-payments`

- **Tables:** `Platform.PlatformPayments`
- **Audit trigger:** present on all tables
- **Template:** `admin/invoices` — `template/src/30-entry-admin.html`
- **Pages:** `/admin/invoices` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/payments?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/payments/:id`: detail
  - `POST /api/admin/payments`: create (draft)
  - `PATCH /api/admin/payments/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/payments/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/payments/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/payments (record/allocate)
  - POST /api/admin/payments/:id/refund
- **Depends on:** `platform-invoices` (phase 41)

### 41.3 Dunning Cases `dunning-cases`

- **Tables:** `Platform.DunningCases`, `Platform.DunningAttempts`
- **Audit trigger:** present on all tables
- **Template:** `admin/dunning` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/dunning` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/dunning-cases?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/dunning-cases/:id`: detail
  - `POST /api/admin/dunning-cases`: create (draft)
  - `PATCH /api/admin/dunning-cases/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/dunning-cases/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/dunning-cases/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/dunning-cases/:id/attempt|resolve|escalate
  - Scheduled dunning job (actor = SERVICE)
- **Depends on:** `platform-invoices` (phase 41), `dunning-policies` (phase 38)

### 41.4 Reseller Payouts `reseller-payouts`

- **Tables:** `Platform.ResellerPayouts`, `Platform.ResellerTenants`
- **Audit trigger:** present on all tables
- **Template:** `admin/partners` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/partners` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/reseller-payouts?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/reseller-payouts/:id`: detail
  - `POST /api/admin/reseller-payouts`: create (draft)
  - `PATCH /api/admin/reseller-payouts/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/reseller-payouts/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/reseller-payouts/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/reseller-payouts/calculate?period (Platform.getResellerCommissions)
  - POST /api/admin/reseller-payouts/:id/approve|pay
- **Depends on:** `resellers` (phase 38), `platform-payments` (phase 41)

## Phase 42: Growth & support

**Transactions** · admin · 4 entities. Leads, support tickets, announcements/broadcasts and the communication log.

### 42.1 Leads `leads`

- **Tables:** `Platform.PlatformLeads`, `Platform.PlatformLeadActivities`
- **Audit trigger:** present on all tables
- **Template:** `admin/leads` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/leads` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/leads?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/leads/:id`: detail
  - `POST /api/admin/leads`: create (draft)
  - `PATCH /api/admin/leads/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/leads/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/leads/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/leads/:id/move-stage
  - POST /api/admin/leads/:id/convert (starts tenant onboarding)
- **Depends on:** `tenants` (phase 40)

### 42.2 Support Tickets `support-tickets`

- **Tables:** `Platform.SupportTickets`, `Platform.SupportTicketMessages`
- **Audit trigger:** present on all tables
- **Template:** `admin/support` — `template/src/30-entry-admin.html`
- **Pages:** `/admin/support` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/support-tickets?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/support-tickets/:id`: detail
  - `POST /api/admin/support-tickets`: create (draft)
  - `PATCH /api/admin/support-tickets/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/support-tickets/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/support-tickets/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/support-tickets/:id/messages
  - POST /api/admin/support-tickets/:id/assign|resolve|reopen
- **Depends on:** `tenants` (phase 40)

### 42.3 Announcements & Broadcasts `announcements-admin`

- **Tables:** `Platform.Announcements`, `Platform.AnnouncementTargets`, `Platform.TenantBroadcasts`, `Platform.AnnouncementReceipts`
- **Audit trigger:** present on all tables
- **Template:** `admin/announcements` — `template/src/30-entry-admin.html`
- **Pages:** `/admin/announcements` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/announcements?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/announcements/:id`: detail
  - `POST /api/admin/announcements`: create (draft)
  - `PATCH /api/admin/announcements/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/announcements/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/announcements/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/announcements/:id/publish|schedule
  - POST /api/admin/broadcasts
- **Depends on:** `tenant-segments` (phase 38)

### 42.4 Communication Logs `communication-logs`

- **Tables:** `Platform.CommunicationLogs`
- **Audit trigger:** present on all tables
- **Template:** `admin/comms` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/comms` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/communication-logs?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/communication-logs/:id`: detail
  - `POST /api/admin/communication-logs`: create (draft)
  - `PATCH /api/admin/communication-logs/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/communication-logs/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/communication-logs/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/admin/communication-logs?tenant&channel (read-only)
  - POST /api/admin/communication-logs/:id/resend
- **Business rules:** Append-only.
- **Depends on:** `communication-templates` (phase 37)

## Phase 43: Platform operations

**Transactions** · admin · 4 entities. Incidents and status, flag change requests, privacy requests and the entitlement change log.

Read-only reports delivered with this phase: System Health, Platform Audit Log.

### 43.1 Service Incidents `service-incidents`

- **Tables:** `Platform.ServiceIncidents`, `Platform.ServiceIncidentUpdates`
- **Audit trigger:** present on all tables
- **Template:** `admin/status` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/status` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/incidents?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/incidents/:id`: detail
  - `POST /api/admin/incidents`: create (draft)
  - `PATCH /api/admin/incidents/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/incidents/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/incidents/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/incidents/:id/updates
  - POST /api/admin/incidents/:id/resolve

### 43.2 Flag Change Requests `flag-change-requests`

- **Tables:** `Platform.FlagChangeRequests`, `Platform.FlagChangeRequestApprovers`, `Platform.FlagChangeRequestComments`, `Platform.FlagScheduledChanges`
- **Audit trigger:** present on all tables
- **Template:** `admin/change-requests` — `template/src/3B-flags.html`
- **Pages:** `/admin/change-requests` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/flag-change-requests?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/flag-change-requests/:id`: detail
  - `POST /api/admin/flag-change-requests`: create (draft)
  - `PATCH /api/admin/flag-change-requests/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/flag-change-requests/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/flag-change-requests/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/flag-change-requests/:id/approve|reject|apply|schedule
- **Business rules:** Applied changes write FlagAuditLogs.
- **Depends on:** `feature-flags` (phase 39)

### 43.3 Privacy Requests `privacy-requests`

- **Tables:** `Platform.PrivacyRequests`
- **Audit trigger:** present on all tables
- **Template:** `admin/security` — `template/src/3A-admin-plus.html`
- **Pages:** `/admin/security` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/privacy-requests?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/privacy-requests/:id`: detail
  - `POST /api/admin/privacy-requests`: create (draft)
  - `PATCH /api/admin/privacy-requests/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/privacy-requests/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/privacy-requests/:id/history`: audit trail (Company.AuditTrailEntries)
  - POST /api/admin/privacy-requests/:id/approve|fulfil (export/erase per policy)
- **Business rules:** Erasure respects legal retention of financial records.
- **Depends on:** `tenants` (phase 40)

### 43.4 Entitlement Change Log `entitlement-log`

- **Tables:** `Platform.EntitlementChangeLogs`
- **Audit trigger:** present on all tables
- **Template:** `admin/entitlements` — `template/src/3B-flags.html`
- **Pages:** `/admin/entitlements` (list/screen)
- **Permissions:** none: own data or Super Admin (portal-wide)
- **API:**
  - `GET /api/admin/entitlement-changes?search&status&page&pageSize&sort`: list → { items, total }
  - `GET /api/admin/entitlement-changes/:id`: detail
  - `POST /api/admin/entitlement-changes`: create (draft)
  - `PATCH /api/admin/entitlement-changes/:id`: update with rowVersion (409 when stale); drafts only
  - `DELETE /api/admin/entitlement-changes/:id`: drafts only; posted documents are reversed, never deleted
  - `GET /api/admin/entitlement-changes/:id/history`: audit trail (Company.AuditTrailEntries)
  - GET /api/admin/entitlement-changes?tenant (read-only)
- **Business rules:** Append-only.
- **Depends on:** `subscriptions` (phase 40)

## Tables that are not entities

| Table | Why |
|---|---|
| `Company.AuditTrailEntries` | audit log written by DB triggers (read through each entity's History tab and the Audit Trail screen) |
| `Company.AuditTrailSeals` | audit log integrity seals (system) |
| `Platform.PlatformAuditLogs` | platform audit log written by DB triggers |
| `Platform.FlagAuditLogs` | written by feature-flag changes |
| `Inventory.StockMovements` | stock ledger produced by posting documents |
| `Inventory.StockBalances` | stock balance maintained by posting |
| `Inventory.StockReservations` | maintained by sales order approval |
| `Company.CalculatorSettings` | UI utility (topbar calculator), per user |
| `Company.CalculatorTapeLines` | UI utility (topbar calculator), per user |
| `Platform.PlatformDocumentCounters` | platform numbering counters (system) |
| `Platform.JobQueueSamples` | system health telemetry |
| `Platform.FlagDailyEvaluations` | flag evaluation telemetry |
| `Platform.FlagCodeReferences` | flag code-reference scan results (system) |
| `Platform.PlatformAdmin` | Super Admin login table: already implemented (single row) |
| `Platform.ErrorCodes` | error catalogue: built in Phase 0 (foundation); each phase adds its codes via SQL |
| `Platform.ErrorLogs` | append-only error log written by the API exception filter (Phase 0) |
| `Platform.PlatformStaff` | not used: the Super Admin portal has exactly one user |
| `Platform.PlatformStaffRoles` | not used: no platform staff roles |
| `Platform.PlatformStaffRolePermissions` | not used: no platform staff roles |
| `Platform.PlatformStaffSessions` | not used: no platform staff |
| `Platform.PlatformStaffTenantScopes` | not used: no platform staff |
