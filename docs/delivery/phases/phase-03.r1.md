# Phase 3 rev 1: Finance structure

**Objective:** give each company the structure every posting needs:
- a fiscal calendar whose periods can be closed and locked;
- a chart of accounts (started from a standard template, then tailored);
- cost centres, projects and cost-allocation rules;
- the default account mappings that sub-ledgers post through.

Every change is attributed to the user in row history. Nothing posts yet (vouchers arrive in Phase 16), but every rule a posting will rely on is in place and enforced by the database.

**Entities (4, MASTER):** Fiscal Years & Periods · Chart of Accounts · Cost Centres & Projects · Account Mappings

**Status before this plan:** Phases 0–2 `done`; no phase in progress.

**Decisions taken with you:**
- **Seed a standard chart of accounts template** (Pakistan trading & distribution) in this phase's SQL. A company applies it with one click (only while its chart is empty), then edits freely. The Super Admin template editor stays in Phase 37.
- **Create the current fiscal year now:**
  - "New fiscal year" generates the year and its 12 monthly periods (+ optional P13) from the company's FY start month.
  - Demo Company gets FY 2026-27 in the SQL.
  - New companies get their current year when provisioned.
- **Keep segregation-of-duties rules in code** (Phase 2 behaviour). `Company.SegregationOfDutiesRules` moves out of this phase to Phase 5 (Treasury rules & compliance setup, currently 4 entities) as a new entity "Segregation-of-Duties Rules".

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Fiscal Years & Periods | Master | Company settings: FY start month (done) | Every posting date must fall in an open period |
| Chart of Accounts | Master | Branches, currencies (done) | Every later financial master (banks, tax codes, items) references accounts |
| Cost Centres & Projects | Master | Chart of accounts (this phase), branches (done) | Expense lines and budgets need them |
| Account Mappings | Master | Chart of accounts (this phase) | Sub-ledgers (AR, AP, payroll, tax) post through mapped roles |

## 2. Verified schema (live DB; every table currently empty except `Company.PostingRoles`, 74 global rows)

**Fiscal Years & Periods** (`Accounting.FiscalYears`, `FiscalPeriods`, `PeriodModuleLocks`; all audited)
- **FiscalYears:**
  - `code` must equal `Company.getFiscalYearLabel(startDate, startMonth)`, e.g. "FY 2026-27" (check);
  - length 28–550 days; no overlapping years (`EXCLUDE` constraint);
  - `status` ∈ OPEN/CLOSED; `isLocked` only when CLOSED; `hasAdjustmentPeriod`;
  - closing entry / net profit / auditor columns, used at year-end (Phase 29).
- **FiscalPeriods:**
  - `periodNo` 1–13 (13 = adjustment); `code` like `JUL-2026` or `P13-2027`;
  - no overlap except P13; `status` ∈ OPEN/CLOSED/LOCKED.
  - **Guard trigger:**
    - a period must lie inside its year, and P13 needs the year flag;
    - closing or locking is refused while draft/pending vouchers exist;
    - it stamps closedBy/lockedBy and clears them on reopen.
- **PeriodModuleLocks:** per period × module (GL/AR/AP/INV/PAY) OPEN/CLOSED/LOCKED.
- **Existing DB functions:** `fiscalYearAddUpdate` (with `periods`), `getFiscalPeriodForDate`, `assertPostingAllowed` (used from Phase 16).
- **Permissions:** `close` has view/approve/post/export only. Creating years and closing/locking/reopening use `close:approve`.

**Chart of Accounts** (`Accounting.ChartOfAccounts`, `AccountBranches`, `SavedLedgerViews`)
- **Codes:**
  - `code` `^[1-5][0-9]{3}(-[0-9]{2,3})?$`, unique per company;
  - class = first digit (1 assets, 2 liabilities, 3 equity, 4 revenue, 5 expenses);
  - level from the code (X000 = 1, XY00 = 2, XYZW = 3, XYZW-NN = 4).
- **Kinds:**
  - `kind` HEADER (levels 1–2), GROUP (level 3), POSTABLE (level 4);
  - only POSTABLE accounts have `subType` (25 values), a branch, or an opening balance.
- `nature` DR/CR; `currencyCode` → Currencies; `status` ACTIVE/INACTIVE; `deletedAt`.
- **Guard trigger `accountGuard`:**
  - code, parent, level, class and kind are fixed after creation;
  - the opening balance is locked after creation (entered via Opening Balances, Phase 16);
  - the parent must be the code's parent and must not be postable;
  - an account can't be deleted while it has sub-accounts or postings.
- **AccountBranches:** account × branch (restricts an account to branches). Audited.
- **SavedLedgerViews:** per-user named ledger filters. **No audit trigger** (added).
- **Existing DB functions:** `accountAddUpdate`, `savedLedgerViewAddUpdate`, `getGeneralLedgerForPeriod`, `getAccountBalancesForPeriod`, `getTrialBalanceForPeriod`.
- **Template source:** `Platform.ChartOfAccountsTemplates` / `ChartOfAccountsTemplateAccounts` (code, name, parentCode, level, class, nature, subType, isPostable, defaultRole), **empty today**.

**Cost Centres & Projects**
- **CostCentres:**
  - `code` `^[A-Z]{2,4}-[0-9]{2,5}$` unique; `parentCostCentreId` (tree, not self);
  - `branchId`, `centreType` BRANCH/DEPARTMENT, `annualBudget ≥ 0`, `tags[]`;
  - `ownerEmployeeId` (→ HR, Phase 11), `status`, `deletedAt`.
  - **No audit trigger** (added).
- **Projects:**
  - `code` `^PRJ-[0-9]{2,4}$`; budget and expected revenue ≥ 0; dates in order;
  - `colour` and `status` (PLANNING/IN_PROGRESS/ON_HOLD/COMPLETED/CANCELLED) lookups;
  - owner (Phase 11). Audited.
- **ProjectTags:** tag `^[a-z0-9][a-z0-9_-]{0,39}$`. **No audit trigger** (added).
- **CostAllocationRules** (account, basis lookup, status) and **CostAllocationSplits** (cost centre %, 0 < % ≤ 100). A deferred trigger requires an active rule's splits to total exactly 100%. Both audited.
- **Existing DB functions:** `costCentreAddUpdate`, `projectAddUpdate`, `costAllocationRuleAddUpdate` (with splits).

**Account Mappings**
- **`Company.PostingRoles`:** global, 74 roles in 11 groups with normal balance. 12 are flagged `onSettingsScreen`, exactly the 12 fields of the template's "Default account mapping" panel (AR/AP control, sales, returns, output/input GST, WHT payable, salaries payable, default bank, retained earnings, rounding, FX gain/loss). **No audit trigger** (added).
- **`Company.DefaultAccountMappings`:**
  - one account per role per company;
  - `bankAccountId` (→ BankCash.BankAccounts, Phase 4) only for DEFAULT_BANK/SALARY_BANK. It is left empty until Phase 4.
  - Audited.
- **Existing DB functions:** `defaultAccountMappingAddUpdate`, `getAccountForRole` (used by posting from Phase 16).

**Unresolved:** none blocking. Not in this phase:
- cost-centre / project owners (employees, Phase 11);
- bank-account link on the bank mappings (Phase 4);
- account actuals, budgets and transactions (Phase 16 / 27);
- reopening a **locked** period (needs an approval request, Phase 29).

## 3. Template → page mapping
| Entity | Template | Page | Pattern | Notes |
|---|---|---|---|---|
| Fiscal Years & Periods | `42-acc-reports.html` · `app/periods` | `/periods` | 3 year cards (previous / current / next), period table with status chips filter, close / lock / reopen modals with module checkboxes, "New fiscal year" | "Year-end close" links to Phase 29. Voucher and draft counts are 0 until Phase 16. Reopening a locked period shows "Reopen requests arrive in Phase 29". |
| Chart of Accounts | `46-coa.html` + `97-coa.js` · `app/accounting/coa` | `/accounting/coa` | KPI strip by class, toolbar (search, class / type / status / level filters, tree / flat views), tree table with expand/collapse, bulk select (activate / deactivate / export), add-account modal, delete modal, row menu, History drawer | Empty chart: "Apply standard chart of accounts" call to action. Balances are 0 until postings exist. |
| Account Ledger | same files · `app/accounting/ledger` | `/accounting/ledger?account=` | account header, period presets, transactions table, related accounts, saved views (save / open / share) | Uses `getGeneralLedgerForPeriod`. The table shows "No postings yet: vouchers arrive in Phase 16". |
| Cost Centres & Projects | `4A-company-plus.html` + `9A-company-plus.js` section 7 · `app/accounting/cost-centres` | `/accounting/cost-centres` | tree (centres and projects) + detail (head, KPIs, structure, budget vs actual, burn chart, top transactions, allocation rules) + new / edit modal + allocation-rule modal (splits totalling 100%) | "Budget variance" links to Phase 27. Actuals and transactions show empty states until Phase 16. Owner select disabled (Phase 11). |
| Account Mappings | `60-settings-ess.html` · `app/settings#set-finance` "Default account mapping" panel | `/settings?tab=finance` | 12 account selects (postable accounts only) + Reset to template / Save | Restores the panel left out in Phase 1. Default bank maps to the bank's ledger account; picking the bank account itself arrives in Phase 4. |

**Sidebar:**
- Finance › Accounts › Chart of accounts (`coa:view`), Account ledger (`coa:view`), Cost centres & projects (`coa:view`);
- Finance › Period Close › Fiscal periods (`close:view`);
- labels and grouping per `template/src/90-nav.js`.

**Styles:** `17-coa.css` (chart of accounts + ledger) and section "7. COST CENTRES" of `1A-company-plus.css` are ported verbatim into `src/app/styles/`.

**States everywhere:** loading, empty, field validation, success toast, error banner with reference, read-only without the edit permission, no-access page without view.

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/finance/{fiscal,account,cost-centre,project,allocation,mapping,ledger-view}.ts` | Zod schemas mirroring the DB checks (code formats, levels, 100% splits) |
| Domain | `modules/finance/accounts/domain/account-code.ts` (level, parent code, kind and class from a code; next free code under a parent), `modules/finance/fiscal/domain/periods.ts` (month periods for a year + P13) | Pure rules shared by UI previews and services |
| Application | `modules/finance/{fiscal,accounts,cost-centres,mappings}` services | Use cases on ports; each mutation via `unitOfWork.run(actorContext(user, meta), …)` |
| Infrastructure | Prisma stores using the existing `*AddUpdate` functions; template apply via a new SQL function | Explicit `tenantId` filters |
| Server adapter | Controllers under `/api/accounting/*` and `/api/settings/account-mappings` | Guards, Zod pipes, error mapping |
| UI | `src/features/finance/*`; pages `/periods`, `/accounting/coa`, `/accounting/ledger`, `/accounting/cost-centres`; settings Finance tab panel | Template screens, modals, History |

Prisma: map the 14 Accounting/Company tables from a scratch `db pull` (relations to unmapped models removed).

## 5. API contracts (all under `/api`, tenant from the session)
| Method & path | Permission | Notes / errors |
|---|---|---|
| `GET /accounting/fiscal-years` (with periods + module locks) · `GET …/:id` | `close:view` | |
| `POST /accounting/fiscal-years` `{startDate?, hasAdjustmentPeriod}` | `close:approve` | Defaults to the next year after the latest one (or the current year when none exist); generates 12 (+P13) periods in one call. Overlap → 409 `FISCAL_YEAR_OVERLAP` |
| `POST /accounting/periods/:id/close` · `/lock` · `/reopen` `{modules?, rowVersion}` | `close:approve` | Drafts pending → 409 `PERIOD_HAS_OPEN_VOUCHERS`; reopen of LOCKED → 409 `PERIOD_LOCKED` (request flow in Phase 29); module locks written to `PeriodModuleLocks` |
| `GET /accounting/accounts?tree` · `GET …/:id` · `GET …/summary` (KPIs by class) | `coa:view` | |
| `POST /accounting/accounts` | `coa:create` | Parent, code, name, nature, subType (postable), currency, branches. Code/level/parent rules → 422 `ACCOUNT_CODE_INVALID` / `ACCOUNT_PARENT_INVALID`; duplicate → 409 |
| `PATCH /accounting/accounts/:id` (+rowVersion) | `coa:edit` | Name, description, subType, currency, branches, icon. Structure fields → 409 `ACCOUNT_STRUCTURE_LOCKED` |
| `POST …/:id/deactivate` · `/activate` · bulk `POST /accounting/accounts/bulk-status` | `coa:edit` | |
| `DELETE /accounting/accounts/:id?rowVersion` | `coa:delete` | Soft delete; sub-accounts → 409 `ACCOUNT_HAS_CHILDREN`; postings → 409 `ACCOUNT_HAS_POSTINGS` |
| `GET /accounting/account-templates` · `POST /accounting/accounts/apply-template` `{templateId}` | `coa:view` / `coa:create` | Only when the chart is empty (409 `COA_NOT_EMPTY`); also fills the default mappings |
| `GET /accounting/accounts/:id/ledger?from&to&branch` | `coa:view` | `getGeneralLedgerForPeriod` |
| `GET/POST/PATCH/DELETE /accounting/ledger-views[/:id]` | `coa:view` | Own views, plus views others shared |
| `GET/POST/PATCH /accounting/cost-centres[/:id]` · `/deactivate` · `/activate` · `DELETE` (soft) | `coa:view/create/edit/delete` | Parent in the same company and not its own descendant (422 `COST_CENTRE_CYCLE`) |
| `GET/POST/PATCH /accounting/projects[/:id]` (with tags) · `DELETE` (soft) | `coa:view/create/edit/delete` | |
| `GET/POST/PATCH /accounting/cost-allocation-rules[/:id]` (with splits) · `DELETE` | `coa:view/create/edit/delete` | Splits ≠ 100% → 422 `ALLOCATION_NOT_100` |
| `GET /settings/account-mappings` (roles shown on the settings screen, with the mapped account) · `PUT /settings/account-mappings` (bulk) | `comp:view` / `comp:edit` | Account must be ACTIVE and POSTABLE (422 `ACCOUNT_NOT_POSTABLE`) |

- **Delete vs deactivate:**
  - **Accounts:** deactivate; delete only when nothing references the account.
  - **Cost centres / projects:** soft delete.
  - **Allocation rules:** delete (cascade splits).
  - **Fiscal years:** never deleted.
- **Concurrency:** `rowVersion` on every update/close (409 `CONCURRENCY_CONFLICT`).
- **Lists:** the chart of accounts is loaded whole as a tree (hundreds of rows) and paged client-side like the template; everything else is small.

## 6. Database changes: `prisma/sql/009-finance-structure.sql` (idempotent, added to `db:sql`)
1. **Audit triggers:**
   - `triggerAudit` on `Accounting.SavedLedgerViews`, `Accounting.CostCentres`, `Accounting.ProjectTags`;
   - `triggerAudit` on `Company.PostingRoles` (global rows → tenantId NULL).
2. **Error codes on the existing guards** (same rules, added `HINT`s; the functions are replaced with identical logic):
   - `ACCOUNT_STRUCTURE_LOCKED`, `ACCOUNT_OPENING_LOCKED`, `ACCOUNT_PARENT_INVALID`, `ACCOUNT_HAS_CHILDREN`, `ACCOUNT_HAS_POSTINGS`;
   - `PERIOD_OUTSIDE_YEAR`, `PERIOD_ADJUSTMENT_DISABLED`, `PERIOD_HAS_OPEN_VOUCHERS`;
   - `ALLOCATION_NOT_100`.
3. **New error codes:** `FISCAL_YEAR_OVERLAP` (exclusion violation, SQLSTATE 23P01), `PERIOD_LOCKED`, `COA_NOT_EMPTY`, `ACCOUNT_CODE_INVALID`, `ACCOUNT_NOT_POSTABLE`, `COST_CENTRE_CYCLE`.
4. **Standard template:** one row in `Platform.ChartOfAccountsTemplates` ("Pakistan trading & distribution"), about 150 accounts in `ChartOfAccountsTemplateAccounts`:
   - headers / groups / postable accounts across the 5 classes;
   - Pakistani tax accounts (output/input GST, WHT, further tax), statutory (EOBI, PF, SESSI);
   - `defaultRole` on the accounts for all 74 posting roles where one applies.
   - Upserted by template code + account code.
5. **`Accounting.applyChartTemplate(pTemplateId)`:**
   - inserts the template's accounts level by level (parents first) for the current company (refused if any account exists);
   - then upserts `DefaultAccountMappings` from `defaultRole`;
   - runs in the caller's audited transaction.
6. **`Accounting.createFiscalYear(pStartDate, pAdjustment)`:** creates the year (code from `getFiscalYearLabel`) and its monthly periods (+P13).
7. **Current year for every company:**
   - a provisioning hook (`AFTER INSERT` on `CompanySettings`, or `provisionTenant`) creates the current fiscal year;
   - backfill for Demo Company: FY 2026-27, Jul 2026 – Jun 2027 (start month 7).
8. **Readable labels** for the Phase 3 lookups (account sub-types, natures, centre types, allocation bases, project status/colour, modules).

## 7. Audit (row history)
- **Tables covered:** all 13 tables in this phase. Four of them get their trigger here (SavedLedgerViews, CostCentres, ProjectTags, PostingRoles).
- **User attribution:**
  - App changes run in `withContext` with the signed-in user and session.
  - Applying the template is one transaction, so every inserted account and mapping is attributed to the user who applied it.
  - SQL seeding is labelled `system: 009-finance-structure.sql`.
- **History view:** History drawers for fiscal years, periods, accounts, cost centres, projects, allocation rules and mappings. Each table is registered in `history-tables.ts` with its view permission (`close:view`, `coa:view`, `comp:view`).

## 8. Ordered tasks
1. **Roadmap:**
   - move `Company.SegregationOfDutiesRules` to a new Phase 5 entity;
   - set Phase 3 `in-progress`;
   - `npm run delivery:roadmap` must pass.
2. **Database:** `009-finance-structure.sql` (template data, functions, hints, triggers, backfill), applied twice; map the Prisma models.
3. **Contracts and domain:** account-code rules, period generation.
4. **Server:** services, stores and controllers per entity; history registration.
5. **Pages from the templates:** periods, chart of accounts (tree, modals), ledger, cost centres & projects, finance mapping panel. Port the CSS verbatim; add the sidebar entries.
6. **Wire to the API:** create / edit / deactivate / delete flows, template apply, period close / lock / reopen, History.
7. **Verification** (§9), then the acceptance request.

## 9. Verification
**Functional (UI and API)**
- **Template and accounts:**
  - apply the standard template → ~150 accounts and the 12 settings mappings filled; applying again → 409 `COA_NOT_EMPTY`;
  - add a postable account under a group: wrong code / parent / non-postable parent → field errors;
  - rename / deactivate / activate / bulk status;
  - delete an account with sub-accounts → 409;
  - changing an account's code → 409 `ACCOUNT_STRUCTURE_LOCKED`.
- **Fiscal calendar:**
  - Demo has FY 2026-27 with 12 periods;
  - create FY 2027-28 (+P13); an overlapping year → 409;
  - close / lock / reopen a period with module locks; reopening a locked period → 409 `PERIOD_LOCKED`.
- **Cost centres, projects, rules:**
  - centre tree with parent / child; a cycle → 422;
  - project with tags;
  - allocation rule whose splits don't total 100 → 422, exactly 100 → saved.
- **Mappings:** save the 12 mappings; a non-postable account → 422; reload shows the values.
- **Ledger:** opens for an account, empty with the Phase 16 note; saved views CRUD.
- **Permissions:** allowed vs denied per screen (view-only and no-access users).
- **History:** every insert / update / delete above shows the real user and session (psql check).

**Visual:** headless Edge screenshots of `/periods`, `/accounting/coa` (tree, add modal), `/accounting/ledger`, `/accounting/cost-centres` (detail, modals) and the Finance tab mapping panel, next to the template routes. At 1400×900 and 390×844, light and dark.

**Build:** both typechecks, lint + lint:arch, roadmap check, SQL run twice, `db:seed`.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:** all of §9 passes, and the deviations are listed in the acceptance request.
- **Risks:**
  - The standard template is our own reference chart, not an official FBR chart. Companies are expected to tailor it.
  - Replacing the existing guard functions must keep their logic identical (only `HINT`s added). This is checked by running every guard case in rolled-back transactions.
  - The chart of accounts screen is large (tree + filters + bulk actions). Balances and ledgers stay empty until Phase 16.
- **Blockers:** none.

---
**Approve Phase 3 revision 1 for implementation?**
