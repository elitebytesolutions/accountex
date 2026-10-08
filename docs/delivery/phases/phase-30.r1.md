# Phase 30 rev 1: Time & attendance (workspace)

> **Status: approved 2026-10-08 (revision 1).** Planned together with Phases 30, 31 and 40 (run in parallel); Phases 36–39 accepted the same day.

**Objective:**
- Punches (device / manual / self-service geo).
- The daily attendance register, built from punches, roster, holidays and approved leave, and lockable for payroll.
- Regularisation requests, weekly rosters with shift swaps and open shifts, and overtime claims.
- The My Profile › Attendance and Shifts pages, and the My Day punch card.

**Entities (4, TRANSACTIONAL):** Attendance · Regularisation Requests · Rosters & Shift Swaps · Overtime Claims

## 1. Selection rationale
| Entity | Depends on (status) | Why now |
|---|---|---|
| Attendance | employees, shifts, devices (P11 ✓), holidays (P10 ✓) | Payroll (32) needs payable days |
| Regularisation | attendance, approvals (P16 ✓) | Corrects missed punches before payroll |
| Rosters & Shift Swaps | work shifts, employees ✓ | Register needs each day's planned shift |
| Overtime Claims | overtime policies (P11 ✓), attendance | Payroll pushes approved OT |

## 2. Verified schema (live DB; all 8 tables empty; Demo has 0 employees)

**AttendancePunches**
- Partitioned by month, append-only by design.
- `attendancePunchSourceChk`:
  - DEVICE needs a device;
  - MANUAL needs a reason;
  - ESS_GEO needs lat / long.
- Device de-duplication index.
- **No audit trigger.**

**AttendanceRegister**
- Unique (employee, date); status lookup with 9 codes.
- Lock trigger `hrAttendanceDayLock`; `leaveRequestId` / `leaveTypeId` for LEAVE days; `payrollRunId`.

**RegularisationRequests**
- docNo REG; status PENDING / APPROVED / REJECTED / WITHDRAWN (**no DRAFT**).
- Stage LINE_MANAGER / HR / COMPLETED. CHECKs: decision ⇔ decidedAt; non-PENDING ⇒ stage COMPLETED.

**ShiftRosters**
- Unique (employee, date); SHIFT ⇔ shiftId; published flag.
- **No audit trigger.**

**Shift swaps and open shifts (EmployeeSelfService schema)**
- **ShiftSwapRequests:** SW numbering.
- **OpenShifts / OpenShiftClaims:** a slot trigger enforces capacity.

**OvertimeClaims**
- docNo OT. Amount check: round(hours × rate × multiplier, 2), or 0 for comp-off.
- Status PENDING / APPROVED / REJECTED / PUSHED / CANCELLED.

**DB defects to fix in 025:**
- **The three approve functions don't satisfy their own CHECKs.** `regularisationRequestApprove`, `overtimeClaimApprove` and `shiftSwapRequestApprove` only set status — no decidedAt / decidedBy / stage COMPLETED — and ignore the comment.
- **Missing functions:** reject functions, punch insert, register build / lock, roster publish, open-shift claim.
- **`overtimeClaimCancel` allows PUSHED** (and that violates `overtimeEntryPushedChk` anyway).
- **Editing is not restricted to PENDING / unpublished** in the `*AddUpdate` functions.
- **REG / OT / SW document types exist, but no company has a numbering series**, so `getNextDocNo` fails.
- **The approval workflow `Subject` lookup has no attendance / overtime / swap codes.**

**Permissions** (all exist):
- `att:view/create/edit/approve/export`, `myatt:view/create`, `myshift:view/create`.
- HR_MANAGER holds all `att`; EMPLOYEE holds `myatt` / `myshift`.

**Unresolved questions:**
- **Q30-1. Approval routing.** Proposal:
  - Add `Subject` codes ATTENDANCE_REGULARISATION, OVERTIME_CLAIM and SHIFT_SWAP.
  - Seed one editable workflow per company and subject (line manager, then HR).
  - Fall back to direct HR approval when no workflow applies, as expense claims do.
- **Q30-2. Register build.** Proposal:
  - `HumanResources.attendanceRegisterBuild(pTenant, pDate, pEmployee?)`, run on demand ("Process day") and after a punch or an approved regularisation.
  - It is idempotent and never overwrites locked or manual rows.
  - A nightly run happens only if a scheduler exists.
- **Q30-3. Register lock.** Proposal: lock and unlock per month from the register page now (`att:approve`). Payroll (32) sets `payrollRunId` later.
- **Q30-4. Self-service geo punch.** Proposal: the browser sends geolocation, and the geofence check uses the branch coordinates. If a branch has no coordinates, `insideGeofence` is null and the punch is accepted with a "no geofence" flag. Selfie / face match stays disabled (no camera pipeline).

## 3. Template → page mapping
| Entity | Template | Page |
|---|---|---|
| Attendance | `50-hr-core.html:894–1000` (Today: KPIs, status, late arrivals, live check-ins, mark-attendance modal), `:1001–1059` (month register grid, lock banner) | `/hr/attendance`, `/hr/attendance/register` |
| Regularisation | `50-hr-core.html:1060–1147` (chips, checkbox table, drawer with approval flow, reject modal) | `/hr/attendance/requests` |
| Rosters & swaps | `50-hr-core.html:1148–1222` (weekly roster, publish); existing `shifts-screen.tsx` roster panel is enabled | `/hr/shifts` (roster panel + swap / open-shift lists) |
| Overtime | `50-hr-core.html:1340–1458` (claims table, log-overtime modal with comp-off, push to payroll disabled until 32) | `/hr/overtime` (existing screen, claims part enabled) |
| Self-service | `6A-ess.html` + `9C-ess.js:366–677` (attendance calendar, geo punch, correction), `:2898–3189` (my shifts, swap wizard, open shifts), `48-dash-stock.html:262` + `92-dash.js:214–309` (My Day punch card) | `/profile/attendance`, `/profile/shifts`, `/profile` punch card |

**Nav:** Time & Attendance gains Attendance Today, Attendance Register and Regularisation.

**Disabled template parts:** selfie / face match; "Push to payroll" (Phase 32); "Add to calendar".

## 4. Clean Architecture
| Layer | Location |
|---|---|
| Contracts | `src/shared/hr/{attendance,regularisation,roster,overtime-claim}.ts` |
| Domain | `hr/attendance/domain`: day status from punches + shift + holiday + leave; late / early / worked minutes; geofence distance; OT amount; roster publish rules |
| Application | `AttendanceService` (punch, process day, register, lock), `RegularisationService`, `RostersService` (entries, publish, swaps, open shifts), `OvertimeClaimsService`; approvals through `ApprovalSubjects.register` (pattern: `cash/claims/expense-claims.service.ts`); `UnitOfWork.run(actorContext)` |
| Infrastructure | Prisma stores; fixed `*AddUpdate` / approve / reject DB functions |
| Server adapter | `/api/hr/attendance`, `/api/hr/regularisation-requests`, `/api/hr/rosters`, `/api/hr/shift-swaps`, `/api/hr/open-shifts`, `/api/hr/overtime-claims`; self-service `/api/me/attendance`, `/api/me/regularisation-requests`, `/api/me/shifts`, `/api/me/shift-swaps`, `/api/me/open-shifts/:id/claim` |
| UI | `src/features/hr/attendance/*`, `src/features/profile/attendance|shifts` |

## 5. API contracts (highlights)
| Method & path | Permission | Errors |
|---|---|---|
| `POST /me/attendance/punch` (direction, lat / long, workMode) | myatt:create | 409 `ATTENDANCE_DAY_LOCKED`, 400 geo pair |
| `POST /hr/attendance/manual` (manual punch with reason) | att:create | 400 reason |
| `POST /hr/attendance/process?date`, `GET /hr/attendance/today`, `GET /hr/attendance/register?month` | att:edit / att:view | — |
| `POST /hr/attendance/register/lock?month`, `/unlock` | att:approve | 409 locked |
| `POST /me/regularisation-requests`, `POST /me/…/:id/withdraw`, `GET/PATCH /hr/regularisation-requests`, `POST /:id/approve \| reject` | myatt:create / att:approve | 409 `REQUEST_NOT_PENDING`, 400 time / missed-punch rules |
| `PUT /hr/rosters?week` (entries), `POST /hr/rosters/publish?week` | att:edit / att:approve | 409 published (edit via republish) |
| `POST /me/shift-swaps`, `POST /me/shift-swaps/:id/accept \| decline \| withdraw`, `POST /hr/shift-swaps/:id/approve \| reject` | myshift:create / att:approve | 409 `SWAP_NOT_ACTIONABLE` |
| `GET/POST /hr/open-shifts`, `POST /:id/cancel`, `POST /me/open-shifts/:id/claim`, `POST /hr/open-shifts/claims/:id/confirm \| decline` | att:edit / myshift:create | 409 `OPEN_SHIFT_FULL` |
| `GET/POST/PATCH /hr/overtime-claims`, `POST /:id/approve \| reject \| cancel` | att:create / att:approve | 400 over policy limit, 409 not pending |
| History `GET /api/history/HumanResources/<table>/:id` | att:view | — |

**Deletes:**
- Punches are voided (`isVoid`), never deleted.
- Requests are withdrawn or cancelled.
- Roster entries are deleted only while unpublished.

**Concurrency:** rowVersion on every editable row.

## 6. Database: `prisma/sql/201-attendance.sql` (idempotent, added to `db:sql`)
- Audit triggers on AttendancePunches (partitioned parent) and ShiftRosters.
- Fixes to approve / cancel / AddUpdate.
- New functions: reject functions, `attendancePunchAdd`, `attendanceRegisterBuild`, register lock / unlock, `shiftRosterPublish`, `openShiftClaim`.
- REG / OT / SW numbering series for every company, plus a tenant-insert trigger (pattern from `023-banking.sql`).
- Subject lookup codes and per-company default workflows.
- Error codes.

## 7. Audit
- Every write runs in `UnitOfWork.run(actorContext(user, meta))`.
- History tabs on requests, claims, swaps and register days.
- Register rows from the build are written by the user who pressed "Process"; any nightly run is logged as `system: attendance-build`.

## 8. Ordered tasks
1. SQL 025, Prisma models (8 tables), registries.
2. Contracts, domain, services.
3. HR pages, then My Profile pages and the punch card.
4. Nav.
5. Verification.

## 9. Verification
- In Test Co with marker employees (with app users, a manager and HR):
  - geo and manual punches → process day → register statuses (present / late / absent / holiday / leave);
  - regularisation: approve fixes the day, reject records the reason;
  - lock blocks edits;
  - roster publish;
  - swap accept → approve;
  - open-shift claim beyond capacity → 409;
  - overtime amount rule, approve / reject / cancel.
- Permissions per role (HR_MANAGER, EMPLOYEE, ACCOUNTANT denied).
- History names the real user.
- Visual check vs templates at 1440 light / dark and 390.

## 10. Risks
- Partitioned punch table: ensure future partitions exist (`ensureAttendancePunchPartition`).
- Register build rules must match payroll's expectations (Phase 32).
- Shared tables with Phase 31 (ownership rule above).

## Appendix: parallel delivery
**Status before these plans (ROADMAP):**
- **Done:** 0–17.
- **In progress:**
  - **18 Cash** (another session).
  - **36–39** (Super Admin catalogue, templates, config and flags). All four API suites pass (107/155/131/129) and all 17 admin pages load in the browser, but they are **not yet accepted**.

**Ordering:**
- **Phase 40** needs 36, 37 and 39 accepted first. It can be approved now and start the moment you accept 36–39.
- **Phases 30 and 31** depend only on finished phases (10, 11, 13, 16), so they can start now in a parallel session.

**Parallel-safety rules** (all three run at the same time as Phase 18):
- **SQL file numbers are reserved:**
  - `201-attendance.sql` (Phase 30)
  - `202-leave-lifecycle.sql` (Phase 31)
  - `105-admin-tenant-lifecycle.sql` (Phase 40)
- **Shared registries are add-only and re-read before every edit:** `add-update.ts`, `references.ts`, `history-tables.ts`, `admin-history-tables.ts`, `workspace-nav/nav.ts`, `admin-nav/nav.ts`, `prisma/schema.prisma`, `profile/tabs.ts`.
- **Table ownership between 30 and 31** (they share HR tables):
  - **`HumanResources.AttendanceRegister`** is owned by Phase 30. The register build reads approved leave (`LeaveRequests`) to mark LEAVE days. Phase 31 never writes the register.
  - **`HumanResources.LeaveAdjustments`** is owned by Phase 31. A COMP_OFF credit is created in 31's "Adjust balance" flow by picking an approved comp-off overtime claim. Phase 30 only marks the claim APPROVED and never writes adjustments.
- **Test data:** Demo has **0 employees**. Every suite runs in **Test Co** (`test`) with marker employees it creates through the API and cleans up afterwards. Real Demo data is never touched.
