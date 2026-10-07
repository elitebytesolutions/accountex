# Phase 0 rev 1: Foundation

**Objective:** Build what every later phase relies on:
- every insert/update/delete from the app keeps a user-attributed row history;
- errors have catalogue codes, HTTP statuses and a stored log;
- a shared CRUD contract and API permission guard;
- the template-faithful workspace shell;
- a fix for the shared rate-limit bucket.

**Entities:** 0 business entities. This is the roadmap's approved foundation exception.

**Status before this plan:** ROADMAP shows every phase `planned`; nothing is in progress.

---

## 1. Selection rationale
Phase 1 (Company core) cannot start without these. Its pages need the shell and UI kit, its mutations need user attribution, and its validation needs error codes.

## 2. Verified schema (live DB, 2026-10-03)
**Audit tables**
- **`Company.AuditTrailEntries`**
  - partitioned by RANGE (`occurredAt`), 5 partitions; RLS forced, policy `tenantIsolation`;
  - columns: `id` bigint, `tenantId` uuid **NOT NULL**, `occurredAt`, `userId`, `actorEmail` citext, `action` (validated by lookup), `schemaName`, `tableName`, `recordId` uuid, `recordLabel`, `module`, `changes` jsonb, `ipAddress`, `userAgent`, `sessionId` uuid, `entryHash` bytea;
  - triggers: `auditLogAppendOnly`, `auditLogHash` (sha256 over 12 fields), `validateLookups`;
  - holds **4,403 rows**, all with `userId` NULL (from seeding).
- **`Platform.PlatformAuditLogs`**: `staffUserId`, `actorLabel`, `action`, `tenantId`, `details`, `payload`, `ipAddress`, `result`, `category`, `actorDetail`, `eventHash`. 0 rows.

**Audit trigger functions**
- **`Company.triggerAudit`** (299 tables):
  - INSERT stores the full new row, DELETE the full old row, UPDATE only the changed fields;
  - **skips rows without `tenantId`**;
  - never sets `actorEmail`, `userAgent`, `sessionId` or the record label;
  - Platform schema rows go to `PlatformAuditLogs`.
- **`Company.triggerAuditRedacted(cols…)`** strips secret columns on 4 tables: `Users` (passwordHash, mfaSecretEnc, mfaRecoveryCodes), `UserMfaMethods` (secretEnc), `ApiKeys` (keyHash), `IntegrationWebhooks` (signingSecretEnc). Same gaps otherwise.

**Session-setting helpers**
- `Company.getCurrentUserId()` reads `app.userId`.
- `Company.getCurrentTenantId()` reads `app.tenantId` (errors if unset).

**Error tables**
- No error catalogue or error log exists.
- No `ErrorCategory` lookup exists.

**App code**
- `PrismaService` is a plain `PrismaClient`; nothing sets `app.*`.
- `RequestIdMiddleware` already creates or reuses `x-request-id` (any `[\w-]{1,100}`, so the correlation ID is **text**, not uuid).
- `DomainExceptionFilter` maps 5 error classes to HTTP and returns no correlation ID.
- `ThrottlerGuard` keys by IP; SSR calls come from `127.0.0.1`.

**Unresolved:** none blocking. Decisions taken below are marked ✱.

## 3. Template → shell mapping
| Piece | Template source | Next.js |
|---|---|---|
| Fonts, icons, tokens | `00-head.html` (Plus Jakarta Sans, Lucide 0.469), `10-styles.css` `:root` + `[data-theme=dark]` tokens | `next/font` Plus Jakarta Sans; `lucide-react` (**new dependency**); tokens as CSS variables in `globals.css`, mapped to Tailwind v4 `@theme` |
| Shell layout | `20-shell-open.html`, `80-shell-close.html`, `99-app.js` (`renderSidebar`, `renderTopbar`, crumbs) | `src/app/(app)/layout.tsx` + `src/features/shell/*`: sidebar (brand, search menu, groups/modules from `nav.ts`), topbar (crumbs, search, notifications button, theme toggle, the existing user menu), content area |
| UI kit used by Phase 1+ | `10-styles.css`, `15-polish.css`, `95-ui.js` (toast, drawer, sheet, tabs, badges, tables, form grid) | `src/components/ui/*`: `PageHead`, `Panel`, `DataTable` (sort, pagination, empty/loading/error), `Drawer`, `Tabs`, `Badge`, `Field` / `Input` / `Select` / `Textarea`, `Button`, `Toast` provider, `EmptyState`, `ErrorState`, `ConfirmDialog` |
| State screens | `60-settings-ess.html` `app/404`, `app/unauthorized`, `app/states` | `src/app/(app)/not-found.tsx`, `/unauthorized`, `error.tsx` |

Only **structure and styling** in this phase. The sidebar shows only screens that exist (Dashboard; later phases add theirs).

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/common/list-query.ts`, `api-error.ts` (+ `correlationId`), `src/shared/common/history.ts` | List query (search, filters, page, pageSize ≤ 100, sort) and `{ items, total }`; error body; history item DTO |
| Domain | `src/server/core/domain/errors.ts` | `DomainError(code, message, details)`: the catalogue code drives the HTTP status, so the existing subclasses stay as shortcuts |
| Application ports | `core/application/ports/audit-context.ts`, `error-catalogue.ts`, `error-log.ts`, `record-history.ts` | Use cases depend on these, never on Prisma |
| Infrastructure | `infrastructure/prisma/prisma.service.ts` `withContext()`; `infrastructure/errors/{catalogue,error-log,sqlstate-map}.ts`; `infrastructure/audit/prisma-record-history.ts` | Session settings + transaction; catalogue cache; error log writer (own connection, outside the failed transaction); `getRecordHistory` call |
| Server adapter | `common/context/request-context.ts` (built from the verified JWT user + request), `common/guards/permission.guard.ts` + `@RequirePermission()`, `common/filters/domain-exception.filter.ts`, `common/guards/throttler-by-user.guard.ts` | Trusted actor; permission check from `SessionUser.permissions`; error mapping + logging; per-user throttle buckets |
| UI | `src/features/shell/*`, `src/components/ui/*`, `src/features/history/history-tab.tsx` | Shell, kit, reusable History tab |

## 5. API / action contracts
| Method & path | Response | Permission | Errors |
|---|---|---|---|
| `GET /api/history/:schema/:table/:id?page&pageSize` | `{ items: HistoryItem[], total }`: version, action, at, actor { id, name, email }, changes, row | the record's own `view` permission, via a per-table resource map (added per phase) | 403 `PERMISSION_DENIED`, 404 `HISTORY_TABLE_UNKNOWN` |
| `POST /api/auth/login` (existing, **demonstration mutation**) | unchanged | public | unchanged codes, now from the catalogue |

On a successful login, `Users.lastLoginAt` / `lastLoginIp` / `failedLoginCount = 0` are updated inside `withContext`. A failed login increments `failedLoginCount`. This gives Phase 0 one real, user-attributed application mutation to verify, and is useful anyway.

Concurrency contract for later phases: `rowVersion` in the PATCH body; a stale version → 409 `CONCURRENCY_CONFLICT`.

## 6. Database changes: `prisma/sql/005-row-history.sql` (idempotent, added to `db:sql`)
1. **`AuditTrailEntries`:**
   - add `rowData jsonb`, `rowVersion int`, `actorName text`, `correlationId text`, `hashVersion smallint NOT NULL DEFAULT 1`;
   - make `tenantId` **nullable** (global rows);
   - index `(correlationId)`.
2. **`Company.writeAuditEntry(op, schema, table, old, new, secretCols)`:** one internal function used by both triggers. It:
   - computes the diff (ignoring `updatedAt/updatedBy/rowVersion`);
   - redacts secret columns to `[redacted]`;
   - snapshots `actorName`/`actorEmail` from `Company.Users` for `app.userId`. Without a user it uses `actorName = 'system: ' || app.actorLabel`, or `'system'`;
   - reads `app.correlationId/userAgent/sessionId/clientIp`;
   - takes `recordLabel` from the first of `name`, `fullName`, `displayName`, `code`, `title` present in the row;
   - stores `rowData` (full row after change, old row for DELETE, secrets redacted);
   - **logs rows without `tenantId`** (as `tenantId` NULL);
   - writes Platform-schema rows to `PlatformAuditLogs` (`payload` = changes, `actorDetail` = name/email, `eventHash` unchanged mechanism).
3. **`triggerAudit()` / `triggerAuditRedacted()`:** `CREATE OR REPLACE` so they delegate to `writeAuditEntry`. Same names, so all 303 existing triggers keep working.
4. **`triggerAuditLogHash`** ✱: rows with `hashVersion = 2` hash the 12 old fields plus `rowData`, `actorName`, `correlationId`, `userAgent`, `sessionId`. The existing 4,403 rows keep version 1 and stay verifiable.
5. **`Company.getRecordHistory(schema, table, recordId, limit, offset)`:** returns versions newest-first. `rowVersion` comes from `rowData`, or the entry order when absent.
6. **`Lookups.Lookups` / `Lookups.LookupColumns`:** attach `triggerAudit` (global rows now logged).
7. **Errors:**
   - lookup `ErrorCategory` (VALIDATION, AUTH, PERMISSION, NOT_FOUND, CONFLICT, BUSINESS_RULE, RATE_LIMIT, DATABASE, INTERNAL);
   - `Platform.ErrorCodes` (`code` PK, `httpStatus`, `category`, `module`, `userMessage`, `description`, `isLogged`, `isActive`);
   - append-only `Platform.ErrorLogs` (`occurredAt`, `tenantId`, `userId`, `correlationId`, `method`, `path`, `httpStatus`, `errorCode`, `message`, `details jsonb`, `sqlState`, `stackHash`), with indexes `(tenantId, occurredAt)`, `(userId, occurredAt)`, `(errorCode, occurredAt)`;
   - both get `triggerAudit` and `validateLookups`.
8. **Seed codes:**
   - `VALIDATION_FAILED` 400, `AUTH_INVALID_CREDENTIALS` 401, `UNAUTHORIZED` 401, `PERMISSION_DENIED` 403, `FORBIDDEN` 403, `NOT_FOUND` 404, `HISTORY_TABLE_UNKNOWN` 404, `CONFLICT` 409, `CONCURRENCY_CONFLICT` 409, `USER_EMPLOYEE_ROLE_REQUIRED` 409, `TOO_MANY_REQUESTS` 429, `INTERNAL_ERROR` 500;
   - DB defaults: `DB_UNIQUE_VIOLATION` 409 (23505), `DB_FOREIGN_KEY_VIOLATION` 409 (23503), `DB_CHECK_VIOLATION` 422 (23514), `DB_NOT_NULL_VIOLATION` 422 (23502), `DB_APPEND_ONLY` 403 (42501).
9. **`003-employee-self-service.sql`:** `triggerKeepEmployeeRole` raises with `HINT = 'USER_EMPLOYEE_ROLE_REQUIRED'`.

Rollback: the current definitions of the 3 functions are saved first to `prisma/sql/backup/audit-functions.before-005.sql`.

## 7. Audit (row history)
- **Tables covered:**
  - the 299 + 4 audited tables gain user name/email, full row, correlation ID, user agent and session;
  - `Lookups.*`, `Platform.ErrorCodes`, `Platform.ErrorLogs` are added;
  - the other 160 unaudited tables are covered in the phase that builds their entity (ROADMAP lists them).
- **User attribution:** the server builds the context from the **verified JWT user** (id, tenant), the request ID, IP, user agent and session. No client-supplied actor is read.
  - `withContext` runs `set_config(..., true)` (transaction-local) and the mutation in **one** interactive transaction, so the change and its history commit or roll back together.
  - The same transaction sets `app.tenantId` for RLS.
- **History view:** reusable `HistoryTab` component plus `GET /api/history/...`. Phase 1+ detail pages mount it.

## 8. Ordered tasks
1. Back up the 3 audit function definitions → write and apply `005-row-history.sql` → `npm run db:sql` twice (idempotent).
2. `withContext` + request context + per-user throttler. Login/failed-login updates `Users` through it.
3. Error catalogue cache, `DomainError(code)`, exception filter (catalogue status, SQLSTATE/HINT mapping, `correlationId` in the body, `ErrorLogs` written outside the failed transaction, `stackHash` for 5xx, redaction).
4. Shared list/history contracts, `@RequirePermission` guard, `GET /api/history/...`.
5. Shell + UI kit + state screens from the template (`lucide-react`, Plus Jakarta Sans, tokens, light/dark).
6. Verification; set Phase 0 `status: "done"` only after your acceptance.

## 9. Verification
**Database:**
- **Login history:** log in as the seeded admin → an `AuditTrailEntries` UPDATE row on `Users` with your user ID, your name and email, the request's `correlationId`, IP, user agent, `rowData` without `passwordHash` (redacted), and `hashVersion` 2.
- **Insert / update / delete** on a scratch row through `withContext` (rolled back after reading) → three rows with full `rowData`, the user and before/after.
- **Global rows:** a change to a `Lookups` row is logged with `tenantId` NULL.
- **Existing rows:** the 4,403 v1 rows are unchanged and their hashes still verify.
- **Append-only:** `AuditTrailEntries` and `ErrorLogs` reject UPDATE and DELETE.

**API:**
- bad password → 401 `AUTH_INVALID_CREDENTIALS` + `correlationId` + one `ErrorLogs` row with that user ID;
- bad body → 400 `VALIDATION_FAILED` with field details;
- `/api/history/...` without permission → 403 `PERMISSION_DENIED`;
- forced unique violation → 409 `DB_UNIQUE_VIOLATION` (no SQL leaked);
- unhandled exception → 500 `INTERNAL_ERROR` with `stackHash` stored;
- 200 dashboard page loads in a row do not trip 429 (the per-user bucket fix).

**Visual:** headless-Edge screenshots of `/dashboard` (shell) and the UI-kit states vs `template/index.html#/app/dashboard` / `#/app/states`, light and dark, at 1400×900 and 390×844. Deviations are listed, not hidden.

**Build:** typecheck (web + server), lint, `npm run delivery:roadmap`.

## 10. Acceptance criteria, risks, blockers
- **Accept when** every verification item above is shown with real output.
- **Risk:** changing `triggerAudit` affects 303 tables at once. Mitigations: backup file, idempotent SQL, regression check on an existing audited table, hash-chain versioning.
- **Risk:** the shell is the largest piece. Scope is limited to the shell and the kit Phase 1 needs; other widgets come with their phases.
- **New dependency:** `lucide-react` (template icon set).
- **Not in scope:** any business entity, the Audit Trail settings screen (Phase 35), and the Super Admin shell restyle (Phase 36).

---
**Approve Phase 0 revision 1 for implementation?**
