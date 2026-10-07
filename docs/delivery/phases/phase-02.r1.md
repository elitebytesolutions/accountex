# Phase 2 rev 1: Access & security

**Objective:** each company manages its own people's access. Admins add users, give them job roles and branches, and suspend or remove them. They shape roles with the permission matrix and approval limits, define approval workflows, and design the document templates. Every user signs in with their **company code** to a session that can be listed and revoked, changes their own password, and sets their preferences. Every change is attributed to the user in row history.

**Entities (5, MASTER):** Users · Roles & Permissions · Approval Workflows · Document Templates · Account & Security (reduced, see below)

**Status before this plan:** Phases 0 and 1 `done`; no phase in progress.

**Decisions taken with you:**
- **Deferred:** MFA (authenticator / SMS), forgot-password and the email/WhatsApp invite link. There's no mail or SMS delivery yet, and the three share it.
  - **Users are added with "Create account now":** the admin sets a temporary password, and the user must change it at first sign-in. The template's "Invite" option shows as unavailable.
- **Where the deferred work goes:** a new master entity **Sign-in Recovery & MFA** in Phase 15 (Self-service & reporting setup, currently 4 entities), with tables `UserInvites`, `UserMfaMethods`, `TrustedDevices`, `PasswordResets` and templates `login/mfa`, `login/forgot`.
- **`Company.NotificationPreferences`** (per event × channel × delivery) moves to Phase 29 › Tasks & Notifications, where notifications are delivered. The profile's notification switches use `UserPreferences.notifyEvents`.
- **No new npm packages.**

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Users | Master | Branches (done) | Every later screen needs real users with branch access; today only the seeded default user exists |
| Roles & Permissions | Master | — | System roles exist from provisioning but can't be viewed or tuned; custom roles and limits gate every later module |
| Approval Workflows | Master | Roles, Users (this phase) | Vouchers, bills, payroll and stock adjustments (Phases 16+) route through them; masters must exist before transactions |
| Document Templates | Master | Document types (global, Phase 1) | Printing of invoices/vouchers from Phase 16 on needs a default template per document type |
| Account & Security | Master | Users (this phase) | Sessions must be server-side before more users sign in; own password, preferences; sign-in screen with company code |

## 2. Verified schema (live DB)
**Users**
- **`Company.Users` (existing, partly mapped):**
  - email `citext`, unique per tenant while status ≠ REMOVED (`appUserEmailUidx`);
  - status ∈ `UserStatus` (ACTIVE, INVITED, SUSPENDED, REMOVED);
  - `dataScope` ∈ OWN/BRANCH/ALL;
  - `loginHours` ∈ ANY/BUSINESS/CUSTOM with `loginFrom`/`loginTo`;
  - `ipRestricted` + `ipAllowlist cidr[]`, `sessionTimeoutMin`, `mustChangePassword`;
  - `isExternal`/`externalOrg`, `jobTitle`, `department`, `phone`, `defaultBranchId`, `approvalLimit`, `moduleAccess text[]`;
  - `employeeId` (→ HR, Phase 11).
- **Triggers:** stamp, touch, `coreAppUserAudit` (triggerAuditRedacted: audited, though the roadmap scanner misses it because of the name), `validateLookups`, Employee-role default, default-user lock.
- **`Company.UserBranches`** (user × branch, unique): audited, 0 rows.
- **`Company.UserWarehouses`** (FK → `Inventory.Warehouses`, Phase 6): audited, 0 rows. Not used until Phase 6.
- **`Company.UserRoles`:** audited; triggers keep EMPLOYEE and lock the default user.

**Roles & Permissions**
- **`Company.Roles`:** name `citext` unique per tenant; `systemKey` ∈ SystemKey; `tone` ∈ RoleTone; `icon`, `description`, `isSystem`, `branchRestricted`, `copiedFromRoleId`, `deletedAt`.
  - Audited; `rolesToDefaultUser` assigns each new role to the default user.
  - **No guard against renaming or deleting system roles** (added in this phase).
- **`Company.RolePermissions`:** audited.
- **`Company.RoleLimits`:** one per role.
  - `maxVoucherAmount ≥ 0`, `maxDiscountPct` 0–100, `backdateDays` ∈ {0,3,7,30,365}, `salaryVisibility` ∈ HIDDEN/MASKED/FULL.
  - Audited.
- **`Company.Permissions`:** global catalogue of 320 codes in 7 modules.
  - Actions VIEW/CREATE/EDIT/APPROVE/POST/DELETE/EXPORT; these map 1:1 to the template matrix columns V C E A P D X and its resource keys.
  - **Audit trigger missing** (added in this phase).

**Approval Workflows** (all audited, 0 rows)
- **`ApprovalWorkflows`:**
  - name unique per tenant; `subject` ∈ Subject;
  - status ∈ ApprovalWorkflowStatus; `version ≥ 1`; `priority`;
  - `onComplete`/`onReject` lookups; 4 notify flags;
  - `publishedAt` required unless DRAFT; `deletedAt`.
- **`ApprovalWorkflowSteps`:**
  - `stepNo` 1–20, unique per workflow;
  - `approverType` ROLE|USER with the matching id (checks);
  - `appliesAboveAmount`, `slaHours > 0`, `onSlaBreach`, `approvalMode`;
  - `blockSelfApproval`, `allowDelegation`, `requireComment`.
- **`ApprovalWorkflowConditions`:** `seq` unique; `field`/`operator` lookups; `value jsonb` (an array for IN/NOT_IN/BETWEEN).
- **`ApprovalDelegations`:** from ≠ to; `endsOn ≥ startsOn`; optional `subject`.

**Document Templates**
- **`DocumentTemplates`** (audited, 0 rows):
  - name unique per tenant; `category` lookup; `docType` → `DocumentTypes`; `letterKind` required exactly for HR_LETTER;
  - paper / headerLayout / language lookups; six "show on document" flags; `bodyHtml`, `version`;
  - one default per (category, docType, letterKind) among non-deleted rows (partial unique);
  - a default must be ACTIVE (check).
- **`DocumentTypes`:** global, read-only here. **Audit trigger missing** (added).

**Account & Security**
- **`UserSessions`** (0 rows; stamp, touch, lookups; **no audit trigger**):
  - `tokenHash bytea(32)` unique; `clientType`, `authMethod` lookups;
  - device/user agent/IP/location; `signedInAt`, `lastActiveAt`, `expiresAt`;
  - `revokedAt` ⇔ `revokeReason` (RevokeReason lookup).
- **`UserPreferences`** (one per user; **no audit trigger**):
  - language/dateFormat/numberFormat/startRoute/theme lookups;
  - compactTables, showAccountCodes;
  - in-app / email digest (+ time) / SMS above amount / WhatsApp;
  - `notifyEvents text[]` (checked list).
- **Today's session** is a stateless JWT cookie, so a session can't be listed or revoked.
- **Today's login** is email + password; an email in two companies can't be resolved (noted in `auth.service.ts`).

**Unresolved (decide during review):**
- **User removal:** the "Remove" action sets status REMOVED + `deletedAt` (soft). Users are never hard-deleted, because every audited row references them.
- **Custom roles and the default user:** every new role is auto-assigned to the default user (Phase 0 rule). So "role in use" means *other* users hold it. Deleting a role soft-deletes it (`deletedAt`), and permission loading ignores deleted roles.

## 3. Template → page mapping
| Entity | Template | Page | Pattern | Notes |
|---|---|---|---|---|
| Users | `49-cash-users.html` + `9E-cash-users.js` USERS · `app/settings/users` | `/settings/users` | KPI strip, team table (search, role/status filters), row menu, **user detail drawer** (Profile · Permissions · Sessions · Activity tabs), **add/edit wizard drawer** (method → identity → role → access → security → review) | **Pending invites:** "Invites arrive in Phase 15". **Security posture:** shows MFA as not available yet. **Seats:** count only (plans are Phase 36). **Employee link:** "Available in Phase 11". **Warehouses:** "Available in Phase 6". **MFA row in the security step:** disabled. |
| Roles & Permissions | same files · `app/settings/roles` | `/settings/roles` | role list + search, role header (users, branch-restricted switch), SoD conflict banners, **permission matrix** by module group with row/column toggles and unsaved markers, limits panel, summary panel, sticky save bar, **new/duplicate role modal** | Admin matrix locked; system roles show a lock badge and can be copied, not deleted. "Last changed by" comes from history. |
| Approval Workflows | `60-settings-ess.html` · `app/settings/approvals` | `/settings/approvals` | workflow list, builder (conditions table, steps, step settings, notifications), publish | "Approval log" needs approval requests (transactions), so it is omitted. Delegations panel in the same page. Test (dry-run) drawer. |
| Document Templates | `60-settings-ess.html` · `app/settings/templates` | `/settings/templates` | template list, editor (name, paper, header, language, show-on-document switches, merge fields), live preview | "Import" omitted. **Test print:** browser print of the preview. **Preview:** client-side only (no PDF rendering). |
| Account & Security | `60-settings-ess.html` · `app/profile/security` (tabs prof-profile, prof-security, prof-prefs); `30-entry-admin.html` · `login` | `/profile/security?tab=`, `/login` | **Profile tab:** own details, access summary, recent activity. **Security tab:** change password + active sessions table with revoke. **Preferences tab:** regional & display, theme, notification switches. **Sign-in:** company code, email, password. | **Security tab:** the MFA panel shows "available in Phase 15". **Sign-in:** the SSO buttons, "Forgot password?" and the MFA notice are not shown. **Change photo:** omitted (attachments are Phase 35). |

**Sidebar:** System › Settings gains Users (`usr:view`), Roles & Permissions (`rol:view`), Approval Workflows (`wf:view`), Document Templates (`comp:view`).

**Styles:** the `cu-*` rules for Users/Roles (`template/src/1E-cash-users.css`) are ported verbatim into `src/app/styles/finsoft-users.css`. Any other feature CSS the approvals/templates/profile screens use is ported the same way.

**States everywhere:** loading skeleton, empty state, field validation, success toast, error banner with reference, read-only without the edit permission, no-access page without the view permission.

**Missing templates:**
- **Forced password change at first sign-in:** none. It reuses the profile Security tab's "Change password" panel, with a banner.

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/access/{user,role,permission,approval-workflow,document-template,me}.ts`, `src/shared/auth/login.schema.ts` (+ `companyCode`) | Zod input/output schemas (same rules as the DB checks), list queries |
| Domain | `modules/access/roles/domain/sod.ts` (segregation-of-duties conflicts: create+approve, create+post, create users + edit roles), `modules/access/approval-workflows/domain/conditions.ts` (pure condition evaluator for dry-run), `modules/auth/domain/sign-in-policy.ts` (login hours, IP allow-list, password strength) | Pure rules, no framework |
| Application | `modules/access/users`, `roles`, `approval-workflows`; `modules/settings/document-templates`; `modules/me` (password, sessions, preferences, profile); `modules/auth` (login, logout, session check) | Use cases on ports; every mutation via `unitOfWork.run(actorContext(user, meta), …)` |
| Infrastructure | Prisma stores per entity; `PrismaSessionStore` | Explicit `tenantId` filters; `*AddUpdate` functions where the DB has them |
| Server adapter | Controllers under `/api/settings/users|roles|permissions|approval-workflows|approval-delegations|document-templates`, `/api/me/*`, `/api/auth/*`; `JwtAuthGuard` checks the session row | Parse, guard, map errors |
| UI | `src/features/access/*`, `src/features/me/*`, `src/features/auth/*`; pages `src/app/(app)/settings/{users,roles,approvals,templates}`, `src/app/(app)/profile/security`, `src/app/(auth)/login` | Template screens, drawers, matrix, wizard |

Prisma: map `UserBranches`, `RoleLimits`, `Permissions` (already), `ApprovalWorkflows`, `ApprovalWorkflowSteps`, `ApprovalWorkflowConditions`, `ApprovalDelegations`, `DocumentTemplates`, `UserSessions`, `UserPreferences`, all from a scratch `db pull`.

## 5. API contracts (all under `/api`, tenant from the session)
| Method & path | Permission | Notes / errors |
|---|---|---|
| `POST /auth/login` `{companyCode, email, password}` | public | Creates a `UserSessions` row; the JWT carries the session id. 401 `AUTH_INVALID_CREDENTIALS` (same answer for an unknown company, unknown email or wrong password); 403 `AUTH_OUTSIDE_LOGIN_HOURS`, `AUTH_IP_NOT_ALLOWED`; 423 locked after repeated failures (existing `failedLoginCount`/`lockedUntil`) |
| `POST /auth/logout` | session | Revokes the current session (reason LOGOUT) |
| every authenticated request | — | Guard: session exists, isn't revoked or expired, and is within the user's inactivity timeout; else 401 `AUTH_SESSION_REVOKED` / `AUTH_SESSION_EXPIRED`. `lastActiveAt` is refreshed at most once a minute. While `mustChangePassword`, only `/me/*` and `/auth/*` are allowed (403 `AUTH_PASSWORD_CHANGE_REQUIRED`) |
| `GET /settings/users?search&status&role&branch&page&pageSize&sort` · `GET /settings/users/:id` · `GET /settings/users/summary` (KPIs) | `usr:view` | List rows show role, branches and last active (from sessions) |
| `POST /settings/users` (create now: identity, roles, branches, access, security, temp password, mustChange) | `usr:create` | Email unique (409); password strength (422 `PASSWORD_TOO_WEAK`) |
| `PATCH /settings/users/:id` (+rowVersion) · `PUT /settings/users/:id/roles` · `PUT /settings/users/:id/branches` | `usr:edit` | EMPLOYEE kept by trigger; default user's roles locked (409 `TENANT_DEFAULT_USER_LOCKED`) |
| `POST /settings/users/:id/suspend` · `/reactivate` · `/remove` · `/reset-password` (new temp password, must change) | `usr:edit` (`remove`: `usr:delete`) | 409 `USER_SELF_ACTION` on yourself; default user locked. Suspend/remove/reset revoke all the user's sessions |
| `GET /settings/users/:id/sessions` · `DELETE /settings/users/:id/sessions[/:sid]` | `usr:view` / `usr:edit` | Admin sign-out of devices |
| `GET /settings/users/:id/activity` | `usr:view` | The user's own recent actions (audit entries where they are the actor) |
| `GET /settings/permissions` | `rol:view` | Catalogue grouped by module (read-only) |
| `GET /settings/roles` · `GET /settings/roles/:id` (grants, limits, user count, SoD conflicts) | `rol:view` | |
| `POST /settings/roles` `{name, description, icon, tone, copyFromRoleId}` · `POST /settings/roles/:id/copy` | `rol:create` | Name unique (409); new role auto-assigned to the default user (existing trigger) |
| `PATCH /settings/roles/:id` (+rowVersion) · `PUT /settings/roles/:id/permissions` (replace grants) · `PUT /settings/roles/:id/limits` | `rol:edit` | System role rename → 409 `ROLE_SYSTEM_LOCKED`; ADMIN grants locked to all (409 `ROLE_SYSTEM_LOCKED`) |
| `DELETE /settings/roles/:id?rowVersion` | `rol:delete` | System role → 409 `ROLE_SYSTEM_LOCKED`; held by other users → 409 `ROLE_IN_USE`; else soft delete |
| `GET/POST/PATCH /settings/approval-workflows[/:id]` (with steps + conditions in one body) · `POST …/:id/publish` · `/archive` · `DELETE …/:id` (drafts only) | `wf:view/create/edit/delete` | Publishing needs ≥1 step (422 `WORKFLOW_STEPS_REQUIRED`); one active workflow per subject + identical conditions (409 `WORKFLOW_DUPLICATE`) |
| `POST /settings/approval-workflows/:id/test` `{amount, branchId, …}` | `wf:view` | Dry-run: whether it matches, and which steps / approvers apply |
| `GET/POST/PATCH/DELETE /settings/approval-delegations[/:id]` | `wf:edit` | DB checks: dates, from ≠ to |
| `GET/POST/PATCH /settings/document-templates[/:id]` · `POST …/:id/set-default` · `/activate` · `/deactivate` · `DELETE` (soft) | `comp:view` / `comp:edit` | One default per category + docType + letterKind (the old default is cleared in the same transaction); a default can't be deactivated (409 `DOC_TEMPLATE_DEFAULT_LOCKED`) |
| `GET /settings/document-types` (exists) | `comp:view` | |
| `GET/PATCH /me/profile` (name, title, phone, default branch) | own | |
| `POST /me/password` `{currentPassword, newPassword}` | own | 422 `AUTH_PASSWORD_INCORRECT`, `PASSWORD_TOO_WEAK`; clears `mustChangePassword`; revokes the other sessions |
| `GET /me/sessions` · `DELETE /me/sessions/:id` · `DELETE /me/sessions` (all others) | own | |
| `GET/PATCH /me/preferences` | own | Creates the row on first save |

- **Delete vs deactivate:**
  - **Users:** suspend / remove (soft).
  - **Roles:** soft delete if unused.
  - **Workflows:** archive; hard delete only while DRAFT.
  - **Templates:** deactivate / soft delete.
  - **Sessions:** revoke.
- **Concurrency:** every PATCH/DELETE carries `rowVersion` (409 `CONCURRENCY_CONFLICT`). The matrix save sends the role's `rowVersion`.
- **Pagination, filters, sort:** the users list is server-paged. Roles, workflows and templates are small, so they are listed whole.

## 6. Database changes: `prisma/sql/008-access-security.sql` (idempotent, added to `db:sql`)
1. **Audit triggers:**
   - `triggerAudit` on `Company.Permissions` and `Company.DocumentTypes` (global rows → tenantId NULL) and on `Company.UserPreferences`;
   - `triggerAuditRedacted` on `Company.UserSessions`, with `tokenHash` redacted. To keep history readable it fires only on INSERT and on UPDATE OF `revokedAt` (the per-minute `lastActiveAt` refresh isn't logged).
   - The deferred tables (`TrustedDevices`, `PasswordResets`, `NotificationPreferences`) get theirs in the phases that use them.
2. **System-role guard:** `triggerRoleSystemLock`. On a system role, `name` or `systemKey` can't change and the role can't be deleted or soft-deleted (`HINT ROLE_SYSTEM_LOCKED`). ADMIN's grants can't be removed.
3. **New error codes:**
   - **401:** `AUTH_SESSION_REVOKED`, `AUTH_SESSION_EXPIRED`;
   - **403:** `AUTH_OUTSIDE_LOGIN_HOURS`, `AUTH_IP_NOT_ALLOWED`, `AUTH_PASSWORD_CHANGE_REQUIRED`;
   - **409:** `USER_SELF_ACTION`, `ROLE_SYSTEM_LOCKED`, `ROLE_IN_USE`, `WORKFLOW_DUPLICATE`, `DOC_TEMPLATE_DEFAULT_LOCKED`;
   - **422:** `AUTH_PASSWORD_INCORRECT`, `PASSWORD_TOO_WEAK`, `WORKFLOW_STEPS_REQUIRED`;
   - **423:** `AUTH_ACCOUNT_LOCKED`.
4. **Lookup labels** for the users/roles/workflow/template selects, readable as in the template (labels only, as in Phase 1).
5. **`Company.setDefaultDocumentTemplate(pId)`:** clears the old default, then sets the new one.

## 7. Audit (row history)
- **Tables covered by the audit trigger:**
  - `Users`, `UserRoles`, `UserBranches`, `Roles`, `RolePermissions`, `RoleLimits`;
  - the 4 approval tables, `DocumentTemplates`;
  - added in this phase: `Permissions`, `DocumentTypes`, `UserSessions` (sign-in and revoke), `UserPreferences`.
- **User attribution:**
  - **Admin actions:** run in `withContext` with the admin's verified session (user ID, name/email snapshot, IP, user agent, **session id**, correlation ID).
  - **Sign-in and the first password change:** recorded as the user themselves.
  - **Failed sign-ins:** recorded as `login attempt`.
- **History view:** a History tab for users (detail drawer), roles, workflows and templates. All new tables are registered in `history-tables.ts` with their view permission (`usr:view`, `rol:view`, `wf:view`, `comp:view`). Sessions show in the Sessions tabs.

## 8. Ordered tasks
1. **Roadmap and status:**
   - move `UserInvites`, `UserMfaMethods`, `TrustedDevices`, `PasswordResets` and `login/mfa`, `login/forgot` into the new Phase 15 entity;
   - move `NotificationPreferences` to Phase 29 › Tasks & Notifications;
   - set Phase 2 `in-progress`; `npm run delivery:roadmap` must pass.
2. **Database:** `008-access-security.sql`, applied twice; map the Prisma models.
3. **Sessions and sign-in:** session table, guard, company-code login, logout revoke, forced password change. Update the seed and scratch scripts for the new login body.
4. **Contracts,** then domain rules (SoD, condition evaluator, sign-in policy), use cases, stores, controllers per entity, `history-tables.ts`.
5. **Pages from the templates:** Users (table, detail drawer, wizard), Roles (list, matrix, limits, modal), Approvals (builder, delegations, dry-run), Templates (editor, preview), Profile Security (3 tabs), Login. Port the template CSS verbatim; add the sidebar entries.
6. **Wire to the API;** finish create/edit/suspend/remove/delete flows; History tabs.
7. **Verification** (§9), then the acceptance request.

## 9. Verification
**Functional (UI and API)**
- **Sign-in:**
  - company code + email + password works;
  - a wrong company, email or password all give the same 401;
  - login hours and the IP allow-list block with their codes;
  - the lockout applies after repeated failures.
- **Sessions:**
  - revoking a session (own or by an admin) makes its next request 401;
  - the inactivity timeout applies;
  - logout revokes;
  - sessions show device/IP/last active.
- **Users:**
  - create now with a temp password → the user must change it at first sign-in;
  - edit, roles (EMPLOYEE kept), branches, suspend/reactivate, remove, reset password;
  - suspending yourself, or anything on the default user, is refused.
- **Roles:**
  - create / copy / rename / limits / matrix save;
  - SoD conflicts shown;
  - system role rename/delete → 409; role in use → 409;
  - a new role lands on the default user.
- **Approval workflows:** draft → publish (needs a step) → archive; duplicate active → 409; dry-run matches; delegations CRUD with date checks.
- **Templates:** create/edit, set default (the previous one is cleared), default can't be deactivated, live preview, print.
- **Own account:** change password (wrong current → 422), preferences persist, profile edit.
- **Permissions:** for each screen, allowed vs denied (no view → no-access page; view-only → read-only UI; API 403). Test users are created and removed through the app.
- **History:** every insert/update/delete above shows in History with the real user and session. psql check that the session ids match.

**Visual:** headless Edge screenshots of `/settings/users` (table, detail drawer, wizard), `/settings/roles` (matrix, modal), `/settings/approvals`, `/settings/templates`, `/profile/security` (3 tabs) and `/login`, next to the template routes. At 1400×900 and 390×844, light and dark.

**Build:** both typechecks, lint + lint:arch, roadmap check, SQL run twice.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:** all of §9 passes, and the deviations are listed in the acceptance request.
- **Risks:**
  - **Breaking change for anyone signing in:** login gains the company code (`demo` for Demo Company), and every existing JWT is invalidated when sessions go server-side.
  - **Extra query per request:** the session check adds one DB read per request (indexed by the unique `tokenHash` / primary key).
  - **Users screen size:** it's the largest template screen so far (KPIs, wizard, drawer). The deferred parts show "available in Phase N" rather than fake data.
  - **Audit volume:** sessions are audited only on sign-in/revoke to keep history readable.
- **Blockers:** none. No new packages; no mail/SMS needed after the deferrals.

---
**Approve Phase 2 revision 1 for implementation?**
