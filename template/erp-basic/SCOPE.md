# Finsoft ERP — Product Scope (Basic edition)

> **Edition:** Basic — the core ERP: the smallest complete product a trading SME can run its books, bank & cash, sales, purchases and stock on.
> **Companion files:** `database/` (PostgreSQL 16 schema), `entities/` (page → entity map, one section per screen), `POSTING_RULES.md`, `erd/index.html` (interactive ERD).
> **Sister edition:** `../erp-full/` — every prototype screen (195). Basic is a strict subset of Full: same tables, same columns, so a Basic tenant upgrades to Full with additive DDL only.
> **Source of truth:** the Finsoft HTML prototype screens (`finsofthtml/src`).

## 1. Product summary
Finsoft Basic gives a Pakistani trading business a correct double-entry ledger, bank and cheque management, a cash book, FBR-ready sales and purchase invoicing (GST, further tax, WHT), customer and vendor balances with ageing, and batch/expiry-aware stock across warehouses and shops — multi-branch, multi-user, in PKR on a July–June fiscal year.

**Goals**
1. Every financial document posts a balanced, immutable journal; closed periods reject postings.
2. Every stock quantity comes from an append-only stock ledger (batch + expiry + location) valued at moving weighted-average cost.
3. Pakistan tax identity and rates out of the box (NTN, STRN, CNIC, ATL; GST 18%, further tax 4%, WHT 153).
4. Safe multi-tenancy with row-level security.

## 2. Portals & personas
| Portal | Basic routes | Users |
|---|---|---|
| Platform console | `admin/dashboard`, `admin/tenants`, `admin/tenants/new`, `admin/tenants/view`, `admin/plans`, `admin/subscriptions`, `admin/templates`, `admin/staff`, `admin/audit` | Finsoft staff |
| Tenant app | ~43 screens across settings, accounting, bank & cash, tax codes, sales, purchases, inventory and reports | Owner, Finance Manager, Accountant, Sales, Procurement, Storekeeper, Auditor |
| Entry | `login`, `login/forgot`, `login/mfa`, `app/404`, `app/unauthorized` | everyone |

## 3. Module map
| # | Module (schema) | Basic screens | Basic tables | Section |
|---|---|---|---|---|
| 1 | Platform (minimal) (`Platform`) | 9 | 10 | §8.1 |
| 2 | Auth, settings, users & roles (`Company`) | 12 | 23 | §8.2 |
| 3 | Accounting (`Accounting`) + financial reports | 7 + 6 | 8 | §8.3 |
| 4 | Bank & cash (`BankCash`) | 6 | 11 | §8.4 |
| 5 | Tax codes (`Tax`) | 1 | 2 | §8.5 |
| 6 | Sales & receivables (`Sales`) | 11 | 16 | §8.6 |
| 7 | Purchases & payables (`Purchases`) | 10 | 13 | §8.7 |
| 8 | Inventory (`Inventory`) | 11 | 19 | §8.8 |

## 4. Cross-cutting
- **Multi-tenant** shared schema; `tenantId` + composite FKs + RLS on every tenant table.
- **Multi-branch** documents and users; **multi-warehouse** stock with bins and batches.
- **Numbering** via `Company.DocumentTypes` → `Company.NumberingSeries` → `Company.getNextDocNo()` (row-locked).
- **RBAC** with the Roles matrix (`<resource>:<action>`, View/Create/Edit/Approve/Post/Delete/Export).
- **Audit trail** with field-level before/after values.
- **Posting integrity:** balanced on post, immutable once posted, reversal instead of edit, open period + books lock date.
- Attachments and notifications.

## 5. Not in Basic (available in Full)
Approval workflows engine, recurring vouchers, bank reconciliation & rules, bulk cheque vouchers, petty cash, expense claims, fixed assets, budgets, year-end close wizard, cost-centre projects & allocation, GST/WHT returns and FBR POS integration, POS counter, delivery challans, sales/purchase returns screens, price-list schemes, credit control, payment reminders, recurring invoices, landed cost, kits, barcode labels, stock counts, stock vouchers, demand & reorder, wholesale & distribution, HR, payroll, ESS, Report Studio, the SaaS growth/billing console and feature flags.

## 6. Release plan
Basic = Full's phases P1 (Foundation), P2 (Finance core) and P3 (Trade & stock). See `../erp-full/SCOPE.md` §7.

## 7. Decisions & gaps
- One `Sales.SalesInvoices` table for standard invoices (`INV-`) and the counter Sales Voucher (`SV-`); one `Purchases.VendorBills` table for bills (`BILL-`) and the Purchase Voucher (`PV-`).
- Sales Voucher team members (booker, salesman, …) are free text in Basic (no HR module); Full adds employee FKs.
- Transfers use `TRF-YYYY-NNNNNN` (the prototype showed TR- and TRF-).
- Credit-limit breaches block posting in Basic (overrides are a Full feature).
- Moving weighted-average cost; FEFO batch picking.

## Naming, enumerations and the data-access API
These rules apply to every object (details: `database/CONTRACT.md`, per-module tables: `database/NAMING.md`).

**Readable names, no underscores.** Schemas use full module names (`Accounting`, `FixedAssets`, `BankCash`, `HumanResources`, `EmployeeSelfService`, `Reports`), tables are PascalCase plurals named after the screen that shows them (`Sales.SalesInvoices`, `Company.UserRoles`, `Inventory.Products`), columns are camelCase (`customerId`, `docNo`). In SQL every mixed-case name is double-quoted: `SELECT i."docNo" FROM "Sales"."SalesInvoices" i`.

**One table for every list of values.** There are no hard-coded `CHECK (status IN (...))` lists. Every status, type, reason and category lives in `Lookups.Lookups` (code, readable label, Urdu label, badge tone, order); `Lookups.LookupColumns` records which column uses which list, and one generic trigger validates every write. Business lists (reasons, categories, payment terms) accept tenant-specific values; dependent lists (account sub-type per account class, cheque status per direction) use `parentCodes`. Screens fill dropdowns with `Lookups.getLookups('<list>')`.

**One function per entity for saving, one for reading, one per screen button.**

| Function | Screen button | What it does | Status after |
|---|---|---|---|
| `Sales.salesInvoiceAddUpdate(payload)` | Save / Save Draft | inserts (no id) or updates (id) the header and its lines; only while DRAFT | DRAFT |
| `Sales.getSalesInvoiceInfo(id)` | open the record | the invoice, its lines, labels and badge tones of its lists | — |
| `Sales.salesInvoiceApprove(id, comment)` | Approve | records the approval (the preparer can't approve their own) | APPROVED |
| `Sales.salesInvoicePost(id)` | Post | runs the posting hook (journal + stock), locks the record; posting twice does nothing | POSTED |
| `Sales.salesInvoiceVoid(id, reason)` | Void | reverses the posting (journal + stock), keeps the number | VOID |

Save functions never change a document's status and never touch posted records; actions never take field values. The posting itself (which accounts, which stock) lives in the module posting hooks (`database/api/*-posting.sql`, e.g. `Sales.salesInvoicePostEntries`) and follows `POSTING_RULES.md`. The application's database role can only read and execute functions — it cannot insert, update or delete table rows directly — so every write passes the same validation, numbering, tenant and audit rules.

## 8. Module scope
### Platform Admin (SaaS console) — Basic

**Portal & personas.** The Finsoft Cloud console (`admin/*`) is used by Finsoft staff only: Super Admin, Support Lead, Support Agent, Billing, Engineer. It works across all tenants and runs without a tenant context (schema `Platform`, no RLS, role `finsoftPlatform`).

**Screens (9).** Platform Overview (`admin/dashboard`), All Tenants, Onboard Tenant, Tenant 360, Plans & Pricing, Subscriptions, Templates, Platform Team, Platform Audit Log.

#### Features
- **Tenant registry.** Code (4–10 characters, permanent, unique), subdomain `<code>.finsoft.pk`, legal identity (NTN, STRN, SECP #), industry, city/province, configuration (fiscal-year start Jul/Jan/Apr, PKR, Asia/Karachi, number/date format, data residency PK-Lahore or UAE-Dubai), COA template, MFA / SSO flags, health score, account manager.
- **Onboarding wizard** (5 steps). Company & legal → plan & modules (12 module codes; add-ons) → first administrator (tenant owner, invite valid 72 h) → configuration → review & provision. Provisioning creates the tenant's company, branch, owner user, chart of accounts (copied from `ChartOfAccountsTemplateAccounts`), FY 2026-27 with 12 periods, Pakistani tax codes and number series (`{PREFIX}-{YYYY}-{SEQ6}`, yearly reset).
- **Tenant list and Tenant 360.** Views (at risk, trials ending, past due, enterprise), filters by plan, status, region and city, MRR, seats used vs bought, modules. Bulk extend trial, change plan, send notice, suspend. Tenant 360 adds impersonation (recorded in the audit log), plan change with proration, data export, suspend/reactivate, and tenant user admin (invite, MFA reset, password reset, deactivate).
- **Plans & pricing.** Starter Rs 9,999 · Growth Rs 24,999 · Business Rs 49,999 · Enterprise (custom, list 180,000) per month; annual = 2 months free; seats, storage, trial 14/30 days, plan × module matrix (Included / Add-on with price / Not available).
- **Subscriptions.** Monthly / annual cycle, amount, seats, period, next renewal, payment method (card, JazzCash, Easypaisa, Raast, bank transfer, direct debit, invoice), auto-renew. KPIs: MRR, annual share, renewals due in 30 days, past due.
- **COA templates.** Versioned (v2026.2), 4-level tree with Dr/Cr nature and default account roles.
- **Platform team.** Staff, role, 2FA type, tenant scope, status.
- **Platform audit log.** Append-only, 7-year retention, actor/tenant/period filters, CSV export.

#### Business rules
- One live subscription per tenant (TRIAL / ACTIVE / PAST_DUE / SUSPENDED).
- Plan price changes apply to new subscriptions and renewals only. Existing tenants are grandfathered.
- Tenant code and subdomain are unique and never change.
- Exactly one primary OWNER contact per tenant. The owner user cannot be deactivated (transfer ownership first).
- Suspending a tenant signs all its users out. Data is retained, and scheduled jobs (payroll, recurring vouchers) pause until reactivation.
- Impersonation requires a reason, is time-boxed (30/60 min), read-only by default and visible to the tenant. Start and end are written to `Platform.PlatformAuditLogs`.
- An active staff member must have a password hash (or SSO). Every console action is audited, and the audit log rejects UPDATE/DELETE.
- Subscription changes are field-audited into `Company.AuditTrailEntries` (generic trigger).

#### Statuses
- Tenant: PROVISIONING → TRIAL → ACTIVE ⇄ PAST_DUE → READ_ONLY → SUSPENDED → CHURNED.
- Subscription: TRIAL → ACTIVE ⇄ PAST_DUE → SUSPENDED → CANCELLED / EXPIRED.
- Plan: ACTIVE / RETIRED. COA template: DRAFT → PUBLISHED → DEFAULT → RETIRED. Staff: INVITED → ACTIVE → SUSPENDED / DISABLED.
- Audit result: SUCCESS / FAILED / BLOCKED / RECORDED.

#### Integrations
- FBR Active Taxpayer List lookup for NTN/STRN at onboarding **[simulated]**.
- Transactional email for invitations and notices (`no-reply@finsoft.pk`).
- DNS/TLS for `<code>.finsoft.pk` at provisioning.

#### Not in Basic (Full only)
SaaS analytics, leads CRM, partners & coupons, platform invoices, payments and dunning, usage & quotas, feature management (flags, segments, entitlements, change requests), support tickets, announcements, communications, system health, status & incidents, security & privacy, API keys & webhooks, tax master, master seed lists, role-permission matrix, tenant notes.


### Core: company, users & access, numbering, notifications, audit (Basic)

**Screens:** `login` · `login/forgot` · `login/mfa` · `app/dashboard` · `app/settings` · `app/settings/users` · `app/settings/roles` · `app/settings/audit` · `app/notifications` · `app/profile` · `app/unauthorized` · `app/404`
**Schema:** `Company` (`02-core.sql`): 23 tables (3 global reference + `PostingRoles` lookup + 19 tenant), plus the monthly audit partitions.

#### Company & branches
- One `CompanySettings` per tenant. It holds the legal identity (legal/trading name, SECP no., NTN `1234567-8`, STRN, address, province, industry, legal structure, logo) and:
  - **finance defaults:** fiscal year start (July default; Jan/Apr allowed), base currency PKR, decimals, Western / South-Asian number format, multi-currency switch, cost-centre-required switch, future-period posting switch;
  - **books lock date:** no journal may be dated on or before it (`Company.getBooksLockDate()` is used by every posting guard);
  - **sales / purchase defaults:** terms, quotation validity, default GST code, credit-limit action BLOCK_OVERRIDE / WARN / ALLOW, overdue tolerance, 90-day block, 3-way-match tolerance, bill approval threshold, stock-adjustment approval threshold (Rs 25,000), PO-before-bill, WHT 153 auto-deduction, partial GRN, duplicate vendor-invoice warning;
  - **tax registration:** GST registered, return period, 18% standard rate, 4% further tax, provincial services tax (PRA/SRB/KPRA/BRA/ICT), ATL status;
  - **branding:** colours, document font (Inter / Noto Nastaliq Urdu), paper size, email footer.
- Anything not fixed goes in `CompanySettingValues` (typed key/value per settings tab).
- **Branches:** code (LHR/KHI/ISB/FSD/MUL), name, head office / default flag, manager, address, province, sales-tax authority, ACTIVE/INACTIVE, opening date. The branch code is the `{BR}` numbering token and the unit of branch-wise access and reporting.
- **Default account mapping:** one GL account per posting role (`Company.PostingRoles`, 74 seeded roles). The settings screen shows 12 of them (AR/AP control, revenue, returns, output/input GST, WHT payable, salaries payable, default bank, retained earnings, rounding, FX). The rest (inventory, COGS, GRNI, shrinkage, cheques in hand …) are mapped from the COA template at onboarding.

#### Users, roles and access
- **Sign-in:** company code + work email + password, or Google / Microsoft SSO.
  - MFA uses an authenticator app (TOTP) or SMS, plus 10 recovery codes.
  - "Remember me" and "Trust this device" each last 30 days.
  - Five failed attempts lock the account. Users can be restricted by IP allow-list and login hours (any / business / custom). Session timeout is 15 min – 12 h.
- **User status:** INVITED → ACTIVE ⇄ SUSPENDED → REMOVED (soft delete).
  - Suspending a user revokes every session, and you cannot suspend yourself.
  - Invites (email/WhatsApp) and password resets are single-use hashed tokens: 7 days for an invite, 30 minutes for a reset.
- **RBAC:** role × permission. The permission catalogue is the matrix of ~38 resources (coa, vch, sinv, bill, item, usr, rol …) × actions **V**iew / **C**reate / **E**dit / **A**pprove / **P**ost / **D**elete / e**X**port, coded `resource:action` (e.g. `sinv:post`).
  - The system roles are Owner, Finance Manager, Accountant, HR Manager, Payroll Officer, Sales Executive, Storekeeper and Auditor (read-only). They can be copied but not deleted.
  - A role is either branch-restricted or company-wide.
- **Per-user access:** branches, warehouses, module switches, a data scope of OWN / BRANCH / ALL, and an approval limit (the largest single voucher the user may approve).
- **Effective permissions:** the union of the user's roles (`Company.getUserEffectivePermissions`). A missing permission shows *No access* with "Request access", which sends a notification to an admin.

#### Document numbering
- `NumberingSeries` holds one series per doc type, optionally per branch. Each series has a prefix, a pattern (`{PREFIX}-{YYYY}-{SEQ6}`; tokens `{YYYY} {YY} {MM} {BR} {SEQn}`), padding, a start value and a reset policy (NEVER / YEARLY / MONTHLY).
- `Company.getNextDocNo()` takes the branch series first, else the tenant-wide one. It increments `NumberingSeriesCounters` under a row lock, so numbers are never MAX+1 and two concurrent posts can never share a number.
- Numbers are assigned **at post** for posting documents and at save for masters (see the posting rules).

#### Notifications
- In-app inbox with categories APPROVALS / FINANCE / HR / SYSTEM. Each notification has unread/read state, a needs-action flag, a mention flag, and a deep link to the document.
- Per-user channels: in-app, daily email digest (08:00), SMS above an amount, WhatsApp. Users pick the events they subscribe to (approvals assigned, rejected documents, bank alerts, credit breaches, daily cash, tax due).

#### Audit trail
- `Company.AuditTrailEntries` is append-only and partitioned by month (DEFAULT partition + `Company.ensureAuditTrailPartitions()`).
  - Generic triggers record INSERT/UPDATE/DELETE with field-level before/after.
  - The API records LOGIN, LOGIN_FAILED, POST, APPROVE, REJECT, VOID, REVERSE, PERMISSION, EXPORT, PASSWORD_RESET, MFA_RESET and SESSION_REVOKED, with IP, device and session.
  - Secrets (password hash, MFA seed) are redacted.
- Each entry carries a SHA-256 `entryHash`. `Company.sealAuditTrailBlock()` chains entries into sealed blocks (`Company.AuditTrailSeals`), and "Verify chain" recomputes them. No UPDATE/DELETE path exists.

#### Dashboard
Read-only views over the ledgers (`core.vDash*`): cash & bank balance, monthly revenue and expenses, money flow, recent transactions.


### Accounting (acc)

**Screens.** Chart of Accounts · Account Ledger · Opening Balances · Voucher Register · New Voucher · Voucher Detail · Fiscal Years & Periods · financial reports (TB, P&L, Balance Sheet, General Ledger, Day Book, Reports Centre — views only).

**Features.**
- **Chart of accounts**: 4 levels — class (`1000`), header (`1100`), group (`1120`), postable (`1120-01`); classes 1 Assets (Dr), 2 Liabilities (Cr), 3 Equity (Cr), 4 Income (Cr), 5 Expenses (Dr). Codes are auto-suggested under the parent and immutable. Account type (sub-type) per class: Cash, Bank, Receivable, Inventory, Prepayment, Fixed asset, Deposit · Payable, Accrual, Tax, Statutory, Borrowing · Capital, Reserve, Drawings · Sales, Other income, Finance income · Cost of sales, Employee cost, Premises, Depreciation, General expense, Finance cost, Taxation. Nature defaults from the class but can be flipped for contra accounts. Optional branch restriction. Tree, map view, inspector, bulk activate/deactivate/move/delete.
- **Single ledger**: one journal for every manual voucher type (JV, CPV, CRV, BPV, BRV, Contra, Opening) and every system posting from sales, purchases, inventory, treasury and tax. Lines carry account, particulars, cost centre, branch and an optional customer/vendor sub-ledger party.
- **Voucher entry**: one-sided cash/bank vouchers add the cash/bank leg automatically; instrument type, cheque no/date and payee for bank vouchers; department, reference, prepared/approved by, tags, comments, attachments; JV auto-reverse date; 300-character narration.
- **Numbering**: `JV-2026-000045` tenant-wide or branch cash series `CPV-LHR-0621`, from `Company.NumberingSeries` (row-locked, never MAX+1).
- **Opening balances**: opening trial balance per fiscal year with CSV import (replace / add / skip), difference parked in a suspense account, posted as one OB journal.
- **Fiscal periods**: fiscal years (default 01 Jul – 30 Jun, label `FY 2026-27`) with 12 monthly periods (`SEP-2026`) and an optional P13 adjustment period; periods OPEN → CLOSED → LOCKED; no overlaps.
- **Cost centres**: simple hierarchy (`CC-110`) tagged on lines.

**Key business rules.**
- Only postable, active accounts take entries; header/group balances are roll-ups.
- A voucher posts only when balanced with ≥ 2 lines, in an OPEN period, after the company books lock date.
- Posted vouchers are immutable; a reversal posts a mirror voucher and marks the original REVERSED (reasons: incorrect amount, wrong account, duplicate entry, wrong period, other).
- A period cannot close while draft or pending vouchers are dated in it.
- An account cannot be deleted while it has sub-accounts or postings; it can be deactivated.

**Statuses.** Voucher DRAFT → PENDING_APPROVAL → POSTED → REVERSED · Opening batch DRAFT → POSTED · Period OPEN / CLOSED / LOCKED · Year OPEN / CLOSED (+ locked) · Account ACTIVE / INACTIVE.

**Not in Basic** (Full): cost-centre owners/budgets, projects, allocation rules, recurring templates, module-level period locks, audited reopen requests, year-end close wizard, budgets and budget vs actual, saved ledger views, voucher activity log and multi-step approvals, cash flow statement, Report Studio.


### Bank & Cash (treasury) — Basic

**Screens (6).** Bank Accounts (`app/bank/accounts`), Bank Transactions (`app/bank/transactions`), Receive & Issue Cheques (`app/bank/cheques`), Cheque Register & PDC (`app/bank/cheque-register`), Bank Book (`app/bank/book`), Cash Book (`app/cash/book`).

**Tables (11).** `BankCash.Banks`, `BankAccounts`, `CashAccounts`, `CashCategories`†, `cheque`, `ChequeAllocations`, `ChequeBounces`*, `BankTransactions`, `CashBookEntries`†, `CashDayCloses`*, `CashDayCloseDenominations`*.
† helper table not in the contract registry. * registry lists it as Full; it is in Basic because a Basic screen uses it (bounce modal, Cash Count / close day).

#### Features
- **Bank accounts.** Our accounts at Meezan, HBL, UBL, Bank Alfalah, Bank Al Habib, MCB, Allied and others. Each has a type (Current, Savings / PLS, Running finance with limit, Foreign currency), a title, an account number, an IBAN, a bank branch, an owning branch and an opening balance. Each is linked 1:1 to a GL account under 1120. A purpose tag (Primary, Collections, Vendor payments, Payroll) and a payroll-disbursement flag are kept. Statement import is enabled per account, with a CSV / Excel / MT940 format.
- **Book vs statement.** Book balance comes from the GL. Statement balance and "reconciled to" are kept on the account and drive the open-items badge.
- **Bank transactions.** Each bank voucher leg and each imported statement line is a `BankTransactions` with a mode (Cash, Card, IBFT, RAAST, Bank transfer, Debit card, Cheque). Unbooked statement lines can be categorised as Bank charges, Profit on deposit, Markup expense, Customer receipt or Vendor payment; categorising posts the voucher.
- **Cheques.** Received and issued cheques, including post-dated ones. Each cheque carries:
  - the cheque no., party, drawee bank and deposit / issue account;
  - the cheque, due and received dates and the amount;
  - a PDC flag and a posting mode (Deposit, Hold as PDC, Clear on deposit);
  - allocation against invoices or bills.

  Lifecycle actions: Deposit, Clear, Bounce (reason, bank charges, recovery from customer, notify owner, credit hold), Re-present, Replace, Stop and Reverse. A PDC maturity calendar and register show the cheques due.
- **Cash Book quick entry.** Cash In / Cash Out, Bank Only, Transfer and Cheque modes post CRV / CPV / BRV / BPV / contra JV in one step. Each entry records:
  - date and time;
  - party (free text or picked customer / vendor);
  - category (with a default contra account);
  - payment mode, reference, narration and an attachment.
- **Daily cash count.** Count the denominations (5,000 … 10, plus coins), compare with the book balance and close the day. Any variance posts to Cash over / short, and a locked day is read-only.
- **Books.** The Cash Book and Bank Book are running-balance views over the journal.

#### Business rules
- Every bank and cash account maps to exactly one GL account. Money truth is always `Accounting.VoucherLines`.
- A received cheque is unique per drawee bank + cheque no. + customer. An issued leaf is unique per bank account.
- Cheque status follows its direction and only moves along the allowed transitions (trigger `triggerChequeStatusGuard`). Each status requires its date (depositedOn, clearedOn, bouncedOn, stoppedOn).
- Issued cheques require the issuing bank account. A HOLD_PDC posting mode requires the PDC flag.
- A bank line has exactly one of deposit / withdrawal. An UNCATEGORISED line has no voucher; every other status has one.
- Transfers need different from / to accounts. The payment mode must fit the entry kind (cash: Cash/Card; bank: IBFT/RAAST/Bank transfer/Debit card; cheque: Cheque).
- A day close is unique per cash account and date. A LOCKED close with a variance must have its variance JV, and it can only be reopened, not edited.
- One PRIMARY bank account per tenant. Running finance accounts need a limit.

#### Statuses
- Cheque (received): IN_HAND → DEPOSITED → CLEARED; BOUNCED; CANCELLED; REPLACED.
- Cheque (issued): ISSUED → PRESENTED → CLEARED; BOUNCED; STOPPED; CANCELLED; REPLACED.
- Bank transaction: UNCATEGORISED, PENDING, UNPRESENTED, UNCLEARED, CLEARED, RECONCILED.
- Cash day close: COUNTED → LOCKED → REOPENED.
- Bank account: ACTIVE, DORMANT, CLOSED.

#### Integrations
Bank statement files (bank CSV, Excel, MT940); Raast / IBFT references in descriptions.

#### Doc types
CHQ (cheque voucher). Cash-book vouchers use the accounting types CRV / CPV / BRV / BPV / CON / JV.


### Tax — Basic

**Screens (1).** Tax Codes (`app/tax/codes`).

**Tables (2).** `Tax.TaxCodes`, `Tax.TaxCodeRates`. Function `Tax.getTaxRateOnDate(taxCodeId, date, isAtl)`.

#### Features
- **Tax code catalogue.** Covers:
  - Sales tax: standard 18%, zero-rated, exempt, reduced (Eighth Schedule), further tax 4% to unregistered buyers.
  - Income tax withholding: 153(1)(a) goods with a non-ATL double rate, 153(1)(b) services, 153(1)(c) contracts, 149 salary (slab), 155 rent.
  - Advance tax collection: 236G distributors, 236H retailers.
- **Code attributes.** Each code has a type (Sales tax / Withholding / Collection) and applies to sales, purchases, vendor payments, customer receipts or payroll. It also carries the tax (payable) and input (recoverable) GL accounts, the FBR legal reference, the WHT section and nature, "calculate on amount excluding sales tax", "check ATL status before applying", and an active flag.
- **Effective-dated rates.** Each rate row has a filer rate, a non-ATL rate and the Finance Act reference, so a rate change keeps history (e.g. Finance Act 2026, effective 01 Jul 2026).
- **Rate lookup on documents.** Documents snapshot the rate from `Tax.getTaxRateOnDate` into their `taxRate`.

#### Business rules
- Code unique per tenant. Sales-tax codes carry a sales-tax kind. Withholding and collection codes carry a WHT section.
- Every code except exempt ones (rate basis NONE) must have a tax account.
- Rates 0–100%. A tax code's rate periods must not overlap (exclusion constraint). An open-ended period has `effectiveTo` NULL.
- A non-ATL rate applies only when the code checks ATL and the party (`Sales.Customers.atlStatus` / `Purchases.Vendors.atlStatus`) is not on the ATL.

#### Statuses
Active / inactive, soft delete.

#### Integrations
Reference rates from the platform tax master (`Platform.TemplateTaxCodes` at onboarding).


### Sales & Receivables (sales) — Basic

**Screens (11).** Customers (`app/customers`), Customer Detail (`app/customers/view`), Quotations (`app/sales/quotations`), Sales Orders (`app/sales/orders`), Sales Invoices (`app/sales/invoices`), New Invoice (`app/sales/invoices/new`), Invoice View (`app/sales/invoices/view`), Sales Voucher (`app/sales/voucher`), Credit Notes (`app/sales/credit-notes`), Receipts & Allocation (`app/receivables/receipts`), AR Ageing & Reports (`app/receivables/ageing`).

**Tables (16).** `Sales.CustomerGroups`, `customer`, `CustomerContacts`, `CustomerNotes`†, `PriceLists`, `PriceListItems`, `quotation`, `QuotationLines`, `SalesOrders`, `SalesOrderLines`, `invoice`, `SalesInvoiceLines`, `CreditNotes`, `CreditNoteLines`, `receipt`, `CustomerReceiptAllocations`.
† helper table that is not in the contract registry.

#### Features
- **Customer master.** Each customer records:
  - legal and display name, type (Company, Individual, Government, AOP), group, sales rep and branch;
  - FBR identity: NTN, CNIC, STRN, ATL status, sales-tax registered, further tax 4 %, WHT u/s 153 deducted (section and rate), GST exempt / zero-rated;
  - contact, billing and shipping address, area, city and province;
  - credit limit, payment terms and credit days, receivable account, price list, opening balance (as of), block-over-limit and auto-reminder flags;
  - a guarantor block (name, father, CNIC, phone, address) from Bhatti for credit customers.

  The detail page shows KPIs (balance, overdue, limit used, average days to pay), the invoice and receipt history, a running statement with print / PDF / e-mail, contacts and notes.
- **Pricing.** Price lists (code, markup on cost, rounding, default), assigned to customer groups and customers. Each item price is effective-dated.
- **Quotations.** Valid-till date, sales rep, branch and price list; send, remind, revise (new revision) and convert to a sales order with locked prices.
- **Sales orders.** Expected delivery, ship-from warehouse, customer PO ref, reserve-stock flag, line-level delivered and invoiced quantities, and credit hold. KPIs show open orders, value to deliver, value to invoice, late orders and on-time %.
- **Sales invoices (STANDARD).** The New Invoice form shows:
  - the credit check, bill-to / ship-to snapshot and payment terms with due date;
  - lines with item, description, HS code, qty, rate, disc % and tax code;
  - totals: GST, further tax 4 % for unregistered buyers, advance tax 236G / 236H, the FBR POS fee and a WHT u/s 153 estimate;
  - notes and terms, attachments, and a posting preview.

  Posting submits to FBR (IRN + QR), e-mails the PDF, can send a WhatsApp payment link and schedules an auto-reminder.
- **Sales Voucher (COUNTER).** Fast trade / counter entry. It is the same invoice table with `channel = 'COUNTER'` and doc type SV, and it carries:
  - SV no., tax invoice no., bill-book no., customer PO no. and date;
  - area and city, booker / deliveryman / salesman / supervisor, sale type, delivery slot;
  - a batch-wise grid with bonus;
  - Hold / Recall, Estimate, Print;
  - a split-tender Receive Payment modal (Cash, Card, Credit, JazzCash, Easypaisa) with cash tendered and change.
- **Credit notes.** Raised against an invoice. Reason: damaged, sales return, rate difference, short supply or other (with a note). Return warehouse, return qty capped at the invoiced qty, and treatment: apply to invoice, keep as customer credit, or refund. The flow is draft → approval → posting.
- **Receipts & allocation.** Methods IBFT, Cheque, Cash, RAAST, Card, JazzCash and Easypaisa, with deposit-to bank or cash account and reference. Each receipt records:
  - WHT deducted at source (section, certificate status / no.) and bank charges;
  - allocation to invoices, open credit notes or the opening balance, by hand or FIFO;
  - the unallocated remainder as a customer advance (optionally linked to a sales order).
- **AR reports.** Ageing (current, 1–30, 31–60, 61–90, 90+; by due or invoice date), sales register, customer statement, sales by customer and by item, and GST output (Annex-C).

#### Business rules
- **Tenancy and integrity.**
  - Every FK is tenant-composite.
  - Allocations, credit notes, override and reminder rows can only point to an invoice of the **same customer** (FK on `(tenantId, id, customerId)`).
  - Document numbers come from `Company.getNextDocNo`: QT, SO, INV, SV, CN, RCPT, and CUST for customers.
- **Arithmetic is enforced by CHECKs.**
  - Line: `baseQty = qtyCtn × ctnFactor + qtyLoose`; taxable = gross − discount; total = taxable + tax (+ further tax).
  - Invoice net = taxable + GST + further tax + advance tax + FBR fee.
  - Credit note total = value + GST + further tax.
  - Balances and the receipt's unallocated amount are generated columns, and none can go negative (no over-payment, over-application or over-allocation).
- **Settlement is automatic.**
  - Triggers recompute `paidAmount` and `creditAppliedAmount` and move the invoice POSTED → PARTIALLY_PAID → PAID.
  - They recompute credit-note `appliedAmount` (OPEN ↔ APPLIED) and receipt `allocatedAmount` (UNALLOCATED / PARTLY_ALLOCATED / ALLOCATED).
  - A bounced or voided receipt automatically re-opens what it settled.
- **Posted documents are immutable.**
  - Once an invoice leaves DRAFT, its customer, dates, terms, warehouse and amounts are frozen. A credit note is frozen once approved, and a receipt always is.
  - Lines are locked with their header. Posting may still set a line's cost and batch.
  - Corrections go through a credit note, VOID with a reversal journal, or a new receipt. Nothing is deleted.
- **Credit control (Basic).** Exposure = balance + new document. With `blockOverLimit`, posting above the limit is refused (Full adds approved overrides).
- **Tax.**
  - An unregistered buyer (no STRN) gets further tax 4 %. GST-exempt customers get exempt / zero-rated codes.
  - The WHT u/s 153 estimate is informational. Actual WHT is booked from the receipt.
  - Credit notes reverse output GST in the Sales Tax Return.
- **Derived, not stored:** customer balance / overdue / utilisation and the Near-limit / Overdue badges; invoice OVERDUE; sales-order LATE and fulfilment %.

#### Statuses
- Customer: ACTIVE · ON_HOLD (OVER_LIMIT / OVERDUE / BOUNCED_CHEQUE / MANUAL) · DISPUTED · INACTIVE (+ derived NEAR_LIMIT, OVERDUE).
- Quotation: DRAFT → SENT → ACCEPTED → CONVERTED · EXPIRED · CANCELLED.
- Sales order: DRAFT → CONFIRMED → PARTIALLY_DELIVERED → TO_INVOICE → INVOICED · ON_HOLD · CANCELLED (+ derived LATE).
- Invoice: DRAFT → POSTED ("Sent" when `sentAt`) → PARTIALLY_PAID → PAID · VOID (+ derived OVERDUE). FBR: NOT_REQUIRED / PENDING / POSTED / FAILED.
- Credit note: DRAFT → PENDING_APPROVAL → OPEN / APPLIED · CANCELLED.
- Receipt: UNALLOCATED → PARTLY_ALLOCATED → ALLOCATED · BOUNCED · VOID. WHT certificate: NOT_APPLICABLE / NOT_YET_RECEIVED / RECEIVED.

#### Integrations
- FBR POS / Digital Invoicing: IRN, QR, Rs 1 service fee.
- E-mail (invoice PDF, statements, receipts) and WhatsApp payment links (Raast QR).
- Bank / cheque handling through treasury.


### Purchases & payables

**Schema:** `Purchases`
**Tables (Basic, 13):** VendorCategories (helper lookup), vendor, VendorContacts, PurchaseOrders, PurchaseOrderLines, grn, GoodsReceivedNoteLines, bill, VendorBillLines, DebitNotes, DebitNoteLines, VendorPayments, VendorPaymentAllocations
**Screens:** app/vendors, app/vendors/view, app/purchases/orders, app/purchases/grn, app/purchases/bills, app/purchases/bills/new, app/purchases/voucher, app/purchases/debit-notes, app/payables/payments, app/payables/ageing

#### Features
- **Vendor master** (`VEN-0001`):
  - Tax and FBR: legal name, category, NTN or CNIC, STRN, FBR Active Taxpayer (ATL) status with "Verify ATL", default WHT section (153(1)(a) goods / (b) services / (c) contracts / Exempt).
  - Accounts and terms: expense or inventory account, payable account, payment terms and credit days.
  - Contacts and banking: phone, email, address, city, primary bank and IBAN, and contacts.
  - **Vendor 360** has tabs Overview, Bills, Payments, Statement and Documents (NTN certificate, STRN, supply agreement and WHT certificates are stored as `Company.Attachments`).
- **Purchase orders** (`PO-2026-000001`):
  - Vendor, order and expected dates, deliver-to branch (and warehouse), terms, department (cost centre), buyer, and lines with GST.
  - **Approval:** two levels (`PENDING_L1` → `PENDING_L2`). Thresholds come from company settings ("routed for approval above Rs 500,000"). Approval emails the PO to the vendor.
  - Receipt and billing progress roll up from the lines.
- **Goods received (GRN)** (`GRN-2026-000001`):
  - Received against an approved PO, line by line: ordered, previously received, received now, accepted, rejected with a reason, then batch, expiry and cost.
  - Records a QC note and QC result (`PASSED` / `PARTIAL_REJECT`) and the receiving warehouse.
  - A live 3-way match badge shows the match state.
  - Posting stocks the goods in and accrues GRNI.
- **Vendor bills** (`BILL-2026-000001`):
  - Header: vendor invoice number (the system warns on a duplicate for the same vendor), PO and GRN pull-through, payable account, currency and fx.
  - Lines: item or expense account, GST/SST tax code, and a WHT section per line.
  - Matching: a 3-way match state (`MATCHED`, `QTY_VARIANCE`, `PRICE_VARIANCE`, `NO_PO`) with the variance %.
  - Approval route: prepared → Finance Manager (above Rs 1,000,000) → CEO (above Rs 2,500,000). Bills can also be scanned with OCR, and can be marked disputed.
- **Purchase voucher** (`PV-2026-000001`): a counter purchase in one flow, stored on the same `bill` table with `channel = COUNTER`.
  - Supplier, supplier bill number, purchaser, due date, deal on supply, and retail-price discount %.
  - A barcode or UPC grid with Ps-Qty / Bonus / Brk / T-Qty, purchase and sale price (with a markup helper), and GST % and discount %.
  - Pay mode On Credit, Cash, Bank or Cheque, with an amount paid now.
  - WHT u/s 153 % (filer or non-filer rate) and advance tax 236G.
  - Review checklist and a journal preview before posting.
- **Debit notes** (`DN-2026-000001`):
  - Raised against a bill for one of four reasons: purchase return, price variance, short supply or quality rejection.
  - Return-from warehouse, input GST reversal, and WHT adjustment.
  - Settled by adjusting against the bill or by requesting a refund.
- **Payments** (`PAY-2026-000001`):
  - **Payment run:** pick approved bills due by a date. One payment is created per vendor, by IBFT, cheque, pay order or cash, from a bank or cash account.
  - **Cheques:** cheque number series and crossing ("A/C Payee only").
  - **Other run outputs:** bank charges, the bulk-IBFT bank upload file and payment advices. Bills can also be paid with "Pay selected" from the bills list.
  - **Allocation:** on-account payments are allocated later, manually or FIFO, and open debit notes can be used as credits. WHT is either already withheld at the bill or withheld now.
- **AP ageing and reports** (`app/payables/ageing`, views):
  - **Ageing:** by due date or bill date, in buckets Current, 1–30, 31–60, 61–90 and 90+, with disputed amounts.
  - **Other reports:** purchase register, vendor statement, WHT deducted by section, and purchases by vendor.

#### Key business rules
- **Numbering:** document numbers come from `Company.getNextDocNo()` for doc types PO, GRN, BILL, PV, DN and PAY. Vendor codes use the VEN sequence `VEN-{SEQ4}`.
- **Quantities** are in base units. Cartons + loose → base through `Inventory.Products.ctn`. Bonus is free; on the PV, breakage (Brk) is paid for but not stocked. `netUnitCost` = taxable ÷ (qty + bonus − breakage) feeds the moving-average cost.
- **Posting:** documents are inserted as `DRAFT` and posted by a status change.
  - Posted documents are locked by trigger. Only settlement and roll-up columns may change afterwards.
  - Corrections go through void or cancel with a reversal journal.
- **Receipts against POs:**
  - Goods can only be received against an `APPROVED` or `PARTIALLY_RECEIVED` PO.
  - An over-receipt is rejected (PO line `receivedQty ≤ ordered + bonus`).
  - A rejected quantity must have a reason.
- **Bill balance** = net payable (total − WHT) − paid now − effective allocations. It is maintained by trigger and drives the status (`POSTED` → `PARTIALLY_PAID` → `PAID`). `OVERDUE` and `DUE_TODAY` are derived from `dueDate`, never stored.
- **Settlement:**
  - A payment or debit note can only settle posted bills of the same vendor.
  - Over-allocation is rejected.
  - Allocations of a posted source are reversed, never deleted.
- **WHT u/s 153:**
  - The section comes from the vendor default or the line. The rate is taken from the tax master at posting and doubled for vendors not on the ATL.
  - WHT withheld at the bill is deposited through CPR by the 15th of the next month.
- **Input tax** from bills and PVs is claimable. A debit note reverses it, and the reversal is reported in the next sales-tax return.

#### Statuses
| Document | Statuses |
|---|---|
| Vendor | ACTIVE, INACTIVE · ATL: ACTIVE, NOT_ON_ATL, UNVERIFIED |
| Purchase order | DRAFT → PENDING_L1 → PENDING_L2 → APPROVED → PARTIALLY_RECEIVED → RECEIVED → BILLED · CANCELLED |
| GRN | DRAFT → POSTED · CANCELLED · QC: PASSED / PARTIAL_REJECT · bill: AWAITING / PARTIALLY_BILLED / BILLED · match: MATCHED / QTY_VARIANCE / TWO_WAY_BILL_AWAITED / OVER_RECEIPT |
| Bill / PV | DRAFT → AWAITING_APPROVAL → APPROVED → POSTED → PARTIALLY_PAID → PAID · VOID (OVERDUE, DUE_TODAY derived) · match: MATCHED / QTY_VARIANCE / PRICE_VARIANCE / NO_PO |
| Debit note | DRAFT → OPEN → APPLIED or REFUNDED · VOID |
| Vendor payment | DRAFT → PENDING_APPROVAL → POSTED → PRESENTED → CLEARED · VOID |

#### Integrations
- **FBR ATL check:** an online check on vendor save and with "Verify ATL".
- **Bank file:** a bulk-IBFT upload file (Meezan format).
- **Cheques:** issued through `BankCash.Cheques` (cheque register).
- **OCR:** bill capture from an image or PDF.
- **Email:** the PO and the debit note are emailed to the vendor.


### Inventory

**Screens (11).** Product Catalogue, Product Detail, Companies & Brands, Product Classes, Warehouses, Whole Stock, Stock In / Out, Stock Transfers, Stock Adjustments, Batches & Expiry, Stock Movements. Schema `Inventory` (19 tables).

**Features.**
- **Catalogue.** Items (`PK-1001`) with UPC (8 / 12 / 13 digits), Urdu name, image, carton size + loose unit (multi-UoM), shelf hint, purchase / average / retail / wholesale prices, GST %, financial discount %, low / high levels, HS code, and attributes Short (no discount at sale), Required Expiry, Controlled, Precious. Piece and carton barcodes (unique per tenant). Drafts, activation, soft delete, duplicate, import and inline price edit.
- **Principals.** Companies & Brands (`CO-07`) with colour, contacts and notes.
- **Classification.** Main classes `MC-NNN` and sub types `ST-NNN` with icon, visibility and drag-and-drop order.
- **Locations.** Warehouses and shops (`WH-LHR`, `SH-DHA`), each with branch, manager, capacity, its own inventory GL account and a "block negative stock" switch; bins `A-01-01` (rack-row-bin).
- **Batches & expiry.** Batch / expiry / mfg date / cost; FEFO register with expiry windows, timeline and calendar; dispositions Saleable, Priority, Quarantine, Clearance, Return to principal, Written off.
- **Stock ledger.** Append-only `Inventory.StockMovements` (17 movement types) with trigger-maintained balances per item × warehouse × bin × batch (on hand, reserved, available, value, last movement) and moving weighted-average cost.
- **Stock operations.** Manual stock in / out (`MI` / `MO`) by reason; transfers (`TRF-YYYY-NNNNNN`) with dispatch and receipt; adjustments (`ADJ`) with approval above Rs 25,000 (also used for batch write-offs and the Product Detail "Adjust stock").
- **Reporting.** Whole Stock (current / as on date), Stock Movements, stock card on Product Detail; views for stock on hand, valuation, stock card and near expiry.

**Key business rules.**
1. Stock is derived only from the ledger; the ledger is append-only (UPDATE / DELETE / TRUNCATE rejected). Corrections are new documents.
2. Every ledger row has exactly one of `qtyIn` / `qtyOut` > 0, in base units; `baseQty = qtyCtn × ctn + qtyLoose`.
3. A warehouse with `blockNegativeStock` rejects any movement that would take a slot (item × bin × batch) below zero; others allow minus stock.
4. Expiry-tracked items need a batch (with expiry) on every movement; unsaleable batches cannot be sold.
5. Retail price ≥ purchase price, low level ≤ high level; an ACTIVE item must have a company, class and prices.
6. Adjustments above the approval limit (Rs 25,000, `Company.CompanySettingValues`) need Finance Manager approval before posting.
7. Transfers cannot have the same source and destination; stock leaves the source at posting and arrives at receipt.
8. Item codes, UPCs, barcodes, company codes / names, class and sub-type names, batch numbers (per item) and document numbers are unique per tenant.
9. Document numbers come from `Company.getNextDocNo` (MI, MO, TRF, ADJ; masters ITEM, MFR, WH).

**Statuses.**
- Item: DRAFT → ACTIVE ↔ INACTIVE.
- Manual stock entry: DRAFT → POSTED · CANCELLED.
- Transfer: DRAFT → POSTED → DISPATCHED → IN_TRANSIT → RECEIVED · CANCELLED.
- Adjustment: DRAFT → PENDING_APPROVAL → POSTED · REJECTED · CANCELLED.
- Batch disposition: SALEABLE · PRIORITY · QUARANTINE · CLEARANCE · RETURN_TO_PRINCIPAL · WRITTEN_OFF.

**Integrations.** Purchases (GRN in, returns), Sales (SALE out, returns), Accounting (JV per stock document).

**Not in Basic (Full only).** Kits & assembly, barcode labels, bulk price update and price history, principal claims / targets, item suppliers, reservations, per-line transfer receipt variance, stock counts, stock vouchers, reorder rules, demand of goods, Stock In View, Inventory Report Studio, van locations.



## 9. Glossary
| Term | Meaning |
|---|---|
| ATL | Active Taxpayers List (FBR). Non-ATL parties attract higher WHT rates. |
| NTN / STRN / CNIC | National Tax Number / Sales Tax Registration Number / national identity card number |
| GST | General sales tax (18% standard); **further tax** 4% applies on supplies to unregistered buyers |
| WHT 153 / 149 / 236G / 236H | Withholding / advance income tax sections: 153 payments to suppliers & contractors, 149 salaries, 236G/H advance tax on sales to distributors / retailers |
| CPR | Computerised Payment Receipt — proof of tax deposited with FBR |
| IRN | FBR invoice reference number returned by POS real-time integration (printed with a QR code) |
| PRA / SRB | Punjab Revenue Authority / Sindh Revenue Board (provincial sales tax on services) |
| PDC | Post-dated cheque |
| GRN / GRNI | Goods received note / goods received not invoiced (clearing account) |
| JV / CPV / CRV / BPV / BRV / CON / OB | Journal, cash payment, cash receipt, bank payment, bank receipt, contra, opening-balance vouchers |
| FEFO | First-expiry-first-out batch picking |
| CTN / loose | Carton quantity and loose pieces; base qty = CTN × pieces-per-carton + loose |
| Bonus | Free quantity given under a scheme (buy X get Y) |
