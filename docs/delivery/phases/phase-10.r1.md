# Phase 10 rev 1: Organisation

**Objective:** the HR organisation masters that employees (Phase 11), attendance and payroll build on:
- departments in a hierarchy, with cost centre and budget;
- designations (positions) per department with grade and reporting line;
- grade bands with salary ranges;
- work shifts with grace, break, half-day and overtime rules;
- the holiday calendar, per branch.

Every change is attributed to the user in row history. No employees, rosters or attendance yet.

**Entities (5, MASTER):** Departments · Designations · Grades · Work Shifts · Holidays

**Status before this plan:** Phases 0–9 `done`; no phase in progress.

**Decisions taken with you:**
- **The Org Chart shows departments now.** `/hr/org` is built with the template's "Departments" and "Positions" views: the department tree with its designations and approved positions. The "People" view turns on in Phase 11, when employees exist.
- **Seed data:** every company gets the Pakistan public holidays for FY 2026-27 (from the template list) and a default "General" shift. Grades start empty.
- **Cost centres: pick an existing one only.** A department links to an existing cost centre (Phase 3); new cost centres are still created on the Cost Centres page.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Departments | Master | Branches (1, done), cost centres (3, done) | Employees, approvals, purchase orders and payroll lines are tagged by department |
| Designations | Master | Departments, grades (this phase) | Every employee holds one |
| Grades | Master | none | Designations, salary structures and leave rules use them |
| Work Shifts | Master | none | Employees, rosters and attendance need a shift |
| Holidays | Master | Branches (1, done) | Attendance and payroll exclude them from working days |

## 2. Verified schema (live DB; all six tables are empty)

**Departments** (`HumanResources.Departments`, audited)
- `code` `^[A-Z0-9]{2,10}$` (unique), `name`, `description`.
- `parentId` → Departments; not its own parent (DB check). **Cycles are checked by the app**: a department can't move under one of its own sub-departments.
- `division` (lookup `Division`: Commercial / Operations / Support).
- `headEmployeeId` → Employees (**Phase 11**; the field shows "after Phase 11" until then).
- `costCentreId` → `Accounting.CostCentres`, `annualBudget` ≥ 0, `isActive`, `deletedAt`.
- **Referenced by** employees, position history, payroll lines, purchase orders, stock vouchers, job openings, training, clearance items and self-service tables (later phases).
- DB function `departmentAddUpdate`.

**Designations** (`HumanResources.Designations`)
- `title` (unique per department), `departmentId` (required), `gradeId`, `approvedPositions` ≥ 0 (default 1).
- `reportsToDesignationId` → Designations; not itself (DB check); cycles checked by the app.
- `isActive`, `deletedAt`.
- **Audit trigger missing → added.**
- **Referenced by** employees, position history, onboardings, job openings.
- DB function `designationAddUpdate`.

**Grades** (`HumanResources.Grades`, audited)
- `code` `^[A-Z]{1,3}-?[0-9]{1,2}$` (e.g. G-5), unique.
- `levelRank` 1–99, unique.
- `levelName`; `minSalary` ≤ `midSalary` ≤ `maxSalary` (all ≥ 0).
- `isActive`, `deletedAt`.
- **Referenced by** employees, salary structures, overtime and leave rules, payroll lines.
- DB function `gradeAddUpdate`.

**Work Shifts** (`HumanResources.WorkShifts`)
- **Identity:** `code` `^[A-Z0-9]{2,6}$` (unique), `name`, `description`, `colour` (lookup `WorkShiftColour`).
- **Times:**
  - `startTime` ≠ `endTime`; `crossesMidnight` must equal (end < start) (DB check), so overnight shifts are allowed and the flag is computed;
  - `scheduledHours`;
  - `graceMinutes` 0–240;
  - break start/end together or neither;
  - `fridayExtendedBreak` + `fridayBreakEnd`, `prayerBreakNote`.
- **Rules:** `halfDayBelowHours` > 0, `lateMarksPerHalfDay` > 0, `overtimeAfterMinutes` ≥ 0, `weeklyOff` (lookup `WeeklyOff`).
- **Season and status:**
  - `isDefault` (one default per company: partial unique index);
  - `isSeasonal` ⇔ `season` (lookup `Season`: Ramadan);
  - `validFrom` ≤ `validTo`;
  - `status` (Active / Inactive), `deletedAt`.
- **Audit trigger missing → added.**
- **Referenced by** employees, branch HR settings, rosters, attendance, shift swaps, open shifts.
- DB function `workShiftAddUpdate`.

**Holidays** (`HumanResources.Holidays` + `HolidayBranches`)
- `name`, `fromDate` ≤ `toDate`, `days`.
- `holidayType` (lookup: Public / Company / Optional / Event).
- `isMoonDependent`, `hijriNote`, `eligibilityNote` (e.g. "Hindu staff").
- `appliesToAllBranches`; otherwise the branch list in `HolidayBranches` (unique per holiday, cascade on delete).
- `status` (lookup: Upcoming / Tentative / Observed / Cancelled; Tentative only when moon-dependent: DB check).
- `source` (Manual / Gazette), `notifyEss`, `deletedAt`.
- **Audit triggers missing on both tables → added.**
- **Referenced by** attendance (later phases).
- DB function `holidayAddUpdate` (branches as an array).

**Unresolved questions:** none. The roadmap's open question is answered: grades sit on the template's "Designations & Grades" tab.

## 3. Template → page mapping (`template/src/50-hr-core.html`; static markup, no script)
| Entity | Template · route / tab | Page / component | Pattern | Notes |
|---|---|---|---|---|
| Departments | `app/hr/departments` tab **Departments** | `/hr/departments` → `DepartmentsScreen` | Table + add/edit modal (template `hrc-add-dept`) | **From the template:** the table (department + description, code, head, headcount, cost centre, annual budget, YTD payroll, utilisation), the search, the totals row and the "Org chart" link. Sub-departments are indented under their parent. **Real but empty until Phase 11 / payroll:** head, headcount, YTD payroll, utilisation (shown as "—" / 0). **Added:** division, active switch, delete, History in the modal. |
| Designations & Grades | tab **Designations & Grades** | same page | Two panels + modals (`hrc-add-desig`, `hrc-add-grade`) | **From the template:** the grade bands table (grade, level, min / mid / max, staff) and the designations table (title, department, grade badge, filled, open), the search and grade filter, "Add grade" and "Add designation". Filled = 0 until Phase 11; open = approved − filled. **Added:** reports-to on designations, edit / delete / History, and validation that min ≤ mid ≤ max. |
| Branches | tab **Branches** | same page | Read-only cards | The company's branches (Phase 1) as the template's cards, with a link to Settings › Branches for changes. Headcount and devices are "—" until Phases 11 and 12. |
| Org Chart | `app/hr/org` | `/hr/org` → `OrgChartScreen` | Template `.org` tree | **"Departments" view:** the department tree (name, code, division, designation and position counts). **"Positions" view:** each department's designations nested by their reports-to line. **"People"** is disabled until Phase 11. **From the template:** the search, zoom out / in, fit, collapse-all controls and the four KPI cards (max depth, average span, vacant positions, branches). Export PDF prints the chart with the browser. |
| Work Shifts | `app/hr/shifts` | `/hr/shifts` → `ShiftsScreen` | Shift definitions table + modal (`hrc-add-shift`) | **From the template:** the definitions table (shift + description, code, timing with "+1 day" for overnight, hours, grace, break incl. Friday, half-day after, weekly off, employees, status) and the "New shift" modal fields. **Added:** colour, seasonal / validity, set as default, History. **Placeholders:** the weekly roster panel (empty state: rosters arrive with attendance, Phase 12); "Publish roster" disabled. |
| Holidays | `app/hr/holidays` | `/hr/holidays` → `HolidaysScreen` | KPIs + month calendar + list + modal (`hrc-add-holiday`) | **From the template:** the four KPIs (public holiday days, next holiday, optional holidays, moon-dependent), the month calendar with holiday events and weekly offs (from the default shift), previous / next / today, the year list with status badges and the branch filter, the sandwich-rule banner, and the add-holiday modal. **Added:** edit / delete / mark observed / cancel, the branch multi-select, History. **Deferred:** "Subscribe (.ics)" (a later integration); "Import gazette" re-runs the seeded list for the next year only when a later phase supplies it, so it is disabled. |

Every page has loading, empty, validation, success, error and permission states.

Missing templates: none. The roster panel and the People org view wait for their phases.

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/hr/{department,designation,grade,shift,holiday}.ts` | Zod list / create / update schemas; helpers: `shiftHours(start, end, break)`, `crossesMidnight`, `holidayDays(from, to)`, `wouldCycle(parentOf, id, newParent)` |
| Domain | `src/server/modules/hr/*/domain` | Hierarchy cycle check (departments, designations); code rules |
| Application | `DepartmentsService`, `DesignationsService`, `GradesService`, `ShiftsService`, `HolidaysService` (module `hr`) | Use cases in `UnitOfWork.run(actorContext…)`; in-use checks; default-shift switch; holiday status rules |
| Infrastructure | Prisma stores; writes through the existing `*AddUpdate` functions (allow-list); `references.ts` entries | Read models with counts (sub-departments, designations, positions) |
| Server adapter | Controllers under `/api/hr/departments`, `/designations`, `/grades`, `/shifts`, `/holidays`, plus `/api/hr/org` and `/api/hr/form-options` | Zod pipes, `@RequirePermission`, user context for audit |
| UI | `src/features/hr/*`; pages `src/app/(app)/hr/{departments,org,shifts,holidays}` | Screens from the templates; nav group **Workforce** › People (Org Chart, Departments & Designations) and Time & Attendance (Shifts & Rosters, Holidays) |

## 5. API contracts
| Method & path | Request | Response | Permission | Errors |
|---|---|---|---|---|
| `GET /api/hr/departments` | search, status, page, pageSize, sort | `{ items, total }` with parent, cost centre, child / designation / position counts | `emp:view` | — |
| `GET /api/hr/departments/:id` | — | detail | `emp:view` | 404 |
| `POST /api/hr/departments` | code, name, description, parentId, division, costCentreId, annualBudget | detail | `emp:create` | 400, 409 code |
| `PATCH /api/hr/departments/:id` | fields + rowVersion | detail | `emp:edit` | 409 stale, 400 `DEPARTMENT_CYCLE` |
| `POST /api/hr/departments/:id/activate \| deactivate` | rowVersion | detail | `emp:edit` | 409 `DEPARTMENT_HAS_ACTIVE_CHILDREN` on deactivate |
| `DELETE /api/hr/departments/:id` | rowVersion | 204 | `emp:delete` | 409 `DEPARTMENT_IN_USE` (sub-departments, designations, employees, documents) |
| `GET/POST/PATCH/DELETE /api/hr/designations(/:id)`, activate / deactivate | title, departmentId, gradeId, approvedPositions, reportsToDesignationId | designation(s) with department, grade, reports-to, filled / open | view `emp:view`; create `emp:create`; edit `emp:edit`; delete `emp:delete` | 409 title per department, 400 `DESIGNATION_CYCLE`, 409 `DESIGNATION_IN_USE` |
| `GET/POST/PATCH/DELETE /api/hr/grades(/:id)`, activate / deactivate | code, levelRank, levelName, min / mid / max | grade(s) with designation and staff counts | `emp:*` as above | 400 band order, 409 code / rank, 409 `GRADE_IN_USE` |
| `GET/POST/PATCH/DELETE /api/hr/shifts(/:id)`, activate / deactivate, `POST /:id/default` | shift fields | shift(s) with computed hours and employee count | view `att:view`; create `att:create`; edit `att:edit`; delete `att:approve` (no `att:delete` exists) | 400 times / break / season, 409 code, 409 `SHIFT_IN_USE`, 409 `SHIFT_DEFAULT_REQUIRED` when deleting or deactivating the default |
| `GET/POST/PATCH/DELETE /api/hr/holidays(/:id)`, `POST /:id/status` | name, from / to, type, moon-dependent, notes, all branches / branchIds, status | holiday(s) with branches and days; list filterable by year (FY) and branch | view `att:view`; create `att:create`; edit `att:edit`; delete `att:approve` | 400 range, 400 tentative-not-moon, 409 `HOLIDAY_IN_USE` (attendance) |
| `GET /api/hr/org` | view = departments \| positions | tree + KPIs | `emp:view` | — |
| `GET /api/hr/form-options` | — | departments, grades, designations, cost centres, branches, lookups | `emp:view` or `att:view` (two routes) | — |
| `GET /api/history/HumanResources/<table>/:id` | — | row history | the entity's view permission | — |

- **Delete vs deactivate:** delete only when unreferenced (soft delete; codes are retired and never reused). Otherwise deactivate.
- **Concurrency:** every write carries `rowVersion`; stale → 409.
- **Lists:** departments are server-paged; designations, grades, shifts and holidays are short lists, loaded whole with filters.

## 6. Database changes: `prisma/sql/016-organisation.sql` (idempotent, added to `npm run db:sql`)
- Audit triggers on `Designations`, `WorkShifts`, `Holidays`, `HolidayBranches`.
- **Per-tenant seed** (function + tenant trigger; backfilled for existing companies):
  - the **General** shift as default: GEN 09:00–18:00, 15 min grace, break 13:00–14:00 with Friday break to 14:30, half-day below 4 h, OT after 30 min, Sunday off;
  - the **FY 2026-27 Pakistan public holidays** from the template list:
    - fixed dates as *Upcoming* (or *Observed* when already past);
    - Eid-ul-Fitr, Eid-ul-Adha and Ashura as *Tentative*, moon-dependent;
    - Diwali and the day after Christmas as *Optional*;
    - source *Gazette*, all branches.
- **Error codes:** `DEPARTMENT_IN_USE`, `DEPARTMENT_CYCLE`, `DEPARTMENT_HAS_ACTIVE_CHILDREN`, `DESIGNATION_IN_USE`, `DESIGNATION_CYCLE`, `GRADE_IN_USE`, `SHIFT_IN_USE`, `SHIFT_DEFAULT_REQUIRED`, `HOLIDAY_IN_USE`.
- **Lookup labels:** WeeklyOff "Saturday & Sunday". Tones for the holiday status and type badges.
- **No new tables or columns.** Prisma models are added for the six tables (scalar fields, as in Phase 9) and the `HumanResources` schema is mapped.

## 7. Audit (row history)
- **Tables covered:** all six (two already have the trigger, four get it).
- **Attribution:** every write runs in `UnitOfWork.run(actorContext(user, meta))`, so the audit row records the signed-in user, IP, session and correlation ID. The seed is recorded as `system: seedOrganisationDefaultsFor`.
- **History view:** a History tab in each edit modal (department, designation, grade, shift, holiday); a holiday's branch changes show in its history.

## 8. Ordered tasks
1. `016-organisation.sql`; Prisma models; registrations (references, add-update, history tables).
2. Shared contracts and helpers.
3. Server module `hr`: departments, designations, grades, shifts, holidays, org tree, form options.
4. Pages from the templates; nav group Workforce.
5. Wire to the API; delete / deactivate rules; error and permission states.
6. Verification: Phase 10 API suite, visuals vs template (light / dark / 390 px), history attribution; clean the test data. Regressions of earlier phases are **not** run this phase (next full run after Phase 14).

## 9. Verification
- **Functional** (API suite `api-p10`):
  - CRUD, reload, deactivate and delete for every entity;
  - validation:
    - code formats;
    - grade band order and unique rank;
    - shift times, break pair, overnight flag computed, grace limits, seasonal ⇔ season;
    - holiday range; tentative only when moon-dependent;
  - hierarchy cycles rejected (department under its own child; designation reporting chain);
  - in-use blocks (a department with designations; a grade on a designation);
  - one default shift (switching the default moves it);
  - branch-specific holidays;
  - permissions:
    - HR manager: full;
    - auditor: read-only;
    - salesman: no access (403);
    - employee-only user: no HR pages;
  - history rows carry the real user;
  - seeded holidays and General shift present.
- **Visual:** each page and tab vs the template in light and dark at 1400 px and on 390 px mobile.
- Typecheck, lint, architecture and roadmap checks pass.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:**
  - everything in §9 passes;
  - test data cleaned (seeded holidays and shift kept);
  - deviations listed honestly.
- **Risks:**
  - **Placeholders until employees exist:** headcount, department head, filled positions and YTD payroll read 0 / "—" until Phase 11.
  - **Tentative holiday dates:** the seeded moon-dependent dates are estimates, to be confirmed when the moon is sighted.
- **Blockers:** none.

---
**Approve Phase 10 revision 1 for implementation?**
