# Finsoft ERP — Product Scope (Full edition)

> **Edition:** Full — every screen in the Finsoft HTML prototype (`finsofthtml/src`, 195 routes).
> **Companion files:** `database/` (PostgreSQL 16 schema), `entities/` (page → entity map, one section per screen), `POSTING_RULES.md` (Dr/Cr per event), `erd/index.html` (interactive ERD).
> **Sister edition:** `../erp-basic/` — the core ERP. Basic is a strict subset of Full (see §10 Upgrade from Basic).
> **Source of truth:** the prototype screens (forms, tables, status badges, JS logic, `src/91-data.js`). The legacy Bhatti Traders Oracle schema was used only as a reference for trading/distribution logic.

## 1. Product summary
Finsoft is a multi-tenant SaaS ERP for Pakistani SMEs — traders, distributors, manufacturers and services firms. It runs double-entry accounting, sales and purchases with FBR-compliant sales tax and withholding tax, batch/expiry-aware inventory, van-sales distribution, HR, attendance and payroll with EOBI/PESSI/PF, and an employee self-service portal — in PKR, on a July–June fiscal year, in English and Urdu, light and dark.

**Goals**
1. One ledger that is always right: every financial document posts a balanced journal, posted records are immutable, closed periods reject postings.
2. Stock that is always explainable: every quantity comes from an append-only stock ledger (batch + expiry + location), valued at moving weighted-average cost, picked FEFO.
3. Pakistan compliance out of the box: NTN/STRN/CNIC/ATL, GST 18% / further tax 4%, WHT 153/149/236G/236H, FBR POS real-time invoices (IRN + QR), sales-tax return annexes, EOBI/PESSI/PF.
4. Fast data entry for trade: keyboard-first vouchers, carton + loose quantities, bonus/scheme lines, barcode scanning, hold/recall, templates.
5. Safe multi-tenancy: shared schema, `tenantId` on every row, composite foreign keys, PostgreSQL row-level security.

## 2. Portals
| Portal | Routes | Users |
|---|---|---|
| **Platform console** | `admin/*` (28) | Finsoft staff: Super Admin, Support Lead/Agent, Billing, Engineer |
| **Tenant app** | `app/*` (141) | the customer's finance, sales, purchase, store, HR and management staff |
| **Employee self-service** | `EmployeeSelfService/*` (17) | every employee of a tenant |
| **Entry & utility** | `login`, `login/forgot`, `login/mfa`, `chooser`, `mobile` + `app/states`, `app/404`, `app/unauthorized` | everyone |

## 3. Personas (from the prototype's users and role matrix)
| Persona | Example (seed data) | Main screens |
|---|---|---|
| Platform Super Admin | Saim Javed | tenants, plans, billing, feature flags, system |
| Tenant Owner / CEO | Ahmed Raza | dashboard, approvals, reports |
| Finance Manager | Sana Javed (signed-in user) | vouchers, bank, period close, tax, approvals |
| Accountant | Hira Ali | vouchers, receipts, payments, reconciliation |
| Sales Executive / Booker / Salesman | Bilal Khan (EMP-0042) | quotations, orders, invoices, bookings, recovery |
| Procurement / Storekeeper | — | POs, GRN, stock in/out, transfers, counts |
| Cashier | — | POS, cash book, petty cash |
| HR Manager / Payroll Officer | Ayesha Noor | employees, attendance, leave, payroll |
| Auditor | — | read-only + audit trail |
| Employee | everyone | ESS: attendance, leave, payslips, claims, requests |

## 4. Module map
| # | Module (schema) | Screens | Tables | Section |
|---|---|---|---|---|
| 1 | Platform console (`Platform`) | 28 | 87 | §11.1 |
| 2 | Workspace, settings, users & roles (`Company`) + Report Studio (`Reports`) | 24 | 56 + 5 | §11.2 |
| 3 | Accounting (`Accounting`) | 12 + 8 reports | 25 | §11.3 |
| 4 | Fixed assets (`FixedAssets`) | 4 | 7 | §11.4 |
| 5 | Bank & cash (`BankCash`) | 12 | 27 | §11.5 |
| 6 | Tax & FBR (`Tax`) | 4 | 12 | §11.6 |
| 7 | Sales & receivables (`Sales`) | 18 | 35 | §11.7 |
| 8 | Purchases & payables (`Purchases`) | 12 | 19 | §11.8 |
| 9 | Inventory (`Inventory`) | 18 | 41 | §11.9 |
| 10 | Wholesale & distribution (`Distribution`) | 8 | 34 | §11.10 |
| 11 | HR (`HumanResources`) | 22 | 50 | §11.11 |
| 12 | Payroll (`Payroll`) | 8 | 20 | §11.12 |
| 13 | Employee self-service (`ess`) | 17 | 22 | §11.13 |

## 5. Cross-cutting capabilities
- **Multi-tenant.** One database, shared schema. `Platform.Tenants` is the root; every tenant table carries `tenantId`, `UNIQUE (tenantId, id)` and composite FKs, and is protected by RLS (`91-rls.sql`). The API sets `app.tenantId` / `app.userId` per transaction from the verified session; tenant never comes from the request body.
- **Multi-branch.** Branches (LHR, KHI, ISB, FSD) on users, vouchers, documents, cost centres, employees; branch-scoped document series (`CRV-LHR-0381`).
- **Multi-warehouse / location.** Warehouses, shops and vans; bins (`A-01-01`); stock per item × warehouse × bin × batch.
- **Document numbering.** `Company.DocumentTypes` (global catalogue) → `Company.NumberingSeries` per tenant (prefix, pattern with `{PREFIX} {YYYY} {YY} {MM} {FY} {BR} {SEQn}`, reset NEVER / YEARLY / MONTHLY) → `Company.getNextDocNo()`, row-locked, never `MAX+1`.
- **Approvals.** Workflows with conditions (amount, type, branch), multi-step chains (role / user / line manager), SLA + escalation, delegation, "preparer can't approve own", one inbox (`app/approvals`).
- **RBAC.** Roles × permission catalogue (`<resource>:<action>`, actions View/Create/Edit/Approve/Post/Delete/Export exactly as the Roles matrix), role limits (max voucher amount, max discount %, backdate days, salary visibility), segregation-of-duties rules, branch and warehouse scoping.
- **Audit.** Generic trigger writes field-level before/after diffs to `Company.AuditTrailEntries` (monthly partitions, hash-sealed blocks); platform actions to `Platform.PlatformAuditLogs`.
- **Posting integrity.** Single ledger; balanced-on-post; immutable once posted; reversal instead of edit; open-period and books-lock-date checks; posting is idempotent per source document.
- **Shared services.** Attachments, comments/@mentions/reactions, activity feed, tags, notifications (in-app, email, SMS, WhatsApp), tasks (Today's Work), data import with column mapping and validation, document templates (A4 / A5 / thermal 80 mm, EN / EN+UR, FBR QR), backups and restore requests, API keys and webhooks.
- **Localisation.** PKR with South-Asian digit grouping (12,45,000.00) or Western; dates `DD MMM YYYY`; English and Urdu (Urdu product names, Urdu reminder templates, amount in words in Urdu); timezone Asia/Karachi, storage UTC.
- **Feature management.** Feature flags with environments, targeting rules, segments, rollouts, prerequisites, plan entitlements and change requests gate modules and features per tenant.

## 6. Non-functional requirements
| Area | Requirement |
|---|---|
| Security | RLS forced on every tenant table; no DELETE grant on documents (draft lines excepted); MFA (TOTP) per user / enforced per tenant; Google/Microsoft SSO and SAML for staff; IP allow-lists; session and trusted-device management; password hashes only (Argon2id); secrets never stored in clear (token references) |
| Integrity | money `numeric(18,2)`, qty `numeric(18,3)`; every enumeration in the single `Lookups.Lookups` table (validated by trigger), CHECK constraints for arithmetic and state rules; posted records immutable; append-only ledgers (stock, audit) |
| Performance | every list filter index leads with `tenantId`; trigram indexes for name/SKU search; report views use `securityInvoker` so RLS still applies; heavy registers partitioned (audit log, attendance punches) |
| Availability & DR | daily backups with retention policy, monthly restore tests, Pakistan primary (Lahore) + Karachi DR or UAE region (data residency per tenant) |
| Compliance | FBR POS real-time integration, IRIS-ready sales-tax annexes, WHT certificates, EOBI/PESSI statements; privacy requests (export / delete) with approval workflow |
| UX | light and dark themes, keyboard shortcuts (F1–F6 on trade vouchers), barcode scanning, responsive to 390 px, mobile apps for bookers and employees |

## 7. Release phases (recommended build order)
| Phase | Content | Edition |
|---|---|---|
| **P1 Foundation** | platform tenants/plans/subscriptions, login + MFA, company & branches, users, roles & permissions, numbering, audit | Basic |
| **P2 Finance core** | COA, vouchers, ledger, opening balances, fiscal periods, bank accounts & transactions, cheques, cash book, tax codes, TB / P&L / BS / GL / day book | Basic |
| **P3 Trade & stock** | customers, quotations, orders, invoices, sales voucher, credit notes, receipts; vendors, POs, GRN, bills, purchase voucher, debit notes, payments; items, classes, manufacturers, warehouses, stock in/out, transfers, adjustments, batches, movements | Basic |
| **P4 Operations+** | approvals engine, recurring, reconciliation & bank rules, petty cash & expense claims, POS, challans, returns, price lists & schemes, credit control, reminders, landed cost, counts, kits, labels, demand, fixed assets, budgets, GST/WHT returns, FBR integration | Full |
| **P5 Distribution** | quick wholesale entry, bulk invoicing, bookings, back-orders, load sheets, settlement, recovery, routes, commission | Full |
| **P6 People** | HR, attendance & devices, shifts, leave, overtime, lifecycle, recruitment, performance, training, payroll, loans, final settlement, ESS | Full |
| **P7 Growth console** | SaaS analytics, leads, partners & coupons, dunning, usage & quotas, feature flags, support, comms, status page, Report Studio, mobile | Full |

## 8. Out of scope
- Manufacturing / BOM production planning beyond kit assembly.
- Multi-currency general ledger revaluation (bills and landed cost carry currency + FX rate; the base ledger is PKR).
- Hospital / lab / patient modules present in the legacy Bhatti system (no screens).
- E-commerce storefront, CRM marketing automation.
- Payment-gateway settlement reconciliation beyond the bank-statement import.
- Native mobile app internals (the `mobile` screen is a showcase; mobile apps call the same API).

## 9. Assumptions, decisions and known gaps
**Decisions taken while modelling the screens**
1. **One invoice table for every sales channel.** Standard invoices (`INV-`), the Sales Voucher (`SV-`), wholesale bills from Quick Entry / Bulk Invoicing / bookings (`WS-`) and POS (`POS-`) are all `Sales.SalesInvoices` with a `channel`. The `INV-2026-001180` numbers on load sheets are the same table.
2. **One bill table** for vendor bills (`BILL-`) and the counter Purchase Voucher (`PV-`).
3. **Shops are customers.** A wholesale shop (`SHP-001`) is a `Sales.Customers` with `customerChannel = 'WHOLESALE'` plus a `Distribution.ShopRouteProfiles` profile — one AR ledger.
4. **People are foreign keys.** Bookers, salesmen, deliverymen, drivers and supervisors are `HumanResources.Employees` rows (Basic stores them as text on the Sales Voucher because Basic has no HR).
5. **Unified numbering** where the prototype was inconsistent: transfers `TRF-YYYY-NNNNNN` (prototype showed TR- / TRF-), landed cost `LC-` (prototype used `CN-`, which clashed with credit notes), ESS attendance corrections use the `REG` series and leave the `LV` series.
6. **Run invoices issue stock at dispatch** (`Sales.SalesInvoices.stockIssueMode = 'AT_DISPATCH'`): the van load is a warehouse → van transfer; delivery/settlement issues from the van.
7. **Account roles, not hard-coded codes.** Postings resolve accounts through `Company.DefaultAccountMappings` (74 roles in `Company.PostingRoles`); the codes in the prototype's journal previews (1201, 5160, 4920 …) are the defaults of the Trading & Distribution COA template.
8. **Draft numbering.** Documents receive their number when created (drafts show numbers in the prototype); voided drafts keep their number (gaps are explained, never reused).
9. **Moving weighted-average cost** per item (Bhatti `AVCOST`), re-valued by landed cost; FEFO batch picking.
10. **API keys and webhooks** used by the gateway before a tenant is known live in `Platform.PlatformApiKeys` / `Platform.WebhookEndpoints`; the tenant settings screens manage the tenant's own rows through the API.

**Known gaps / simulated values** (marked **[simulated]** in the entity docs)
- Per-location stock split, reserved quantities and average daily sales shown in some prototype panels are computed in the browser; the schema derives them from `Inventory.StockBalances`, `Inventory.StockReservations` and the ledger.
- SaaS CAC, website visitors, service latency and status-page subscribers have no data source.
- PF trust profit rates and balances are not modelled.
- Roster coverage targets (required headcount per shift) are not modelled.

## 10. Upgrade from Basic
Basic and Full share table names, column order, types, defaults and constraints for every Basic table. Full only:
- adds tables (all of `FixedAssets`, `Distribution`, `HumanResources`, `Payroll`, `ess`, `Reports`, and the Full-only tables of the other schemas);
- adds columns to Basic tables (always after Basic's business columns);
- adds lookup values (e.g. list `SalesInvoiceChannel` gains `WHOLESALE`, `POS`; the warehouse type list gains `VAN`) and their `LookupColumns` rows.
An upgrade is therefore additive DDL: create the new tables, `ALTER TABLE … ADD COLUMN` the new columns, insert the Full lookup values (`92-lookups.sql` is idempotent), run the Full fk files, views, API and posting functions, `91-rls.sql` (it re-discovers every table) and the Full seed blocks. No data is rewritten.

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

## 11. Module scope
### Platform Admin (SaaS console) — Full

**Portal & personas.** The Finsoft Cloud console (`admin/*`) is used by Finsoft staff only, with roles Super Admin (locked to all permissions), Support Lead, Support Agent, Billing and Engineer. It runs without a tenant context (schema `Platform`, no RLS, role `finsoftPlatform` with a BYPASSRLS login for cross-tenant counts). Access requires SSO (SAML/Okta or Google Workspace), 2FA and the IP allow-list. Break-glass password login is for the Super Admin only.

**Screens (28).** Overview, All Tenants, Onboard Tenant, Tenant 360, Templates · SaaS Analytics, Leads CRM, Partners & Coupons · Plans & Pricing, Subscriptions, Platform Invoices, Dunning & Collections, Usage & Quotas · Feature Flags, Flag Detail, Segments, Plan Entitlements, Change Requests · Support Tickets, Announcements, Communications · System Health, Platform Audit Log, Status & Incidents, Security & Privacy, API & Webhooks, Tax Master · Platform Team.

Everything in the Basic platform scope applies, plus the sections below.

#### Features
**Tenants & onboarding**
- Health score from six hourly signals: logins, modules adopted, invoices/week, payment status, support tickets and NPS (`Tenants.healthFactors`).
- Internal notes. Impersonation sessions are recorded, time-boxed and linked to a ticket.
- Tenant data export (ZIP / CSV / JSON, encrypted, link valid 24 h).
- Provisioning also seeds leave types and salary components from the master seed lists, raises the first platform invoice and sends the welcome message.

**Growth**
- SaaS analytics: MRR/ARR, MRR movement (new / expansion / contraction / churn), NRR, GRR, logo churn, ARPU, LTV:CAC, CAC payback, trial→paid funnel, MRR by plan, churn reasons, cohort retention M0–M11.
- Leads CRM Kanban: Lead → Demo → Trial → Paid → Churned. Sources: website, referral, partner, Facebook, LinkedIn, expo. Shows trial engagement and a win rate.
- Partners: Bronze/Silver/Gold/Platinum tiers, commission 10/15/20%, monthly statements with WHT 12% u/s 233, IBFT payout.
- Coupons: % or flat, duration once/3/6/12 months/forever, redemption cap, plan scope, new-customers-only, stackable with partner, schedule/pause/expire.

**Billing**
- Platform invoices `FS-INV-YYYY-NNNNN` with provincial sales tax on services (PRA 16%, SRB, KPRA, BRA by tenant province). Proration, add-on, overage and manual invoices.
- Payments by card, JazzCash, Easypaisa, Raast, direct debit and bank transfer, plus manual "Mark paid" and refunds.
- Dunning: grace (default 7 d) → read-only (7 d) → suspended (31 d) → cancel. Data is archived 90 d.
- Smart retries at 10:00 on salary-credit days (1st, 10th): card → JazzCash wallet → Raast request-to-pay. Promise-to-pay pauses retries.
- Reminders by email / SMS / WhatsApp at D−3…D+14 in English or Urdu.
- Usage & quotas: meters for users, branches, invoices/month, storage, API calls/day and /month, SMS, FBR submissions. Bars turn amber at 80% and red at 100%. Per-tenant overrides have an expiry and an overage choice. Alert rules are evaluated every 15 minutes (notify AM, email owner, throttle, block, offer add-on).

**Feature management**
- Flags typed release / kill switch / ops / experiment / entitlement, with category, lifecycle (define → develop → production → cleanup → archived), owner, tags, temporary + expiry, and boolean or multivariate variations.
- Three environments (Dev, Staging, Production).
- Targeting order: prerequisites → off → individual tenant targets → ordered rules (segment, plan, region, city, industry, tenant age, user role, app version, platform; in / not in / > / <) → default (percentage rollout or fixed variation).
- Sticky bucketing `hash(Tenants.code + '.' + key) % 100`.
- Scheduled ramps, evaluation insights (14 days), code references from a nightly scan of 3 repos, full audit with JSON diff, SDK keys per environment (server / client / mobile; rotation keeps the old key valid for 24 h).
- Segments: AND rules plus include/exclude lists, reused across flags.
- Plan entitlements: module/feature × plan matrix, limits (blank = unlimited), add-ons (POS terminal, WhatsApp + Rs 1.20/message, extra company, payroll per employee). An impact preview counts tenants gaining, losing or over a limit; options are grandfather until renewal, email owners, post to changelog.
- Change requests (`CR-NNNN`) for every Production change.

**Support & comms**
- Support tickets `TCK-NNNN`: Kanban by status, priority SLA, internal notes, attachments, CSAT.
- Announcements (release note, maintenance, compliance, billing) with severity, audience by plan / module / tenant, scheduled publish, banner and/or admin email, views and clicks.
- Communications: six lifecycle templates in English and Urdu (RTL) across email, SMS and WhatsApp, with merge variables, versions, test send, segment broadcasts and a delivery log with retry.

**System**
- System health: services, job queues, backups (nightly full + 15-min WAL, 35-day retention, AES-256, restore-tested).
- Status page: 8 components, 90-day uptime, incidents `INC-YYYY-NNN` (Investigating → Identified → Monitoring → Resolved, post-mortem within 5 working days), planned maintenance with in-app banner.
- Security & privacy: SSO, 2FA policy, IP allow-list, password policy (HIBP), admin sessions, privacy requests `PRV-YYYY-NNN` (export / delete, 30-day deadline, deletion needs two approvers, PECA 2016 / PDPB draft).
- API & webhooks: tenant API keys (live/test, scopes, rotation, revoke) and webhook endpoints (HMAC-SHA256 signed, 8 events, 6 attempts at 1m/5m/30m/2h/6h, replay, payload inspector).
- Tax master: sales tax by authority (FBR 18% goods; PRA/SRB/KPRA/BRA on services) with future-dated changes and legal reference, WHT sections with ATL / non-ATL rates and thresholds, salary slabs u/s 149 per tax year, FBR DI / PRA e-invoicing endpoints (sandbox / production), publish to tenants.
- Platform team: editable role × permission matrix (14 permissions); tenant scope all / by region / specific tenants.

#### Business rules
- Four eyes in Production: every Production flag change needs one approval from a chosen approver. The requester can never approve (CHECK + trigger). Only one pending CR per flag × environment. Kill switches bypass approval after typing the key, are logged as emergency, and page on-call.
- A flag key is snake_case, 3–60 characters, unique and immutable. Temporary flags need an expiry. Stale = 100% for 60 days, past expiry, or no evaluations. Archived flags stop evaluating.
- Entitlements are commercial and never driven by release rollouts. Saving the entitlement matrix rewrites the plan rule of the linked entitlement flags.
- Invoice arithmetic: net = gross − discount; total = net + tax; balance = total − paid. Payments keep `paidAmount` / status in step (trigger). Invoices are never deleted (VOID with reason). OVERDUE is derived.
- One dunning case per unpaid invoice. A promise-to-pay needs a date and source. Recovery closes the case and restores access.
- Partner payout: net = gross − WHT (12% u/s 233).
- Coupons: code 4–24 chars `[A-Z0-9-]`, case-insensitive unique; percent ≤ 100; one redemption per tenant per coupon.
- Usage overrides need a reason; only one live override per tenant × meter. "Never" means no expiry date.
- Privacy deletion needs two distinct approvers and typing the tenant code; a completion certificate is issued.
- Tax master rate ranges never overlap per authority × nature (exclusion constraint). Changes need a legal reference (Finance Act / SRO).
- API keys and SDK secrets are stored hashed (shown once). Revealing a stored secret is audited. Rotation grace is 24 h.
- Impersonation: one live session per staff member, reason required, 30/60 min, read-only by default.

#### Statuses
- Platform invoice: DRAFT → OPEN → PARTIALLY_PAID → PAID · OVERDUE (derived) · VOID · UNCOLLECTIBLE.
- Platform payment: PENDING → SUCCEEDED / FAILED; SUCCEEDED → PARTIALLY_REFUNDED / REFUNDED.
- Dunning case: GRACE → READ_ONLY → SUSPENDED → COLLECTIONS; PROMISE; closed RECOVERED / CANCELLED / WRITTEN_OFF.
- Lead: LEAD → DEMO → TRIAL → PAID / CHURNED. Partner payout DUE → PAID. Coupon SCHEDULED → ACTIVE ⇄ PAUSED → EXPIRED.
- Flag stage DEFINE → DEVELOP → PRODUCTION → CLEANUP → ARCHIVED. Change request PENDING → APPROVED / REJECTED / CANCELLED. SDK key ACTIVE → GRACE → REVOKED.
- Ticket NEW → IN_PROGRESS ⇄ WAITING_ON_CUSTOMER → RESOLVED → CLOSED. Announcement DRAFT → SCHEDULED → PUBLISHED → ARCHIVED.
- Incident INVESTIGATING → IDENTIFIED → MONITORING → RESOLVED. Maintenance SCHEDULED → IN_PROGRESS → COMPLETED / CANCELLED.
- Privacy request RECEIVED → VERIFIED → APPROVED → PROCESSING → DONE / REJECTED. Backup RUNNING → COMPLETED / FAILED.

#### Integrations
- Payments: card gateway (3-D Secure), JazzCash, Easypaisa, Raast request-to-pay, bank direct-debit mandates (Meezan, UBL), IBFT for partner payouts.
- Messaging: email (SES + backup SMTP), SMS (Jazz with Telenor failover), WhatsApp Business API.
- Identity: SAML 2.0 (Okta), Google Workspace OAuth, WebAuthn hardware keys, TOTP, HIBP breached-password check.
- Tax: FBR Digital Invoicing (PRAL IRIS) and PRA e-invoicing, sandbox and production; FBR ATL lookup.
- Monitoring: job queues (Sidekiq/BullMQ), backups to the PK-Karachi DR site, status.finsoft.pk subscribers.
- Feature-flag SDKs: `@finsoft/flags-node` (server), browser client ID, mobile key (Android, iOS, booker app).


### Core: company, users & access, approvals, collaboration, numbering, notifications, audit, import, backup, integrations (Full)

**Screens (24):**
- **Entry:** `login`, `login/forgot`, `login/mfa`, `chooser`, `mobile`
- **Workspace:** `app/dashboard`, `app/today`, `app/approvals`, `app/setup`, `app/activity`, `app/notifications`, `app/profile`, `app/import`
- **Settings:** `app/settings` (+ `/approvals`, `/audit`, `/backup`, `/integrations`, `/roles`, `/templates`, `/users`)
- **Utility:** `app/states`, `app/404`, `app/unauthorized`
- Report Studio (`app/reports/studio` + built-in studios) is described at the end.

**Schema:** `Company` (`02-core.sql`): 56 tables (the 23 Basic tables + 33 Full-only), plus the monthly audit partitions. `Reports` (`14-rpt.sql`): 5 tables.

Everything in the Basic core section applies unchanged (Basic ⊂ Full). Full adds the following.

#### Company & branches (additions)
- **HR & Payroll tab:**
  - pay day rule, cut-off, working-days basis, EOBI employer amount, PF %, automatic salary tax u/s 149, payslips published to ESS;
  - attendance policy: working week, grace minutes, late marks per leave, half-day threshold, overtime 1.5× / 2×, attendance source (ZKTeco + ESS), and the ESS geofence (branch lat/long + radius, default 200 m).
- **Tax tab:** FBR POS / Digital Invoicing real-time reporting and FBR number + QR on invoices.
- **Multi-currency:** daily rates in `Company.ExchangeRates` (SBP feed or manual).
- **Branch manager:** can be an employee (`HumanResources.Employees`). The branch headcount comes from HR.

#### Users & access (additions)
- **Invites (`UserInvites`):** channels Email/WhatsApp, role, branch, linked employee. They expire after 7 days and can be resent (with a cool-down), have their link copied, or be revoked.
- **Users linked to employees** (`Users.employeeId`) keep HR, payroll, ESS and access in sync. The role is suggested from the job title.
- **Extra MFA factors (`UserMfaMethods`):** SMS fallback, WebAuthn and mobile biometrics. **Trusted devices (`TrustedDevices`)** have a 30-day MFA skip, a push token and Face ID unlock.
- **Role data limits (`RoleLimits`):** max voucher amount a member may approve, max discount %, back-dated posting window (0/3/7/30 days/any open period), and salary visibility (hidden / masked except own / full).
- **Segregation of duties (`SegregationOfDutiesRules`):** create+approve and create+post pairs on financial resources, and create users + edit roles (privilege escalation). Rules are WARN or BLOCK, and the Owner is exempt. The matrix shows live conflicts with a one-click fix.

#### Approvals engine
- **Workflows (`ApprovalWorkflows`):**
  - subjects: vouchers, vendor payments, bills, POs, expense claims, leave, payroll runs, credit overrides, sales orders, stock adjustments, loans;
  - AND-ed conditions (amount, doc type, branch, department …);
  - ordered steps: approver = role / specific user / preparer's line manager, optional "only above amount", SLA hours with escalate / remind, any-one / all mode, no self-approval, delegation when on leave, comment required;
  - outcome AUTO_POST or MARK_APPROVED; rejection returns the document to the preparer; notifications in-app / email / WhatsApp;
  - lifecycle DRAFT → ACTIVE (published, versioned) ⇄ INACTIVE.
- **Requests (`Approvals`):** at most one PENDING per document, with an SLA deadline per step. `ApprovalActions` is an append-only log: SUBMIT / APPROVE / REJECT / REQUEST_CHANGES / DELEGATE / ESCALATE / REMIND / AUTO_SKIP, with bulk approve. `ApprovalDelegations` holds standing delegations.
- **Approvals Inbox:** KPIs, type filters, chain, comments, @mentions, keyboard shortcuts, bulk approve. The same data feeds Today's approvals queue, the dashboard card and the Owner mobile app (swipe to approve).

#### Collaboration & workspace
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

#### Settings (Full)
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

#### Mobile apps
- **Employee app:** geofenced face + GPS check-in, leave, corrections, advances, OCR receipt scan, payslips.
- **Owner app:** cash, swipe approvals, receivables with WhatsApp reminders.
- Both use the same tables. Devices are registered in `TrustedDevices` (push token, biometric unlock). Actions queued offline sync later as normal writes.

#### Report Studio (`Reports`)
- **`SavedReports`:**
  - CUSTOM reports are built over a source: sales invoices, vendor bills, GL transactions, customers, stock movements, payroll lines.
  - PRESET reports are saved views of the six built-in studios (Financial, Inventory, Receivables, Payables, Payroll, HR) with tab, view mode, options and filters.
  - Both carry a date range, filters, group-by, sort, limit (Top N / all), totals row, table/chart (bar/line/donut), folder, visibility (only me / shared with roles or users / everyone) and the owner's favourite star.
- **`SavedReportColumns`:** selected columns with aggregate and format.
- **`SavedReportShares`:** roles or users, view or edit.
- **`ReportSchedules`:** daily / weekly / monthly / quarterly at a set time, XLSX/PDF/CSV, recipients (emails and users), "only if rows" for alert reports such as Minus Stock, ACTIVE/PAUSED, next and last run.
- **`ReportRuns`:** every generation (manual / scheduled / API), with format, parameters snapshot, row count and output file. It feeds the Reports Centre's *Recent runs*. Report data always comes from live views; nothing is stored as report rows.


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


**Full additions.**
- **Cost centres & projects** (`app/accounting/cost-centres`): branch → department tree with owner, annual budget, icon and tags; projects `PRJ-01` with owner, budget, expected revenue, dates, colour, tags and status (Planning, In progress, On hold, Completed, Cancelled); burn chart and project P&L from tagged lines.
- **Allocation rules**: shared costs (rent, electricity, fleet fuel, internet) split across cost centres by floor area, headcount, km driven or users; splits must total 100%.
- **Multi-branch accounts**: `Accounting.AccountBranches` lets several (not all) branches use an account.
- **Recurring templates** (`app/accounting/recurring`): JV/BPV/CPV templates, monthly/weekly/quarterly/yearly on a given day or last day, start date, end never / after N / on date, auto-post, failure notification, next/last run, run history; also on-demand voucher templates ("Save as template" / "Import from template").
- **Period control**: module-level close per period (GL, AR, AP, Inventory, Payroll); audited reopen requests with reason, approver, reopen-until date, automatic re-close and approver MFA for locked periods.
- **Year-end close** (`app/periods/close`): dry run or final; 11-point pre-close checklist; year-end adjustments (posted / proposed / awaiting input); closing JV transferring income and expenses to retained earnings; lock all periods; carry forward balance-sheet balances as next year's opening batch; audit pack; CEO approval for the final close.
- **Budgets** (`app/budgets`, `app/budgets/variance`): operating, capital, department and project budgets per FY; versions v1…vN (one approved); 12 monthly columns per account and cost centre; seed from prior actuals (+ uplift) or a prior budget; CEO approval; budget vs actual by month, department and account with variance %.
- **Voucher activity log & approvals**: per-voucher audit trail (created, edited, attachment, submitted, approved, sent back, posted, reversed) and multi-step approval chains (Finance Manager → CFO/CEO by amount) via `core.approval*`.
- **Saved ledger views** per user on the Account Ledger.
- **Statements**: cash flow (indirect) and Report Studio (see Financial Reports).

**Full business rules.**
- A posting is blocked when its period is not OPEN or its module is closed for that period.
- Approved/superseded budget versions are frozen; changes are saved as a new version.
- A project that is Completed or Cancelled takes no new postings.
- A template run that fails is recorded (FAILED) and never half-posts.
- Only one completed final close per fiscal year; final close requires CEO approval.


### Fixed assets (fa)

**Screens.** Fixed Asset Register · Asset Detail · Run Depreciation · Asset Disposals.

**Features.**
- **Asset categories** with default method (WDV / SLM / none), rate and GL accounts (cost, accumulated depreciation, expense); land is not depreciated.
- **Asset register**: code `FA-0012`, name, category, location (branch), custodian (employee), cost centre, tag (`ALN-VH-0012`, printable), serial, acquisition date, cost, source document (vendor bill) and supplier, method, rate, residual value, "charge full month in month of purchase", per-asset GL accounts, vehicle registration / engine / chassis, insurer, policy, premium and expiry, tax WDV (ITO 2001), last physical verification; NBV = cost − accumulated depreciation. Search by code, name, serial or tag; category and branch filters; cost-by-category panel; alerts for assets under repair, insurance expiring and verification due.
- **Transfers** between branches and custodians, with approval; history on the asset.
- **Depreciation runs**: per period, optionally per branch or category; recompute while draft; review computed charges by category; journal preview; post one JV; run history; email summary. Monthly proration, WDV on opening NBV, SLM on cost, capped at NBV − residual.
- **Depreciation schedule**: per asset per fiscal year (opening NBV, months posted / months, depreciation, accumulated, closing NBV) as Locked / Pending / Projected, feeding the NBV chart.
- **Disposals** `DSP-2026-0009`: sale, scrap, write-off or trade-in; buyer, proceeds, GST on sale, receive-into bank/cash; automatic NBV and gain/loss; draft → approval → posted derecognition journal.

**Key business rules.**
- An asset is depreciated at most once per period; fully depreciated, method-none and disposed assets are skipped.
- Accumulated depreciation only moves through posted runs (and is written back on disposal).
- A disposal snapshot must match the asset's current cost and accumulated depreciation when posted.
- One live disposal and one open transfer per asset; disposed assets cannot be transferred.
- Posted runs and disposals are frozen; corrections are reversals of their journals.

**Statuses.** Asset NEW / IN_USE / UNDER_REPAIR / FULLY_DEPRECIATED / DISPOSED · Run DRAFT / POSTED / CANCELLED · Schedule LOCKED / PENDING / PROJECTED · Disposal DRAFT / PENDING_APPROVAL / POSTED / CANCELLED · Transfer PENDING_APPROVAL / APPROVED / REJECTED / COMPLETED / CANCELLED.


### Bank & Cash (treasury) — Full

**Screens (12).**
- Basic: Bank Accounts, Bank Transactions, Receive & Issue Cheques, Cheque Register & PDC, Bank Book, Cash Book.
- Full only: Cheque Voucher (`app/bank/cheque-voucher`), Bank Reconciliation (`app/bank/reconciliation`), Bank Rules & Import (`app/bank/rules`), Cash Ledger (`app/cash/ledger`), Petty Cash (`app/cash/petty`), Expense Claims (`app/cash/expenses`; same table as ESS `ess/expenses`).

**Tables (27).**
- Basic 11: bank, BankAccounts, CashAccounts, CashCategories†, cheque, ChequeAllocations, ChequeBounces, BankTransactions, CashBookEntries†, CashDayCloses, CashDayCloseDenominations.
- Full-only 16: ChequeBooks, ChequeBatches, ChequeBatchLines, BankStatementImports, BankStatementLines, BankRules, BankRuleConditions, reconciliation, BankReconciliationMatches, ExpenseCategories, PettyCashFunds, PettyCashReplenishments, PettyCashVouchers, ExpenseClaims, ExpenseClaimLines, ExpenseClaimActions.
- † helper tables not in the contract registry.

**Columns Full adds to Basic tables.**
- `CashAccounts.approvalThreshold` (Rs 50,000).
- `Cheques.chequeBookId`, `Cheques.crossedAcPayee`.
- `ChequeBounces.creditHoldEventId`.
- `BankTransactions.statementLineId`, `bankRuleId`, `reconciliationId`.
- `CashBookEntries.employeeId`.

#### Features (in addition to Basic)
- **Cheque books.** Leaf range, next leaf, leaf width and default "A/C payee" crossing per bank account; one active book per account.
- **Cheque Voucher.** A single receive / issue voucher (R-CHQ-0001 / I-CHQ-0001) with:
  - old no., posting preview (Dr / Cr) and a printed cheque preview (amount in words, MICR);
  - a bulk sheet mode: common header (type, date, bank, posting mode, old-no rule, remarks prefix);
  - rows typed on screen or uploaded from Excel / CSV (≤ 1,000), validated cell by cell, each generating one voucher.
- **Statement import.** CSV / Excel / MT940 with format detection, period, opening / closing balance and duplicate removal (dedupe hash).
- **Bank rules.** IF conditions (Description / Amount / Reference / Direction with contains, starts with, equals, less / greater than, is; match all / any) THEN account + cost centre, with auto-post. Rules run by priority (first match wins) and count their hits.
- **Raast / IBFT matching.** Credits are matched to open invoices by reference and amount with a confidence score; "Match ≥ 90%" matches in bulk.
- **Bank reconciliation.** Per account and period, statement vs book lines are marked Matched / Unmatched / Suggested / Unpresented / Amount differs.
  - Summary: statement balance − unpresented cheques + deposits in transit = adjusted bank, against book + unbooked credits − unbooked debits = adjusted book.
  - "Create adjustments" books the unbooked items.
  - The reconciliation closes only at zero difference; closing advances the account's "reconciled to" and shows in the history.
- **Cash Ledger.** Every drawer / counter / imprest with:
  - running balance, category chips, voucher-type and amount filters, table / timeline / heatmap views;
  - day close with denominations and ±tolerance, and a 14-day variance trend;
  - a voucher drawer with journal lines, attachments and audit trail.

  Entries ≥ Rs 50,000 and contra JVs need Finance Manager approval.
- **Petty cash (imprest).** Funds per branch with custodian, imprest amount and health (Healthy / Topped up / Low / Critical).
  - Petty vouchers (PC-LHR-0412) record category, paid to and receipt status (Attached / Missing / N/A).
  - A top-up replenishes the listed vouchers from cash or bank in one voucher.
- **Expense claims.** Employees submit claims from ESS: receipt scan with OCR, merchant, category with policy limits (per month / meal / night / trip), cost centre or project, purpose and travel request.
  - Finance reviews lines and receipts, then approves (with exception when over policy) or rejects with a reason and the option to resubmit.
  - Approved claims are paid by bank, cash or with payroll. Tracker: Sent → Manager → Finance → Paid.

#### Business rules (in addition to Basic)
- Cheque book: last ≥ first leaf; next leaf within range; issued cheques take the next leaf.
- Bulk rows: 6–8 digit cheque no., due ≥ cheque date, amount > 0. A row is GENERATED exactly when it points at its cheque.
- Rule conditions: allowed operator per field; amounts numeric; direction IN / OUT.
- Reconciliation match: MATCHED / SUGGESTED / AMOUNT_DIFFERS need both a statement line and a book entry. MATCHED needs equal amounts. UNPRESENTED has no statement line.
- Petty voucher: REPLENISHED exactly when linked to a replenishment. ATTACHED exactly when it has receipts. A replenishment pays from exactly one cash or bank account.
- Expense claim:
  - REJECTED exactly when a reason is set; APPROVED / PAID need an approver.
  - PAID needs a payment method (and a payroll run when paid with payroll).
  - Approved amount ≤ claimed. The action trail is append-only.

#### Statuses (in addition to Basic)
- Cheque batch: DRAFT → VALIDATED → GENERATED / PARTIAL · CANCELLED.
- Statement import: UPLOADED → PARSED → MATCHED · FAILED.
- Statement line: UNMATCHED → CATEGORISED / MATCHED · IGNORED.
- Reconciliation: IN_PROGRESS → CLOSED → REOPENED.
- Petty fund: HEALTHY, TOPPED_UP, LOW, CRITICAL, CLOSED.
- Petty voucher: UNREPLENISHED → REPLENISHED · VOID.
- Expense claim: DRAFT → PENDING / OVER_POLICY → APPROVED → PAID · REJECTED · WITHDRAWN.

#### Integrations
- Bank statement files (Meezan / HBL / UBL / Alfalah CSV-Excel layouts, MT940).
- Raast and IBFT credit references.
- Payroll (reimburse with payroll).
- ESS (claims, notifications).
- Approvals engine (`Company.Approvals`).

#### Doc types
CHQ, CHB (cheque batch), PCV (petty cash voucher), EXP (expense claim), REC (reconciliation).


### Tax — Full

**Screens (4).**
- Basic: Tax Codes (`app/tax/codes`).
- Full only: Sales Tax Return (`app/tax/sales-tax`), Withholding Tax (`app/tax/wht`), FBR Integration (`app/tax/fbr`).

**Tables (12).**
- Basic 2: TaxCodes, TaxCodeRates.
- Full-only 10: SalesTaxReturns, SalesTaxReturnLines, WhtChallans, WhtCertificates, WhtDeductions, WhtStatements, FbrSettings, FbrBranchMappings, FbrInvoiceSubmissions, FbrConnectionEvents†.
- † helper table not in the contract registry.

#### Features (in addition to Basic)
- **Monthly sales tax return (STR).**
  - Output tax (Annex-C) with further tax on unregistered buyers, and input tax (Annex-A) with supplier match status.
  - Inadmissible input u/s 8 / 8B and the 90% cap check, carry-forward and net payable.
  - Pre-filing validation:
    - buyer NTN / CNIC;
    - Annex-C reconciles to GL 2210;
    - blacklist check;
    - unmatched input;
    - FBR digital-invoice sync.
  - IRIS export of Annex-A / C / H (CSV or Excel, include or exclude unmatched input), filing, CPR payment and filing history.
- **Withholding register.** Every deduction or collection is kept by section:
  - deducted from vendors and staff (153, 155, 149);
  - collected from customers (236G / 236H);
  - suffered on our receipts (153(1)(a) withheld by customers).

  Each row records the party, ATL status, source document, taxable amount, rate and tax.
- **CPR challans.** Monthly challans settle the unpaid deductions of the chosen sections and create the BPV.
- **Certificates.** Deduction certificates are issued to deductees (PDF), and certificates are received from customers.
- **Statements.** Quarterly u/s 165 and annual u/s 149 statements, with due date, tax, status and filing date.
- **FBR real-time invoicing (PRAL).**
  - Settings: environment (Production / Sandbox), POS ID, NTN / STRN snapshot, token (held in the secret store) with expiry, and branch → POS mapping.
  - Behaviour: report on posting, print QR, block posting if FBR is unreachable, sync interval.
  - Monitoring: a submission log with IRN, status, retries and errors, plus connection history (health checks, timeouts, token renewals).

#### Business rules (in addition to Basic)
- One return per authority, month and revision. Inadmissible input ≤ input tax.
  - FILED / PAID needs a filing date. PAID needs a CPR no., date and amount.
  - CPR numbers are unique.
- Annex lines:
  - C rows are sales-side only with value and tax.
  - A rows are purchase-side with a match status and no further tax.
  - H rows need an item and a closing quantity.
  - At most one source document per row.
- WHT deduction:
  - one party at most, on the side allowed by its direction;
  - PAID exactly when a CPR payment is linked;
  - CLAIMED only for SUFFERED rows.
- WHT certificate: issued ones carry no customer; received ones carry no vendor or employee; dates follow the direction.
- FBR:
  - one configuration per authority;
  - a live connection needs a token reference;
  - one submission per invoice / credit note, and ACCEPTED exactly when an IRN exists;
  - FAILED needs an error;
  - IRNs are unique.
- Connection log is append-only.

#### Statuses (in addition to Basic)
- Sales tax return: DRAFT → VALIDATED → FILED → PAID · REVISED.
- WHT deduction: UNPAID → PAID; CLAIMED (suffered); CANCELLED.
- WHT payment: DRAFT → PAID · CANCELLED.
- WHT return: IN_PREPARATION → FILED → REVISED.
- WHT certificate: DRAFT → ISSUED / RECEIVED → CLAIMED · CANCELLED.
- FBR config: NOT_CONFIGURED → CONNECTED · DEGRADED · DISCONNECTED.
- FBR submission: PENDING → ACCEPTED · FAILED.

#### Integrations
- FBR IRIS (annex upload, WHT statements).
- FBR / PRAL Digital Invoicing API (real-time reporting, QR).
- FBR ATL lookup.
- FBR e-Payment (CPR).

#### Doc types
STR (sales tax return), WHT (WHT challan record).


### Sales & Receivables (sales) — Full

**Screens (18).** Basic 11: Customers (`app/customers`), Customer Detail (`app/customers/view`), Quotations (`app/sales/quotations`), Sales Orders (`app/sales/orders`), Sales Invoices (`app/sales/invoices`), New Invoice (`app/sales/invoices/new`), Invoice View (`app/sales/invoices/view`), Sales Voucher (`app/sales/voucher`), Credit Notes (`app/sales/credit-notes`), Receipts & Allocation (`app/receivables/receipts`), AR Ageing & Reports (`app/receivables/ageing`).

**Tables (35).** Basic 16: `Sales.CustomerGroups`, `customer`, `CustomerContacts`, `CustomerNotes`†, `PriceLists`, `PriceListItems`, `quotation`, `QuotationLines`, `SalesOrders`, `SalesOrderLines`, `invoice`, `SalesInvoiceLines`, `CreditNotes`, `CreditNoteLines`, `receipt`, `CustomerReceiptAllocations`.
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

#### Full additions
**Screens (+7).** POS / Counter Sale (`app/sales/pos`), Delivery Challans (`app/sales/challans`), Sales Returns (`app/sales/returns`), Recurring Invoices (`app/sales/recurring`), Price Lists & Schemes (`app/sales/price-lists`), Credit Control (`app/receivables/credit`), Payment Reminders (`app/receivables/reminders`).

**Tables (+19).** `CustomerAddresses`, `PriceListQuantityBreaks`, `scheme`, `SalesSchemeItems`, `SalesSchemeEligibilities`, `DeliveryChallans`, `DeliveryChallanLines`, `SalesReturns`, `SalesReturnLines`, `PosShifts`, `PosShiftDenominations`†, `PosPayments`, `CreditOverrides`, `CreditHoldEvents`, `PaymentReminderTemplates`, `PaymentReminderRules`, `PaymentReminderLogs`, `RecurringInvoices`, `RecurringInvoiceLines`.

**Columns added to Basic tables.**
- `customer`: `customerChannel` (STANDARD / WHOLESALE), `PriceTiers` (RETAILER / WHOLESALER / DISTRIBUTOR), `priceTierFactor`.
- `invoice`:
  - `channel` adds WHOLESALE (`WS-`) and POS (`POS-`);
  - `PriceTiers`, `priceTierFactor`, `creditOverrideId`, `routeId`;
  - booker / deliveryman / salesman / supervisor `*EmployeeId`;
  - `posShiftId`, `recurringProfileId`, `deliveryChallanId`, `shipToAddressId`;
  - `schemeId`, `schemeAmount`, `stockIssueMode`, `stockIssuedAt`.
- `SalesInvoiceLines`: `listRate`, `isManualRate`, `schemeId`, `deliveryChallanLineId`.
- `CreditNotes`: `salesReturnId`.
- `receipt`: `posShiftId`.

##### Features
- **Channels on one invoice table.** STANDARD (INV), COUNTER (SV), WHOLESALE (WS: quick wholesale entry, bulk invoicing, delivery runs) and POS (POS). Each channel has its own number series, and load sheets, settlement and recovery all point at `Sales.SalesInvoices`.
- **Wholesale pricing.**
  - A shop is a customer with `customerChannel = 'WHOLESALE'` plus a `Distribution.ShopRouteProfiles` profile (route, GPS).
  - The price tier factor (Retailer 1, Wholesaler 0.95, Distributor 0.90) applies to the list rate; a manual rate override is flagged.
  - Booker, salesman, deliveryman and supervisor are `HumanResources.Employees` FKs (commission follows the salesman). Route is a `Distribution.Routes` FK.
  - Delivery-run invoices can issue stock at van dispatch (`stockIssueMode = 'AT_DISPATCH'`).
- **Price lists & schemes.**
  - Price-list editor with live margin on cost, markup + rounding "apply to all", effective-dated save, CSV export.
  - Trade schemes: free goods (buy X get Y), invoice discount above a value, bundle price, line discount (Rs or %), settlement discount (paid within N days) and service promos. Each has dates, eligible groups / customers / tiers, budget cap, max uses per customer, times applied and value given.
  - Quantity-break slabs per item (optionally per list), with no overlapping ranges.
- **POS.**
  - Shift per counter with opening float, barcode / tile cart, held carts and line discount.
  - Multi-tender (cash with change, card, JazzCash, Easypaisa, credit) and the FBR Rs 1 fee.
  - Receipt print, then shift close with a denomination count, expected vs counted over / short, and a Z-report (Z-YYYY-NNNN).
- **Delivery challans.** Created from a sales order with per-line pending qty, vehicle and driver. The flow Packed → Dispatched → Delivered → Invoiced moves stock at dispatch into goods-delivered-not-invoiced, and the challan converts into an invoice without moving stock again.
- **Sales returns.** Against an invoice, without one, or as a replacement. Each line has a reason (expired, damaged, wrong item, customer request) and a disposition (restock, quarantine, write-off) with sensible defaults. The return qty cannot exceed the qty sold. Posting raises the credit note automatically.
- **Recurring invoices.** Weekly / monthly / quarterly / every N days, with start date, end mode (never, on a date, after N runs) and template lines. Auto-send by e-mail and WhatsApp, or save as draft. Actions: Run now, Pause / Resume, Skip next run. MRR is shown.
- **Credit control.**
  - Exposure watchlist: balance + open orders + unposted drafts against the effective limit (limit + approved temporary increase).
  - Override requests: one-time for a document, temporary limit with valid-until, or release of a hold. Each records snapshots, condition and approver, with segregation of duties (requester ≠ approver). The wholesale PIN override is logged in `Distribution.CreditOverrideLogs`.
  - Append-only hold / release log (auto over-limit, overdue, bounced cheque, dunning, manual).
- **Payment reminders / dunning.**
  - Rules by days from the due date (−3, 0, +7, +15, +30 …), mapped to dunning levels (pre-due → final).
  - Channels: WhatsApp, SMS, e-mail. Bilingual EN / UR templates with placeholders.
  - Actions: message, call task, credit hold, legal notice; escalation to a manager, statement attachment, run time 09:00 and quiet hours.
  - Send now / send to all, and a delivery log (queued → sent → delivered → read / failed).

##### Business rules (Full)
- A POS invoice requires an open shift. There is one open shift per branch + counter, and a shift closes only with a counted cash amount and a Z-report number.
- Non-credit POS tenders always produce a `Sales.CustomerReceipts`, so AR stays a single ledger.
- A challan line cannot exceed the pending SO quantity. A challan is INVOICED only with its invoice set.
- `schemeAmount ≤ discountAmount`. Scheme type fields are enforced (e.g. FREE_GOODS needs buy and free qty). `valueGiven ≤ budgetCap`.
- An override needs a decision maker different from the requester. TEMP_LIMIT needs an amount and a valid-until date.
- Credit hold events are append-only. The current state is `Customers.status` / `holdReason`.
- A reminder rule needs at least one channel. Escalation needs a target user. There is one rule per offset day.

##### Statuses (Full)
- Delivery challan: PACKED → DISPATCHED → DELIVERED → INVOICED · CANCELLED.
- Sales return: DRAFT → POSTED · CANCELLED. Line reason / disposition as above.
- POS shift: OPEN → CLOSED. POS tender: CASH / CARD / CREDIT / JAZZCASH / EASYPAISA.
- Credit override: PENDING → APPROVED → USED · REJECTED · EXPIRED.
- Recurring profile: ACTIVE ⇄ PAUSED → ENDED (+ derived "Ends soon").
- Scheme: Live / Off / Scheduled / Ended (derived from `isActive` and dates).
- Reminder log: QUEUED → SENT → DELIVERED → READ · FAILED.

##### Integrations (Full)
- WhatsApp Business API, Jazz SMS gateway and e-mail delivery receipts.
- Card terminals (HBL POS), JazzCash / Easypaisa wallets.
- FBR POS integration per counter (`Tax.FbrBranchMappings`).


### Purchases & payables

**Schema:** `Purchases`
**Tables (Full, 19):** the 13 Basic tables (VendorCategories, vendor, VendorContacts, PurchaseOrders, PurchaseOrderLines, grn, GoodsReceivedNoteLines, bill, VendorBillLines, DebitNotes, DebitNoteLines, VendorPayments, VendorPaymentAllocations) + VendorBankAccounts, PurchaseReturns, PurchaseReturnLines, LandedCostShipments, LandedCostItems, LandedCostCharges
**Screens (12):** app/vendors, app/vendors/view, app/purchases/orders, app/purchases/grn, app/purchases/bills, app/purchases/bills/new, app/purchases/voucher, app/purchases/debit-notes, app/purchases/returns, app/purchases/landed-cost, app/payables/payments, app/payables/ageing

#### Features (Basic, unchanged)
- **Vendor master** (`VEN-0001`):
  - Tax and FBR: legal name, category, NTN or CNIC, STRN, FBR Active Taxpayer (ATL) status with "Verify ATL", default WHT section (153(1)(a) goods / (b) services / (c) contracts / Exempt).
  - Accounts and terms: expense or inventory account, payable account, payment terms and credit days.
  - Contacts and banking: phone, email, address, city, primary bank and IBAN, and contacts.
  - **Vendor 360** has tabs Overview, Bills, Payments, Statement and Documents.
- **Purchase orders** (`PO-2026-000001`): two-level approval (`PENDING_L1` → `PENDING_L2`) above the company threshold. Approval emails the PO to the vendor. Receipt and billing progress roll up from the lines.
- **Goods received (GRN):**
  - Received against an approved PO: ordered, previously received, received now, accepted, rejected with a reason, then batch, expiry and cost.
  - Records QC and the receiving warehouse, and shows a live 3-way match. Posting stocks the goods in and accrues GRNI.
- **Vendor bills** (`BILL-`):
  - The system warns on a duplicate vendor invoice number. PO and GRN lines are pulled through.
  - Lines carry GST/SST and a WHT section each. Matching gives a 3-way match state with the variance %.
  - Bills go through a 2-level approval route, can be captured with OCR, and can be marked disputed.
- **Purchase voucher** (`PV-`): a counter purchase (`VendorBills.channel = COUNTER`).
  - The grid has Ps-Qty / Bonus / Brk / T-Qty and a markup helper.
  - Pay mode: credit, cash, bank or cheque, with an amount paid now. WHT u/s 153 % and advance tax 236G are applied.
- **Debit notes** (`DN-`): four reasons, input GST reversal and WHT adjustment. Settled by adjusting against the bill or by a refund.
- **Payments** (`PAY-`):
  - **Payment run:** one payment per vendor, by IBFT, cheque, pay order or cash. Cheque number series and crossing, bank charges, and the bulk-IBFT file.
  - **Allocation:** on-account allocation, manual or FIFO, with debit notes usable as credits. WHT is either already withheld at the bill or withheld now.
- **AP ageing and reports** (views): ageing, purchase register, vendor statement, WHT deducted, and purchases by vendor.

#### Full additions
- **Vendor banks** (`Purchases.VendorBankAccounts`): several accounts per vendor, with IBAN or SWIFT and currency (for foreign suppliers paid by TT). `Vendors.countryCode` marks foreign suppliers.
- **Purchase returns** (`PR-2026-000001`, app/purchases/returns):
  - Header: supplier, return date, reference purchase (PV or bill), supplier bill number.
  - Payment type: Credit or Cash refund.
  - Reason: expired, damaged, wrong item or quality.
  - Dispatch details: gate pass number, transporter and debit-note narration.
  - Lines: batch, expiry, rate, return qty (limited to the purchased qty), bonus, disc % and GST.
  - Tabs: Effect (stock, payable and GST tiles plus the reversal journal preview) and Additional Information.
  - Statuses: `DRAFT` → `POSTED` → `REFERENCED` (once a debit note is raised from it) · `CANCELLED`.
  - On a Credit return, posting raises the debit note that settles the referenced bill.
- **Landed cost** (`LC-2026-001`, app/purchases/landed-cost; the prototype used a country prefix such as `CN-2026-014`, which is replaced):
  - **Import shipment:** origin, ports, mode and container, B/L, WeBOC GD, LC or TT reference, fx, ETA and cleared date.
  - **Cost lines:** customs duty, ACD, RD, import sales tax, s.148 income tax, freight, haulage, clearing, port, insurance, demurrage, detention, LC charges, excise cess and PSQCA testing. Each has a payee, an "In cost" switch and a "Claimable" flag.
  - **Allocation** by Value, Qty or Weight onto the GRN lines gives the landed unit cost and the % uplift.
  - **Post** creates the journal and revalues the moving-average cost.
  - **Statuses:** `IN_TRANSIT` → `CLEARED` → `POSTED` · `CANCELLED`.
- **Dimensions:** `PurchaseOrders.departmentId` (HumanResources.Departments) and `projectId`, plus `VendorBills.projectId` and `VendorBillLines.projectId` (Accounting.Projects). Budget availability on the PO is read from acc budgets.
- **Payments:** `VendorPayments.chequeBookId` (BankCash.ChequeBooks), so cheque numbers are issued from a registered book.
- **Approvals engine:** the PO, bill and payment approvals run through `Company.Approvals` (polymorphic), which adds the "Nudge" reminders.
- **Tax:** WHT on bills and payments feeds `Tax.WhtDeductions`, `Tax.WhtChallans` (CPR) and `Tax.WhtCertificates`. Input tax and its reversal feed `Tax.SalesTaxReturnLines` (Annex-A).

#### Key business rules
All the Basic rules apply: numbering through `Company.getNextDocNo()`, base-unit quantities, insert as DRAFT then post by status change, trigger locks on posted documents, no over-receipt, bill balance maintained from `VendorPaymentAllocations`, same-vendor settlement only, and WHT u/s 153 doubled for vendors not on the ATL. Full adds:
- **Purchase returns:**
  - A return line cannot exceed the purchased qty ("of 24").
  - A Cash refund needs a cash account.
  - A Credit return settles through its debit note.
- **Landed cost shipments:**
  - A shipment can be posted only once it is `CLEARED` and linked to its GRN. Only one live shipment is allowed per GRN.
  - The capitalised total equals the sum of the allocated amounts. Rounding goes to the last line.
  - Import sales tax and s.148 tax are claimable, not cost, unless switched in (the UI warns "will overstate stock cost").
- **Import GRNs** (`GoodsReceivedNotes.isImport`) post stock at the provisional FOB cost and no GL. The landed-cost journal brings the goods into inventory at the full landed value.

#### Statuses
| Document | Statuses |
|---|---|
| Vendor | ACTIVE, INACTIVE · ATL: ACTIVE, NOT_ON_ATL, UNVERIFIED |
| Purchase order | DRAFT → PENDING_L1 → PENDING_L2 → APPROVED → PARTIALLY_RECEIVED → RECEIVED → BILLED · CANCELLED |
| GRN | DRAFT → POSTED · CANCELLED · QC PASSED / PARTIAL_REJECT · bill AWAITING / PARTIALLY_BILLED / BILLED · match MATCHED / QTY_VARIANCE / TWO_WAY_BILL_AWAITED / OVER_RECEIPT |
| Bill / PV | DRAFT → AWAITING_APPROVAL → APPROVED → POSTED → PARTIALLY_PAID → PAID · VOID (OVERDUE, DUE_TODAY derived) |
| Debit note | DRAFT → OPEN → APPLIED or REFUNDED · VOID |
| Vendor payment | DRAFT → PENDING_APPROVAL → POSTED → PRESENTED → CLEARED · VOID |
| Purchase return | DRAFT → POSTED → REFERENCED · CANCELLED |
| Landed cost shipment | IN_TRANSIT → CLEARED → POSTED · CANCELLED |

#### Integrations
- **FBR ATL check.**
- **Bank:** the bulk-IBFT file.
- **Cheques:** cheque book and cheque register.
- **OCR:** bill capture.
- **Email:** the PO and debit note go to the vendor.
- **Imports:** WeBOC GD and B/L references, and LC or TT through the bank account.


### Inventory

**Screens (18).** Product Catalogue, Product Detail, Companies & Brands, Product Classes, Kits & Bundles, Barcode Labels, Warehouses, Whole Stock, Stock In / Out, Stock Transfers, Stock Adjustments, Stock Count, Stock Vouchers, Batches & Expiry, Stock In View, Stock Movements, Demand & Reorder, Inventory Reports. Schema `Inventory` (41 tables).

**Features.**
- **Catalogue.** Items (`PK-1001`) with UPC (8 / 12 / 13 digits), Urdu name, image, carton size + loose unit (multi-UoM), shelf hint, purchase / average / retail / wholesale prices, GST %, financial discount %, low / high levels, HS code, and attributes Short (no discount at sale), Required Expiry, Controlled, Precious. Piece and carton barcodes (unique per tenant). Drafts, activation, soft delete, duplicate, import, inline price edit, **bulk price update** (by company / class / selection, % with Rs 1 / 5 / 10 rounding, undo) with full price history.
- **Principals.** Companies & Brands (`CO-07`) with colour, contacts and notes; principal claims (scheme / damage / expiry, settled via vendor credit) and period purchase targets.
- **Classification.** Main classes `MC-NNN` and sub types `ST-NNN` with icon, visibility and drag-and-drop order.
- **Kits & bundles.** Bill of materials (`KIT-NNN`), live cost roll-up, target margin and suggested price, assemble / disassemble vouchers (`ASM`); assembled kits are stocked as their own item.
- **Labels.** Thermal 2×1", 38×25 mm and A4 40-up templates; price, Urdu name, batch / expiry, company and carton-barcode options; print jobs are logged.
- **Locations.** Warehouses, shops and vans (`WH-LHR`, `SH-DHA`), each with branch, manager, capacity, its own inventory GL account and a "block negative stock" switch; bins `A-01-01` (rack-row-bin).
- **Batches & expiry.** Batch / expiry / mfg date / cost; FEFO register with expiry windows, timeline and calendar; dispositions Saleable, Priority, Quarantine, Clearance, Return to principal, Written off.
- **Stock ledger.** Append-only `Inventory.StockMovements` (17 movement types) with trigger-maintained balances per item × warehouse × bin × batch (on hand, reserved, available, value, last movement); moving weighted-average cost; reservations for sales orders.
- **Stock operations.** Manual stock in / out (`MI` / `MO`) by reason; transfers (`TRF-YYYY-NNNNNN`) with dispatch, in-transit tracking, driver / vehicle and per-line receipt variance; adjustments (`ADJ`) with approval above Rs 25,000; physical counts (`SC`) with scope (classes, ABC-A only), blind counting, frozen snapshot, scanner entry, variance reasons and journal; stock vouchers for breakage, gifts, samples and internal use (`BRK / GFT / SMP / INT`).
- **Planning.** Reorder rules, reorder suggestions grouped by preferred supplier, demand of goods (`DMD`) to a principal → purchase orders.
- **Reporting.** Whole Stock (current / as on date), Stock In View (opening / in / out / closing by company), Stock Movements, Report Studio inventory reports (current, as-on, over, minus, list, checking, value, movement, dead / slow, ABC, near expiry).

**Key business rules.**
1. Stock is derived only from the ledger; the ledger is append-only (UPDATE / DELETE / TRUNCATE rejected). Corrections are new documents.
2. Every ledger row has exactly one of `qtyIn` / `qtyOut` > 0, in base units; `baseQty = qtyCtn × ctn + qtyLoose`.
3. A warehouse with `blockNegativeStock` rejects any movement that would take a slot (item × bin × batch) below zero; others allow minus stock (reported).
4. Expiry-tracked items need a batch (with expiry) on every movement; unsaleable batches cannot be sold.
5. Retail price ≥ purchase price, low level ≤ high level; an ACTIVE item must have a company, class and prices.
6. Adjustments above the approval limit (Rs 25,000, `Company.CompanySettingValues`) need Finance Manager approval before posting; count variances need a reason per line and an approver.
7. Transfers cannot have the same source and destination; stock leaves the source at posting and arrives at receipt.
8. Item codes, UPCs, barcodes, company codes / names, class and sub-type names, batch numbers (per item) and document numbers are unique per tenant.
9. Document numbers come from `Company.getNextDocNo` (MI, MO, TRF, ADJ, SC, BRK, GFT, SMP, INT, ASM, DMD, PCB; masters ITEM, MFR, KIT, WH).

**Statuses.**
- Item: DRAFT → ACTIVE ↔ INACTIVE.
- Manual stock entry: DRAFT → POSTED · CANCELLED.
- Transfer: DRAFT → POSTED → DISPATCHED → IN_TRANSIT → RECEIVED · CANCELLED.
- Adjustment: DRAFT → PENDING_APPROVAL → POSTED · REJECTED · CANCELLED.
- Stock count: DRAFT → COUNTING → VARIANCE_REVIEW → APPROVED · CANCELLED.
- Stock voucher / assembly voucher: DRAFT → POSTED · CANCELLED.
- Demand: DRAFT → SAVED → ORDERED · CANCELLED.
- Batch disposition: SALEABLE · PRIORITY · QUARANTINE · CLEARANCE · RETURN_TO_PRINCIPAL · WRITTEN_OFF.
- Bulk price batch: DRAFT → APPLIED → UNDONE. Label job: QUEUED → PRINTED · FAILED.

**Integrations.** Purchases (GRN in, returns, demand → PO, item suppliers, claims via debit notes), Sales (SALE out, returns, reservations, schemes), Distribution (vans as warehouses, vehicles / drivers on transfers), Accounting (JV per stock document), HR (requested by / driver / department), Report Studio.

**Upgrade from Basic.** Add columns `Inventory.Products` (weightKg, abcClass, avgDailySales, lastSaleDate, leadDays), `Inventory.Warehouses.vehicleId` (+ type VAN), `Inventory.StockInOut.requestedByEmployeeId`, `Inventory.StockTransfers` (driverEmployeeId, vehicleId); create the 22 Full tables and the last-sale / reservation / kit triggers; seed label templates.


### Wholesale & Distribution (FULL edition only)

**Schema** `Distribution` · **Screens (8)** app/wholesale/entry, /bulk, /bookings, /backorders, /load-sheet, /settlement, /recovery, /routes · **Sources** `src/4D-wholesale.html`, `src/9H-wholesale.js`, `src/4E-distribution.html`, `src/9I-distribution.js`, `src/91-data.js` · **Plan module key** `DIST` · **Release phase** P4

#### What it does
It runs the sales side of an FMCG or trading distributor:
- Shops are grouped on beats (routes), and bookers take orders in the field.
- Orders become wholesale invoices, which load onto vans.
- At day end the salesman settles cash, cheques and returns.
- Recovery rounds chase outstanding balances, and the team is paid commission against monthly targets.

#### Features
- **Quick Wholesale Entry**
  - Keyboard-first billing: carton + piece qty, piece/carton rate toggle, and price tiers (Retailer ×1.00, Wholesaler ×0.95, Distributor ×0.90).
  - Live schemes add free lines ("Buy 10 get 1").
  - Input tools: barcode scan mode (piece and carton barcodes), Add many, Paste from Excel, Repeat last order, order templates.
  - Hold/recall of parked bills.
  - Live credit panel (limit, outstanding, this bill, available, overdue days). Going over the limit is blocked unless a manager approves it by PIN: 3 attempts then lock-out, and every attempt is logged.
  - Print (A4, 2 copies) and WhatsApp share.
- **Bulk Invoicing**
  - Bill a whole route in two modes: a shops × products carton matrix, or the same items to selected shops.
  - Cells tint with quantity, and you can fill them from last orders.
  - Credit is checked per shop; over-limit shops are **skipped, never overridden**, and their reason is recorded.
  - The result shows the invoice number range and links straight to the load sheet.
- **Order Bookings**
  - Orders sync from the booker app with GPS verification (within 25 m of the shop pin, otherwise "N km off" and the supervisor is notified).
  - Stock check serves the oldest booking first.
  - Bulk convert to invoices, optionally allowing partial delivery. Shortages create back-orders; without "allow partial" the booking is held.
- **Back-orders**
  - Pending quantities are shown by item or by customer, with age and value at tier rates.
  - A live incoming-stock feed comes from GRNs.
  - Allocate an arrival by one of three policies: FEFO + oldest, Priority tier (Distributor first) or Pro-rata. The preview shows allocated qty and batch per shop.
  - Convert allocated lines to invoices, or cancel lines with a reason (customer no longer needs it, discontinued, other distributor, price disagreement). Cancelling notifies the shop by SMS.
- **Load Sheets**
  - The run builder has route, van, driver, date and departure, and shows on-beat/off-beat for the date. You pick the open invoices to load.
  - The consolidated pick list is sorted by shelf, split into cartons and loose pieces, with weight and value and a picked tick.
  - Van capacity meters show cartons and kg against the van's capacity: warn at 85 %, block dispatch over 100 %.
  - Prints a load sheet (LS) and a gate pass (GP, seal no, QR).
  - Dispatch moves the stock into the van.
- **Route Settlement**
  - A per-invoice grid records delivery state (Full / Partial / Not delivered + reason), returns per line with reason, and cash / cheque (no, bank, date) / credit. The difference chip can book a shortfall as credit.
  - Cash bag count by PKR denomination (5000…10) with short/excess.
  - Van stock reconciliation: loaded, delivered, returned, counted, variance.
  - Journal preview, then post: receipts, sales returns, stock back, one JV, run closed.
- **Recovery Sheet**
  - Built per salesman, route and date. Each shop shows outstanding, 0–30 / 31–60 / 61–90 / 90+ ageing, last payment, amount collected, mode (Cash / Cheque / Online / JazzCash), remarks and promise-to-pay date.
  - Target ring and KPIs.
  - WhatsApp reminder in English or Urdu.
  - Printable sheet.
  - Bulk-post receipts, allocated FIFO to the oldest invoices.
- **Routes & Salesmen**
  - Route cards show visit days, booker, salesman, van, driver, shop count and monthly sales trend.
  - Route map with ordered stops and ETA.
  - Drag-and-drop shop assignment between routes.
  - New route wizard.
  - Booker/salesman cards: target achievement, strike rate, productive calls and commission.
  - Leaderboard.
  - Commission slab table.

#### Key business rules
1. A shop is a `Sales.Customers` with exactly one `Distribution.ShopRouteProfiles` profile (route, area, tier, pin, recovery target). All AR is in the single sales ledger.
2. **Price rules.**
   - Tier rate = item wholesale price × `PriceTiers.rateFactor`.
   - A booking freezes its rate at booking time. Manual rate edits are flagged on the line.
3. **Carton maths.**
   - `baseQty = qtyCtn × unitsPerCtn + qtyLoose`.
   - Loose pieces ≥ pack size roll into cartons.
   - Load lists always split base qty into whole cartons + loose (< pack).
4. **Credit.**
   - Used = outstanding + this bill. Over 80 % is a warning; over 100 % blocks the save.
   - Override needs a manager PIN; 3 wrong attempts lock the override (logged as LOCKED).
   - Bulk invoicing never overrides.
5. **Bookings.**
   - The stock check is served in booking-time order.
   - Conversion re-checks stock live.
   - The short qty becomes a back-order (source BK) when partial is allowed; otherwise the booking is HELD.
6. **Back-orders.**
   - `pending = original − invoiced − cancelled`, and `allocated ≤ pending`.
   - The status (WAITING / PART_ALLOCATED / READY / INVOICED / CANCELLED) is enforced by a CHECK against the quantities.
7. **Runs.**
   - An invoice can be on only one live run.
   - Dispatch requires ≥ 1 invoice and capacity ≤ 100 % (cartons and kg).
   - Only one dispatched run per van at a time.
   - After dispatch the load is locked.
8. **Settlement.**
   - Net = max(invoice − returns, 0); difference = net − cash − cheque − credit.
   - Not delivered ⇒ full return and no collection.
   - Return qty ≤ supplied.
   - Van expected = returned qty, and the variance is valued at cost.
   - After SETTLED every detail row is frozen.
9. **Recovery.**
   - Collected ≤ outstanding.
   - The ageing buckets must sum to outstanding.
   - Posting allocates FIFO to the oldest invoices.
   - A posted entry is immutable.
10. **Commission.**
    - The slab is chosen by achievement % (bands [from, to), with no overlapping active slabs).
    - Commission = achieved × rate / 100.
    - Accrued by journal and paid via payroll or cash.

#### Statuses
| Document | Statuses |
|---|---|
| Held bill | HELD → RECALLED · DISCARDED |
| Credit override log | PENDING → APPROVED · DENIED · LOCKED |
| Bulk invoice batch | DRAFT → GENERATING → COMPLETED · FAILED |
| Order booking (BK) | NEW → CHECKED → CONVERTED · PARTIAL · HELD · CANCELLED |
| Back-order line | WAITING → PART_ALLOCATED → READY → INVOICED · CANCELLED |
| Back-order allocation | ALLOCATED → INVOICED · RELEASED |
| Delivery run (RUN) | LOADING → SCHEDULED → DISPATCHED → SETTLED · CANCELLED |
| Route settlement (RS) | OPEN → SETTLED |
| Recovery entry | PENDING → PROMISED → READY → POSTED |
| Recovery sheet (RCV) | OPEN → POSTED → CLOSED |
| Sales target | OPEN → CLOSED |
| Salesman commission | DRAFT → APPROVED → ACCRUED → PAID · CANCELLED |

#### Document numbers (`Company.NumberingSeries`)
| Doc type | Example | Pattern |
|---|---|---|
| WS (sales) | WS-2026-000231 | `{PREFIX}-{YYYY}-{SEQ6}` |
| BK | BK-2026-4120 | `{PREFIX}-{YYYY}-{SEQ4}` |
| RUN | RUN-2026-0412 | `{PREFIX}-{YYYY}-{SEQ4}` |
| LS | LS-0412 | `{PREFIX}-{SEQ4}` |
| GP | GP-2026-0412 | `{PREFIX}-{YYYY}-{SEQ4}` |
| RS | RS-2026-0412 | `{PREFIX}-{YYYY}-{SEQ4}` |
| RCV | RCV-2026-0001 | `{PREFIX}-{YYYY}-{SEQ4}` |
| RT (route master) | RT-01 | `{PREFIX}-{SEQ2}` |
| SHP (shop customer code) | SHP-001 | `{PREFIX}-{SEQ3}` |

#### Integrations
- **Booker mobile app sync:** bookings, GPS.
- **WhatsApp:** invoice share, recovery reminders in EN and UR.
- **SMS:** back-order cancellation notice.
- **Barcode scanners:** piece and carton barcodes.
- **Printing:** A4 invoice, load sheet, gate pass with QR, recovery sheet.

#### Permissions
`ws:entry`, `ws:post`, `ws:CreditOverrides`, `ws:template`, `ws:bulk`, `bk:view`, `bk:convert`, `bo:view`, `bo:allocate`, `bo:convert`, `bo:cancel`, `run:view`, `run:build`, `run:dispatch`, `rs:view`, `rs:edit`, `rs:post`, `rcv:view`, `rcv:edit`, `rcv:post`, `route:view`, `route:edit`, `target:edit`, `commission:approve`.

#### Personas
- **Booker:** app, bookings.
- **Salesman:** recovery, settlement cash bag.
- **Driver / deliveryman:** run.
- **Store keeper:** pick list, gate pass.
- **Supervisor:** GPS exceptions, load check.
- **Operations head:** credit PIN override.
- **Cashier / accountant:** settlement posting.

#### Simulated in the prototype
- GPS pins and offsets.
- The route map geometry.
- Item weight per piece (`WT` table; will come from `Inventory.Products.weightKg`).
- The monthly sales sparklines.
- The booker app sync.

#### Out of scope
- Live vehicle tracking and route optimisation (the "Optimise stop order" button only re-sequences stops).
- Van sales without a prior invoice.
- Returnable-crate ledger: only a count is printed on the gate pass.


### HR (Full edition) — schema `HumanResources`

**Screens (22).**
- People: `app/hr/employees`, `/employees/new`, `/employees/view`, `/departments`, `/org`
- Time & attendance: `/attendance`, `/attendance/register`, `/attendance/requests`, `/devices`, `/shifts`, `/holidays`, `/overtime`
- Leave: `/leave`, `/leave/requests`, `/leave/balances`, `/leave/policies`
- Lifecycle and talent: `/onboarding`, `/offboarding`, `/recruitment`, `/performance`, `/training`
- Reports: `/reports`

ESS reuses the HR tables for attendance corrections, leave, goals, 1:1s, feedback and onboarding tasks. Payroll, loans and final settlement are scoped under Payroll.

#### Features
- **Employee master** (`EMP-0042`):
  - Identity exactly as on the NADRA CNIC: father/husband name, CNIC issue/expiry, DOB, gender, marital status, religion, blood group.
  - Contact and emergency contacts.
  - Job: department, designation, grade, reporting manager, cost centre, branch, shift, weekly off.
  - Terms: employment type, probation, confirmation, notice period, biometric ID.
  - Field-role flags (booker / salesman / deliveryman / supervisor) that the distribution pickers use.
  - Statutory record (EOBI, PESSI/SESSI/KPESSI, NTN, ATL filer status, PF, group insurance, OT eligibility) and a salary bank account (IBAN, bank/cheque/cash).
  - Documents with verification and expiry, assets in custody, position history, and HR letters (salary certificate, experience, NOC, increment, warning) in English or Urdu.
- **5-step Add Employee wizard.** One save creates the employee, statutory and bank records, documents, the salary (payroll) and the ESS login, and starts the onboarding checklist.
- **Organisation:**
  - Departments with parent, head, cost centre, annual budget and division.
  - Designations with approved positions (filled/open are derived).
  - Grade bands G-1…G-8 with min/mid/max monthly gross.
  - Branch HR settings: social security scheme, branch manager, default shift, ESS geofence.
  - Org chart that shows vacancies.
- **Time & attendance:**
  - **Devices.** ZKTeco devices over ADMS push or TCP pull, with a heartbeat/sync log.
  - **Punches.** Raw punches are partitioned by month and come from three sources: device, manual, and ESS selfie + geofence.
  - **Daily attendance.** One processed row per employee per day: status, in/out, late/early/worked/OT minutes, payable fraction.
  - **Monthly register.** Codes P/A/L/H/W/LT/HD, locked once payroll uses it.
  - **Regularisation requests** (`REG-`): missed punch, late arrival, on-duty, WFH, early leaving. Approval goes line manager → HR.
- **Shifts and holidays:**
  - Shifts carry grace, break, Friday Jumu'ah break, half-day threshold, late marks per ½-day, OT start, night and seasonal (Ramzan) options.
  - Weekly roster (shift / OFF / LEAVE) that can be published to ESS.
  - Holiday calendar with public, company, optional and event types. Moon-dependent dates are tentative, holidays can be limited to branches, and the gazette can be imported.
- **Overtime:**
  - Policy (one active per tenant): weekday 1.5×, weekly off 2×, holiday 2×; hourly basis gross÷26÷8; daily and monthly caps; minimum minutes; rounding; eligible grade; pre-approval; comp-off option.
  - Claims (`OT-`): amount = hours × hourly rate × multiplier.
  - Push to payroll, or comp-off credit.
- **Leave:**
  - Fully configurable leave types: accrual monthly/upfront/event/once in service; pro-rata for new joiners; carry forward capped/unlimited with expiry and accumulation cap; encashment at year end or exit (basic or gross ÷ 30).
  - Rules: sandwich, half day, negative balance, payroll-lock block, attachment rules, backdating, minimum notice, maximum consecutive days, maximum per month, maximum times in service.
  - Eligibility by gender, employment type, branch, grade and service length, plus an approval workflow per type.
  - Requests (`LV-`): full day / half AM / half PM, handover, contact during leave.
  - A balance ledger per employee × type × leave year, with manual adjustments and a year-end carry forward run (carry / encash / lapse).
- **Lifecycle:**
  - Onboarding templates and checklists (new joiner and role-change tracks) with owners, due dates and a buddy.
  - Offboarding (`OFF-`): resignation/termination, notice served, reason, retention talk, departmental clearance (IT, Admin, Finance, Line manager, HR), exit interview (confidential option), then hand-off to final settlement in payroll.
- **Talent:**
  - Recruitment: requisitions (`REQ-`) with a candidate pipeline (Rozee.pk / LinkedIn / careers page / referral), activities, ratings and offers. A hire creates the employee and starts onboarding.
  - Performance: cycles (goal setting → self → manager → calibration → sign-off), reviews with a 9-box grid, KRAs/OKRs with key results, competency ratings, 1:1s and feedback.
  - Training: programs, sessions, enrolments and certifications with expiry reminders.
- **Reports** (HR Report Studio): headcount, attendance summary, leave balances/liability, late arrivals, turnover and department cost. All of these are views.

#### Key business rules
- Each tenant has a unique EMP code, CNIC, biometric ID and ESS user. Reporting manager ≠ self, and DOB must be before joining.
- `status = EXITED` ⇔ `exitDate` is set. Opening an offboarding case sets NOTICE_PERIOD. Closing it sets EXITED and writes a history row.
- Attendance day: one row per employee per date. LATE counts as present. Payable fraction is 0 / 0.5 / 1. Once payroll locks a day it is read-only (trigger), and later corrections go through the next payroll.
- Late marks: every *n* late marks (shift `lateMarksPerHalfDay`, default 3) costs ½ day unless the mark is waived.
- Regularisation requests: at most N per month (company setting, "4 allowed"). An approved request adds a MANUAL punch and recomputes the day.
- Leave:
  - An employee cannot hold two live (pending or approved) requests over overlapping dates (exclusion constraint).
  - A half day is a single date with 0.5 days.
  - The balance is maintained only by triggers: pending → `booked`, approved → `used`, adjustments → entitled / carried / adjusted / encashed / lapsed.
  - A negative balance on a paid type is rejected unless the type allows it.
- Overtime amount must equal hours × rate × multiplier, or 0 when it is taken as comp-off. A comp-off entry creates exactly one COMP_OFF leave credit. Only APPROVED, non-comp-off entries can be pushed to payroll.
- Sandwich rule: holidays and weekly offs between leave days count as leave when the type has `sandwichRule`.
- Exits: the exit interview is unique per exit case. Clearance must be complete before the case moves to SETTLEMENT.

#### Statuses
| Entity | Values |
|---|---|
| employee | PROBATION, ACTIVE, ON_LEAVE, NOTICE_PERIOD, EXITED |
| AttendanceRegister | PRESENT, LATE, WFH, ON_DUTY, HALF_DAY, ABSENT, LEAVE, HOLIDAY, WEEKLY_OFF |
| RegularisationRequests | PENDING → APPROVED / REJECTED / WITHDRAWN (stage LINE_MANAGER → HR) |
| device | ONLINE, OFFLINE, UNSTABLE |
| holiday | UPCOMING, TENTATIVE, OBSERVED, CANCELLED |
| OvertimeClaims | PENDING → APPROVED → PUSHED · REJECTED · CANCELLED |
| LeaveRequests | PENDING → APPROVED / REJECTED · CANCELLED (stage LINE_MANAGER → HR_REVIEW → CEO) |
| LeaveYearEndClosings | DRAFT → COMPLETED · REVERSED |
| onboarding / task | PRE_JOINING → IN_PROGRESS → COMPLETED · CANCELLED / NOT_STARTED → IN_PROGRESS · SCHEDULED → COMPLETED · SKIPPED (overdue derived) |
| offboarding | SERVING_NOTICE → RETENTION_TALK → SETTLEMENT → CLOSED · WITHDRAWN |
| JobOpenings | DRAFT → PENDING_APPROVAL → OPEN ↔ ON_HOLD → OFFER_STAGE → CLOSED · CANCELLED |
| candidate | APPLIED → SCREENING → INTERVIEW → OFFER → HIRED · REJECTED |
| PerformanceCycles stage / review | GOAL_SETTING → SELF_REVIEW → MANAGER_REVIEW → CALIBRATION → SIGN_OFF / SELF_PENDING → AWAITING_MANAGER → REVIEWED → CALIBRATED → SIGNED_OFF |
| training enrolment | ENROLLED → IN_PROGRESS → COMPLETED · BEHIND · WITHDRAWN |

#### Document numbers
EMP (`EMP-0042`), REG (`REG-2026-0418`), OT (`OT-2026-0214`), LV (`LV-2026-0612`), REQ (`REQ-2026-031`), ONB, OFF. These come from `Company.getNextDocNo`. The ESS prototype prefixes `AC-` and `LR-` are unified into REG and LV.

#### Integrations
- ZKTeco biometric devices: ADMS push to the cloud, or TCP pull on port 4370.
- ESS mobile check-in with selfie, liveness and geofence.
- Rozee.pk / LinkedIn / careers page as candidate sources.
- .ics holiday feed.
- Cabinet Division gazette import.
- Email/SMS through `Company.Notifications`.

#### Statutory context (PK)
- EOBI: 5% employer / 1% employee.
- Provincial social security: PESSI (Punjab), SESSI (Sindh), KPESSI (KP).
- Income tax u/s 149, with ATL filer status.
- Labour law: Factories Act 1934 and the Shops & Establishments Ordinance 1969 (overtime, leave); Maternity & Paternity Leave Act 2023 (90 / 30 days).

#### Out of scope here
Salary, payroll runs, payslips, loans and final settlement (Payroll). Helpdesk, letters requested from ESS, kudos and polls (ESS). HR posts nothing to the GL.


### Payroll (FULL edition — release P5)

**Screens (8):** Payroll Overview `app/hr/payroll` · Run Payroll `app/hr/payroll/run` · Salary Structures `app/hr/payroll/structures` · Payslips `app/hr/payroll/payslips` · Payslip `app/hr/payroll/payslip` · Payroll Reports `app/hr/payroll/reports` · Loans & Advances `app/hr/loans` · Final Settlement `app/hr/settlement`. Employee-facing parts live in ESS (`ess/payslips`, `ess/tax`, `ess/loans`).

**Tables (schema `Payroll`, 20):** SalaryComponents, SalaryStructures, SalaryStructureComponents, SalaryStructureCommissionTiers*, payGroup*, EmployeeSalaries, loan, PayrollRuns, PayrollRunBranches, PayrollRunChecklistItems*, SalaryPaymentBatches*, PayrollAdjustments, PayrollRunLines, PayrollRunLineComponents, payslip, FinalSettlements, FinalSettlementLines, LoanInstallments, TaxDeclarations, SalaryTaxSlabs (* = helper tables beyond the registry).

#### Features
- **Salary components** — earnings, deductions and employer contributions; calculation PERCENT_OF / FIXED / FORMULA / MONTHLY_INPUT / SYSTEM; GL debit/credit mapping; tax treatment FULLY_TAXABLE / EXEMPT_UPTO_LIMIT (10% of basic medical, Rs 150,000 p.a. employer PF) / EXEMPT; flags prorate, show on payslip, gratuity base, EOBI wage; statutory roles (ITX, EOB/EOR, PSI, PFE/PFR, GRT, LON, ADV).
- **Structures** — grade structures G1–G5 (basic band, gross mid, component overrides such as "B × 45%", "Rs 7,500", "120 L × OGRA") and add-on plans (S1 commission tiers by target achievement, cap 50% of basic). Duplicate as draft.
- **Employee salary** — effective-dated (no overlaps, exclusion constraint), structure + add-on, basic, gross, pay group, pay mode; revisions feed the run ("4 revisions effective 01 Oct").
- **Payroll run wizard** — Period & Scope (month, period, pay date, attendance cut-off, run type REGULAR / OFF_CYCLE / BONUS_ONLY, pay group, salary payable account, branches, include notice / exited) → Inputs (attendance sync, approved OT, LWP, loan installments, salary revisions, one-time arrears/bonus/commission lines, CSV import, missing-punch resolution) → Review (per-employee lines, variance vs last month, flags: >15% variance, missing IBAN, negative-net risk, pro-rata) → Approve (multi-level workflow, checklist) → Post & Pay (GL journal preview, bank files per bank, payslip email/ESS publish, SMS, deposit reminders).
- **Tax engine** — u/s 149 projected annual taxable salary on the tenant copy of FBR slabs (`SalaryTaxSlabs`, tax year 2026-27), less exemptions and ESS declarations (Zakat s.60 deductible; donations s.61, health insurance s.62A, VPS s.63 as credits at average rate), spread over remaining months; filer / non-filer status.
- **Statutory** — EOBI 1% employee / 5% employer of minimum wage Rs 37,000; PESSI 6% employer (Punjab; SESSI for Karachi); PF 8% / 8% of basic (settings show 8.33% — configurable on the component); gratuity provision 1 month basic per completed year.
- **Payslips** — numbered PS-YYYY-MM-NNNN, PDF password = CNIC last 5, email with delivery tracking (EMAILED / VIEWED / BOUNCED / NO_EMAIL / ON_HOLD), YTD, tax computation, loan and PF balances, secure share link from ESS.
- **Reports** — Payroll Register, Bank Advice, EOBI PR-01, PESSI, Salary Tax u/s 149 (Annex-C / IRIS), PF Register; overview analytics (12-month cost vs budget, cost by department, gross → CTC).
- **Loans & advances** — LOAN / SALARY_ADVANCE / MEDICAL, purpose, eligibility snapshot (installment ≤ 30% of gross admin policy; ≤ 40% of net pay ESS policy; advance ≤ 50% of basic; staff loan ≤ Rs 150,000 after 1 year, one at a time; medical ≤ Rs 100,000 with estimate), interest-free, schedule, disbursement from bank or cash, automatic recovery in payroll, prepayment, recovery from final dues.
- **Final settlement** — exit facts (resignation, last day, notice required/served, reason, rehire), computation (pending salary, leave encashment, gratuity with Rs 300,000 exemption, notice shortfall, advance/loan recovery, tax, EOBI), PF trust info, approval, JV + BPV, off-cycle run, experience letter & EOBI exit (PR-04).

#### Business rules
- One live REGULAR run per month per pay group; regular run number `PR-YYYY-MM`; off-cycle `PR-YYYY-OFF-NN` (PRUN sequence).
- A run's inputs and lines are editable only in DRAFT / REVIEW; after approval only payment/hold fields change; posted runs are reversed, never edited.
- `net = gross − deductions` on every line, run, payslip and settlement (CHECKs).
- Approval: payroll > Rs 10M two levels; CEO final approval above Rs 20M gross (core approval workflow).
- Previous period must be POSTED before the next run is posted; posting respects acc period locks.
- Loan outstanding = approved − recovered (generated column); loans close automatically when fully recovered.
- Exiting employees: regular payslip ON_HOLD, paid in settlement; loans move to SETTLEMENT status.

#### Statuses
PayrollRuns DRAFT → REVIEW → AWAITING_APPROVAL → APPROVED → POSTED → PAID (REJECTED, CANCELLED, REVERSED) · payslip GENERATED → EMAILED → VIEWED (NO_EMAIL, BOUNCED, ON_HOLD) · loan PENDING → APPROVED → ACTIVE → CLOSED (SETTLEMENT, REJECTED, WITHDRAWN) · installment SCHEDULED → RECOVERED / SETTLED (REQUESTED, SKIPPED, CANCELLED) · FinalSettlements DRAFT → PENDING_APPROVAL → APPROVED → PAID (CANCELLED) · TaxDeclarations NOT_DECLARED → PENDING → IN_REVIEW → APPROVED (REJECTED).

#### Integrations
Bank salary files (Meezan bulk .txt, HBL IBFT .csv), FBR IRIS (Annex-C, CPR), EOBI PR-01 / PR-04, PESSI returns, email/SMS/WhatsApp, biometric attendance (via HR).

#### Settings used (Company.CompanySettingValues, HR & Payroll tab)
Pay day, payroll cut-off, working-days basis (calendar / fixed 30 / working days), salary disbursement bank, EOBI employer share, PF %, auto-deduct tax u/s 149, publish payslips to ESS on post; numbering "Payroll Run PR-{YYYY}-".


### Employee Self-Service (FULL edition — release P5)

**Screens (17):** My Day `ess/dashboard` · My Attendance `ess/attendance` · My Leave `ess/leave` · My Payslips `ess/payslips` · Expense Claims `ess/expenses` · Loans & Advances `ess/loans` · Letters & Requests `ess/requests` · Helpdesk `ess/helpdesk` · Kudos & Pulse `ess/kudos` · Goals & Reviews `ess/goals` · Tax Declarations `ess/tax` · Shifts & Swaps `ess/shifts` · My Team `ess/team` · Directory `ess/company` · Onboarding `ess/onboarding` · My Profile `ess/profile` · Notifications `ess/notifications`. Mobile app (`src/9D-mobile.js`) uses the same tables.

**Tables (schema `ess`, 22):** LetterRequests, HelpdeskCategories, HelpdeskTickets, HelpdeskTicketMessages, faq, kudos, KudosReactions, PulseSurveys, PulseSurveyQuestions*, PulseSurveyResponses, poll, PollOptions, PollVotes, ShiftSwapRequests, OpenShifts, OpenShiftClaims, CompanyAnnouncements, CompanyAnnouncementReads*, CompanyPolicies, PolicyAcknowledgements*, PresenceStatuses, ProfileChangeRequests* (* = helper tables beyond the registry).
**Reused tables:** HumanResources.Employees (incl. emergency_* contacts), HumanResources.AttendancePunches / AttendanceRegister / RegularisationRequests (doc type REG, ESS label "AC-"), HumanResources.LeaveRequests (doc type LV, ESS label "LR-") / LeaveBalances / holiday, HumanResources.Goals / KeyResults / PerformanceReviews / OneOnOneMeetings / feedback, HumanResources.Onboardings / OnboardingTasks, HumanResources.ShiftRosters / shift, HumanResources.EmployeeDocuments, BankCash.ExpenseClaims (+ line, action), Payroll.Payslips / loan / LoanInstallments / TaxDeclarations, Company.Notifications / NotificationPreferences / Approvals / ApprovalActions / comment.

#### Features
- **My Day** — punch clock with geofence, leave balance gauge, latest payslip breakdown, month attendance calendar, holidays, announcements.
- **Attendance** — selfie + geofence check-in/out, live timer, month calendar with punch details, correction requests (missed punch-in/out, late arrival, on-duty/field visit, WFH) to the line manager (24 h SLA).
- **Leave** — balances (annual accrual 1.17/month, casual, sick with certificate > 2 days, comp-off expiry), apply with live working-day count excluding weekends/holidays, half days, handover, team-clash warning, manager then HR for > 3 days, withdraw / cancel.
- **Payslips & tax** — 12-month payslips, compare months, YTD, u/s 149 certificates, secure bank share link; tax projection on FBR slabs with Zakat / VPS / donation / health declarations and proof upload verified by Payroll.
- **Money requests** — expense claims with receipt OCR and policy limits; salary advance / staff loan / medical loan with live EMI, eligibility checks and repayment preview.
- **Letters** — salary certificate, experience, NOC for visa, bank letter, employment verification; auto-filled from profile, HR digital signature, QR verification, English/Urdu, digital or printed.
- **Helpdesk** — HR / Payroll / IT / Admin desks with owner and SLA (72/48/24/72 h; High priority halves it), keyword auto-routing, FAQ suggestions, chat, reopen, CSAT 1–5, service-level stats.
- **Culture** — kudos with five badges and points (+20 to recipient), reactions, recognition wall; anonymous weekly pulse (1–5, per-survey respondent hash, department participation); company polls (one vote per employee, results after voting).
- **Shifts** — weekly roster (me / team), swap or cover requests (colleague accepts → manager approves; 48 h notice, max 2 per month, 11 h rest), open shifts with perks and limited slots (manager confirms).
- **Manager (My Team)** — team today (in / late / leave / not in, nudge), swipe approval deck for leave, corrections, expenses, advances, bulk approve with undo, team calendar and stats.
- **Directory** — people search with presence (Available / Busy / In the field / Away), org chart, announcements with read receipts, policy acknowledgement with timestamp.
- **Onboarding** — role onboarding checklist (documents, policies with read-to-end e-signature, IT, buddy booking, training modules) with progress and completion badge.
- **Profile** — personal / job / bank & payroll tabs; OTP-verified change requests reviewed by HR; emergency contacts (primary + alternate on HumanResources.Employees); documents with expiry alerts.
- **Notifications** — grouped inbox, filters, read/unread/dismiss, per-category channels (in-app / email / WhatsApp), quiet hours.

#### Business rules
- ESS rows are always scoped to the signed-in employee; managers see direct reports only (`EmployeeSelfService:team`).
- Pulse answers store no employee id; audit triggers are off on `PulseSurveyResponses`.
- One vote per poll, one reaction of each type per kudos, one pending change per profile field, one live swap request per person per day, one published version per policy code.
- ESS shows HR documents with their own labels (AC- for REG attendance corrections, LR- for LV leave requests); stored numbers come from the single HR series.
- Open-shift claims cannot exceed `slotsTotal` (trigger); kudos to self is blocked.
- Bank detail changes apply from the next payroll after HR approval.

#### Statuses
LetterRequests stage SUBMITTED → HR_REVIEW → SIGNED → READY, status OPEN / COMPLETED / REJECTED / WITHDRAWN · HelpdeskTickets OPEN → IN_PROGRESS → RESOLVED → CLOSED · ShiftSwapRequests REQUESTED → ACCEPTED → APPROVED (DECLINED, REJECTED, WITHDRAWN) · OpenShiftClaims REQUESTED → CONFIRMED (DECLINED, WITHDRAWN) · PulseSurveys / poll DRAFT → OPEN → CLOSED · announcement / policy DRAFT → PUBLISHED → ARCHIVED / RETIRED · ProfileChangeRequests PENDING → APPROVED / REJECTED (WITHDRAWN) · presence AVAILABLE / BUSY / IN_FIELD / AWAY.

#### Integrations
WhatsApp / SMS / email notifications, device GPS + camera (selfie liveness), calendar export (.ics), QR letter verification page.



## 12. Glossary
| Term | Meaning |
|---|---|
| ATL | Active Taxpayers List (FBR). Non-ATL parties attract higher WHT rates. |
| NTN / STRN / CNIC | National Tax Number / Sales Tax Registration Number / national identity card number |
| GST | General sales tax (18% standard); **further tax** 4% applies on supplies to unregistered buyers |
| WHT 153 / 149 / 236G / 236H | Withholding / advance income tax sections: 153 payments to suppliers & contractors, 149 salaries, 236G/H advance tax on sales to distributors / retailers |
| CPR | Computerised Payment Receipt — proof of tax deposited with FBR |
| IRN | FBR invoice reference number returned by POS real-time integration (printed with a QR code) |
| PRA / SRB | Punjab Revenue Authority / Sindh Revenue Board (provincial sales tax on services) |
| EOBI / PESSI / SESSI / PF | Old-age benefits, provincial social security, provident fund contributions |
| PDC | Post-dated cheque |
| GRN / GRNI | Goods received note / goods received not invoiced (clearing account) |
| JV / CPV / CRV / BPV / BRV / CON / OB | Journal, cash payment, cash receipt, bank payment, bank receipt, contra, opening-balance vouchers |
| FEFO | First-expiry-first-out batch picking |
| CTN / loose | Carton quantity and loose pieces; base qty = CTN × pieces-per-carton + loose |
| Bonus | Free quantity given under a scheme (buy X get Y) |
| Booker / Salesman / Deliveryman / Supervisor | Field roles in distribution: takes orders / sells & collects / delivers / supervises a route |
| Load sheet / Gate pass | Consolidated pick list for a van run / exit document for the loaded van |
| Route settlement | End-of-day reconciliation of a van run: cash, cheques, credit, returns, van stock |
| Recovery sheet | Salesman's collection list of outstanding shop balances |
| MRR / ARR / NRR | Monthly / annual recurring revenue, net revenue retention (platform analytics) |
