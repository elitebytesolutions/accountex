---
name: phased-delivery
description: Generic standard for database-driven, phase-by-phase delivery of a business application. Plan 3–5 entities per phase (masters before transactions), map each to existing HTML templates, design the Clean Architecture flow, get approval, implement CRUD with user-attributed row history (audit) and error codes, verify, and request acceptance. Use when a project skill (e.g. `next-phase`) binds it, or when asked to plan/execute work "phase by phase" for entities. Contains no project-specific paths; project skills supply them.
---

# Phased delivery standard

You are the software architect and full-stack lead. This standard is project-agnostic. A **project binding** (a project skill such as `next-phase`) supplies the concrete values for every `‹slot›` below. If no binding exists, ask for the missing slots before planning.

| Slot | Meaning |
|---|---|
| ‹roadmap› | where the phase/entity roadmap and each phase's progress status live (and how they are validated/regenerated) |
| ‹schema-source› | how to read the real database schema and how to change it safely |
| ‹templates› | folder of the HTML templates and how routes/tabs are identified |
| ‹stack› | frontend/backend frameworks, layer layout, contracts location |
| ‹audit› | how every application insert/update/delete records who did it and keeps the row's history |
| ‹errors› | error-code catalogue and error log conventions |
| ‹permissions› | permission model and guards |
| ‹verify-kit› | typecheck/lint commands, DB queries, visual comparison tooling |

## 1. Planning only on "next phase"

When the user says **"next phase"**:
1. Read ‹roadmap›. If a phase is `in-progress` (implemented but not yet accepted), **report that first** and finish or close it. Don't plan a new one.
2. Read the project instructions, architecture decisions, ‹schema-source›, existing implementation and ‹templates› for the next `planned` phase.
3. Produce the phase plan (section 5). **Do not implement, change the database, or modify application data** until the user approves that exact phase **and revision**.

Use only verified information: real table/column names from the database, real template files. List missing access and unresolved decisions explicitly.

## 2. Entity selection

- **3–5 new business entities per phase**, chosen by dependency, complexity and business relevance.
- **Masters first:** every in-scope master is accepted before transactional entities are selected. A blocked master is resolved before moving on.
- Plan batch sizes so no 1–2 entity tail remains. If one is unavoidable, ask for an explicit **final-batch exception**.
- Never pad a batch with unrelated transactions or already completed entities.
- Keep the entity inventory in ‹roadmap› current:
  - entity and backing tables;
  - master/transactional;
  - dependencies;
  - templates and pages;
  - phase and status.

## 3. Template mapping

- Select the exact HTML template for each entity's list, create, view and edit experiences.
- Record source paths, routes, tabs and the proposed pages/components/drawers/modals.
- **Missing templates are reported as open questions, never invented.**
- Reproduce the design faithfully: typography, spacing, colours, icons, tables, forms, overlays, responsive behaviour.
- Never modify the original templates.
- Every page has loading, empty, validation, success, error and permission states.

## 4. Clean Architecture flow (define before coding)

`UI → server adapter → application use case → domain rules + repository interface → infrastructure/database → response DTO → UI`

- **Domain** is pure: no framework, ORM or database imports.
- **Application** holds the use cases and depends only on ports.
- **Infrastructure** implements the ports.
- **Server adapters** handle request parsing, authentication, the permission guard and the user context for audit.
- Before pages, define:
  - contracts and validation;
  - permissions;
  - relationships;
  - filtering, pagination and sorting;
  - optimistic concurrency;
  - error codes;
  - delete vs deactivate rules.

## 5. Phase plan (use `references/phase-plan-template.md`)

Every plan contains:
1. Phase number, revision, objective, exact entity count.
2. Selected entities and the dependency rationale.
3. Verified schema details and unresolved questions.
4. HTML → page mapping.
5. Clean Architecture modules and responsibilities.
6. API/action contracts and CRUD behaviour.
7. Database changes, if any, in the project's safe change mechanism.
8. Audit: which tables get row history, and how the user is attributed.
9. Ordered implementation tasks.
10. Functional and visual verification.
11. Acceptance criteria, risks, blockers.

End by asking for approval of **that exact phase and revision**. Changes after review create a new revision.

## 6. Implementation order (after approval)

Mark the phase `in-progress` in ‹roadmap›, then:
1. Convert the selected templates into pages using the agreed contracts and clearly marked temporary fixtures.
2. Build domain rules, use cases, repositories, persistence and endpoints.
3. Connect the pages to the real backend.
4. Finish persisted create, read/list, update and the approved delete/deactivate.
5. Audit (section 7) on every table the phase touches.
6. Verify the full flow (section 8).

Preserve constraints, permissions, relationships and history. For transactional entities, respect posting, approval, reversal and immutability: posted data is corrected only by reversal.

## 7. Application audit: who changed which row

Every **insert, update and delete made through the application** is logged in the database, **atomically with the change**, keeping the row's history:
- **who:** the user's ID plus a snapshot of their name/email at that moment. Taken from the verified session, **never from client input**. Scripts and jobs are logged as `system: <name>`, never left blank.
- **what:** action, table, record ID/label, the changed fields (before → after), and the full row at that version.
- **where/when:** IP, user agent, session, correlation ID, timestamp.

Audit rows are append-only. Each entity's detail page shows a **History** tab of these versions.

Secrets are excluded and sensitive values redacted. Every table in a phase must be covered before the phase is done.

Error responses carry a catalogue code, HTTP status and correlation ID (‹errors›). Each new error a phase introduces is added to the catalogue in that phase.

## 8. Verify, request acceptance, stop

For every entity, demonstrate:
- working CRUD, persisted after reload;
- validation and error codes/HTTP statuses;
- permissions (allowed and denied);
- relationship handling;
- **history rows showing the real user** for insert, update and delete.

Visually compare each page with its template under matching conditions. **Never claim pixel-perfect without a visual comparison.** Report the actual results and every outstanding deviation, then **stop and ask for acceptance**.

Only after the user accepts is the phase marked `done` in ‹roadmap›. The next "next phase" starts again at step 1.
