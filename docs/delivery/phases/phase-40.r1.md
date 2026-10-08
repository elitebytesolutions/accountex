# Phase 40 rev 1: Tenant lifecycle (Super Admin)

> **Status: approved 2026-10-08 (revision 1).** Planned together with Phases 30, 31 and 40 (run in parallel); Phases 36–39 accepted the same day.

**Objective:** onboard, run and close tenant companies from the Platform Console:
- onboarding through `Platform.provisionTenant`;
- the tenant list and Tenant 360;
- subscriptions with an event history;
- usage meters and per-tenant limit overrides;
- time-boxed, audited impersonation.

**Entities (4, TRANSACTIONAL):** Tenants · Subscriptions · Usage · Impersonation Sessions

## 1. Selection rationale
| Entity | Depends on (status) | Why now |
|---|---|---|
| Tenants | plans (36), COA and seed templates (37) — awaiting acceptance | Billing (41), growth (42) and operations (43) all hang off tenants |
| Subscriptions | tenants, plans, coupons (36) | MRR, renewals and dunning (41) need live subscriptions |
| Usage | tenants, usage alert rules (39) | Phases 36 and 39 left "meters arrive in Phase 40" gaps: plan limits editor and alert rules |
| Impersonation Sessions | tenants | Support needs it; the Tenant 360 template already shows it |

## 2. Verified schema (live DB)

**Tenants**
- Columns: code / subdomain unique citext, code `^[A-Za-z][A-Za-z0-9]{3,9}$`.
- Status lookup `TenantStatus`: PROVISIONING / TRIAL / ACTIVE / PAST_DUE / READ_ONLY / SUSPENDED / CHURNED.
- `coaTemplateId`, health fields, suspended* / churned* columns.
- Insert triggers seed every workspace default (head office, fiscal year, banks, HR, payroll, …).
- Rows: 2 (demo, test).

**Child tables of Tenants:** TenantContacts (one primary OWNER), TenantModules (unique tenantId + moduleKey), TenantAddons (one active per add-on), TenantNotes. All 0 rows.

**Subscriptions**
- One live subscription per tenant (partial unique).
- `mrrAmount` is never set by `subscriptionAddUpdate`.

**SubscriptionEvents**
- Append-only.
- `subscriptionEventMovementChk` ties movement to mrrBefore / mrrAfter.
- 14 event types.

**Usage tables**
- **UsageMeters:** 0 rows. Lookup `UsageMeterCode` has 8 codes; this phase seeds the meters.
- **UsageSnapshots:** unique (tenant, meter, date).
- **UsageLimitOverrides:** one live override per tenant and meter; expiry and price checks.
- View `Platform.getCurrentUsage` gives: latest snapshot, plan limit, override, % and band.

**ImpersonationSessions**
- `reason` required; `timeLimitMinutes` ∈ {30, 60}; `isReadOnly` defaults to true.
- One live session per staff member; `targetUserId` has no foreign key.

**Missing audit triggers** (added in 105):
- **Tenants, TenantContacts, TenantModules, TenantNotes, SubscriptionEvents, UsageMeters, UsageSnapshots.**
- These rows go to `Platform.PlatformAuditLogs`, the admin history. They do not go to `Company.AuditTrailEntries`; the roadmap text is corrected.

**DB defects to fix in 105:**
1. **`provisionTenant` inserts ACTIVE directly.** No trial, contacts, modules, subscription, COA template or seed copy. A duplicate code raises a raw unique violation.
2. **`tenantAddUpdate` can INSERT a tenant**, bypassing provisioning. Add an UPDATE-only guard: `TENANT_CREATE_VIA_PROVISION`.
3. **`subscriptionAddUpdate` / `usageLimitOverrideAddUpdate` read `app.tenantId`**, which the admin context leaves null. Wrap them in `inTenant()`, as `prisma-integration.stores.ts` already does.
4. **`mrrAmount` is never filled**, so `getAllTenants.mrr` is always 0.
5. **Tenant sign-in only accepts `status = 'ACTIVE'`**: TRIAL and PAST_DUE companies are locked out. **Suspension does not end live sessions.**

**Unresolved questions** (each has a proposal):
- **Q40-1. Which statuses may sign in?** Proposal:
  - ACTIVE, TRIAL and PAST_DUE: full access.
  - READ_ONLY: sign-in allowed; every non-GET request returns 403 `TENANT_READ_ONLY` (one guard).
  - SUSPENDED, CHURNED and PROVISIONING: refused with 403 `TENANT_SUSPENDED` / `TENANT_INACTIVE`.
  - Suspending revokes all live `UserSessions`.
- **Q40-2. Onboarding the default user.** The template's Admin User step has no password field, but the Phase 0 rule requires one. Proposal: add a **Password + confirm** field in template style (tenant password policy).
- **Q40-3. What impersonation signs in as, and how "both identities" are recorded.** Proposal:
  - The admin picks a user (default: the tenant's default user).
  - A tenant `UserSessions` row is created with `authMethod = IMPERSONATION` (new lookup code), linked to `ImpersonationSessions.id`.
  - Every audit row written during impersonation carries `actorLabel = "Super Admin <email> as <user>"` and `sessionId` = that session.
  - Read-only sessions refuse writes (403 `IMPERSONATION_READ_ONLY`).
  - The tenant sees "Support access" history in Settings › Account & Security.
  - **No new column on `AuditTrailEntries`.**
- **Q40-4. How usage is captured.** Proposal:
  - `Platform.captureUsageSnapshots(pDate)` computes USERS, BRANCHES and INVOICES_MONTH (0 until Phase 23) from live tables.
  - STORAGE_GB comes from the attachments size.
  - API, SMS and FBR meters stay 0 until their phases.
  - Runs on demand ("Refresh usage") and nightly if a scheduler exists. If none exists, on demand only and the nightly run is noted for later.
  - The template shows 6 meters; all 8 lookup codes are seeded and the 6 template ones are shown.
- **Q40-5. Copying seed templates at onboarding.** Proposal: the wizard's "Seed tax codes", "Seed leave types & salary components" and COA template choice run inside the same provisioning transaction.

## 3. Template → page mapping
| Entity | Template | Page | Pattern |
|---|---|---|---|
| Tenants list | `3A-admin-plus.html:4`, `9B-admin-plus.js:202–416` | `/admin/tenants` | 5 KPIs, region strip, filters, table, bulk bar (extend trial, change plan, notice, suspend), quick-view drawer |
| Onboard | `30-entry-admin.html:190–408` (5-step wizard) | `/admin/tenants/new` | Wizard: company, plan & modules, admin user (+ password), configuration, review & provision checklist |
| Tenant 360 | `3A:19`, `9B:417–769` | `/admin/tenants/[id]` | Profile panel and tabs: Overview, Users, Usage, Billing, Flags, Integrations, Activity (History). Actions: impersonate, change plan, export, suspend |
| Subscriptions | `30-entry-admin.html:513–588` | `/admin/subscriptions` | KPIs, chips, table, row drawer, "Trials expiring", "MRR movement"; "Run renewals" |
| Usage | `9B:1204–1316` | `/admin/usage` (existing page gains the meters part) | KPIs, per-tenant meters table, top consumers, override modal |
| Impersonation | `9B:479, 633–656` | Tenant 360 modal + red banner in the workspace shell | Reason, ticket, 30 / 60 minutes, read-only switch, live timer, "End session" |

**Nav:**
- "Tenant Management" gets All Tenants, Onboard Tenant and Subscriptions.
- The "Onboard" tile goes into ADMIN_MENU and the create menu.

**Missing template parts:**
- Tenant 360 Flags / Integrations tabs show existing Phase 38/39 data, read-only.
- "Export data" stays disabled until Phase 35.
- "Send notice" stays disabled until Phase 42.

## 4. Clean Architecture
| Layer | Location |
|---|---|
| Contracts | `src/shared/platform/{tenant,subscription,usage,impersonation}.ts` |
| Domain | `platform-admin/tenants/*/domain`: status transitions, MRR movement classification, usage bands, override expiry, impersonation expiry |
| Application | `TenantsService` (onboard via provisioning store, suspend / reactivate / churn, modules, contacts, notes), `SubscriptionsService` (change plan, cancel, renew, extend trial — each writes a SubscriptionEvent), `UsageService`, `ImpersonationService`; all in `UnitOfWork.run(adminActorContext)` |
| Infrastructure | Prisma stores; provisioning via `provisionTenant` + new `Platform.tenantOnboard`; `inTenant()` wrapper; tenant `TokenService` + `SessionStore` for impersonation |
| Server adapter | `/api/admin/tenants`, `/api/admin/subscriptions`, `/api/admin/usage`, `/api/admin/impersonation` (`@AdminRoute`); tenant side `GET /api/settings/support-access` |
| UI | `src/features/platform-tenants/*`; pages under `src/app/admin/(portal)/{tenants,subscriptions}`; banner in the workspace shell |

## 5. API contracts (all `@AdminRoute`; a tenant token gets 401)
| Method & path | Notes | Errors |
|---|---|---|
| `GET /admin/tenants` (search, status, plan, region, page), `GET /:id` | List from `getAllTenants` | 404 |
| `POST /admin/tenants` | Onboard in one transaction: provisionTenant → status TRIAL / ACTIVE → contacts → modules from plan → subscription → seed copies | 409 code / subdomain, 400 password policy |
| `PATCH /:id`, `PUT /:id/modules`, `POST /:id/contacts`, `POST /:id/notes` | rowVersion | 409 stale |
| `POST /:id/suspend \| reactivate \| churn` | Reason required; suspend revokes sessions | 409 `TENANT_STATUS_ORDER` |
| `GET /admin/subscriptions`, `POST /:id/change-plan \| cancel \| renew \| extend-trial`, `POST /admin/subscriptions/run-renewals` | Each writes SubscriptionEvents with movement + MRR | 409 `SUBSCRIPTION_NOT_LIVE` |
| `GET /admin/usage?tenant`, `POST /admin/usage/refresh`, `POST /admin/usage/overrides`, `POST /overrides/:id/revoke` | Overrides: one live per tenant and meter | 409 `USAGE_OVERRIDE_EXISTS` |
| `POST /admin/tenants/:id/impersonate`, `POST /admin/impersonation/:id/end`, `GET /admin/impersonation` | Returns the tenant session (cookie); time-boxed | 409 `IMPERSONATION_ACTIVE`, 403 `IMPERSONATION_READ_ONLY` |
| `GET /admin/history/Tenants/:id` (+ children), Subscriptions, UsageLimitOverrides, ImpersonationSessions | Allow-list additions | 404 |

**Deletes:** none. Tenants are churned, not deleted; subscriptions are cancelled; overrides are revoked.

## 6. Database: `prisma/sql/105-admin-tenant-lifecycle.sql` (idempotent)
- Audit triggers on the 7 tables above.
- `Platform.tenantOnboard(jsonb)`: calls `provisionTenant`, then sets status, contacts, modules, subscription and seed copies.
- `tenantAddUpdate` becomes update-only.
- MRR computed on subscription save.
- UsageMeters seed (8 codes).
- `captureUsageSnapshots`.
- Lookup codes: `UserSessionAuthMethod` IMPERSONATION; `RevokeReason` TENANT_SUSPENDED / IMPERSONATION_ENDED.
- Error codes listed above.
- **Code changes outside the admin module:**
  - Tenant sign-in store and guard (Q40-1).
  - A read-only guard.
  - Workspace shell impersonation banner.

## 7. Audit
- Platform rows go to `PlatformAuditLogs`, attributed to the Super Admin.
- Tenant-side rows written during impersonation go to `AuditTrailEntries`: actorLabel "Super Admin … as …", plus the impersonation session id.
- History tabs on Tenant 360 and Subscriptions.

## 8. Ordered tasks
1. SQL 105, Prisma models, registries.
2. Contracts, domain, stores and services (onboarding first).
3. Sign-in, read-only and suspension changes; impersonation session.
4. Pages: tenants list, wizard, Tenant 360, subscriptions, usage meters, banner.
5. Plan limits editor (Phase 36) and usage alert rules (Phase 39) now show the meters.
6. Verification.

## 9. Verification
- Onboard a **marker company** through the wizard API: provisioning path, roles and grants (Phase 37 edits respected), contacts, modules, subscription, seed copies. Then sign in as its default user.
  - The company cannot be hard-deleted, so it is churned at cleanup and reported (or it stays as an agreed fixture).
- Status transitions and sign-in rules per status; suspension revokes sessions.
- Subscription change-plan / cancel / renew: events, MRR movement, CHECKs.
- Usage: refresh snapshots for demo / test / marker; set and revoke an override; band calculation.
- Impersonation: read-only blocks writes; history rows name "Super Admin … as …"; expiry; tenant can see support-access history.
- Tenant token refused on every new route.
- Visual check against the templates at 1440 light / dark and 390.

## 10. Acceptance, risks
- **Risks:**
  - Sign-in and read-only changes touch shared auth (regression-test the workspace login).
  - Impersonation must never let a tenant-side token reach `/api/admin`.
  - The nightly job depends on whether a scheduler exists.
- **Blocker:** 36, 37 and 39 must be accepted before implementation starts.

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
