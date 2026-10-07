---
name: next-phase
description: Accountex delivery workflow. Use when the user says "next phase" (or asks to plan, continue, verify or accept a delivery phase). Binds the generic `phased-delivery` standard to this repo, covering the roadmap in docs/delivery, the DB-first PostgreSQL schema, template/src HTML, NestJS + Next.js Clean Architecture, and DB-trigger row history (who changed what) for every CRUD operation, then plans the next pending phase for approval.
---

# Next phase (Accountex)

**Load and follow the `phased-delivery` skill.** This file only supplies the Accountex values for its slots and the project rules on top.

## Start every time
1. Open `docs/delivery/ROADMAP.md`. The summary table shows each phase's status. If one is `in-progress`, report it first.
2. Read that phase's section: entities, tables, missing audit triggers, templates, pages, endpoints, rules, dependencies, open questions.
3. Read `AGENTS.md` (Next.js 16: check `node_modules/next/dist/docs/` before writing Next code) and the memory files.
4. Plan with `.claude/skills/phased-delivery/references/phase-plan-template.md`. In plan mode, write only the plan file.

## Slots
| Slot | Accountex value |
|---|---|
| ‹roadmap› | Data in `docs/delivery/roadmap/*.ts` (masters, transactions, admin, `NOT_ENTITIES`, `FOUNDATION_TASKS`; each phase has `status: planned \| in-progress \| done`). `npm run delivery:roadmap` validates tables, routes, tabs, permissions and dependency order against the live DB and `template/src`, then regenerates `docs/delivery/ROADMAP.md`. Never hand-edit the `.md`. |
| ‹schema-source› | Live PostgreSQL 18 `accountex` on `localhost:5434`, credentials in `.env`. The database is the source of truth. **Never run `prisma migrate`**: it would offer to wipe this DB. Changes go in a new idempotent `prisma/sql/NNN-*.sql` added to `npm run db:sql`. Map the tables you need into `prisma/schema.prisma` by copying from a scratch `prisma db pull` (Prisma 7.10 pulls partial unique indexes as invalid 1:1 relations, so fix list relations by hand). No enums: fixed lists are `Lookups.Lookups` rows registered in `Lookups.LookupColumns` (tone ∈ good/warn/danger/info/neutral/violet). System lookup rows can't be deleted, only deactivated. Never delete lookups by name prefix (e.g. `Delivery*` includes real challan lookups). |
| ‹templates› | `template/src/*.html` (sections `data-route="app/…"` / `"admin/…"`, tabs `data-tab`), styles `10-styles.css` + `15-polish.css` + feature CSS, behaviour in `9x-*.js`. Rebuild preview with `powershell -File template/build.ps1`. Never edit templates for app work. |
| ‹stack› | One server: NestJS API under `/api` (`src/server`) + Next.js pages (`src/app`, `src/features`). Shared Zod contracts in `src/shared` (`.ts` import extensions). Server modules use `src/server/modules/<module>/<entity>/{domain,application,infrastructure,presentation}`; enforced by `npm run lint:arch`. Routes: template `#/app/x/y` → `/x/y`, `…/view` → `…/[id]`. My Profile is `/profile/*`, reached only from the header user menu. Super Admin is `/admin/*` (separate JWT, single user). |
| ‹audit› | Every insert/update/delete from the app runs in `PrismaService.withContext({ userId, tenantId, correlationId, clientIp, userAgent, sessionId })` (built in Phase 0). It sets `app.*` settings in the same transaction. The DB trigger `Company.triggerAudit` writes `Company.AuditTrailEntries`: user ID + name/email snapshot, action, table, record, `changes` (before/after), `rowData` (full row version), IP, user agent, session, correlation ID, time. It's append-only and indexed by user and by record. `Company.getRecordHistory` backs `GET /api/history/:schema/:table/:id` and the reusable `HistoryTab` (`src/features/history`); register each new table with its view permission in `src/server/modules/history/application/history-tables.ts`. Use cases take `UnitOfWork` (`core/application/ports/unit-of-work.ts`) and repositories use `prisma.db()` (a method: Prisma's client is a Proxy). Every table in a phase must carry `triggerAudit`; ROADMAP lists the missing ones, which you add in the phase SQL. |
| ‹errors› | `Platform.ErrorCodes` catalogue + append-only `Platform.ErrorLogs` (Phase 0). Triggers raise with `HINT = '<CODE>'`. Responses carry `{ error: { code, message, details }, correlationId }`. Add each new code to the phase SQL. |
| ‹permissions› | `Company.Permissions` codes `resource:action` granted via `Company.RolePermissions`. Default grants for system roles live in `prisma/catalog.ts` (`npm run db:seed`). UI uses `requirePermission(code)` (`src/lib/session.ts`); the API uses the `@RequirePermission` guard (Phase 0). Every user has EMPLOYEE (DB trigger). |
| ‹verify-kit› | `npx tsc -p tsconfig.json --noEmit`, `npx tsc -p tsconfig.server.json --noEmit`, `npm run lint`, `npm run delivery:roadmap`, psql checks that history rows carry the real user. For visuals, use headless Edge over CDP (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe --headless=new --remote-debugging-port=…`): screenshot the Next page and `template/index.html#/<route>` at the same viewport. Test data only inside rolled-back transactions, or clean it up. |

## Phase status
- On approval, set the phase's `status: "in-progress"` in `docs/delivery/roadmap/*.ts` and run `npm run delivery:roadmap`.
- Set it to `"done"` only after the user accepts.

## Project rules that apply to every phase
- Minimal scope: build only the phase's entities. No tests unless asked. Structure-first plans without gap tables.
- Lookups, not enums. DB-first SQL, never migrate.
- The tenant is the main record: never insert `Company.Users` without a tenant, and create tenants only through `Platform.provisionTenant` (tenant → system roles → default user holding every role). The default user (`Tenants.defaultUserId`) is locked: all roles, always ACTIVE, never deleted.
- Scope changes: edit `docs/delivery/roadmap/*.ts`, then run `npm run delivery:roadmap` (it must pass).
- HR URLs are for HR staff work only. Self-service lives under My Profile.
- "Audit" in this project means application row history (who changed which row), not tracking of the development process.
- Report deviations and unverified claims honestly in the acceptance request.
