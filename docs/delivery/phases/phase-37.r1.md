# Phase 37 rev 1: Seed templates & tax master

> **Status: approved 2026-10-07 (revision 1).** Planned with Phases 36, 38 and 39, in parallel with Phase 16. Starts building once Phase 36's Super Admin foundation lands (shell, admin attribution, platform history).

**Objective:** the platform-wide templates new companies start from (chart of accounts, leave types, salary components, tax codes, default role grants), the Pakistan tax master with effective-dated rates, and communication templates.

**Entities (4, MASTER):** COA Templates · Tenant Seed Templates · Tax Master · Communication Templates

**Decision (2026-10-07):** **the database is the source of truth for default role grants.** The admin portal edits `Platform.SystemRoleGrants`, and `npm run db:seed` only adds grants for new permissions (from `prisma/catalog.ts` defaults). It never deletes or overwrites.

**Verified facts that shape scope:**
- **`Platform.provisionTenant` reads only `SystemRoleGrants`.** Nothing copies the leave-type, salary-component, tax-code or tax-master templates into companies today.
- **The COA template is applied on demand,** when a tenant clicks "Apply template" (`Accounting.applyChartTemplate`, true copies).
- **This phase manages the templates.** Copying the leave, salary and tax-code templates into a new company is added by Phase 40 (Tenant lifecycle / onboarding), which owns provisioning. The workspace "Import from Tax Master" (tax codes, payroll slabs) is part of this phase (§5).

## 1. Selection rationale
| Entity | Why now |
|---|---|
| COA Templates | Tenants already apply PK_TRADING; admins need to maintain it and add industries |
| Tenant Seed Templates | Onboarding (40) copies them; default role grants are used by every provisioning today |
| Tax Master | Single source for tax rates; workspace tax codes (Phase 4) and payroll slabs (Phase 12) import from it |
| Communication Templates | Dunning (41) and broadcasts (42) send from them |

## 2. Verified schema (live DB)

**`Platform.ChartOfAccountsTemplates`** (1 row, PK_TRADING DEFAULT)
- Columns: `code` (unique), `name`, `industry`, `version`, `status` (DEFAULT / DRAFT / PUBLISHED / RETIRED), `description`, `icon`.
- `Tenants.coaTemplateId` references it.

**`Platform.ChartOfAccountsTemplateAccounts`** (177 rows)
- Columns: `code` (unique per template), `level` 1–4, `accountClass` 1–5, `nature` (DR / CR), `parentCode`, `subType`, `isPostable`, `defaultRole`.
- Saved through `chartOfAccountsTemplateAddUpdate` with `accounts[]` (replace).
- **Audit trigger missing on both tables → added.**
- **SQL 009 upserts PK_TRADING and its accounts every time `db:sql` runs, which would undo admin edits → changed to insert-only** (`ON CONFLICT DO NOTHING`), keeping first-install behaviour.

**`Platform.TemplateLeaveTypes`**
- Columns: (`seedVersion`, `name`) unique, numeric fields ≥ 0, `genderRestriction`.

**`Platform.TemplateSalaryComponents`**
- Columns: `componentKind`, `calcMethod` (PCT_OF_BASIC needs `pctOfBasic`), `statutoryCode`.

**`Platform.TemplateTaxCodes`**
- Columns: (`seedVersion`, `code`), `taxKind`, rate 0–100 or EXEMPT or a rate note, `isActive`.
- **All three are empty; audit trigger missing → added.**

**`Platform.SystemRoleGrants`** (726 rows)
- PK (`systemKey`, `permissionCode`), already audited.
- **No `id` column, so it gets a matrix API keyed by system role** instead of `/:id`.
- No `AddUpdate` function exists → direct writes, in the actor context.

**`Platform.TaxMasterAuthorities`**
- Columns:
  - `code` (FBR / PRA / SRB / KPRA / BRA), `jurisdiction`, `levyScope`;
  - sandbox / production endpoints, `activeEnvironment`;
  - `apiTokenEnc` + `apiTokenLast4` (encrypted with the existing `SecretBox`, never returned);
  - `platformPosId`, `timeoutSeconds` ∈ {10, 20, 30}, `onFailure`, lastTest*.

**`Platform.TaxMasterSalesTaxRates`**
- Columns: effective dates, `status` (ACTIVE / SCHEDULED / SUPERSEDED), `masterVersion`, `publishedAt`.
- The DB prevents overlap per authority and `appliesTo`.

**`Platform.TaxMasterWithholdingRates`**
- Columns: section, four ATL / non-ATL rates or salary slabs.
- No overlap per section.

**`Platform.TaxMasterSalarySlabs`**
- Columns: (`taxYear`, `slabNo`) unique.
- `Payroll.SalaryTaxSlabs.sourceMasterId` references it.
- All 4 tables are empty and already audited.

**`Platform.CommunicationTemplates`**
- Columns:
  - `code` `^[A-Z][A-Z0-9_]{1,39}$`;
  - `channels` ⊆ {EMAIL, SMS, WHATSAPP} (non-empty);
  - English + Urdu subject / body (Urdu both-or-neither);
  - `version`, `isActive`.
- Empty, audited.

## 3. Template → page mapping
| Entity | Template | Page | Notes |
|---|---|---|---|
| COA Templates | `admin/templates` (`30-entry-admin.html:642–747`): COA cards (version, accounts, status, tenants), preview tree, "New template", "Import from Excel" | `/admin/templates` | From the template. **Template-style additions:** an account tree editor (add / edit / move / delete rows, level and nature rules) replacing the toast-only "Edit"; CSV import (`code, name, parentCode, level, class, nature, postable, defaultRole`) with a validation report; Publish / Retire / Set default. |
| Tenant Seed Templates | same page, "Master seed lists" panel, tabs Tax codes / Leave types / Salary | same page | Tabs from the template, made editable (row modals, **template style**). **Added tab:** "Default role grants": role × permission matrix grouped by module, the same component as Settings › Roles (Phase 2). |
| Tax Master | `admin/tax-master` (`3A-admin-plus.html:173`, `9B-admin-plus.js:2247–2372`): rate tiles, tabs Sales tax / Withholding (Section 149 slabs drawer) / FBR-PRAL connection / Change log, "Change rate" modal, "Publish to tenants" | `/admin/tax-master` | From the template. **"Change rate" schedules a new effective-dated row and supersedes the current one; published rates are never edited.** "Test connection" calls the authority sandbox endpoint with a timeout and stores the lastTest* result. The change log reads platform history. |
| Communication Templates | `admin/comms` (`9B-admin-plus.js:1620–1786`): template list, English / Urdu editor with SMS segment count and `{{variable}}` chips, live Email / SMS / WhatsApp preview, "Send a test" modal | `/admin/comms` | From the template. **"Send test" is disabled until email/SMS delivery exists (Phase 29);** preview works. The delivery log (42) and Broadcast modal (42) are empty or disabled. |

**Nav:** Tenants › Templates; Operations › Tax Master; Growth › Communications (template positions).

## 4. Clean Architecture
`src/shared/platform/{coa-template,seed-template,tax-master,comm-template}.ts` → `src/server/modules/platform-admin/templates/*` (domain: COA tree rules, effective-dating and supersede, slab ranges, `{{variable}}` parsing) → Prisma stores via the allow-listed `*AddUpdate` functions (direct writes for `SystemRoleGrants`) → `/api/admin/...` controllers → `src/features/platform-templates/*` → pages. All writes go through `UnitOfWork.run(adminActorContext)`.

## 5. API contracts (`@AdminRoute`)
| Method & path | Notes | Errors |
|---|---|---|
| `GET/POST/PATCH/DELETE /api/admin/coa-templates(/:id)`, `POST /:id/import` (CSV), `POST /:id/publish \| retire \| default` | One DEFAULT; delete only DRAFT with no tenants | 400 tree / level / nature, 409 `COA_TEMPLATE_IN_USE`, 409 stale |
| `GET/POST/PATCH/DELETE /api/admin/seed/{leave-types,salary-components,tax-codes}(/:id)` | Per `seedVersion` | 409 duplicate, 400 rules |
| `GET /api/admin/seed/role-grants`, `PUT /api/admin/seed/role-grants/:systemKey` | Full permission set for one system role. **Affects new companies only;** existing companies keep their roles. | 400 unknown permission |
| `GET /api/admin/tax-master`, `POST /api/admin/tax-master/{sales-tax,withholding}` (schedule a new effective row), `PUT /salary-slabs/:taxYear`, `PATCH /authorities/:id` (connection; token write-only), `POST /authorities/:id/test`, `POST /publish` | Published rows immutable; `effectiveFrom` must be in the future or today | 409 `TAX_RATE_PUBLISHED_IMMUTABLE`, 409 overlap |
| `GET/POST/PATCH/DELETE /api/admin/comm-templates(/:id)`, `POST /:id/preview` | | 409 code, 409 `COMM_TEMPLATE_IN_USE` |
| **Workspace:** `POST /api/tax/codes/import-master`, `POST /api/payroll/tax-slabs/import-master` | Copy published master rates into the tenant (links `sourceMasterId` for slabs); `tax:create` / payroll permission | 409 when already imported for that period |

## 6. Database: `prisma/sql/102-admin-seed-templates.sql` (idempotent)
- **Audit triggers** on ChartOfAccountsTemplates, ChartOfAccountsTemplateAccounts, TemplateLeaveTypes, TemplateSalaryComponents and TemplateTaxCodes.
- **Supersede function** for tax-master rates (close the current row's `effectiveTo`, insert the scheduled one, flip status on the effective date via the status rule at read time).
- **Error codes** listed in §5.

**Code changes:**
- `prisma/sql/009-finance-structure.sql`: the PK_TRADING upsert becomes insert-only.
- `prisma/seed.ts`: the SystemRoleGrants sync becomes insert-missing-only (no deletes, no overwrites); the demo tenant's role resync stops removing grants.

## 7. Audit
- **Tables covered:** all 11 tables audited.
- **Attribution:** the Super Admin.
- **History:** the role-grant matrix's history comes from SystemRoleGrants' platform log entries for that system key.

## 8. Ordered tasks
1. SQL 102; the 009 and seed.ts changes; Prisma models; registries.
2. Contracts and services.
3. Pages (after the Phase 36 shell).
4. Workspace import endpoints and buttons (tax codes, payroll slabs).
5. Verify.

## 9. Verification
- **Functional:**
  - COA template CRUD, tree rules, CSV import (good and bad file), publish / default; a tenant still sees only DEFAULT / PUBLISHED templates and "Apply" still works;
  - re-running `db:sql` no longer reverts PK_TRADING edits;
  - seed lists CRUD;
  - editing a system role's grants → a **newly provisioned test company** gets them, the existing Demo company is unchanged, and running `db:seed` no longer wipes the edit;
  - tax master: schedule a rate change (old row superseded, no overlap); editing a published row → 409; workspace import creates tax codes with the master rates;
  - comm template CRUD + preview (Urdu rule);
  - history names the Super Admin;
  - a tenant token is refused.
- **Visual:** `/admin/templates`, `/admin/tax-master`, `/admin/comms` against the templates.

## 10. Acceptance, risks, blockers
- **Risks:**
  - **Role-grant edits affect only companies created afterwards.** Pushing grants to existing companies is not in scope.
  - **"Send test" stays disabled** until Phase 29.
- **Blockers:** none.
