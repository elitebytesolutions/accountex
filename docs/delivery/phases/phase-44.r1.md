# Phase 44 rev 1 — Work queue & sign-in recovery

## Context
Phase 44 was split out of Phase 29 by the period-close session (2026-10-08). It is the only roadmap phase still `planned`, and its only dependency, Phase 2 (users, account security), is done. It delivers four things:
- **Today's Work:** personal tasks plus everything due today.
- **Notification Centre:** in-app notifications produced by real events, with per-user preferences.
- **Sign-in recovery:** user invites and forgot/reset password. MFA and trusted devices stay deferred (decided 2026-10-08).
- **Workspace Dashboard:** the `/dashboard` page, which is currently an empty placeholder.

**Entities (3, TRANSACTIONAL):** Tasks · Notifications & Preferences · Sign-in Recovery (UserInvites, PasswordResets), plus the Workspace Dashboard report.
**Status before:** 0–28, 30–32, 36–43 done; 29, 33, 34, 35 in progress in other sessions. Check with the Phase 29 session that it isn't also taking 44 before starting.

## 1. Verified schema (live DB, all tables empty, none mapped in Prisma)
**Shared by all tables:** stamp / touch / lookup-validation triggers and FORCED RLS (`tenantIsolation`).
- **Company.Tasks**
  - Columns: kind, title, notes, module, assigneeUserId, assignedByUserId, dueDate, dueTime, priority, status, repeatRule, remindBeforeMin, source MANUAL/SYSTEM, linkRoute, entity pair, completedAt.
  - Checks: `taskDoneChk` (DONE ⇔ completedAt).
  - Lookups: TaskKind / TaskModule / TaskPriority / RepeatRule / TaskStatus / TaskSource.
  - **No audit trigger.**
- **Company.Notifications**
  - Columns: userId, category (lookup, tenant-extensible), eventCode (regex), title, body, linkRoute, entity pair, actorUserId, amount, severity, needsAction, isMention, channels[], readAt, archivedAt.
  - Indexes: inbox / unread / entity.
  - **No audit trigger.**
- **Company.NotificationPreferences**
  - Unique (user, eventCode, channel); isEnabled, minAmount, delivery INSTANT / DAILY_DIGEST (+ digestTime).
  - **No audit trigger.**
- **Company.UserInvites**
  - Has its audit trigger.
  - One PENDING invite per email (partial unique index); status PENDING / ACCEPTED / EXPIRED / REVOKED with consistency checks; passwordResetId FK.
- **Company.PasswordResets**
  - tokenHash bytea(32), globally unique; purpose RESET / INVITE / ADMIN_RESET; channel; expiry at most 8 days; usedAt.
  - **No audit trigger.**
- **Existing DB objects to reuse:**
  - Views `Company.getTodayDueItems` (invoices / bills / cheques / own tasks due), `Company.getTodayKpis` (task, approval and money tiles) and `Company.getNotificationSummary`. All are scoped by `getCurrentUserId()`.
  - Template save functions `taskAddUpdate`, `notificationPreferenceAddUpdate`, `userInviteAddUpdate`. They are generic, with no business rules.
- **Missing pieces:**
  - No notification writer except `Platform.deliverInAppNotice` (platform broadcasts).
  - No password-reset functions.
  - **No email / SMS / WhatsApp sender anywhere.** Only QUEUED outboxes exist (Platform.CommunicationLogs, PaymentReminderLogs).

## 2. Decisions (recommended defaults)
1. **Today's Work (`/today`, template `app/today`)**
   - KPIs from `getTodayKpis`, "Due today" from `getTodayDueItems`, and the approvals queue from the existing approvals inbox (approve / reject in place).
   - My task list: create / edit / complete / cancel; repeating tasks create their next occurrence on completion.
   - "This week" strip from task and due counts per day. Agenda = today's tasks with times.
   - The calculator and tax calculator are template JS widgets: port the tax calculator only if it is small, otherwise list it as a deviation.
   - Rules: own tasks plus tasks assigned to me; the assigner can edit what they assigned; delete only own PENDING tasks, otherwise cancel.
2. **Notifications (`/notifications`, template `app/notifications`, plus the header bell)**
   - SQL writer `Company.notify(userId, eventCode, category, …)` respects IN_APP preferences.
   - First event sources:
     - **Approvals:** step pending for approvers; approved / rejected for the preparer. Hooked into the approval engine's `onStepChange` path, inside the same transaction.
     - **Finance:** invoice overdue, bill due, PDC maturing — daily job, one notification per document.
     - **Tasks:** task assigned to me; task reminder (job every 5 minutes, uses remindBeforeMin).
     - **System:** invite accepted; password reset requested (to user admins).
   - Tabs by category with counts from `getNotificationSummary`; mark read / mark all read; archive.
   - The workspace header bell shows the latest unread items and links to `/notifications`, next to the existing platform-notices bell.
   - Delivery channels panel: IN_APP preferences take effect. EMAIL / SMS / WhatsApp are saved but not delivered (no provider); the UI says so.
3. **Sign-in recovery**
   - **Tokens:** 32 random bytes, sha256 stored in PasswordResets, single use, invite 7 days / reset 30 minutes, throttled public endpoints with generic replies. Shared helper: `src/server/modules/auth` + a `PasswordResets` store.
   - **Invite:** the Users wizard's "Invite" card is enabled. It creates the user as INVITED, a UserInvites row and a PasswordResets (INVITE) row, and **returns the one-time link once** for the admin to copy or share on WhatsApp (template preview). Resend creates a new token and voids the old one; Revoke is available. The Pending-invites panel on Users becomes live.
   - **Accept / reset page** `/login/reset?token=` (no template, built in auth-page style): set a password with the existing policy, activate the user, mark the token used and the invite ACCEPTED, revoke sessions on reset.
   - **Forgot password** `/login/forgot` (template `login/forgot`): company code + email; always replies "If the account exists…".
     - With no mail provider there is no way to deliver the link to the user. Recommended: the request notifies the company's user admins in-app ("X asked to reset their password").
     - The admin then uses a new **"Send reset link"** on the user (copy-link, ADMIN_RESET), next to the existing temporary-password reset.
     - A `MailSender` port with a log-only adapter is added, so a real provider can plug in later without touching the flows. **Confirmed by the user: the admin shares the link; the dashboard ships live widgets only.**
   - The login form's "Forgot your password?" text becomes a link.
   - `/login/mfa` stays unbuilt (deferred).
4. **Workspace Dashboard (`/dashboard`, template `48-dash-stock.html` `app/dashboard`):** port the template layout. Widgets backed by existing data go live: today's KPIs, cash / bank balances, receivables / payables due, approvals, recent activity, sales and purchases totals from existing reports. Widgets with no data source are listed as deviations after a widget-by-widget check during implementation.
5. **Audit:** add triggers to Tasks, Notifications, NotificationPreferences and PasswordResets (token hash redacted via `triggerAuditRedacted`). Notifications history is low value, but the project rule is that every table gets a trigger.

## 3. Database — `prisma/sql/305-work-queue.sql` (idempotent, added to `db:sql`)
- Audit triggers as in decision 5.
- Functions:
  - `Company.notify(...)`, plus approval and finance event emitters (daily `Company.notifyDueItems(date)`).
  - `Company.taskComplete(id)` (completedAt, next occurrence for repeating tasks).
  - `Company.passwordResetIssue(user, purpose, channel, hash, expiry)` and `Company.passwordResetConsume(hash)` (single-use, expiry check, invite acceptance).
- Lookup code for the invite / reset doc type if needed; error codes (`TASK_NOT_YOURS`, `TOKEN_INVALID_OR_EXPIRED`, `INVITE_PENDING_EXISTS`, `INVITE_NOT_PENDING`, …).
- Prisma models for the 5 tables (generator script from Phase 28).

## 4. Server (Clean Architecture)
- **`src/server/modules/work`**
  - `tasks` (CRUD, complete, today endpoint reading the views)
  - `notifications` (me/notifications list / read / read-all / archive, preferences, summary)
  - `jobs` (task reminders every 5 minutes, daily due-items notifications; actor labels, `NODE_ENV=test` guard)
- **Approval hook:** `src/server/modules/approvals/application/approvals.service.ts` calls the notify port after each step change.
- **Sign-in recovery**
  - Invites: `src/server/modules/access/users` (invite / resend / revoke / pending list / admin "send reset link").
  - Public endpoints in `src/server/modules/auth`: `POST /auth/forgot`, `GET /auth/token/:token` (validate), `POST /auth/reset`. All `@Public()` and `@Throttle` 5/min, audited with `actorLabel` like the login attempt.
- **Reuse:** `actorContext`, `UnitOfWork`, `addUpdate` (register `taskAddUpdate`, `notificationPreferenceAddUpdate`, `userInviteAddUpdate`), `PasswordHasher` (bcrypt), `SessionStore.revokeAllForUser`, `passwordProblem`, `HISTORY_TABLES`.
- **Contracts:** `src/shared/work/*.ts`, `src/shared/access/invite.ts`.

## 5. UI
- **New pages:** `src/app/(app)/today`, `src/app/(app)/notifications`, `src/app/(auth)/login/forgot`, `src/app/(auth)/login/reset`.
- **Features:** `src/features/work/*`.
- **Updates:** Users wizard / screen (invite, pending invites, send reset link); `app-shell` bell; `login-form` link; `account-security` notification note; nav adds Today's Work (top tile) and Notifications.
- **Dashboard:** `src/features/dashboard` + `src/app/(app)/dashboard/page.tsx`.

## 6. Verification
- **Smoke suite `api-p44.mjs` (Test Co):**
  - Task CRUD, permissions (not yours → 403), complete → next repeat, today KPIs / due items.
  - An approval step creates notifications for approvers and the preparer; read / read-all; preferences off → no IN_APP row.
  - Invite → link → accept sets the password and makes the user ACTIVE; reused / expired token rejected.
  - Forgot → generic reply + admin notification; reset via admin link revokes sessions.
  - Throttling on the public endpoints; history rows carry the real user (or the "password reset" label).
- **Visual:** headless-Edge screenshots of `/today`, `/notifications`, `/login/forgot`, `/dashboard` vs the template (light / dark / mobile).
- **Static checks:** tsc (app + server), lint, lint:arch, delivery:roadmap.
- If the shared :3000 watcher is still stale, test on an API-only copy + proxy (Phase 28 recipe).

## 7. Risks
- No mail provider: self-service password reset depends on an admin until a provider is added.
- The dashboard scope depends on which template widgets have data.
- The approval hook touches a shared engine used by several phases; the earlier suites need a re-run (P16, P18, P19).
