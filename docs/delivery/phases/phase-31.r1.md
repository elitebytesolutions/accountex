# Phase 31 rev 1: Leave & lifecycle (workspace)

> **Status: approved 2026-10-08 (revision 1).** Planned together with Phases 30, 31 and 40 (run in parallel); Phases 36–39 accepted the same day.

**Objective:**
- Leave requests (self-service and HR on behalf) with approval.
- Leave balances: accrual, adjustments, year-end carry forward / encash / lapse.
- Onboardings generated from Phase 13 templates, with task tracking.
- Offboardings with clearance and exit interview.
- My Profile › Leave and Onboarding.

**Entities (4, TRANSACTIONAL):** Leave Requests · Leave Balances · Onboardings · Offboardings

## 1. Selection rationale
| Entity | Depends on (status) | Why now |
|---|---|---|
| Leave Requests | leave types (P11 ✓), employees ✓, approvals (P16 ✓) | Payroll (32) needs approved unpaid leave; attendance shows LEAVE days |
| Leave Balances | leave requests | Balance checks and year-end close |
| Onboardings | onboarding templates (P13 ✓), employees ✓ | `/hr/onboarding` already promises "new joiners arrive with Phase 31" |
| Offboardings | employees ✓ | Final settlements (33) start from an offboarding |

## 2. Verified schema (all 9 tables empty; LeaveTypes 7 in Demo; OnboardingTemplates 1)

**LeaveRequests**
- docNo LV; duration FULL / HALF_AM / HALF_PM.
- Status PENDING / APPROVED / REJECTED / CANCELLED (**no DRAFT**).
- Stage LINE_MANAGER / HR_REVIEW / CEO / COMPLETED.
- `leaveRequestNoOverlap` (exclusion constraint).
- Balance trigger: PENDING → booked, APPROVED → used.

**LeaveBalances / LeaveAdjustments / LeaveYearEndClosings**
- **LeaveBalances:** one row per employee, type and year; balance / available are generated; commit-time guard against a negative balance.
- **LeaveAdjustments:** append-only; maps kind → balance column; COMP_OFF needs an overtime claim.
- **LeaveYearEndClosings:** DRAFT / COMPLETED / REVERSED.

**Onboardings + OnboardingTasks**
- One open onboarding per employee and track.
- Task groups, owner functions and action kinds.

**Offboardings + ClearanceItems + ExitInterviews**
- One open offboarding per employee.
- RESIGNATION needs a resignation date.

**Missing audit triggers:** **Onboardings, OnboardingTasks, ClearanceItems, ExitInterviews.**

**DB defects to fix in 026:**
- **`leaveRequestApprove` fails its own CHECKs.** It sets no decidedAt / stage COMPLETED and ignores the comment. Its "preparer can't approve" rule blocks HR approving a request HR applied on behalf of someone.
- **`leaveRequestCancel` breaks the stage CHECK** and allows cancelling REJECTED requests.
- **There is no reject function.**
- **`leaveRequestAddUpdate` edits APPROVED requests** and accepts stage / decision fields from the client.
- **`onboardingCancel` fails on COMPLETED**, and **`leaveYearEndClosingReverse` fails on DRAFT**.
- **Missing functions:** onboarding-from-template, monthly accrual, year-end complete, clearance clear, offboarding complete, leave adjustment add.
- **LV / ONB / OFF numbering series are missing for every company.**

**Permissions:** `lv:*`, `mylv:view/create`, `emp:*`, `myonb:view/edit` all exist and are granted to HR_MANAGER / EMPLOYEE.

**Unresolved questions:**
- **Q31-1. Leave approval chain.** `LeaveTypes.approvalWorkflow` (MANAGER / MANAGER_HR / MANAGER_HR_CEO / HR, `hrApprovalAboveDays`) overlaps the Phase 2 workflow engine. Proposal:
  - Use the engine (`LEAVE_REQUEST` subject already exists).
  - Seed one default editable workflow per company whose steps read the leave type's chain as facts (line manager → HR when the type says so or days > `hrApprovalAboveDays` → CEO).
  - No workflow configured → the leave type's chain is applied directly.
  - HR "apply on behalf" skips the chain, as the template says.
- **Q31-2. Balance check timing.** The DB guard checks `balance`, not `available`. Proposal: the app rejects a request when `available` (balance − booked) < days, unless the type allows negative balances (400 `LEAVE_INSUFFICIENT_BALANCE`).
- **Q31-3. Accrual.** Proposal: "Run accrual for <month>" button (`lv:edit`) creating ACCRUAL adjustments from each type's accrual settings. Idempotent per employee, type and month. Nightly run only if a scheduler exists.
- **Q31-4. Offboarding complete.** Proposal:
  - Requires every clearance item CLEARED or WAIVED.
  - Sets Employees.status EXITED + exitDate.
  - Suspends the linked app user, unless it is the tenant's default user (locked → 409).
  - Final settlement is Phase 33.
- **Q31-5. My Profile › Team approvals deck.** Proposal: leave it for Phase 34. Managers approve leave in the Phase 16 Approvals inbox, and the onboarding POLICY_ACK task stays read-only until Phase 34.

## 3. Template → page mapping
| Entity | Template | Page |
|---|---|---|
| Leave requests | `50-hr-core.html:1561–1690` (overview: KPIs, calendar, who's out, pending approvals, apply-on-behalf), `:1691–1782` (requests list, approve / reject / apply modals) | `/hr/leave`, `/hr/leave/requests` |
| Leave balances | `50-hr-core.html:1783–1873` (balance grid, adjust modal, year-end carry modal) | `/hr/leave/balances` |
| Onboardings | `51-hr-pay-talent.html:890–969` (new joiners, checklist template, open tasks); existing `onboarding-screen.tsx` (P13) gains the joiners / tasks parts | `/hr/onboarding` |
| Offboardings | `51-hr-pay-talent.html:970–1051` (exits in progress, reasons, clearance by department, record resignation, exit interview modal) | `/hr/offboarding` |
| Self-service | `6A-ess.html:18–30` + `9C-ess.js:679–936` (balance cards, requests, team calendar, apply sheet with live days / clash warning, policy); `:214–225` + `:3191–3378` (my onboarding checklist) | `/profile/leave`, `/profile/onboarding` |

**Nav:** HR › Leave (Overview, Requests, Balances; Policies already exists) and HR › Offboarding.

## 4. Clean Architecture
| Layer | Location |
|---|---|
| Contracts | `src/shared/hr/{leave-request,leave-balance,onboarding,offboarding}.ts` |
| Domain | Working-day count (holidays, weekly off, sandwich rule, half days), notice / backdate / max-consecutive rules from the leave type, leave-year start, accrual amount, carry-forward caps, onboarding due dates from template offsets, clearance completeness |
| Application | `LeaveRequestsService` (apply, on behalf, withdraw / cancel, approve / reject via `ApprovalSubjects`), `LeaveBalancesService` (accrual, adjustments, comp-off credit, year-end close / reverse), `OnboardingsService`, `OffboardingsService` |
| Infrastructure | Prisma stores; fixed / new DB functions |
| Server adapter | `/api/hr/leave-requests`, `/api/hr/leave-balances`, `/api/hr/leave-adjustments`, `/api/hr/leave-year-end`, `/api/hr/onboardings`, `/api/hr/offboardings`; self-service `/api/me/leave-requests`, `/api/me/leave-balances`, `/api/me/onboarding` |
| UI | `src/features/hr/leave/*`, `src/features/hr/lifecycle/*`, `src/features/profile/leave|onboarding` |

## 5. API contracts (highlights)
| Method & path | Permission | Errors |
|---|---|---|
| `POST /me/leave-requests`, `POST /me/leave-requests/:id/cancel`, `GET /me/leave-balances` | mylv:create / view | 400 `LEAVE_INSUFFICIENT_BALANCE`, notice / backdate / half-day rules; 409 `LEAVE_OVERLAP` |
| `GET /hr/leave-requests`, `POST /hr/leave-requests` (on behalf), `POST /:id/approve \| reject \| cancel` | lv:view / create / approve | 409 `LEAVE_NOT_PENDING` |
| `GET /hr/leave-balances?year`, `POST /hr/leave-balances/accrue?month`, `POST /hr/leave-adjustments` (manual / opening / comp-off) | lv:view / edit | 400 kind / direction; 409 already accrued |
| `POST /hr/leave-year-end/:year/close`, `POST /:id/reverse` | lv:approve | 409 already closed |
| `GET/POST /hr/onboardings` (from template), `PATCH /:id`, `POST /:id/cancel`, `PATCH /hr/onboardings/:id/tasks/:taskId`, `POST /me/onboarding/tasks/:id/complete` | emp:* / myonb:edit | 409 `ONBOARDING_OPEN_EXISTS` |
| `GET/POST /hr/offboardings`, `PATCH /:id`, `POST /:id/clearance/:itemId/clear \| waive`, `PUT /:id/exit-interview`, `POST /:id/complete \| withdraw` | emp:* | 409 `OFFBOARDING_CLEARANCE_PENDING`, `DEFAULT_USER_LOCKED` |
| History `GET /api/history/HumanResources/<table>/:id` | lv:view / emp:view | — |

**Deletes:**
- Requests are cancelled; adjustments are append-only; closings are reversed.
- Onboardings and offboardings are cancelled or withdrawn.

**Concurrency:** rowVersion.

## 6. Database: `prisma/sql/202-leave-lifecycle.sql` (idempotent)
- Audit triggers on the 4 tables listed above.
- Fixes: approve / cancel / AddUpdate guards; `onboardingCancel`; year-end reverse.
- New functions:
  - `leaveRequestReject`
  - `leaveAdjustmentAdd`
  - `leaveAccrueMonth`
  - `leaveYearEndClosingComplete`
  - `onboardingFromTemplate`
  - `clearanceItemClear`
  - `offboardingComplete`
- LV / ONB / OFF numbering series for every company, plus a tenant-insert trigger.
- Default leave workflow per company.
- Error codes.

## 7. Audit
- Every write runs in `UnitOfWork.run(actorContext)`.
- History tabs on requests, onboardings and offboardings; a balance shows its adjustments trail.
- Approval actions are mirrored by the Phase 16 engine.

## 8. Ordered tasks
1. SQL 026, Prisma models, registries.
2. Contracts, domain, services.
3. HR leave pages, onboarding / offboarding pages, My Profile pages.
4. Nav.
5. Verification.

## 9. Verification
- In Test Co with marker employees (manager, HR, staff):
  - apply → approve (balance booked → used); reject (balance released); overlap → 409; insufficient balance → 400; half day;
  - HR applies on behalf;
  - accrual twice → no double credit;
  - manual adjustment; comp-off credit from an approved overtime claim (if Phase 30 has landed, otherwise a fixture);
  - year-end close carry forward / encash / lapse and reverse;
  - onboarding from template (tasks and due dates), task completion from My Profile;
  - offboarding: clearance blocks completion → clear → complete (employee EXITED, user suspended; default user → 409).
- Permissions; history names the real user.
- Visual check vs templates at 1440 light / dark and 390.

## 10. Risks
- Leave rules (sandwich, notice, accrual) are business-sensitive: they follow the LeaveTypes columns exactly.
- Coordination with Phase 30 on the register and comp-off (ownership rule above).
- Offboarding user suspension must never touch the tenant default user.

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
