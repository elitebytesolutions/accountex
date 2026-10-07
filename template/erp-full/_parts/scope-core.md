## Core: company, users & access, approvals, collaboration, numbering, notifications, audit, import, backup, integrations (Full)

**Screens (24):**
- **Entry:** `login`, `login/forgot`, `login/mfa`, `chooser`, `mobile`
- **Workspace:** `app/dashboard`, `app/today`, `app/approvals`, `app/setup`, `app/activity`, `app/notifications`, `app/profile`, `app/import`
- **Settings:** `app/settings` (+ `/approvals`, `/audit`, `/backup`, `/integrations`, `/roles`, `/templates`, `/users`)
- **Utility:** `app/states`, `app/404`, `app/unauthorized`
- Report Studio (`app/reports/studio` + built-in studios) is described at the end.

**Schema:** `Company` (`02-core.sql`): 56 tables (the 23 Basic tables + 33 Full-only), plus the monthly audit partitions. `Reports` (`14-rpt.sql`): 5 tables.

Everything in the Basic core section applies unchanged (Basic ⊂ Full). Full adds the following.

### Company & branches (additions)
- **HR & Payroll tab:**
  - pay day rule, cut-off, working-days basis, EOBI employer amount, PF %, automatic salary tax u/s 149, payslips published to ESS;
  - attendance policy: working week, grace minutes, late marks per leave, half-day threshold, overtime 1.5× / 2×, attendance source (ZKTeco + ESS), and the ESS geofence (branch lat/long + radius, default 200 m).
- **Tax tab:** FBR POS / Digital Invoicing real-time reporting and FBR number + QR on invoices.
- **Multi-currency:** daily rates in `Company.ExchangeRates` (SBP feed or manual).
- **Branch manager:** can be an employee (`HumanResources.Employees`). The branch headcount comes from HR.

### Users & access (additions)
- **Invites (`UserInvites`):** channels Email/WhatsApp, role, branch, linked employee. They expire after 7 days and can be resent (with a cool-down), have their link copied, or be revoked.
- **Users linked to employees** (`Users.employeeId`) keep HR, payroll, ESS and access in sync. The role is suggested from the job title.
- **Extra MFA factors (`UserMfaMethods`):** SMS fallback, WebAuthn and mobile biometrics. **Trusted devices (`TrustedDevices`)** have a 30-day MFA skip, a push token and Face ID unlock.
- **Role data limits (`RoleLimits`):** max voucher amount a member may approve, max discount %, back-dated posting window (0/3/7/30 days/any open period), and salary visibility (hidden / masked except own / full).
- **Segregation of duties (`SegregationOfDutiesRules`):** create+approve and create+post pairs on financial resources, and create users + edit roles (privilege escalation). Rules are WARN or BLOCK, and the Owner is exempt. The matrix shows live conflicts with a one-click fix.

### Approvals engine
- **Workflows (`ApprovalWorkflows`):**
  - subjects: vouchers, vendor payments, bills, POs, expense claims, leave, payroll runs, credit overrides, sales orders, stock adjustments, loans;
  - AND-ed conditions (amount, doc type, branch, department …);
  - ordered steps: approver = role / specific user / preparer's line manager, optional "only above amount", SLA hours with escalate / remind, any-one / all mode, no self-approval, delegation when on leave, comment required;
  - outcome AUTO_POST or MARK_APPROVED; rejection returns the document to the preparer; notifications in-app / email / WhatsApp;
  - lifecycle DRAFT → ACTIVE (published, versioned) ⇄ INACTIVE.
- **Requests (`Approvals`):** at most one PENDING per document, with an SLA deadline per step. `ApprovalActions` is an append-only log: SUBMIT / APPROVE / REJECT / REQUEST_CHANGES / DELEGATE / ESCALATE / REMIND / AUTO_SKIP, with bulk approve. `ApprovalDelegations` holds standing delegations.
- **Approvals Inbox:** KPIs, type filters, chain, comments, @mentions, keyboard shortcuts, bulk approve. The same data feeds Today's approvals queue, the dashboard card and the Owner mobile app (swipe to approve).

### Collaboration & workspace
- **Activity feed:**
  - `ActivityEvents` holds system events on documents and user posts with module, amount and status card;
  - `comment` holds replies and document threads;
  - `mention` holds @mentions, which feed the "Mentions" tab and notifications;
  - `reaction` holds 👍 / 🎉;
  - attachments are on posts and comments;
  - tags: `tag`, `TaggedRecords`.
- **Today's Work:**
  - `task` holds tasks, meetings and reminders with module, assignee, due date/time, priority, repeat and reminder. Overdue is derived.
  - Plus the approvals queue, items due today (invoices, bills, maturing cheques) and the business calculator.
- **Business calculator:**
  - tape with CALC / GST / UNITS / TOTAL lines, grand total, memory;
  - rounding none/1/5/10, lakh or international grouping, GST rate, amount in words in English/Urdu;
  - tax calculator: GST 18%, WHT 153(1)(a), further tax, PRA;
  - optional server sync in `CalculatorTapeLines` / `CalculatorSettings` (today it is browser-only).
- **Setup Guide:** 9 weighted steps (profile, COA, opening balances, items, bank, tax & FBR, team, first invoice, payroll), marked manually or auto-detected (`SetupGuideSteps`).
- **Data Import:** five-step wizard for customers, vendors, items, opening balances, employees and the COA, from Excel/CSV (Tally / QuickBooks / Peachtree). Files are ≤ 10 MB.
  - Column auto-map with confidence %.
  - Row validation (NTN `1234567-8`, CNIC `12345-1234567-1`, numbers, duplicates) with inline fix or "skip error rows".
  - Results: created / updated / skipped (`DataImports` IMP-YYYY-NNNN, `DataImportErrors`).

### Settings (Full)
- **Document templates (`DocumentTemplates`):** invoice, voucher, payslip and HR letter layouts. Settings cover paper (A4/A5/thermal 80 mm/Letter), header layout, English or English + Urdu, show/hide NTN-STRN, FBR QR, HS codes, item images, amount in words, bank details, plus merge fields and versioning. There is one default per category/doc type/letter kind.
- **Integrations (`integration`):**
  - FBR IRIS/POS, bank feeds (per bank account), ZKTeco, Google Workspace / Microsoft 365 SSO, WhatsApp Business, SMTP, Daraz, Shopify;
  - status CONNECTED / NOT_CONNECTED / REAUTH_NEEDED / ERROR / DISABLED; last sync;
  - secrets live only in the vault (`secretRef`).
- **API keys (`ApiKeys`):** scoped (reports:read, accounting/sales/inventory:write, hr/payroll:read), shown once and stored as a hash. They take an expiry (90 days / 1 year / never) and an IP allow-list.
- **Webhooks (`IntegrationWebhooks`, `IntegrationWebhookDeliveries`):** HMAC-SHA256 signed, with success rate and health.
- **Backup & restore:**
  - `BackupSettings`: daily / 12-hourly / weekly at a set time; keeps daily snapshots 14/35/90 days and monthly snapshots 12/24 months; attachments included; owner emailed on failure; optional Google Drive copy.
  - `Backups`: scheduled / manual / monthly / year-end / safety snapshots, AES-256, stored in Karachi + Singapore. Year-end snapshots are locked.
  - Per-module CSV/Excel export.
  - `BackupRestoreRequests`: requires a reason, the company code typed to confirm, and an automatic safety backup. Only one restore can be open at a time. It signs everyone out (~15 min).
- **Notification preferences** per event × channel (`NotificationPreferences`), including a minimum amount for SMS and a daily digest.

### Mobile apps
- **Employee app:** geofenced face + GPS check-in, leave, corrections, advances, OCR receipt scan, payslips.
- **Owner app:** cash, swipe approvals, receivables with WhatsApp reminders.
- Both use the same tables. Devices are registered in `TrustedDevices` (push token, biometric unlock). Actions queued offline sync later as normal writes.

### Report Studio (`Reports`)
- **`SavedReports`:**
  - CUSTOM reports are built over a source: sales invoices, vendor bills, GL transactions, customers, stock movements, payroll lines.
  - PRESET reports are saved views of the six built-in studios (Financial, Inventory, Receivables, Payables, Payroll, HR) with tab, view mode, options and filters.
  - Both carry a date range, filters, group-by, sort, limit (Top N / all), totals row, table/chart (bar/line/donut), folder, visibility (only me / shared with roles or users / everyone) and the owner's favourite star.
- **`SavedReportColumns`:** selected columns with aggregate and format.
- **`SavedReportShares`:** roles or users, view or edit.
- **`ReportSchedules`:** daily / weekly / monthly / quarterly at a set time, XLSX/PDF/CSV, recipients (emails and users), "only if rows" for alert reports such as Minus Stock, ACTIVE/PAUSED, next and last run.
- **`ReportRuns`:** every generation (manual / scheduled / API), with format, parameters snapshot, row count and output file. It feeds the Reports Centre's *Recent runs*. Report data always comes from live views; nothing is stored as report rows.
