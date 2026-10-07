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
| Integrity | money `numeric(18,2)`, qty `numeric(18,3)`; CHECK constraints for every enum and arithmetic rule; posted records immutable; append-only ledgers (stock, audit) |
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
- widens CHECK lists (e.g. `Sales.SalesInvoices.channel` gains `WHOLESALE`, `POS`; `Inventory.Warehouses.type` gains `VAN`).
An upgrade is therefore additive DDL: create the new tables, `ALTER TABLE … ADD COLUMN` the new columns, replace the widened CHECK constraints, run the Full fk files, views, `91-rls.sql` (it re-discovers every table) and the Full seed blocks. No data is rewritten.

## 11. Module scope
