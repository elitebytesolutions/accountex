# Phase 15 rev 1: Self-service & reporting setup

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

**Objective:** what HR configures for self-service (helpdesk categories and FAQs, company announcements, polls and pulse surveys), plus Report Studio definitions with a live preview. No tickets, votes, survey responses or read receipts; those come in Phase 34. No scheduled report sending; that comes in Phase 35.

**Entities (4, MASTER):** Helpdesk Categories & FAQs · Company Announcements · Polls & Pulse Surveys · Saved Reports (Sign-in Recovery → Phase 29)

## 1. Selection rationale
| Entity | Depends on (status) | Why now |
|---|---|---|
| Helpdesk Categories & FAQs | Users (2) | Tickets (34) need a category and SLA |
| Company Announcements | Branches (1), departments (10), policies (13, built in parallel; the link is optional) | The employee feed and policy updates |
| Polls & Pulse Surveys | Departments (10) | Engagement (34) records votes and responses against them |
| Saved Reports | Users and roles (2) | Report Studio; report runs (35) |

## 2. Verified schema (live DB; all tables empty, no Prisma models)

**`EmployeeSelfService.HelpdeskCategories`**
- Columns:
  - `code` `^[A-Z][A-Z0-9_]{1,19}$` (unique), `name`, `description`;
  - `ownerEmployeeId` (after Phase 11);
  - `slaHours` > 0, `highPrioritySlaFactor` (0, 1];
  - `routingKeywords[]`, `icon`, `sortOrder`;
  - `status` (ACTIVE / INACTIVE), `deletedAt`.

**`EmployeeSelfService.HelpdeskFaqs`**
- Columns: `categoryId`, `question`, `answer`, `keywords[]`, `sortOrder`, `isPublished`, `deletedAt`.
- **Audit triggers missing on both tables → added.**

**`EmployeeSelfService.CompanyAnnouncements`**
- Columns:
  - `title`, `summary`, `body`;
  - `kind` (GENERAL / EVENT / POLICY_UPDATE / BENEFIT / CELEBRATION);
  - `authorEmployeeId` / `authorLabel`;
  - `eventAt`, `venue`, `requiresRsvp`;
  - `branchId`, `departmentId`, `policyDocumentId`;
  - `isPinned`;
  - `status` (DRAFT / PUBLISHED / ARCHIVED); PUBLISHED requires `publishedAt`; `expiresAt` > `publishedAt`.
- **No `deletedAt`.**
- **Audit trigger missing → added.**
- `companyAnnouncementAddUpdate` also accepts `reads[]`. **The API never sends it.**

**`EmployeeSelfService.Polls`**
- Columns: `question`, `createdByEmployeeId`, `departmentId`, `opensAt` < `closesAt`, `showResultsAfterVote`, `status` (DRAFT / OPEN / CLOSED; **the DB default is OPEN, so the API always sends DRAFT on create**).

**`EmployeeSelfService.PollOptions`**
- Columns: `pollId`, `seq` (unique), `label`.

**`EmployeeSelfService.PulseSurveys`**
- Columns: `title`, `periodFrom` ≤ `periodTo`, `departmentId`, `isAnonymous`, `status` (default DRAFT).

**`EmployeeSelfService.PulseSurveyQuestions`**
- Columns: `surveyId`, `seq`, `questionText`, `lowLabel`, `highLabel`, `metricKey` (WORKLOAD / MANAGER_SUPPORT / ENPS / OTHER).
- **Audit triggers missing on all four tables → added.**
- Saved through `pollAddUpdate` (`options[]`) and `pulseSurveyAddUpdate` (`questions[]`).

**`Reports.SavedReports`**
- Columns:
  - `name` (unique per owner), `description`;
  - `folder`, `kind` (CUSTOM needs `sourceEntity`; PRESET needs studio + tab);
  - `sourceEntity` (SALES_INVOICES, VENDOR_BILLS, GL_TRANSACTIONS, CUSTOMERS, STOCK_MOVEMENTS, PAYROLL_LINES);
  - `dateRange` / `dateFrom` / `dateTo`;
  - `filters` jsonb[], `groupBy[]`, `sortField` / `sortDir`, `rowLimit`, `showTotals`;
  - `viewMode`, `display` (CHART requires `chartType`), `defaultFormat`;
  - `visibility` (PRIVATE / SHARED / EVERYONE), `ownerUserId`, `isFavourite`, `isSystem`;
  - `status`, `lastRunAt`, `deletedAt`.
- Already audited.

**`Reports.SavedReportColumns`**
- Columns: `seq`, `fieldKey` (unique per report), `label`, `isVisible`, `aggregate`, `format`, `widthPx`.
- **Audit trigger missing → added.**

**`Reports.SavedReportShares`**
- Columns: `shareType` ROLE / USER, `roleId` XOR `userId`, `canEdit`.
- Already audited.

**`Reports.ReportSchedules`**
- Columns:
  - `frequency` (+ day-of-week / day-of-month rules), `runTime`, `timezone`, `format`;
  - recipients: emails and/or users (at least one);
  - `onlyIfRows`, `status` (ACTIVE requires `nextRunAt`).
- Already audited.
- Saved through `savedReportAddUpdate` (`columns[]`, `shares[]`) and `reportScheduleAddUpdate`.

**Unresolved question (checked in implementation step 1, before the preview is built):** which table or view each `sourceEntity` reads, and the view permission of each source module. A preview must require the source's own view permission as well as `rpt:view`, so payroll lines never show to non-payroll users. Sources whose module isn't built yet (vendor bills 19, GL 16, payroll 32) preview as empty.

## 3. Template → page mapping
| Entity | Template | Page / component | Notes |
|---|---|---|---|
| Helpdesk | `app/profile/helpdesk` (`9C-ess.js` ~2309–2550, employee view) | Employee: `/profile/helpdesk` → category cards + "Quick answers" FAQ search, **from the template**; "New ticket" / "Ask" disabled and "My tickets" empty until Phase 34. Admin: `/hr/helpdesk-setup` (**template style**: categories table + modal, FAQs table + modal) | |
| Announcements | `app/profile/directory` side card "Announcements" (employee view) | Employee: the Announcements card + reader drawer **from the template** (published, not expired, filtered by branch/department). Admin: `/hr/announcements` (**template style**: list + editor + Publish / Archive / Pin) | The directory people grid and presence wait for Phases 11 and 34 |
| Polls & Pulse Surveys | `app/profile/kudos` "Weekly pulse" + "Poll" cards (employee view) | Employee: the open poll / pulse cards **from the template**, voting disabled until Phase 34. Admin: `/hr/engagement` (**template style**: polls and surveys tables, editors with option / question rows, Open / Close) | Anonymous surveys: the results UI never shows respondents (enforced again in Phase 34) |
| Saved Reports | `app/reports/studio` (`42-acc-reports.html:1177–1290`) + modal `#rpt-studio-save` | `/reports/studio` → `ReportStudioScreen`, **from the template**: report selector, builder steps 1–4 (source, columns, filters, group & sort), Table / Chart preview, Save & schedule modal (name, folder, visibility, favourite, schedule, format, recipients) | Export uses the browser (CSV / print) for now. The schedule is saved but not sent until Phase 35 (badge "Delivery in Phase 35"). |

**Nav:** Workforce › **Employee engagement** (Helpdesk setup, Announcements, Polls & surveys; `emp:view`); **Analytics** › Report Studio (`rpt:view`). Profile tabs are already defined in `src/features/profile/tabs.ts`.

## 4. Clean Architecture
| Layer | Location | Responsibility |
|---|---|---|
| Contracts | `src/shared/self-service/{helpdesk,announcement,engagement}.ts`, `src/shared/reports/saved-report.ts` | Zod; `fieldKey` catalogue per source |
| Domain | `self-service/*/domain`, `reports/saved-reports/domain` | Publish / expiry rules, open / close transitions, report-source field allow-list |
| Application | `HelpdeskSetupService`, `AnnouncementsService`, `EngagementSetupService`, `SavedReportsService`, `ReportPreviewService` | `UnitOfWork.run`; preview = permission check → allow-listed fields / filters / group-by → parameterised read query inside RLS context, capped at `rowLimit` (≤ 1,000 in preview) |
| Infrastructure | Prisma stores; allow-list: `helpdeskCategoryAddUpdate`, `helpdeskFaqAddUpdate`, `companyAnnouncementAddUpdate`, `pollAddUpdate`, `pulseSurveyAddUpdate`, `savedReportAddUpdate`, `reportScheduleAddUpdate`; a source → SQL map | No string-built SQL from user input |
| Server adapter | New `SelfServiceModule` and `ReportsModule` | Guards and actor context |
| UI | `src/features/{self-service,reports}`; pages `/hr/{helpdesk-setup,announcements,engagement}`, `/profile/{helpdesk,directory,kudos}` (replacing placeholders), `/reports/studio` | As §3 |

## 5. API contracts
| Method & path | Permission | Errors |
|---|---|---|
| `GET/POST/PATCH/DELETE /api/helpdesk/categories(/:id)`, activate / deactivate; same for `/api/helpdesk/faqs`; `GET /api/me/helpdesk` (employee read) | admin `emp:*`; read `myhelp:view` | 409 code, 409 `HELPDESK_CATEGORY_IN_USE` |
| `GET/POST/PATCH /api/company/announcements(/:id)`, `POST /:id/publish \| archive \| pin`; `GET /api/me/announcements` | admin `emp:*`; feed `dir:view` | 409 `ANNOUNCEMENT_NOT_DRAFT` (published content is only archived, never deleted: no `deletedAt`) |
| `GET/POST/PATCH/DELETE /api/company/polls(/:id)`, `/api/company/pulse-surveys(/:id)`, `POST /:id/open \| close`; `GET /api/me/engagement` | admin `emp:*`; read `mykudos:view` | 409 `POLL_NOT_DRAFT` (edit only in DRAFT), 409 `POLL_IN_USE` (votes exist) |
| `GET/POST/PATCH/DELETE /api/reports/saved(/:id)`, `PUT /:id/columns`, `PUT /:id/shares`, CRUD `/:id/schedules`, `POST /api/reports/preview` | `rpt:*` + the source's view permission for preview; owner or share `canEdit` to edit | 403 `REPORT_SOURCE_FORBIDDEN`, 400 `REPORT_FIELD_NOT_ALLOWED`, 409 name |

- **Concurrency:** `rowVersion` on every write; stale → 409.
- **Visibility:** PRIVATE (owner), SHARED (roles / users), EVERYONE (tenant).
- **Delete vs deactivate:** delete only when unreferenced, otherwise deactivate or archive.

## 6. Database: `prisma/sql/021-self-service-setup.sql` (idempotent)
- **Audit triggers** on HelpdeskCategories, HelpdeskFaqs, CompanyAnnouncements, Polls, PollOptions, PulseSurveys, PulseSurveyQuestions and SavedReportColumns.
- **Error codes** for every code in §5.
- **Seed per tenant:**
  - the four helpdesk categories shown in the template, each with its SLA;
  - the template's pulse questions as a DRAFT survey.

## 7. Audit
- **Tables covered:** all 12 tables audited.
- **Attribution:** actor context; seeds are recorded as `system: seedSelfServiceDefaultsFor`.
- **History:** a History tab in every admin modal and the Report Studio save modal.
- **Registry:** `history-tables.ts` (first `EmployeeSelfService` and `Reports` entries).

## 8. Ordered tasks
1. SQL 021; Prisma models; registries.
2. Verify the report source → table and permission map.
3. Contracts.
4. Services, preview engine, controllers.
5. Employee views from the templates, template-style admin screens, Report Studio; nav.
6. Wire up.
7. Verify.

## 9. Verification
- **Functional:**
  - CRUD + reload for categories and FAQs, announcements (publish / archive / expiry), polls and surveys (options / questions sync, open / close, DRAFT-only edit), and saved reports (columns, shares, schedule rules);
  - **Employee views show only published or open items** for their branch / department;
  - **Report preview:**
    - returns real customer rows;
    - a field outside the allow-list is rejected;
    - a user without the source permission gets 403;
    - private reports are invisible to others;
  - permissions allowed and denied;
  - history attributed to the real user.
- **Visual:** `/profile/helpdesk`, `/profile/directory` (announcements card), `/profile/kudos` and `/reports/studio` against their templates (light, dark, 390 px). The admin pages are template-style deviations.

## 10. Acceptance, risks, blockers
- **Risks:**
  - **Previews are empty for unbuilt modules** (vendor bills, GL, payroll).
  - **Category owner and author employee fields** wait for Phase 11.
  - **Scheduled reports are stored but not sent** until Phase 35.
- **Blockers:** none.

---
**Approved:** Phase 15 revision 1 (2026-10-07).
