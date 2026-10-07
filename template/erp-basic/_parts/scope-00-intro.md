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

## 8. Module scope
