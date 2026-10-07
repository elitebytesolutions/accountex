# Finsoft schema contract

The rules every SQL file, view, function and doc in `erp-basic/` and `erp-full/` follows. Readable names per module: [NAMING.md](NAMING.md) · full old→new map: [naming/rename-map.csv](naming/rename-map.csv).

## 1. Two editions, one truth
- `erp-basic/` = core ERP (73 screens). `erp-full/` = every prototype screen (195). **Basic ⊂ Full**: every Basic table exists in Full with the same name and the same columns (same types, defaults, constraints). Full only **adds** tables, columns, lookup values and functions.
- `00-foundation.sql`, `01a-lookups.sql`, `91-rls.sql` and `api/00-Lookups-api.sql` are byte-identical in both editions.

## 2. Names (no underscores anywhere)
| Object | Rule | Example |
|---|---|---|
| Schema | PascalCase full module name | `"Sales"`, `"FixedAssets"`, `"BankCash"`, `"HumanResources"` |
| Table | PascalCase, plural, named after the screen; lines `<Doc>Lines`; join tables both nouns | `"Sales"."SalesInvoices"`, `"Sales"."SalesInvoiceLines"`, `"Company"."UserRoles"` |
| Column | camelCase; foreign keys `<thing>Id` | `"customerId"`, `"docNo"`, `status` |
| View | camelCase `get<Report>` | `"Accounting"."getTrialBalance"` |
| Save function | `<entity>AddUpdate("pData" jsonb) RETURNS uuid` | `"Sales"."salesInvoiceAddUpdate"` |
| Read function | `get<Entity>Info("pId" uuid) RETURNS jsonb` | `"Sales"."getSalesInvoiceInfo"` |
| Action function | `<entity><Action>("pId" uuid [, reason])` | `"Sales"."salesInvoicePost"`, `"Accounting"."voucherReverse"` |
| Other function | camelCase verbNoun / `get…`; trigger functions `trigger<What>` | `"Company"."getNextDocNo"`, `"Inventory"."triggerStockLedgerApply"` |
| Trigger / index / constraint | camelCase | `"salesInvoicesTouch"`, `"salesInvoicesDocNoKey"` |
| Parameters / variables | `p…` / `v…` camelCase | `"pDocType"`, `"vTenant"` |
| Database roles | camelCase | `"finsoftApp"`, `"finsoftReadOnly"`, `"finsoftPlatform"` |
| Session settings | `app.tenantId`, `app.userId`, `app.clientIp` | |

Mixed-case names are **always double-quoted** in SQL. Lowercase single words (`id`, `code`, `status`) need no quotes.

## 3. Schemas (modules)
`Platform` (global, no `tenantId`, no RLS) · `Company` · `Accounting` · `BankCash` · `FixedAssets` · `Tax` · `Sales` · `Purchases` · `Inventory` · `Distribution` · `HumanResources` · `Payroll` · `EmployeeSelfService` · `Reports` · `Lookups`.

## 4. Tables
- Key: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`. Human codes in `code` / `docNo` (unique per tenant), assigned by `"Company"."getNextDocNo"('<DOC TYPE>')` (row-locked, never MAX+1).
- Tenant tables: `"tenantId" uuid NOT NULL REFERENCES "Platform"."Tenants"(id)` + `UNIQUE ("tenantId", id)`; every FK between tenant tables is composite `("tenantId", "xId") → ("tenantId", id)` so a row can never point at another tenant's row.
- Standard tail: `"createdAt", "createdBy", "updatedAt", "updatedBy", "rowVersion"` (+ `"deletedAt"` on masters), maintained by `"Company"."addStandardTriggers"(table[, audit])`.
- Types: money `numeric(18,2)` · qty `numeric(18,3)` · rate `numeric(18,4)` · percent `numeric(7,4)` · fx `numeric(18,6)`.
- Documents are never deleted: cancelled / voided; posted ones are reversed. Posted documents are immutable (module guard triggers).

## 5. Enumerations → one table
- **No `CHECK (col IN ('A','B'))` lists.** Every value list lives in `"Lookups"."Lookups"` (`lookupType`, `code`, `label`, `labelUrdu`, `tone`, `sortOrder`, `isActive`, `isSystem`, `parentCodes`, `tenantId`).
- `"Lookups"."LookupColumns"` registers which column uses which list (`allowTenantValues` lets tenants add their own values; `dependsOnColumn` + `parentCodes` express dependent lists such as account sub-type per account class).
- `"Lookups"."validateLookups"()` (BEFORE INSERT/UPDATE, attached by `92-lookups.sql`) rejects any value not in the list.
- Codes (`'POSTED'`) are data; program logic compares them, so system codes cannot be renamed or deleted (`isSystem`).
- Remaining CHECK constraints are business rules only (amount ≥ 0, debit xor credit, "a POSTED document has a journal").

## 6. Writes and reads (API layer, `database/api/`)
- The application role `"finsoftApp"` has **SELECT + EXECUTE only** — no INSERT/UPDATE/DELETE. Every write goes through:
  - `<entity>AddUpdate(jsonb)` — insert (no `id`) or update (`id` + optional `rowVersion` optimistic lock); camelCase payload keys = column names; child arrays (`lines`, `contacts`, …) are upserted by `id`, missing rows removed; `tenantId`/audit columns come from the session; documents can be edited only while DRAFT.
  - `<entity><Action>(id …)` — Post / Approve / Void / Cancel / Reverse: change status, run the module posting hook (`<entity><Action>Entries`) that creates journals and stock movements, idempotent.
- Reads: `get<Entity>Info(id)` (record + children + lookup labels/tones), `get<Report>` views, `"Lookups"."getLookups"(type)` for dropdowns, plain SELECT for simple lists.
- API functions are `SECURITY DEFINER SET search_path = pg_catalog, pg_temp`; RLS is FORCEd, so they still only see the caller's tenant.

## 7. Files and install order
```
schema/00-foundation → 01-platform → 01a-lookups → 02…14 modules
fk/*            cross-module foreign keys
views/90-*      get… report views
api/*           AddUpdate / get…Info / actions
schema/91-rls   RLS + grants
schema/92-lookups   every enumeration value + registry + validation triggers (generated)
schema/95-seed-reference   global reference data
```
`database/install.sql` runs them in this order.

## 8. Docs
`entities/*.md` — one section per screen: route, source, tables (Primary / Reads / Writes), **Functions** (Save / Open / Actions), **Lookups** (enum columns and their lists), UI field → column table, statuses, actions → effects, permission. Docs write names without quotes: `Sales.SalesInvoices.customerId`.
