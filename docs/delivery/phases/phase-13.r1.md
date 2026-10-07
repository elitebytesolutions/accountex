# Phase 13 rev 1: Talent & policy setup

> Planned together with Phases 13, 14 and 15 for parallel implementation; approved 2026-10-07.

## Shared context (Phases 13–15)
**Status before this plan:**
- Phases 0–10 are `done`.
- **Phase 11 is `in-progress` in another session.** You asked for 13/14/15 to start in parallel; their roadmap dependencies are all `done`.
- Phase 12 is planned and is expected to use `prisma/sql/018-*`.

**Your decisions (2026-10-07):**
- **Screens with no admin template are built in template style.** They use only existing template components and are listed as deviations at acceptance.
- **Sign-in recovery moves out of Phase 15.** It goes to Phase 29 (Period close & work queue), where reminder runs also need email/SMS delivery; the provider is chosen then.
- **Order templates move to Phase 25,** where they live in the template (Quick Wholesale Entry).
- **Report Studio** = saved definitions, shares and schedules, plus a live read-only preview. Scheduled sending waits for Phase 35.

**Scope moves made from verified schema evidence:**
- **`CompetencyRatings`, `KeyResults` → Phase 33 (performance).** Each row hangs off one employee's review/goal (`performanceReviewId`, `goalId`), so they are not cycle setup.
- **`CompanyAnnouncementReads`, `PresenceStatuses` → Phase 34 (engagement).** They are per-employee runtime rows keyed by `employeeId`, and employees are still being built in Phase 11.

**Applies to all three phases:**
- **Employee-linked fields** (route staff, van default driver, policy/category owner) show "after Phase 11". They become selectable once Phase 11 is accepted, with no rework.
- **Each phase has its own SQL file,** in `npm run db:sql` order after 018:
  - `019-talent-setup.sql` (13);
  - `020-distribution-setup.sql` (14);
  - `021-self-service-setup.sql` (15).
- **Each phase is approved, accepted and marked `done` on its own.** On approval, the scope moves above are written into `docs/delivery/roadmap/*.ts` and `npm run delivery:roadmap` must pass.
- **Shared files are edited by all parallel sessions, including Phase 11. Add lines only:**
  - `prisma/schema.prisma`;
  - `src/server/infrastructure/prisma/add-update.ts` (FUNCTIONS) and `references.ts` (TABLES);
  - `src/server/modules/history/application/history-tables.ts`;
  - `src/features/workspace-nav/nav.ts`;
  - `src/server/modules/hr/hr.module.ts`, `src/server/app.module.ts`;
  - `package.json` `db:sql`.

  Git has no commits yet. **Make a first commit before starting**, so parallel edits can be reviewed and reverted.
- **Pattern per entity (as in Phase 10):** SQL (audit triggers, error codes, seeds) → Prisma models → registries → `src/shared/<module>` Zod contracts → `src/server/modules/<module>/<entity>/{application,infrastructure,presentation}` (writes via the existing `*AddUpdate` functions inside `UnitOfWork.run(actorContext…)`) → `src/features/<module>` screens (reuse `record-modal.tsx`, History tab) → `src/app/(app)/<route>/page.tsx` with `requirePermission`.
- **Every page** has loading, empty, validation, success, error and permission states.
- **Verification** follows the accepted habit:
  - an API suite per phase, run in a scratchpad as `api-pNN.mjs`;
  - typecheck, lint, `lint:arch` and `delivery:roadmap` all pass;
  - headless-Edge screenshots against the template (light, dark, 390 px);
  - psql check that history rows carry the real user;
  - test data cleaned up afterwards;
  - no automated test files.

---

**Objective:** the HR masters that onboarding, appraisals and training use, plus company policies with versioned publishing. No individual onboardings, reviews, enrolments or acknowledgements; those come in Phases 31, 33 and 34.

**Entities (4, MASTER):** Onboarding Templates · Performance Cycles · Training Programs · Company Policies

## 1. Selection rationale
| Entity | Depends on (status) | Why now |
|---|---|---|
| Onboarding Templates | none | Onboardings (31) copy a template's tasks |
| Performance Cycles | none | Goals, reviews and feedback (33) belong to a cycle |
| Training Programs | Departments (10, done) | Enrolments and sessions (33) reference a program |
| Company Policies | Attachments (core) | Acknowledgements (34), announcements (15) and onboarding policy tasks reference them |

## 2. Verified schema (live DB; all tables empty, no Prisma models yet)

**`HumanResources.OnboardingTemplates`**
- Columns: `name` (unique per tenant), `track` (lookup Track: NEW_JOINER / ROLE_CHANGE), `isDefault`, `isActive`, `deletedAt`.
- One default per track (partial unique index).

**`HumanResources.OnboardingTemplateTasks`**
- Columns:
  - `templateId` (cascade);
  - `taskGroup` (lookup: DOCUMENTS, STATUTORY_FINANCE, IT_ADMIN, ORIENTATION, POLICIES, BUDDY, TRAINING);
  - `title`, `description`;
  - `ownerFunction` (lookup: HR, IT, ADMIN, FINANCE, MANAGER, EMPLOYEE, BUDDY);
  - `dueOffsetDays`;
  - `actionKind` (lookup: NONE, UPLOAD, POLICY_ACK, BOOK_BUDDY, TRAINING);
  - `sortOrder`.
- Saved through `onboardingTemplateAddUpdate(pData)` with `tasks[]` (synced).
- **Audit trigger missing on both tables → added.**

**`HumanResources.PerformanceCycles`**
- Columns:
  - `name` (unique), `cycleType` (ANNUAL / HALF_YEARLY / QUARTERLY);
  - period: `periodStart` < `periodEnd`;
  - due dates: `goalSettingDue`, `selfReviewDue`, `managerReviewDue`, `calibrationStart` ≤ `calibrationEnd`, `signOffDue`;
  - `incrementsEffectiveMonth` (must be the 1st of a month);
  - `excludeProbation`, `ratingScaleMax` 3–10;
  - `stage` (GOAL_SETTING → SELF_REVIEW → MANAGER_REVIEW → CALIBRATION → SIGN_OFF);
  - `status` (DRAFT / ACTIVE / CLOSED).
- **One ACTIVE cycle per company** (partial unique index).
- **No `isActive` and no `deletedAt`.**
- Saved through `performanceCycleAddUpdate`.
- **Audit trigger missing → added.**

**`HumanResources.TrainingPrograms`**
- Columns:
  - `code` (optional, not unique), `name` (unique);
  - `audience`, `departmentId`;
  - `format` (WORKSHOP / ONLINE / BLENDED), `durationLabel`, `durationHours` > 0;
  - `provider`, `isMandatory`, `isCpdCertified`;
  - `seats` > 0, `targetParticipants` > 0;
  - `budget` ≥ 0, `costPerHead` ≥ 0;
  - `grantsCertification` + `certificationValidityMonths` (> 0, only when certifying);
  - `startDate` ≤ `endDate`;
  - `status` (PLANNED / IN_PROGRESS / COMPLETED / CANCELLED);
  - `description`, `deletedAt`.
- Already audited.
- `trainingProgramAddUpdate` also accepts `sessions[]`. **The API never sends it;** sessions belong to Phase 33.

**`EmployeeSelfService.CompanyPolicies`**
- Columns:
  - `code` + `version` (unique together), `title`;
  - `category` (HR / FINANCE / IT / ADMIN / COMPLIANCE; tenant values allowed);
  - `effectiveDate`, `ownerEmployeeId` (after Phase 11);
  - `body`, `readMinutes` > 0, `attachmentId`;
  - `requiresAcknowledgement`, `supersedesPolicyId`;
  - `status` (DRAFT / PUBLISHED / RETIRED), `publishedAt` (required when published), `deletedAt`.
- **One PUBLISHED version per code** (partial unique index).
- Already audited.
- `companyPolicyAddUpdate` also accepts `acknowledgements[]` (replace). **The API never sends it.**
- **Nothing in the DB makes published versions immutable → a trigger is added (§6).**

Unresolved questions: none.

## 3. Template → page mapping (`template/src/51-hr-pay-talent.html`; nav `90-nav.js:236-239`)
| Entity | Template · route | Page / component | Pattern | Notes |
|---|---|---|---|---|
| Onboarding Templates | `app/hr/onboarding`, the "Checklist Template" panel | `/hr/onboarding` → `OnboardingScreen` | Panel + editor modal | **From the template:** the checklist panel, with tasks grouped by Documents / Statutory & Finance / IT & Admin / Orientation; the KPI row and the New Joiners and Open Tasks tables (empty states until Phase 31); "Add new joiner" disabled until 31. **Template-style addition:** a template picker plus an editor modal (name, track, default, task rows: group, title, owner, due offset, action, drag order), because the template's "Edit" is only a toast. |
| Performance Cycles | `app/hr/performance`, hero band + 5-step stepper | `/hr/performance` → `PerformanceScreen` | Hero + settings modal | **From the template:** the active cycle's hero (name, period, eligibility, review dates, increments month) and the stepper driven by `stage`. KPIs, review table, Goals & KRAs and 9-box grid are empty states until Phase 33. **Template-style addition:** "Cycle settings" modal (all cycle fields), cycle list/switcher, Open / Advance stage / Close actions. |
| Training Programs | `app/hr/training`, program card grid + modal `po-trn-program` | `/hr/training` → `TrainingScreen` | Card grid + modal | **From the template:** the program cards and the `po-trn-program` fields (name, audience, format, seats, budget). **Added to that modal:** the remaining DB fields, status, History. Sessions, enrolments and expiring certifications are empty states until Phase 33; "Schedule session" disabled. |
| Company Policies | none (employee reader only, in `9C-ess.js` `policySheet`) | `/hr/policies` → `PoliciesScreen` (**new route, template style**) | Table + record modal | List (code, title, version, category, effective, status), editor, Publish and New version actions, History. `/profile/onboarding` stays a placeholder until Phase 31/34 (employee checklist and acknowledgement). |

**Nav:** Workforce › new sub-group **Talent** (Onboarding, Performance, Training, Policies), all gated by `emp:view`.

## 4. Clean Architecture
| Layer | Location | Responsibility |
|---|---|---|
| Contracts | `src/shared/hr/talent.ts` | Zod schemas: template + tasks, cycle (date-order refinements), program, policy |
| Domain | `src/server/modules/hr/{onboarding-templates,performance-cycles,training-programs}`, `src/server/modules/hr/policies` | Stage order, allowed status transitions, policy version rules |
| Application | `OnboardingTemplatesService`, `PerformanceCyclesService`, `TrainingProgramsService`, `PoliciesService` | Use cases in `UnitOfWork.run`; in-use checks; default-per-track switch; open / advance / close; publish = retire the previous published version + publish this one, in one transaction |
| Infrastructure | Prisma stores; the 4 `*AddUpdate` functions added to the allow-list; `references.ts` entries | Read models (task counts by group, cycle with due dates) |
| Server adapter | Controllers in `hr.module.ts` | Zod pipes, `@RequirePermission`, actor context |
| UI | `src/features/hr/components/{onboarding,performance,training,policies}-screen.tsx`; pages under `src/app/(app)/hr/` | As §3 |

## 5. API contracts (all `emp:*`; no `trn`/`perf` permissions exist)
| Method & path | Notes | Errors |
|---|---|---|
| `GET/POST/PATCH/DELETE /api/hr/onboarding-templates(/:id)`, `activate \| deactivate`, `POST /:id/default` | Body includes `tasks[]` | 409 name, 409 `ONBOARDING_TEMPLATE_IN_USE` (onboardings exist) |
| `GET/POST/PATCH/DELETE /api/hr/performance-cycles(/:id)`, `POST /:id/open \| advance \| close` | Edit only while DRAFT / ACTIVE; delete only while DRAFT and unreferenced (hard delete: no `deletedAt`) | 409 `PERFORMANCE_CYCLE_ACTIVE_EXISTS`, 409 `PERFORMANCE_CYCLE_CLOSED`, 409 `PERFORMANCE_CYCLE_IN_USE`, 400 date order |
| `GET/POST/PATCH/DELETE /api/hr/training-programs(/:id)`, `POST /:id/status` | No activate / deactivate: status replaces it (CANCELLED); soft delete when unreferenced | 409 name, 409 `TRAINING_PROGRAM_IN_USE` |
| `GET/POST/PATCH/DELETE /api/hr/policies(/:id)`, `POST /:id/publish`, `POST /:id/new-version`, `POST /:id/retire` | Only DRAFT is editable or deletable; new version copies the row with `version` +1 and `supersedesPolicyId` | 409 `POLICY_PUBLISHED_IMMUTABLE`, 409 `POLICY_IN_USE` |
| `GET /api/history/<schema>/<table>/:id` | History tab | — |

- **Concurrency:** every write carries `rowVersion`; stale → 409.
- **Lists:** server-paged with search and status.

## 6. Database: `prisma/sql/019-talent-setup.sql` (idempotent)
- **Audit triggers** on OnboardingTemplates, OnboardingTemplateTasks and PerformanceCycles.
- **Immutability trigger** on `CompanyPolicies`: when the old status is PUBLISHED, only `status` → RETIRED (plus stamps) may change; otherwise raise `HINT = 'POLICY_PUBLISHED_IMMUTABLE'`.
- **Error codes** for every code listed in §5.
- **Seed per tenant** (function + tenant trigger, backfilled): a default "Standard Staff Onboarding" template with the template's four task groups and tasks.

## 7. Audit
- **Tables covered:** all 5 tables audited.
- **Attribution:** writes run in `UnitOfWork.run(actorContext)`; the seed is recorded as `system: seedTalentDefaultsFor`.
- **History:** a History tab in each modal.
- **Registry:** `history-tables.ts` entries use `emp:view`.

## 8. Ordered tasks
1. SQL 019; Prisma models; registries.
2. Contracts.
3. Server services and controllers.
4. Screens from the templates plus the template-style editors; nav.
5. Wire up; delete / status rules.
6. Verify.

## 9. Verification
- **Functional:**
  - CRUD + reload for each entity;
  - task sync (add, reorder, remove);
  - one default per track;
  - cycle date validation; a second ACTIVE cycle is rejected; stage advances in order; a CLOSED cycle is read-only;
  - program certification rule;
  - policy: published version immutable (API **and** direct SQL update); new version + publish retires the previous one;
  - permissions: HR manager full, auditor read-only, salesman 403;
  - history attributed to the real user.
- **Visual:** the onboarding, performance and training pages against the template (light, dark, 390 px). The policies page, editor modals and cycle settings are template-style deviations.

## 10. Acceptance, risks, blockers
- **Risks:** most of each page stays empty until Phases 31 and 33 (by design). Policy owner waits for Phase 11.
- **Blockers:** none.

---
**Approved:** Phase 13 revision 1 (2026-10-07).
