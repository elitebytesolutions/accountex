# Phase 34 rev 1: Self-service requests

> **Status: accepted 2026-10-08 (started on "start phase 34" with recommended defaults, no plan gate).** Session accountex-75 owns Phase 34 (confirmed with parallel-super-admin-phases, which owns 33). SQL `prisma/sql/401-self-service-requests.sql` (new 4xx range).

**Objective:** employee requests and engagement from My Profile, handled by HR / line managers.

**Entities (5, TRANSACTIONAL):** Letter Requests · Profile Change Requests · Helpdesk Tickets · Kudos, Survey Responses, Reads & Presence · Policy Acknowledgements

**Decided 2026-10-08 (defaults, listed in the acceptance report):**
- **HR side of requests needs `emp:view` / `emp:edit`.** No new HR permission resources were added. There are no HR templates for these queues; HR works them from **My Profile › My Team** (template `app/profile/team`, the approvals deck), shown when the user holds `emp:edit`.
- **Letter request "issue" goes through the Phase 33 letters service.** `EmployeeLettersService.issueLetterInTransaction` generates the PDF, number and verification code, and the request links `hrLetterId`. Rows are never inserted directly into `EmployeeLetters`.
- **Approving a profile change writes the value to the HR record** (Employees, EmployeeBankAccounts, EmployeeStatutoryDetails) in the same transaction, which sets `appliedAt`. A field with no target row is approved with `applied: false`. Self-approval is refused.
- **Helpdesk agents** are `emp:edit` holders, the category owner, or the assigned agent. The SLA comes from the category, with HIGH priority multiplied by `highPrioritySlaFactor`. Messages are append-only inserts (never through the save function's child array). Tickets close through CSAT and are never deleted.
- **Pulse answers are anonymous in the app:** `respondentHash` is sha256(tenant:survey:employee:server secret). The DB audit trigger still records the acting user, so `PulseSurveyResponses` is deliberately not served by the History API.
- **Policy acknowledgement** applies to the current PUBLISHED version, with a typed-name signature, IP and user agent. Repeating it is idempotent.
- **Raw SQL stores, no new Prisma models** (the tables exist; this avoids `schema.prisma` churn while peers edit it in parallel).

## 1. Selection rationale
All dependencies are done:
- employees (11)
- helpdesk setup, announcements, polls/surveys (15)
- company policies (13)

The exception is Phase 33 letters, which are in progress with a peer. The letter request "issue" step calls that peer's service and adapts to it.

## 2. Verified schema (live DB)
- `EmployeeSelfService.{LetterRequests, ProfileChangeRequests, HelpdeskTickets, HelpdeskTicketMessages, Kudos, KudosReactions, PollVotes, PulseSurveyResponses, CompanyAnnouncementReads, PresenceStatuses, PolicyAcknowledgements}` exist with check and unique constraints.
- Save functions exist: `letterRequestAddUpdate`, `profileChangeRequestAddUpdate` / `Approve`, `helpdeskTicketAddUpdate`, `kudosAddUpdate`.
- Status values are Lookups: LetterRequestStatus/Stage, ProfileChangeRequestStatus, FieldKey, HelpdeskTicketStatus/Priority, AuthorRole, Badge, Reaction, Rsvp, PresenceStatus.

## 3. Template → page mapping
| Template | Page |
|---|---|
| app/profile/requests | /profile/requests |
| app/profile/details | /profile/details |
| app/profile/helpdesk | /profile/helpdesk (adds tickets) |
| app/profile/kudos | /profile/kudos |
| app/profile/directory | /profile/directory |
| app/profile/onboarding | /profile/onboarding (adds policies) |
| app/profile/team | /profile/team |

## 4. Clean Architecture
`src/server/modules/ess-requests/{letter-requests, profile-changes, helpdesk-tickets, engagement-actions, policy-acks}`, each with application (port + service), infrastructure (raw-SQL store) and presentation. Contracts are in `src/shared/self-service/*.ts`, and the UI is in `src/features/ess-requests/*`.

## 5. API (permissions)
- `/api/me/*`: myreq, myprof, myhelp, mykudos, dir, myonb, myteam
- `/api/hr/letter-requests` and `/api/hr/profile-change-requests`: emp:view / emp:edit
- `/api/helpdesk/tickets`: myhelp, with agent checks in the service
- `/api/company/announcements/:id/read`: dir
- `/api/hr/policies/:id/acknowledgements`: emp:view

## 6. Database: `prisma/sql/401-self-service-requests.sql` (idempotent)
- Audit triggers on the 7 tables that lacked them.
- RQ/HD numbering series for every tenant, plus a deferred tenant trigger for new tenants.
- 14 error codes.

## 7. Audit
- Every write runs in `UnitOfWork` with `actorContext`.
- The 10 tables are registered in `history-tables.ts` with emp:view. PulseSurveyResponses is excluded because answers are anonymous.

## 8. Ordered tasks
1. SQL
2. Registries
3. Five entity slices (server, contracts, UI, built in parallel)
4. My Team queue page
5. Smoke APIs
6. Quick UI check
7. Acceptance request

## 9. Verification
- One smoke suite per entity, in the scratchpad `api-p34-*.mjs`, run against Test Co.
- Typecheck, lint and `delivery:roadmap`.
- Screenshots of the profile pages (light + mobile).

## 10. Risks / blockers
- Phase 33's letters service is not final. Issuing depends on an active HR letter template in the company.
- The shared dev watcher may be blocked by other sessions' compile errors.
