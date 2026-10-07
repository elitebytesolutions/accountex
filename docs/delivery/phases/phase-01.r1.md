# Phase 1 rev 1: Company core

**Objective:** each tenant can maintain its company profile and every settings tab, its branches, its currencies' exchange rates and its document numbering. Every change is attributed to the user in row history. These masters are referenced by almost every later phase.

**Entities (4, MASTER):** Branches · Currencies & Exchange Rates · Company Settings & Setup Guide · Numbering Series

**Status before this plan:** Phase 0 `done`; no phase in progress.

**Decisions taken with you:**
- Exchange rates get a panel in Settings › Finance, built from template parts (no template exists for it).
- **Profile first:** saving the Company Profile (which needs a valid NTN) creates the settings row. Until then the other settings tabs ask for the profile.
- Provisioning creates a default **Head Office** branch (`HO`), and Demo Company gets one too.

---

## 1. Selection rationale
| Entity | Kind | Depends on | Why now |
|---|---|---|---|
| Branches | Master | tenant (Phase 0) | Users, warehouses, documents and numbering are branch-scoped |
| Currencies & Exchange Rates | Master | none | Base currency and FX for every amount |
| Company Settings & Setup Guide | Master | branches, currencies | Fiscal year start, tax and sales/purchase/HR defaults, used from Phase 3 on |
| Numbering Series | Master | branches, document types (global catalogue, already seeded: 83 rows) | Every document number from Phase 16 on |

## 2. Verified schema (live DB)
**Branches (`Company.Branches`)**
- Columns:
  - `code` must match `^[A-Z]{2,5}$`, unique per tenant;
  - `name`, `description`, `isHeadOffice`, `isDefault` (at most one default per tenant, partial unique index `branchOneDefaultIdx`);
  - `managerUserId` → Users, `managerEmployeeId` → Employees (Phase 11, hidden until then);
  - `address`, `city`;
  - `province`, `salesTaxAuthority`, `status` (all lookup-validated: `Province`, `SalesTaxAuthority`, `ActiveInactiveStatus`);
  - `phone`, `email`, `openingDate`, lat/long/geofence (range checks);
  - `rowVersion`, `deletedAt`.
- Triggers: stamp, touch, **audit**, validateLookups.
- 0 rows today.

**Currencies (`Company.Currencies`)**
- **Global** table (no tenant): PKR, USD, AED, SAR, EUR, GBP, CNY. The tenant **reads** it; editing the currency list is a Super Admin matter.
- **No audit trigger** (added in this phase).

**Exchange rates (`Company.ExchangeRates`)**
- Per tenant: (currency, `rateDate`) unique, `rate > 0`, `source` (lookup `ExchangeRateSource`: SBP / MANUAL).
- Audited.

**Company settings (`Company.CompanySettings`)**
- One row per tenant (`CompanySettings_tenantId_key`), about 70 columns.
- **Profile:** legalName*, tradingName, secpRegNo, **ntn*** (`^\d{7}-\d$`), strn (`^\d{2}-\d{2}-\d{4}-\d{3}-\d{2}$`), address, city, province, phone, email, website, industry, timezone, legalStructure, logoAttachmentId.
- **Finance:** fyStartMonth ∈ {1,4,7}, baseCurrencyCode → Currencies, amountDecimals ∈ {0,2,3}, numberFormat, booksLockDate, fxRateSource, three switches.
- **Sales / Purchase:** terms days 0–365, quotation validity, creditLimitAction, overdue tolerance, thresholds, approval switches.
- **Tax:** GST, return period, rates 0–100, provincial authority, ATL status, FBR switches.
- **HR / Payroll / Attendance:** pay day, cut-off, working days, EOBI, PF, grace 0–120, late marks 1–31, half-day hours, overtime ∈ {1.5, 2}, attendance source, geofence.
- **Branding:** colours `^#[0-9A-Fa-f]{6}$`, font, paper size, email footer, "powered by".
- 16 columns are lookup-validated. Audited.
- **`CompanySettingValues`:** key/value extras per `SettingGroup`. Audited; not needed by any Phase 1 screen.

**Setup guide (`Company.SetupGuideSteps`)**
- (tenant, `stepKey`) unique; `stepKey` lookup has 9 steps (PROFILE, COA, OPENING, ITEMS, BANK, TAX, TEAM, INVOICE, PAYROLL); `isDone` ⇔ `doneAt`.
- The view `Company.getSetupGuideProgress` gives weights and the next step, and needs the settings row.
- **No audit trigger** (added in this phase).

**Numbering series (`Company.NumberingSeries`)**
- `docType` → `Company.DocumentTypes` (global, 83 rows, with default prefix/pattern/padding/reset);
- optional `branchId`; `prefix` `^[A-Z][A-Z0-9-]{0,9}$`; `pattern` contains `{SEQ`, ≤ 60 characters; padding 1–12; startValue ≥ 1;
- `resetPolicy` (NEVER / YEARLY / MONTHLY);
- unique (tenant, docType, branch) with NULLS NOT DISTINCT. Audited.
- **`NumberingSeriesCounters`:** (series, `periodKey` ALL / YYYY / YYYY-MM) → `nextValue`. Not audited.
- The view `Company.getNumberingSeriesPreview` gives the next number and a preview.

**Existing DB functions (reused):**
- `Company.branchAddUpdate`, `companySettingAddUpdate`, `exchangeRateAddUpdate`, `numberingSeriesAddUpdate` (jsonb in, uuid out):
  - insert or partial update;
  - tenant taken from `app.tenantId`;
  - optimistic lock on `rowVersion` (raises 40001 "changed by another user");
  - P0002 "not found".
- There are no delete functions.

**Permissions:** `comp:view`, `comp:edit`, `comp:export`. Create, update and deactivate all use `comp:edit`, because the catalogue has no create/delete action for `comp`.

**Unresolved (decide during review):** none blocking. Not in this phase:
- the "Default account mapping" panel in Settings › Finance (Phase 3);
- the logo upload (needs Attachments, Phase 35): a logo URL field is out, so the template's avatar initials are shown;
- `CompanySettingValues` (no screen uses it yet).

## 3. Template → page mapping
| Entity | Template | Page / component | Pattern |
|---|---|---|---|
| Company Settings | `app/settings` (`template/src/60-settings-ess.html`), tab strip of 8 | `/settings?tab=<key>` (`src/app/(app)/settings/page.tsx`); tabs Profile · Branches · Finance · Sales & Purchases · HR & Payroll · Tax · Numbering · Branding | `.tabs` + `.tab-pane`, panels with `.form-grid`, `.switch`, `.form-actions` (Cancel / Save); unsaved-changes guard; History drawer |
| Branches | tab `set-branches` (table: code, branch + subtitle, manager, address, authority, employees*, status badge, actions) | `features/settings/branches/*` | `panel flush` + `DataTable`; **Add / Edit in the template drawer** (the template's buttons only toast, no form designed); deactivate / delete with confirm dialog |
| Currencies & rates | tab `set-finance` "Fiscal & currency" + **new panel "Currencies & exchange rates"** (template parts only) | `features/settings/currencies/*` | table (currency, symbol, latest rate, date, source), drawer "Add rate" (date, rate, source), rate-history drawer |
| Numbering Series | tab `set-numbering` (table: document type, prefix, padding, next number, preview, reset yearly, actions) | `features/settings/numbering/*` | `DataTable`; Add / Edit in a drawer (document type, branch, prefix, pattern, padding, start, reset); preview from the DB view |
| Setup Guide | `app/setup` (`4A-company-plus.html` + `9A-company-plus.js` "SETUP GUIDE" + `cp-su-*` styles in `1A-company-plus.css`) | `/setup` | progress ring, segmented bar, step list with expand/collapse, mark done / reopen. Links to screens of later phases show "Available in Phase N" |

*The template's "Employees" count column is shown as "—" until Phase 11.

**Sidebar:**
- Workspace › **Setup Guide** (`/setup`, `comp:view`);
- System › **Settings** › **Company Settings** (`/settings`, `comp:view`).

**Styles:** the `cp-su-*` rules for the Setup Guide (and any `cp-*` helpers it uses) are ported verbatim into `src/app/styles/finsoft-company.css`.

**States everywhere:** loading skeleton, empty state, validation per field (Zod + DB check codes), success toast, error banner with reference, read-only view without `comp:edit`, no-access page without `comp:view`.

## 4. Clean Architecture
| Layer | Location | Responsibility |
|---|---|---|
| Contracts | `src/shared/settings/{branch,currency,company-settings,numbering,setup-guide}.ts` | Zod input/output schemas (same regexes as the DB checks), list query |
| Domain | `src/server/modules/settings/<entity>/domain/` | entities and rules (e.g. a branch can't be deactivated if it's the default or the last active one; prefix is locked once a number is issued); repository ports |
| Application | `…/application/*.use-case.ts` | list, get, create, update, deactivate/activate, delete. Each mutation runs in `UnitOfWork.run(ctx)`, so history records the user. |
| Infrastructure | `…/infrastructure/prisma-*.repository.ts` | writes through the existing `*AddUpdate` DB functions; reads via mapped Prisma models and the DB views |
| Presentation | `…/presentation/*.controller.ts` | routes, `@RequirePermission`, Zod pipes, `ReqMeta` |
| Lookups | `src/server/modules/lookups` | `GET /api/lookups/:type`: active tenant/global values (label, tone) for every select |
| UI | `src/features/settings/*`, `src/features/setup/*`, `src/app/(app)/settings`, `src/app/(app)/setup` | pages, drawers, forms (react-hook-form + Zod), `HistoryTab` |

Prisma: map `Branches`, `Currencies`, `ExchangeRates`, `CompanySettings`, `SetupGuideSteps`, `NumberingSeries`, `NumberingSeriesCounters`, `DocumentTypes`, `Lookups` (from a scratch `db pull`).

## 5. API contracts (all under `/api`, tenant from the session)
| Method & path | Permission | Notes / errors |
|---|---|---|
| `GET /lookups/:type` | signed in | `[{ code, label, tone }]` |
| `GET /settings/branches?search&status&page&pageSize&sort` · `GET /settings/branches/:id` | `comp:view` | |
| `POST /settings/branches` · `PATCH /settings/branches/:id` (rowVersion) | `comp:edit` | 409 `DB_UNIQUE_VIOLATION` (code), 409 `CONCURRENCY_CONFLICT`, 422 `DB_CHECK_VIOLATION` |
| `POST /settings/branches/:id/deactivate` · `/activate` | `comp:edit` | 409 `BRANCH_DEFAULT_REQUIRED` (default branch), 409 `BRANCH_LAST_ACTIVE` |
| `POST /settings/branches/:id/make-default` | `comp:edit` | moves the default flag in one transaction |
| `DELETE /settings/branches/:id` | `comp:edit` | hard delete only if unreferenced; else 409 `DB_FOREIGN_KEY_VIOLATION`; never the default branch |
| `GET /settings/currencies` (global + latest rate) · `GET /settings/currencies/:code/rates` | `comp:view` | |
| `POST /settings/currencies/:code/rates` · `PATCH …/rates/:id` · `DELETE …/rates/:id` | `comp:edit` | 409 duplicate date; a base-currency rate is rejected (`FX_BASE_CURRENCY`, 422) |
| `GET /settings/company` | `comp:view` | the row, or `null` plus defaults |
| `PUT /settings/company/profile` | `comp:edit` | creates the row on first save (NTN required) and marks setup step PROFILE done |
| `PATCH /settings/company/:section` (finance / sales / hr / tax / branding) | `comp:edit` | 409 `COMPANY_PROFILE_REQUIRED` before the profile exists; rowVersion |
| `GET /settings/numbering-series` (with preview) · `GET /settings/document-types` | `comp:view` | |
| `POST /settings/numbering-series` · `PATCH /settings/numbering-series/:id` · `DELETE /settings/numbering-series/:id` | `comp:edit` | prefix/pattern/padding locked after the first number → 409 `NUMBERING_IN_USE`; delete only if never used |
| `GET /settings/setup-guide` · `POST /settings/setup-guide/:step/complete` · `/reopen` | `comp:view` / `comp:edit` | |
| `GET /history/Company/{Branches,CompanySettings,ExchangeRates,NumberingSeries,SetupGuideSteps}/:id` | `comp:view` | registered in `history-tables.ts` |

Numbers for documents are allocated by a DB function, `Company.nextDocumentNumber(docType, branchId, date)`. It's built in this phase (no UI) and called by posting from Phase 16 on.

## 6. Database changes: `prisma/sql/007-company-core.sql` (idempotent, added to `db:sql`)
1. **Audit coverage:**
   - `triggerAudit` on `Company.Currencies` (global rows → tenantId NULL) and `Company.SetupGuideSteps`;
   - `NumberingSeriesCounters` is **deliberately not audited**: it changes on every document, and the documents carry their own history. It's recorded as an exception in the roadmap.
2. **Error catalogue:**
   - map SQLSTATE `40001` → `CONCURRENCY_CONFLICT` and `P0002` → `NOT_FOUND` (the existing `*AddUpdate` functions raise these);
   - add `BRANCH_DEFAULT_REQUIRED`, `BRANCH_LAST_ACTIVE`, `COMPANY_PROFILE_REQUIRED`, `NUMBERING_IN_USE` (409) and `FX_BASE_CURRENCY` (422).
3. **Branch guards** (triggers raising with HINT):
   - the default branch can't be deactivated or deleted;
   - the last active branch can't be deactivated;
   - `isDefault` moves atomically.
4. **Numbering:**
   - a guard trigger: once any counter exists for a series, `prefix`, `pattern`, `padding` and `docType` can't change (`NUMBERING_IN_USE`);
   - `Company.nextDocumentNumber(...)` locks the counter row (`SELECT … FOR UPDATE`), allocates the next number inside the caller's transaction, and returns the formatted number (`{PREFIX} {YYYY} {FY} {MM} {BR} {SEQn}`).
5. **Provisioning:** `Platform.provisionTenant` also creates branch `HO` "Head Office" (`isHeadOffice`, `isDefault`, ACTIVE). Backfill Demo Company with `HO` if it has no branch.
6. **Setup guide:** saving the profile upserts step PROFILE as done (`autoDetected`).

## 7. Audit (row history)
- **Tables covered:** Branches, ExchangeRates, CompanySettings, NumberingSeries (already), plus Currencies and SetupGuideSteps (added). NumberingSeriesCounters is the documented exception.
- **User attribution:** every mutation goes through `UnitOfWork.run({ user, tenant, request meta })`, so the history entry carries the user's ID and name/email snapshot in the same transaction.
- **History view:** a History action on each branch, exchange rate, numbering series and the company settings opens the drawer with `HistoryTab`.

## 8. Ordered tasks
1. `007-company-core.sql` (guards, error codes, audit, numbering function, HO branch) → `npm run db:sql` twice.
2. Prisma mappings, lookups module, shared contracts.
3. Pages from the templates (settings tabs, branches table, numbering table, rates panel, setup guide) with clearly marked temporary fixtures.
4. Domain, use cases, repositories (calling the `*AddUpdate` functions) and controllers for the 4 entities.
5. Wire pages to the API; remove the fixtures; set the sidebar entries.
6. History registration plus History drawers.
7. Verification, then roadmap status `done` only after your acceptance.

## 9. Verification
**Functional (UI and API)**
- **Branches:** create (code validation, duplicate → 409), edit (stale rowVersion → 409), deactivate default or last active → 409 with its code, make-default, delete unreferenced vs referenced (409). Persisted after reload.
- **Settings:** before the profile exists other tabs show "complete profile first" and the API gives 409 `COMPANY_PROFILE_REQUIRED`; profile save creates the row and sets setup step PROFILE done; each tab saves with field validation (bad NTN/STRN/colour → field errors).
- **Rates:** add, edit, delete; duplicate date → 409; base currency → 422.
- **Numbering:** create a series per document type; preview matches the template format; `nextDocumentNumber` in a rolled-back transaction gives `JV-2026-000001`, then `…002`; editing the prefix after that → 409 `NUMBERING_IN_USE`.
- **Permissions:** a user without `comp:edit` sees read-only screens and gets 403 on the API; without `comp:view` gets the no-access page.
- **Row history:** every change shows in History with the real user's name and email, before → after, and full row; checked in `Company.AuditTrailEntries` by user.
- **Provisioning:** a test tenant (rolled back) gets branch `HO`; Demo Company has `HO`.

**Visual**
- Headless-Edge screenshots of `/settings` (each of the 8 tabs), the branch drawer, the rates panel, `/setup`, next to `template/index.html#/app/settings` and `#/app/setup`, at 1400×900 and 390×844, light and dark.

**Build**
- Typecheck, lint plus architecture rules, `npm run delivery:roadmap`, SQL runs twice.

## 10. Acceptance criteria, risks, blockers
- **Accept when** all of section 9 is shown with real output.
- **Risk: settings form size.** About 70 fields across 6 tabs; validation mirrors the DB checks to avoid 422s.
- **Risk: numbering concurrency.** The counter is allocated with a row lock in the posting transaction (verified here with two parallel allocations).
- **Template deviations (reported at acceptance):**
  - the branch and series add/edit drawers;
  - the rates panel;
  - "Employees" shown as "—";
  - no logo upload;
  - no account-mapping panel.
- **No blockers.**

---
**Approve Phase 1 revision 1 for implementation?**
