# Phase 42 rev 1: Growth & support

> **Status: approved 2026-10-08 (revision 1).** Planned with Phases 41, 43 and 32.

**Objective:** a sales pipeline from lead to paying company, platform support tickets (raised by companies or by the Super Admin), platform announcements shown inside company workspaces, and broadcasts with a communication log.

**Entities (4):** Leads · Support Tickets · Platform Announcements & Broadcasts · Communication Logs

**Decision (2026-10-08): companies get template-style screens:**
- **"Help & support"** in the workspace: raise a ticket, follow replies, rate CSAT;
- **a dismissible announcement banner / notification** for published announcements.

**Email / SMS / WhatsApp delivery doesn't exist yet (Phase 29):**
- broadcasts and resends create **QUEUED** log rows;
- **IN_APP** messages are delivered for real, as workspace notifications.

## 1. Selection rationale
| Entity | Depends on | Why now |
|---|---|---|
| Leads | Plans (36), resellers (38), onboarding (40) | Lead → trial → paid converts into a company |
| Support Tickets | Tenants (40), the staff mirror (36) | Support for companies; links to impersonation (40) |
| Announcements & Broadcasts | Comm templates (37), segments (38), maintenance windows (39) | Telling companies about releases, maintenance, compliance |
| Communication Logs | Broadcasts, templates | One record of every message sent or queued |

## 2. Verified schema (live DB; all empty)

**`Platform.PlatformLeads`**
- Columns:
  - `companyName`, `contactPerson`, `phone`, `email`, `city`;
  - `source` (WEBSITE / REFERRAL / PARTNER needs `partnerId` / FACEBOOK / LINKEDIN / EXPO);
  - `ownerStaffId` NOT NULL, `planInterestId`, `expectedMrr`;
  - `stage` (LEAD / DEMO / TRIAL / PAID needs `wonAt` / CHURNED), `boardPosition`;
  - demo and trial dates, `trialEngagementScore` 0–100;
  - `lostReason`, `tenantId` (conversion link), `deletedAt`.
- View `getPlatformLeadPipeline`.

**`Platform.PlatformLeadActivities`**
- Columns: `activityType` (CREATED / STAGE_CHANGE / NOTE / CALL / EMAIL / DEMO), from / to stage.
- **Audit trigger missing on both lead tables → added.**

**`Platform.SupportTickets`**
- Columns:
  - `docNo` `^TCK-\d{4,}$`, `tenantId`, `subject`;
  - `category` (tenant values allowed), `priority` (URGENT / HIGH / NORMAL / LOW), `status` (NEW / IN_PROGRESS / WAITING_ON_CUSTOMER / RESOLVED / CLOSED), `channel`;
  - requester user / name / role / email, `assigneeStaffId`;
  - SLA (`slaDueAt` set by trigger from the priority), first response, resolved / closed, CSAT 1–5.
- Already audited.
- View `getSupportTicketKpis`.

**`Platform.SupportTicketMessages`**
- Columns: `authorKind` CUSTOMER / STAFF / SYSTEM, internal notes (staff only), `attachments` jsonb.
- **Audit trigger missing → added.**

**`Platform.Announcements`**
- Columns:
  - `announcementType` (RELEASE_NOTE / MAINTENANCE / COMPLIANCE / BILLING), `severity`;
  - `title`, `message`, `releaseLabel`;
  - `audience` (ALL / PLANS / MODULES / TENANTS);
  - `publishAt`, `status` (DRAFT / SCHEDULED / PUBLISHED / ARCHIVED);
  - `showBanner` / `emailAdmins`, views / clicks, `maintenanceWindowId`.

**`Platform.AnnouncementTargets`**
- Exactly one of plan / module / tenant.
- **Audit trigger missing → added.**

**`Platform.TenantBroadcasts`**
- Columns:
  - template or message override;
  - audience (ALL_ACTIVE / TRIALS / PAST_DUE / PLAN / REGION / ENTERPRISE_OWNERS / SEGMENT / SELECTED_TENANTS), `segmentId`, `tenantIds[]`;
  - `channels` (EMAIL / SMS / WHATSAPP / IN_APP), `scheduledAt`;
  - `status` (SCHEDULED / QUEUED / SENT / CANCELLED), recipient count, SMS cost estimate.
- Already audited.

**`Platform.CommunicationLogs`**
- Columns: template / broadcast, `tenantId`, `recipient`, `channel`, `status` (QUEUED / SENT / DELIVERED / OPENED / READ / BOUNCED / FAILED needs an error), `retryOfId`, `isTest`, related document.
- **Audit trigger missing → added.**

**Defects fixed in this phase's SQL:**
- `platformLeadAddUpdate`, `supportTicketAddUpdate` and `announcementAddUpdate` scope rows by the session tenant, which is null for the Super Admin. → They use the payload's `tenantId` (or none for leads) in the admin context.
- `supportTicketAddUpdate` never writes `status`.
- **TCK numbering:** via `getNextPlatformDocumentNo('TCK')`.
- **New functions:** `supportTicketReply` (message + first response + status), `leadMoveStage` (activity row), `leadConvert` (links the tenant, PAID, `wonAt`).

## 3. Template → page mapping
| Entity | Template | Page | Notes |
|---|---|---|---|
| Leads | `admin/leads` (`9B-admin-plus.js:1469–1618`): stats row, drag-and-drop kanban (LEAD / DEMO / TRIAL / PAID / CHURNED), card menu, "New lead" modal, "Onboard" toast on PAID | `/admin/leads` | From the template. **Convert** opens the Phase 40 onboarding wizard pre-filled from the lead; after onboarding, the lead links to the new company. |
| Support (admin) | `admin/support` (`30-entry-admin.html:750–824`): Board / List, KPIs, filters, kanban by status, ticket drawer `#adm-ticket` (SLA countdown, thread, internal note, reply, Resolve) | `/admin/support` | From the template. "Impersonate from ticket" links Phase 40's impersonation with `supportTicketId`. Attachments stay disabled (no upload service yet). |
| Support (company) | none | `/support` in the workspace: my company's tickets, new ticket, thread, CSAT (**template style**) | Permission: any signed-in user can raise a ticket; company admins see all of the company's tickets |
| Announcements | `admin/announcements` (`30-entry-admin.html:827–912`): chips, cards with views / clicks, drafts list, compose modal `#adm-compose` | `/admin/announcements` | From the template. **Company side (template style):** a dismissible banner for PUBLISHED announcements with `showBanner` that match the company (all / plan / module / tenant), plus a notifications popover entry. Views and clicks are counted. |
| Broadcasts & log | `admin/comms` Broadcast modal + delivery log (`9B-admin-plus.js:1663–1780`) | `/admin/comms` (enable the Phase 37 placeholders) | Recipients are resolved (segment via `evaluateTenantSegment`). IN_APP rows are delivered; EMAIL / SMS / WHATSAPP are QUEUED until Phase 29. Retry creates a retry row. |

**Nav:** Growth › Leads CRM; Support › Support Tickets, Announcements (template positions). Workspace: "Help & support" in the user menu.

## 4. Clean Architecture
- **Contracts:** `src/shared/platform/{lead,ticket,announcement,broadcast,comm-log}.ts`.
- **Admin server:** `src/server/modules/platform-admin/growth/{leads,support,announcements,comms}`.
- **Workspace server:** `src/server/modules/support-desk` (tenant-side tickets and announcements feed; tenant actor context).
- **UI:** `src/features/platform-growth/*`, `src/features/support/*` (workspace), and the shell banner beside `SupportAccessBanner`.

## 5. API
| Method & path | Notes | Errors |
|---|---|---|
| `GET/POST/PATCH/DELETE /api/admin/leads(/:id)`, `POST /:id/move`, `POST /:id/activities`, `POST /:id/convert` | Delete = soft | 400 partner source, 409 already converted |
| `GET/POST/PATCH /api/admin/tickets(/:id)`, `POST /:id/messages`, `POST /:id/assign \| resolve \| reopen \| close` | Admin may log tickets for a company | 409 `TICKET_CLOSED` |
| `GET/POST /api/support/tickets`, `GET /:id`, `POST /:id/messages`, `POST /:id/csat` | Company side; never sees internal notes | 403 another company's ticket |
| `GET/POST/PATCH /api/admin/announcements(/:id)`, `POST /:id/publish \| schedule \| archive`, `PUT /:id/targets` | Published content is archived, not deleted | 409 `ANNOUNCEMENT_NOT_DRAFT` |
| `GET /api/me/platform-announcements`, `POST /:id/dismiss \| click` | Company side | — |
| `POST /api/admin/broadcasts` (preview count + create), `GET /api/admin/comm-logs`, `POST /api/admin/comm-logs/:id/retry` | Logs are append-only | 400 audience / template |

## 6. Database: `prisma/sql/107-admin-growth-support.sql` (idempotent)
- Audit triggers on PlatformLeads, PlatformLeadActivities, SupportTicketMessages, AnnouncementTargets and CommunicationLogs.
- The function fixes and new functions.
- A dismissals table, **only if no existing column fits**; otherwise a per-user dismissal in `Company.UserPreferences`, checked first.
- Error codes; lookup tones.

## 7. Audit
- **Tables:** all audited.
- **Attribution:** company-side writes run in the tenant actor context (user named); admin writes as the Super Admin.
- **History:** History tabs on lead, ticket and announcement.

## 8. Ordered tasks
1. SQL 107 + models + registries.
2. Contracts.
3. Admin services.
4. Company-side services.
5. Admin pages.
6. Workspace pages + banner.
7. Verify.

## 9. Verification
- **Functional:**
  - **Leads:** create → move through the stages → convert via onboarding (marker company) → linked.
  - **Tickets:**
    - a company user raises a ticket → admin replies (first response, SLA) → internal note hidden from the company → resolve → company CSAT;
    - another company can't see it.
  - **Announcements:** targeted to a plan → only matching companies see the banner; dismiss persists; views / clicks counted.
  - **Broadcasts:** segment audience → recipient count; IN_APP delivered; email QUEUED; retry.
  - History attributed; tenant tokens refused on admin routes.
- **Visual:** the admin pages against the templates; the company pages and banner for consistency.

## 10. Risks / blockers
- **No email delivery** (Phase 29).
- **No attachments** (no upload service yet).
- **Blockers:** none.
