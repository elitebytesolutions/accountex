# Phase 43 rev 1: Platform operations

> **Status: approved 2026-10-08 (revision 1).** Planned with Phases 41, 42 and 32.

**Objective:** service incidents with a public status page, approval-gated feature-flag changes (including scheduled rollouts), company privacy requests (export and right to be forgotten), and the entitlement change log.

**Entities (4):** Service Incidents · Flag Change Requests · Privacy Requests · Entitlement Change Log

**Decisions (2026-10-08):**
- **Solo approval, recorded.** While only one platform staff member exists, the Super Admin may approve their own flag change request or privacy deletion after typing a confirmation and a note.
  - It's stored as "solo approval" in the change log and history.
  - The DB four-eyes rules are relaxed **only** when exactly one active platform staff member exists, so strict four-eyes applies automatically if more staff are ever added.
- **Privacy DELETE = anonymise, keep financials:**
  - **Anonymised irreversibly:** personal data (users, employees, contacts, addresses, phone / email / CNIC).
  - **Closed:** logins are disabled and the company is closed (CHURNED).
  - **Kept for the retention period, with names replaced:** invoices, vouchers and tax records.
  - A completion certificate is issued.
  - **EXPORT** produces a per-company export file.

## 1. Selection rationale
| Entity | Depends on | Why now |
|---|---|---|
| Service Incidents | Maintenance windows / status page (39) | Completes the status page; announcements (42) can reference incidents |
| Flag Change Requests | Feature flags (39) | Production flag changes get a request → approve → apply trail; scheduled rollout steps |
| Privacy Requests | Tenants (40), backups runner (38) | Legal export and erasure for companies |
| Entitlement Change Log | Plans, modules, add-ons (36) | An audit of every entitlement change and its impact |

## 2. Verified schema (live DB; all empty)

**`Platform.ServiceIncidents`**
- Columns:
  - `docNo` `^INC-\d{4}-\d{3,}$`, `title`;
  - `impact` (MINOR / MAJOR / CRITICAL), `components[]` (the 8 maintenance components);
  - `stage` (INVESTIGATING / IDENTIFIED / MONITORING / RESOLVED, with `resolvedAt`), `startedAt`;
  - `isPublic`, `declaredByStaffId`, post-mortem fields.
- Already audited.

**`Platform.ServiceIncidentUpdates`**
- Columns: stage, message, `postedBy`, `notifySubscribers`, `updateBanner`.
- **Audit trigger missing → added.**
- View `getStatusComponentHistory` (90-day uptime, public incidents only; maintenance from MaintenanceWindows).

**`Platform.FlagChangeRequests`**
- Columns:
  - `docNo` `^CR-\d+$`, flag, environment;
  - requester, reason, summary;
  - before / after / patch jsonb, `applyNotBefore`;
  - `source` (MANUAL / SCHEDULE_STEP), `status` (PENDING / APPROVED / REJECTED / CANCELLED);
  - decision fields, `appliedAt`.
- One PENDING per flag and environment.
- **Four-eyes check:** decider ≠ requester.

**`Platform.FlagChangeRequestApprovers`**
- **Trigger:** the requester can't approve.

**`Platform.FlagChangeRequestComments`**
- **Audit trigger missing → added.**

**`Platform.FlagScheduledChanges`**
- Columns: `stepDate`, `rolloutPct`, `status` PLANNED → REQUESTED → APPLIED / CANCELLED.

**`FlagAuditLogs`** (append-only) already has CR_APPLIED / CR_REJECTED / SCHEDULE event kinds.

**`Platform.PrivacyRequests`**
- Columns:
  - `docNo` `^PRV-\d{4}-\d{3,}$`, tenant, `requestType` (EXPORT / DELETE), requester details;
  - received / due dates (30-day SLA);
  - `step` (RECEIVED / VERIFIED / APPROVED / PROCESSING / DONE / REJECTED);
  - verifier, approver 1, approver 2 (DELETE needs two, and they must differ);
  - certificate, `exportBackupRunId` → BackupRuns (TENANT_EXPORT type supported).

**`Platform.EntitlementChangeLogs`**
- Append-only. Columns:
  - change set, `changeKind` (FEATURE / LIMIT / ADDON_PRICE) with targets, from / to values;
  - `tenantsAffected`, `impactTone`;
  - grandfather / email owners / post changelog;
  - saved by.
- **No trigger or function writes it; the app must. Audit trigger missing → added.**

**Defects and gaps fixed in this phase's SQL:**
- **Generated functions that delete their history:** `serviceIncidentAddUpdate` deletes updates missing from its array (a timeline must be append-only) → updates are added only through a new `serviceIncidentPostUpdate`.
- **Change-request decisions are incomplete:** `flagChangeRequestApprove` doesn't fill decision fields, and there is no reject → fixed, plus `flagChangeRequestReject`, and an apply that writes `FlagAuditLogs` with the change-request id.
- **Privacy requests can't be created by the Super Admin:** `privacyRequestAddUpdate` takes the tenant from the session (null for the Super Admin) → it takes it from the payload.
- **Solo approval:**
  - the four-eyes check, the approver trigger and the privacy two-people check are replaced by a function `Platform.isSoloStaff()` (exactly one ACTIVE platform staff member);
  - solo decisions record `decisionNote` prefixed "SOLO APPROVAL:".
- **Missing processing functions:**
  - `privacyRequestFulfilExport` (tenant export via the backup runner, TENANT_EXPORT JSON / ZIP);
  - `privacyRequestFulfilDelete` (the anonymisation routine over a fixed list of personal-data columns, the company set to CHURNED, sessions revoked);
  - certificate reference.
- **Numbering:** CR numbering starts at 1001 (template style).

## 3. Template → page mapping
| Entity | Template | Page | Notes |
|---|---|---|---|
| Incidents | `admin/status` incident part (`9B-admin-plus.js:1950–2075`): status banner, 90-day component bars, incident list, detail with 4-stage stepper and update timeline, composer, "Declare incident" modal, post-mortem | `/admin/status` (enable the Phase 39 placeholders) | From the template. **Company side:** the in-app banner for open public incidents with "Update in-app banner" (shares Phase 42's banner component). Email / SMS subscribers wait for Phase 29. |
| Change requests | `admin/change-requests` (`9J-flags.js:1652–1754`): KPIs, tabs, request cards, drawer (diff, approvals, comments, required approver note, Approve & apply / Reject); request modal (`412–443`) | `/admin/change-requests` + the flag-detail "Request change" in Production | From the template. **Production toggles and targeting saves now create a change request** (kill switches keep the emergency path: typed key, logged as emergency). **Solo approval** needs the typed flag key + a note. |
| Scheduled rollout | flag detail "Scheduled changes" panel (`9J-flags.js:1132–1296`) | flag detail (enable) | Each PLANNED step becomes a change request on its date (`BillingJob`-style daily job, `OPS_JOB=off` to disable) |
| Privacy requests | `admin/security` Privacy requests table (`9B-admin-plus.js:1883–1912`): workflow steps, Verify / Approve / Reject, deletion confirm (type the company code), SLA bar, Certificate | `/admin/security` (enable) | From the template. **A deletion needs** the typed company code + solo approval note. **The certificate is a print view.** **Export is downloadable** for 7 days (`exportLinkExpiresAt`). |
| Entitlement log | `admin/entitlements` "Review changes" drawer (`9J-flags.js:1593–1626`) | entitlements page (Phase 36) | **Saving now writes `EntitlementChangeLogs` rows** with impact (tenants affected, tone) and the three switches. **Template-style addition:** a "Change log" tab listing past change sets. |

**Nav:** Feature Management › Change Requests (template position).

## 4. Clean Architecture
- **Contracts:** `src/shared/platform/{incident,change-request,privacy-request,entitlement-log}.ts`.
- **Server:** `src/server/modules/platform-admin/operations/{incidents,change-requests,privacy,entitlement-log}`.
- **Domain:** solo-approval policy, anonymisation column list, rollout-step scheduling.
- **Shared code edits** (minimal, owned by this phase now):
  - the Phase 39 flags service (Production changes → change request);
  - the Phase 36 entitlements save (writes the log);
  - the Phase 38 backups runner (TENANT_EXPORT mode).
- **UI:** `src/features/platform-ops/*`.

## 5. API (`@AdminRoute`)
| Method & path | Notes | Errors |
|---|---|---|
| `GET/POST /api/admin/incidents(/:id)`, `POST /:id/updates`, `POST /:id/postmortem`; `GET /api/status/components` (public read for the banner) | Stage only moves forward; RESOLVED sets `resolvedAt` | 409 `INCIDENT_RESOLVED` |
| `GET /api/admin/change-requests` (+ KPIs), `POST` (from a flag edit), `POST /:id/comments`, `POST /:id/approve \| reject \| cancel` | Approve = apply (or wait for `applyNotBefore`); solo needs `{confirmKey, note}` | 409 one pending per flag / env, 403 `FOUR_EYES_REQUIRED` (when more staff exist), 400 note required |
| `PUT /api/admin/flags/:id/schedule/:env` | Rollout steps | 400 dates / percent |
| `GET/POST /api/admin/privacy-requests(/:id)`, `POST /:id/verify \| approve \| reject \| fulfil`, `GET /:id/export`, `GET /:id/certificate` | DELETE: typed company code + solo note; irreversible | 409 step order, 400 confirmation |
| `GET /api/admin/entitlements/changes` | Change log | — |

## 6. Database: `prisma/sql/108-admin-platform-ops.sql` (idempotent)
- Audit triggers on ServiceIncidentUpdates, FlagChangeRequestComments and EntitlementChangeLogs.
- `isSoloStaff()` and the relaxed checks / trigger.
- The function fixes and new functions.
- The anonymisation routine.
- Counters; error codes; lookup tones.

## 7. Audit
- **Tables:** all audited; FlagAuditLogs and EntitlementChangeLogs stay append-only.
- **Solo decisions:** marked as such.
- **Anonymisation:** itself recorded in history as `system: privacy-erasure` under the Super Admin's request id, without the erased values. The audit hide list covers those columns.

## 8. Ordered tasks
1. SQL 108 + models + registries.
2. Contracts.
3. Services (incidents, change requests + the flags-service hook + the scheduler, privacy + export / anonymise, entitlement log hook).
4. Pages + banner.
5. Verify.

## 9. Verification
- **Functional:**
  - **Incidents:** declare → updates → resolve; uptime bars reflect it; the banner shows for open public incidents.
  - **Flag changes:**
    - a Production toggle creates a request → solo approve (needs key + note) → applied, with an audit row linked to the request;
    - reject;
    - a scheduled step creates a request on its date (job run now).
  - **Privacy:**
    - export for a marker company → downloadable file;
    - delete for a marker company → personal data anonymised (spot-check users / employees), financial rows kept with names replaced, the company CHURNED, logins refused, certificate.
  - **Entitlement log:** an entitlements save writes a log row with impact.
  - Tenant tokens are refused on admin routes; Demo is never used for privacy tests.
- **Visual:** the status, change-request, security-privacy and entitlements pages against the templates.

## 10. Risks / blockers
- **Anonymisation is irreversible.** It's tested only on marker companies, and the column list is reviewed in the plan's code.
- **Solo approval** weakens four-eyes by design while there's one admin.
- **Blockers:** none.
