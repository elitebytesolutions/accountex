# Phase 12 rev 1: Payroll setup

**Objective:** the payroll masters that payroll runs, payslips and final settlements (later phases) calculate from:
- salary components (earnings, deductions, employer contributions) with their formula, GL mapping and tax treatment;
- grade-wise salary structures, plus add-on structures with sales-commission tiers;
- pay groups;
- income-tax slabs for salaried people;
- each employee's effective-dated salary.

Every change is attributed to the user in row history. No payroll runs, payslips, loans or postings yet.

**Entities (5, MASTER):** Salary Components · Salary Structures · Pay Groups · Salary Tax Slabs · Employee Salaries

**Status before this plan:**
- Phases 0–11 `done`.
- Phases 13–15 are `in-progress`, built in parallel by another session at your request. Phase 12 keeps its reserved SQL number 018 and touches only payroll files plus the employee profile and wizard.

**Decisions taken with you:**
- **Placement:** `/hr/payroll/structures` has 4 tabs: Components · Structures & Grades · Pay groups · Tax slabs. Pay groups and tax slabs are built in the template's style, since they have no template. Payroll Overview (`/hr/payroll`) waits for payroll runs.
- **Seed data:** every company gets the template's **17 components**, mapped to its chart of accounts, plus pay groups **Staff** and **Management** (monthly). Structures start empty.
- **Tax slabs:** the Finance Act 2025 salaried slabs are seeded for tax year **2025-26** and copied as **2026-27**. HR verifies 2026-27 against the Finance Act 2026.
- **Salary approval:** users with `prun:approve` (HR manager, admin) add a salary or a revision directly. It is recorded as approved by them and closes the previous salary the day before. Others only view, with `prun:view`.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Salary Components | Master | Chart of accounts (3, done) | Structures and payroll lines are built from components |
| Salary Structures | Master | Components (this phase), grades (10, done) | Each grade's salary template |
| Pay Groups | Master | none | Payroll runs are per pay group |
| Salary Tax Slabs | Master | none | Income tax u/s 149 on every run |
| Employee Salaries | Master | Employees (11, done), structures, pay groups | The input every payroll run reads |

## 2. Verified schema (live DB, schema `Payroll`; all 7 tables are empty)

**SalaryComponents** (audited)
- **Identity:** `code` `^[A-Z][A-Z0-9]{1,9}$` (unique), `name`, `componentType` (Earning / Deduction / Employer contribution).
- **Calculation:**
  - `calcMethod`: Percent of / Fixed / Formula / Monthly input / System;
  - `baseBasis`: Component / Gross / EOBI wage / Gratuity base. `baseComponentId` is required exactly when the basis is Component, and can't be the component itself;
  - `percent`, `fixedAmount`, `wageCeiling`, `formula` (required for Formula), `calcDescription`.
- **GL (DB checks):**
  - an earning needs a debit account;
  - a deduction needs a credit account;
  - an employer contribution needs both.
- **Tax:**
  - `taxTreatment` (required for earnings): Fully taxable / Exempt up to a limit / Exempt;
  - limit as % of basic or an annual amount.
- **Flags:** pro-rate on paid days, show on payslip, include in gratuity base, include in EOBI wage.
- **Other:** `systemRole` (Basic, Overtime, Income tax, EOBI…; unique per company), `sortOrder`, `status`, `deletedAt`.
- DB function `salaryComponentAddUpdate`.

**SalaryStructures** (audited) + **SalaryStructureComponents** + **SalaryStructureCommissionTiers** (both audited)
- **Structure:**
  - `code` `^[A-Z][A-Z0-9-]{0,9}$`, `name`;
  - `structureKind`: Grade (needs a grade) or Add-on;
  - basic min / max, gross mid, commission cap (% of basic), description, `effectiveFrom`;
  - `copiedFromStructureId`;
  - `status`: Draft / Active / Retired.
- **Lines:** one per component. Each line can override the calculation, percent, fixed amount, quantity or formula, and carries a display text.
- **Commission tiers:** achievement from / to % and commission rate %.
- DB function `salaryStructureAddUpdate`.

**PayGroups** (`code` `^[A-Z][A-Z0-9_]{1,19}$`, `name`, `frequency` (Monthly), `status`, `deletedAt`)
- **Audit trigger missing → added.**
- DB function `payGroupAddUpdate`.

**SalaryTaxSlabs** (audited)
- `taxYear` `^\d{4}-\d{2}$`, `slabNo`, `incomeFrom`, `incomeTo` (open-ended for the last slab), `fixedTax`, `ratePercent` 0–100, `sourceMasterId`.
- **No overlapping income ranges per tax year** (DB exclusion constraint).
- DB function `salaryTaxSlabAddUpdate`.

**EmployeeSalaries** (audited)
- **Salary:** employee, structure, add-on structure, pay group, `effectiveFrom` / `effectiveTo`, `basicAmount` > 0, `grossAmount` ≥ basic.
- **Payment and revision:** `payMode` (Bank transfer / Cheque / Cash), `revisionType` (Joining / Increment / Promotion / Adjustment / Confirmation), reason.
- **Approval:** approved by / at.
- **No overlapping periods per employee** (DB exclusion constraint), so a revision closes the previous salary.
- DB function `employeeSalaryAddUpdate`.

**Not available:** the Platform tables `TemplateSalaryComponents` and `TaxMasterSalarySlabs` are empty. The roadmap's "import from template / master" endpoints therefore become the per-company seed below, and the import buttons are not built.

**Existing field kept:** `Employees.payGroup` (lookup Management / Staff from Phase 11) stays as is. The payroll pay group is the salary's `payGroupId`.

## 3. Template → page mapping
| Entity | Template · route / tab | Page / component | Notes |
|---|---|---|---|
| Salary Components | `app/hr/payroll/structures` tab **Components** (`51-hr-pay-talent.html`) + modal `pay-component` | `/hr/payroll/structures` → `PayrollSetupScreen` | **From the template:** the table (code, component, type badge, calculation text, taxable, GL account, payslip), search, type chips and CSV export; the modal fields. **Added:** credit account, wage ceiling, exempt limits, system role, activate / deactivate / delete, History. |
| Salary Structures | tab **Structures & Grades** | same page | **From the template:** the structure cards (grade badge, name, basic range, staff count, component lines, gross mid), the formula banner and "Duplicate structure". **No template for the editor:** a wide modal in the template's style with the component lines table (component, basis, override value, display) and, for add-ons, the commission tiers. Gross mid is computed from the lines at mid basic. Draft → Active → Retired. |
| Pay Groups | new tab **Pay groups** | same page | Template-style table and modal (code, name, frequency, employees, status). |
| Salary Tax Slabs | new tab **Tax slabs** | same page | Template-style table per tax year (slab, from, to, fixed tax, rate); add / edit slab, copy a year to the next, and a "tax on an annual income" calculator line. |
| Employee Salaries | `app/hr/employees/view` tab **Salary** (`50-hr-core.html`) | existing `EmployeeProfileScreen` | **From the template:** the salary structure table (component, type, basis, monthly, annual, gross total), employer contributions and the Gross Salary KPI. **Added:** revision history (effective-dated), "Revise" modal (structure, add-on, pay group, basic, gross, pay mode, type, reason, effective date), History. **Waits for payroll runs:** payslips, net pay, income tax and loan lines. |
| Add-employee wizard | step 3 **Compensation** | existing `EmployeeWizard` | The salary-structure part turns on: structure template and gross / basic. Lines are computed from the structure, and the salary is saved with the employee as revision "Joining", only when the user holds `prun:approve`. |

Every page has loading, empty, validation, success, error and permission states.

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/payroll/{component,structure,pay-group,tax-slab,salary}.ts` | Zod schemas. Helpers: `componentErrors` (the DB checks), `formulaRefs` / `wouldCycle` (formula and percent-of chains must not loop), `computeLines(structure, components, basic)` → monthly amounts and gross, `taxOn(annual, slabs)`, `slabErrors` (contiguous, one open last slab) |
| Domain | `src/server/modules/payroll/*/domain` | Component dependency cycle check; slab contiguity; salary revision rule (effective date after the current one's start; the previous one is closed the day before) |
| Application | `ComponentsService`, `StructuresService`, `PayGroupsService`, `TaxSlabsService`, `EmployeeSalariesService` (module `payroll`) | Use cases in `UnitOfWork.run(actorContext…)`, in-use checks, status transitions, duplicate structure, copy slab year |
| Infrastructure | Prisma stores; `*AddUpdate` functions via the allow-list; `references.ts`; `history-tables.ts` | Read models with GL account names, staff counts, current salary |
| Server adapter | `/api/payroll/components`, `/structures`, `/pay-groups`, `/tax-slabs`, `/employee-salaries` | Zod pipes, `@RequirePermission`, user context |
| UI | `src/features/payroll/*`; page `src/app/(app)/hr/payroll/structures`; Salary tab and wizard step 3 in `src/features/hr` | Nav **Workforce › Payroll**: Salary Structures |

## 5. API contracts
| Method & path | Permission | Notes / errors |
|---|---|---|
| `GET/POST/PATCH/DELETE /api/payroll/components(/:id)`, activate / deactivate | view `prun:view`; write `prun:edit`; delete `prun:edit` | 400 GL / calc / tax combinations and `COMPONENT_CYCLE`; 409 code, retired code, system role; 409 `COMPONENT_IN_USE` (structures, payroll lines) |
| `GET/POST/PATCH/DELETE /api/payroll/structures(/:id)`, `POST /:id/activate \| retire \| duplicate` | as above | Lines and tiers saved with the structure (ids kept). 400 a grade structure needs a grade, tiers must not overlap. 409 `STRUCTURE_IN_USE` (employee salaries); only drafts are deleted |
| `GET/POST/PATCH/DELETE /api/payroll/pay-groups(/:id)`, activate / deactivate | as above | 409 `PAY_GROUP_IN_USE` |
| `GET /api/payroll/tax-slabs?year`, `PUT /api/payroll/tax-slabs/:year` (the whole year), `POST /:year/copy-to/:next`, `DELETE /:year` | view `prun:view`; write `prun:edit` | 400 `TAX_SLABS_NOT_CONTIGUOUS` (gaps, overlaps, more than one open slab); 409 year exists on copy |
| `GET /api/payroll/employee-salaries?employee` (history) · `GET /api/payroll/employee-salaries/current?employee` | `prun:view` | Current salary with computed lines |
| `POST /api/payroll/employee-salaries` (first salary) · `POST /api/payroll/employee-salaries/:employeeId/revise` | `prun:approve` | Approved by the user. 400 basic outside the structure's range (warning only) or gross < basic; 409 `SALARY_REVISION_BACKDATED` when the date is on or before the current salary's start; exited employee → 409 `EMPLOYEE_EXITED` |
| `DELETE /api/payroll/employee-salaries/:id` | `prun:approve` | Only the latest revision, and only before any payroll run uses it (re-opens the previous one) |
| `GET /api/history/Payroll/<table>/:id` | `prun:view` | |

- **Delete vs deactivate:** components, structures and pay groups are deleted only when unreferenced (soft delete; codes retired). Otherwise they are deactivated or retired.
- **Concurrency:** `rowVersion` on every write; stale → 409.

## 6. Database changes: `prisma/sql/018-payroll-setup.sql` (idempotent, added to `npm run db:sql`)
- **Audit trigger** on `PayGroups`.
- **Per-tenant seed** (function + tenant trigger, backfilled):
  - **17 components** with the template's calculations, GL accounts found by code in the company's chart:
    - expense accounts 5210-01…09 and 5230-02;
    - liability accounts 2120-01/03, 2140-03, 2150-01/02/03 and 2220-01;
    - asset accounts 1140-02/03.

    A component whose account is missing is skipped.
  - **Pay groups** STAFF and MANAGEMENT.
  - **Tax slabs** 2025-26 and 2026-27 (6 slabs each).
- **Error codes:** `COMPONENT_IN_USE`, `COMPONENT_CYCLE`, `STRUCTURE_IN_USE`, `PAY_GROUP_IN_USE`, `TAX_SLABS_NOT_CONTIGUOUS`, `SALARY_REVISION_BACKDATED`.
- **Readable lookup labels** for the payroll selects.
- **No new tables.** Prisma models are added for the 7 tables (scalar fields); the `Payroll` schema is mapped.

## 7. Audit (row history)
- **Tables covered:** all 7 (6 already audited, `PayGroups` gets the trigger).
- **Attribution:** every write runs in `UnitOfWork.run(actorContext(user, meta))`. Seeds are recorded as `system: seedPayrollDefaultsFor`.
- **History tab:** in each component, structure and pay-group modal, on the tax-slab year, and per salary revision on the employee's Salary tab.

## 8. Ordered tasks
1. `018-payroll-setup.sql`; Prisma models; registrations (references, add-update, history tables).
2. Shared contracts and calculation helpers (lines, gross, tax).
3. Server module `payroll`: components, structures (lines, tiers, duplicate, status), pay groups, tax slabs (year set, copy), employee salaries (first, revise, current, history).
4. Salary Structures page (4 tabs) from the template; nav entry.
5. Employee profile Salary tab and Gross KPI; wizard step 3.
6. **Verification:**
   - the Phase 12 API suite;
   - visuals vs the template (light / dark / 390 px);
   - history attribution;
   - clean the test data.

   Regressions are **not** run this phase (the next full run is after Phase 14).

## 9. Verification
- **Functional** (API suite `api-p12`):
  - **Components:** CRUD and the GL / calc / tax checks; a percent-of or formula loop is rejected.
  - **Structures:** lines and tiers kept on edit; activate / retire / duplicate; a grade structure needs a grade.
  - **Pay groups:** CRUD and in-use.
  - **Tax slabs:**
    - a gap or overlap is rejected;
    - copy 2025-26 → 2027-28;
    - tax on Rs 1,353,600 per the slabs.
  - **Employee salaries:**
    - first salary;
    - a revision closes the previous one the day before;
    - a backdated revision is rejected;
    - gross < basic is rejected;
    - the latest revision can be deleted, which re-opens the previous one;
    - the current salary's computed lines match the structure.
  - **Permissions:**
    - HR manager: full;
    - auditor: view only;
    - salesman: 403;
    - only `prun:approve` sets salaries.
  - **History** carries the real user.
  - **Seeds** present (17 components with GL accounts, 2 pay groups, 12 slabs).
- **Visual:** the Components and Structures tabs, the component modal and the employee Salary tab vs the template; the new tabs and the structure editor in template style. Light and dark at 1400 px and 390 px mobile.
- **Checks:** typecheck, lint, architecture and roadmap checks pass.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:**
  - everything in §9 passes;
  - test data cleaned; seeds and your Demo data kept;
  - deviations listed honestly.
- **Risks:**
  - **Tax slabs 2026-27** are a copy of 2025-26 until HR checks them against the Finance Act 2026.
  - **Formulas** are stored and checked for references and loops; they are evaluated only for the preview lines. Payroll runs (later) do the real calculation.
  - **Parallel work:** Phases 13–15 change shared registry files at the same time; changes there stay add-only.
- **Blockers:** none.

---
**Approve Phase 12 revision 1 for implementation?**
