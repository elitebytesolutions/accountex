# Phase 11 rev 1: HR policies & people

**Objective:** this phase adds:
- the **employee master**, with statutory details, bank accounts, a document checklist, position history and a link to an app login;
- the HR policies that attendance and payroll (Phase 12+) apply to employees: **leave types** with eligibility, the **overtime policy**, and **biometric devices**.

Every change is attributed to the user in row history. There are no leave requests, overtime claims, attendance punches or salary yet.

**Entities (4, MASTER):** Leave Types & Eligibility · Overtime Policies · Biometric Devices · Employees

**Status before this plan:** Phases 0–10 `done`; no phase in progress.

**Decisions taken with you:**
- **Leave types are seeded.** Every company gets the template's 7 standard Pakistan types: Annual 14, Casual 10, Sick 8, Maternity, Paternity, Hajj/Umrah and Unpaid. Each comes with the template's accrual, carry-forward and eligibility rules (Shops & Establishments Ordinance 1969), and all of them are editable.
- **The overtime policy is seeded:**
  - multipliers: weekday 1.5×, weekly off and public holiday 2.0×;
  - hourly rate = gross ÷ 26 ÷ 8;
  - minimum 30 min; daily cap 4 h; monthly cap 48 h;
  - pre-approval on; comp-off allowed.

  The database allows one active policy per company.
- **Add-employee wizard, step 3 "Compensation":**
  - **now:** only the statutory & benefits switches (EOBI, social security, PF, group insurance, overtime eligible), which are stored;
  - **Phase 12:** the salary structure part shows "Set up in Payroll (Phase 12)", as does the profile's Salary tab.
- **App login:** HR **links an existing user** (Settings › Users) to an employee, or unlinks them, from the employee profile. The wizard's "Create ESS login" checkbox is shown disabled with that hint.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Leave Types & Eligibility | Master | Grades (10, done), branches (1, done) | Leave requests and balances (later) need the types and their rules |
| Overtime Policies | Master | Grades (10, done) | Overtime claims and payroll need the rates |
| Biometric Devices | Master | Branches (1, done) | Attendance punches (Phase 12+) come from devices; employees carry a biometric ID |
| Employees | Master | Departments, designations, grades, shifts (10, done); branches, numbering (1, done); cost centres (3, done) | Payroll, attendance, leave, salesmen and approvals all need employees |

This finishes the HR masters. Payroll setup is Phase 12.

## 2. Verified schema (live DB; all 11 tables are empty)

**Leave Types** (`HumanResources.LeaveTypes`, audited)
- **Identity:** `code` `^[A-Z]{2,4}$` (unique), `name`, `category`, `colour`, `isPaid`, `daysPerYear`, `unit`, `description`, `statuteNote`.
- **Accrual:** `accrualMethod`, `accrualAmount`, `prorateNewJoiners`.
- **Carry-forward:** `carryForwardMode`, `carryForwardMax`, `accumulationCap`, `carryExpiryMonths`.
- **Encashment:** `encashmentMode`, `encashMaxDays`, `encashBasis`.
- **Rules:**
  - `deductionBasis`, `sandwichRule`, `allowHalfDay`, `allowNegative`, `blockInPayrollLock`;
  - attachment required after N days;
  - backdate, notice, max consecutive / per month / times in service, apply window;
  - comp-off expiry.
- **Who it applies to:** `gender`, `employmentTypes` (array within the 5 employment types), `availableAfter`, `probationRule`.
- **Approval:** `approvalWorkflow`, `hrApprovalAboveDays`.
- **Other:** `sortOrder`, `status`, `deletedAt`.
- **DB checks** cover accrual, carry, encash, unpaid and attachment combinations.
- DB function `leaveTypeAddUpdate`.

**Leave Eligibility Rules** (`HumanResources.LeaveEligibilityRules`)
- `leaveTypeId`, `scope` (BRANCH xor GRADE: DB check), `branchId` / `gradeId`, `isIncluded`, `daysOverride`.
- **Audit trigger missing → added.**
- No DB function: written by a hand-written set-based function, `leaveEligibilityReplace(jsonb)`, which keeps row ids.

**Overtime Policies** (`HumanResources.OvertimePolicies`, audited)
- **Rates:** `name`, `statuteNote`, weekday / weekly-off / holiday multipliers (each ≥ 1), `hourlyRateBasis`, `rounding`.
- **Limits:** `minMinutes`, `dailyCapHours` ≤ `monthlyCapHours`, `eligibleUpToGradeId`.
- **Approval:** `requiresPreApproval`, `allowCompOff`.
- **Status:** `effectiveFrom`, `isActive` (**one active per company**: partial unique index), `deletedAt`.
- DB function `overtimePolicyAddUpdate`.

**Biometric Devices** (`HumanResources.BiometricDevices` + `DeviceSyncLogs`)
- **Identity:** `code` and `serialNo` (each unique), `locationLabel`, `brand`, `model`, `branchId`.
- **Connection:**
  - `connectionType` (TCP_PULL needs `ipAddress`), `port`;
  - `commKeySecret`: never returned by the API and masked in history;
  - `timezone`, `punchDirection`, `syncIntervalMin` ∈ {1, 5, 15, 30, 60}, `firmwareVersion`.
- **Status:** `status`, last heartbeat / sync, enrolled users / faces / fingers, `isActive`, `deletedAt`.
- **Sync logs** (`DeviceSyncLogs`): `occurredAt`, `operation`, `records`, `durationMs`, `result`, `message`.
- **Audit triggers missing on both tables → added.**
- DB function `biometricDeviceAddUpdate`.

**Employees** (`HumanResources.Employees`, audited)
- **Identity:**
  - `code`: from the **EMP numbering series**. The `EMP` document type exists, but Demo has no series row, so one is seeded;
  - first / last / legal name, `displayName` (generated);
  - guardian; `cnic` `^\d{5}-\d{7}-\d$` (unique) with issue / expiry dates;
  - `dateOfBirth` < `joiningDate` (DB check);
  - gender, marital status, children, religion, blood group, nationality;
  - `photoAttachmentId` (**Phase 35**).
- **Contact:** mobile, personal / work email, current / permanent address, city, two emergency contacts.
- **Job:**
  - department, designation, grade, `reportingManagerId` → Employees, cost centre, branch, shift, weekly off, `payGroup`, employment type, work pattern;
  - joining date, probation months, confirmation due / confirmed, contract end, notice days;
  - `biometricId` (unique);
  - booker / salesman / deliveryman / supervisor flags.
- **Status:**
  - `status`: Active / Probation / On leave / Notice period / Exited;
  - **exit status ⇔ `exitDate`** (DB check), `exitType`;
  - `appUserId` (unique; mirrors `Company.Users.employeeId`), `deletedAt`.
- DB function `employeeAddUpdate`.

**Employee child tables**
- **`EmployeeStatutoryDetails`** (1:1, audited): EOBI (applicable, number, registered on); social security (applicable, scheme, number); NTN, ATL status; PF (applicable, from); group insurance; overtime eligible.
- **`EmployeeBankAccounts`** (audited):
  - payment mode, bank, branch, account title, IBAN `^PK\d{2}[A-Z]{4}[0-9A-Z]{16}$`, effective from;
  - BANK mode needs IBAN, title and bank (DB check);
  - **one primary active account** per employee (partial unique index).
- **`EmployeeDocuments`:**
  - category, title, issued / expires on, required, renewal frequency, due on, status, verified by / at, remarks;
  - `attachmentId` is required unless the status is PENDING or MISSING. Uploads arrive with file storage in **Phase 35**, so documents are a **checklist** now (Pending / Missing; verification waits for uploads).
  - **Audit trigger missing → added.**
- **`EmployeePositionHistory`:**
  - effective date, event type (lookup `PositionChangeEventType`);
  - from / to department, designation, grade, branch, manager, employment type and status;
  - increment %, reference, reason.
  - **Audit trigger missing → added.** Rows are written by transfer / promote / confirm / exit and are never edited.
- **`BranchHrSettings`:**
  - per branch: social security scheme, HR manager (employee), default shift, geofence.
  - **Audit trigger missing → added.**
  - Edited from the template's Branches tab on `/hr/departments` (built read-only in Phase 10): the manager and default shift become editable.

**Unresolved questions:** none.

## 3. Template → page mapping (`template/src/50-hr-core.html`)
| Entity | Template · route / tab | Page / component | Notes |
|---|---|---|---|
| Employees list | `app/hr/employees` | `/hr/employees` → `EmployeesScreen` | **From the template:** KPIs, cards / table toggle, search, and filters (department, branch, status, type). **Added:** pagination, History. **Export** is CSV. **Import** is disabled (bulk import is a later phase). |
| Add employee | `app/hr/employees/new` | `/hr/employees/new` → `EmployeeWizard` | 5 steps:<br>1. **Personal:** identity, CNIC, contacts, emergency.<br>2. **Job:** department → designation → grade, manager, branch, shift, type, dates, biometric ID, sales flags.<br>3. **Compensation:** statutory switches only; the salary panel shows "Payroll (Phase 12)".<br>4. **Documents & bank:** the bank account, plus the document checklist (required items marked Pending).<br>5. **Review.**<br>The code is previewed, then assigned on save. "Create ESS login" is disabled with a hint. |
| Employee profile | `app/hr/employees/view` | `/hr/employees/[id]` → `EmployeeProfileScreen` | **Built from the template:** the hero and the KPIs, plus these tabs:<br>• **Overview** and **Personal**: edited in the modal;<br>• **Job**: transfer / promote / confirm / exit actions write the position-history timeline;<br>• **Documents**: checklist;<br>• **Bank & statutory**.<br>**Placeholder tabs:** Salary (Phase 12), Attendance and Leave (balances arrive with leave and attendance), Assets.<br>**Disabled until later:** the letters modal ("HR letters", a later phase).<br>**Added:** link / unlink app user, History. |
| Org Chart | `app/hr/org` | existing `/hr/org` | The **People** view is turned on: employee cards nested by reporting manager. Filled positions, the department head and headcount are now real on the chart and on `/hr/departments`. |
| Leave Types & Eligibility | `app/hr/leave/policies` | `/hr/leave/policies` → `LeavePoliciesScreen` | **From the template:** the policy cards, the policy matrix (types × employment types / genders), and the extra-large modal with 4 tabs: General, Accrual & carry-forward, Rules, Eligibility (branch / grade overrides). **Added:** activate / deactivate / delete, History. |
| Overtime Policies | `app/hr/overtime` | `/hr/overtime` → `OvertimeScreen` | **Built now:** the policy panel and its edit modal; History. The claims list shows an empty state: claims arrive with attendance. |
| Biometric Devices | `app/hr/devices` | `/hr/devices` → `DevicesScreen` | **From the template:** the device cards (status, branch, last sync, enrolled), the sync-log table, and the add / edit modal. **"Sync now" and "Test connection" are disabled:** there is no device connector until attendance. The sync log is read-only and empty. |

Every page has loading, empty, validation, success, error and permission states.

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/hr/{employee,leave-type,overtime,device}.ts` | Zod schemas; helpers `cnicValid`, `ibanValid`, `employeeErrors` (DOB < joining, exit ⇔ date), `leaveTypeErrors` (accrual / carry / encash combos), `overtimeErrors` |
| Domain | `src/server/modules/hr/*/domain` | Manager can't be the employee itself or a subordinate (cycle); position-change diff → history row |
| Application | `EmployeesService`, `LeaveTypesService`, `OvertimeService`, `DevicesService` | Use cases in `UnitOfWork.run(actorContext…)`; the code comes from `Company.nextDocumentNumber('EMP', branch, joining)`; link user (sets both `Employees.appUserId` and `Users.employeeId`); in-use checks |
| Infrastructure | Prisma stores; `*AddUpdate` functions via the allow-list; `references.ts`; `history-tables.ts` | Read models with department / designation / manager names |
| Server adapter | `/api/hr/employees`, `/leave-types`, `/overtime-policies`, `/devices`, `/branch-settings` | Zod pipes, `@RequirePermission`, user context |
| UI | `src/features/hr/*`; pages `/hr/employees`, `/hr/employees/new`, `/hr/employees/[id]`, `/hr/leave/policies`, `/hr/overtime`, `/hr/devices` | Nav **Workforce** › People: Employees (first); Time & Attendance: Overtime, Biometric Devices; Leave: Leave Policies |

## 5. API contracts
| Method & path | Permission | Notes / errors |
|---|---|---|
| `GET /api/hr/employees` (search, department, branch, status, type, page, sort) · `GET /:id` | `emp:view` | KPIs on the list |
| `POST /api/hr/employees` (with statutory, bank, documents) | `emp:create` | 409 CNIC / biometric ID / code; 400 DOB, CNIC, IBAN |
| `PATCH /api/hr/employees/:id` + rowVersion | `emp:edit` | Department / designation / grade / branch / manager **can't be changed here**; use transfer / promote (400 `EMPLOYEE_USE_POSITION_CHANGE`) |
| `POST /api/hr/employees/:id/transfer \| promote \| confirm \| exit \| rejoin` | `emp:edit` | Writes `EmployeePositionHistory`; exit sets the date and type; 400 `EMPLOYEE_MANAGER_CYCLE` |
| `POST /api/hr/employees/:id/link-user` `{ userId \| null }` | `emp:edit` | 409 `EMPLOYEE_USER_LINKED` (the user already belongs to another employee) |
| `PUT /api/hr/employees/:id/bank-accounts` · `PUT …/documents` · `PUT …/statutory` | `emp:edit` | Keeps row ids; one primary |
| `DELETE /api/hr/employees/:id` + rowVersion | `emp:delete` | Only when unreferenced (managers of others, linked user, branch HR manager, department head) → 409 `EMPLOYEE_IN_USE`; otherwise exit |
| `GET /api/hr/org?view=people` | `emp:view` | Reporting tree |
| `GET/POST/PATCH/DELETE /api/hr/leave-types(/:id)`, activate / deactivate, `PUT /:id/eligibility` | view `lv:view`; create `lv:create`; edit `lv:edit`; delete `lv:delete` | 409 code; 400 rule combos; 409 `LEAVE_TYPE_IN_USE` (requests / balances, later) |
| `GET/POST/PATCH/DELETE /api/hr/overtime-policies(/:id)`, activate / deactivate | view `att:view`; create `att:create`; edit `att:edit`; delete `att:approve` | 409 `OVERTIME_POLICY_ACTIVE_EXISTS` when activating a second one; 400 multipliers and caps |
| `GET/POST/PATCH/DELETE /api/hr/devices(/:id)`, activate / deactivate, `GET /:id/sync-logs` | `att:*` as above | 409 code / serial; 400 IP for TCP_PULL, interval; `POST /:id/sync` **not built** (no connector) |
| `GET/PUT /api/hr/branch-settings/:branchId` | view `emp:view`; edit `emp:edit` | Manager and default shift |
| `GET /api/history/HumanResources/<table>/:id` | the entity's view permission | |

- **Delete vs deactivate:** delete only when unreferenced (soft delete; codes are retired). Employees are exited rather than deleted once referenced.
- **Concurrency:** every write carries `rowVersion`; stale → 409.
- **Paging:** employees are server-paged. Leave types, policies and devices are short lists.

## 6. Database changes: `prisma/sql/017-hr-people.sql` (idempotent, added to `npm run db:sql`)
- **Audit triggers:** `LeaveEligibilityRules`, `BiometricDevices`, `DeviceSyncLogs`, `EmployeeDocuments`, `EmployeePositionHistory`, `BranchHrSettings`. Each table is checked first, and a trigger is added wherever one is missing.
- **Set-based functions:** `leaveEligibilityReplace`, `employeeBankAccountsReplace` and `employeeDocumentsReplace` (keeping ids), plus `employeePositionChange(jsonb)` (updates the employee and inserts the history row in one statement).
- **Per-tenant seed** (function + tenant trigger, backfilled):
  - the **EMP numbering series** (`EMP-0001`, never reset);
  - the **7 leave types** with their rules;
  - the **overtime policy** (active).

  `BranchHrSettings` rows are created per branch with the default shift.
- **Error codes:**
  - employees: `EMPLOYEE_IN_USE`, `EMPLOYEE_MANAGER_CYCLE`, `EMPLOYEE_USE_POSITION_CHANGE`, `EMPLOYEE_USER_LINKED`;
  - policies and devices: `LEAVE_TYPE_IN_USE`, `OVERTIME_POLICY_ACTIVE_EXISTS`, `DEVICE_IN_USE`.
- **No new tables or columns.** Prisma models are added for the 11 tables (scalar fields).

## 7. Audit (row history)
- **Tables covered:** all 11.
- **Attribution:** every write runs in `UnitOfWork.run(actorContext(user, meta))`. The seed is recorded as `system: seedHrPeopleDefaultsFor`.
- **History tab:** on the employee profile (including the bank, document, statutory and position rows) and in each leave type, overtime and device modal.
- **Redaction:** the device comm key is masked in history and never returned by the API.

## 8. Ordered tasks
1. `017-hr-people.sql`, Prisma models, registrations (references, add-update, history tables).
2. Shared contracts and helpers.
3. Server: employees (incl. position changes, link user, children), leave types, overtime, devices, branch settings, org People view.
4. Pages from the templates; nav entries.
5. Wire to the API; delete / exit rules; error and permission states; turn on the real counts on departments and the org chart.
6. **Verification:**
   - the Phase 11 API suite;
   - visuals vs the template (light / dark / 390 px);
   - history attribution;
   - clean the test data.

   Regressions are **not** run this phase (the next full run is after Phase 14).

## 9. Verification
- **Functional** (API suite `api-p11`):
  - **Employees:** create through the wizard payload with the code from the series; validation (CNIC format / unique, DOB, IBAN, one primary bank, exit ⇔ date); transfer / promote / confirm / exit write history rows; manager cycle rejected; link / unlink user (both sides set; a second link rejected); delete blocked when referenced.
  - **Leave types:** CRUD, rule combinations rejected, eligibility overrides.
  - **Overtime:** a second active policy is rejected; caps and multipliers are validated.
  - **Devices:** CRUD; IP required for TCP_PULL; the comm key is never returned.
  - **Permissions:**
    - HR manager: full;
    - auditor: read-only;
    - salesman: 403;
    - employee-only user: no HR pages.
  - **History** rows carry the real user.
  - **Seeds** present: 7 leave types, the policy and the EMP series.
- **Visual:** every page and tab vs the template in light and dark at 1400 px and on 390 px mobile.
- **Checks:** typecheck, lint, architecture and roadmap checks pass.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:**
  - everything in §9 passes;
  - test data cleaned; the seeds and your Demo data are kept;
  - deviations listed honestly.
- **Risks:**
  - **Placeholders:** salary, attendance, leave balances, assets, letters, photos and document uploads wait for their phases, so the profile shows several empty tabs.
  - **No device connector:** devices are registered, but no punches are pulled until attendance.
  - **Seeded leave rules:** these are the template's values; check them against your HR policy.
- **Blockers:** none.

---
**Approve Phase 11 revision 1 for implementation?**
