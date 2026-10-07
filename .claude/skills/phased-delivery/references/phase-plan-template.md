# Phase ‹N› rev ‹R› — ‹title›

**Objective:** ‹one paragraph›
**Entities (‹count›, ‹MASTER|TRANSACTIONAL›):** ‹entity› · ‹entity› · ‹entity›
**Status before this plan:** ‹roadmap status table; confirm no other phase is in progress›

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|

## 2. Verified schema
Per entity:
- tables;
- key columns and constraints (unique, check, FK);
- lookup-validated columns;
- triggers (stamp/touch/audit);
- missing audit triggers.

Unresolved questions:
- ‹question› → ‹proposed answer / who decides›

## 3. Template → page mapping
| Entity | Template file · route/tab | Page / component | Pattern (list, drawer, modal, detail tabs) | States covered |
|---|---|---|---|---|

Missing templates: ‹list, never invented›

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | | |
| Domain | | |
| Application (use cases) | | |
| Infrastructure | | |
| Server adapter | | |
| UI (feature + page) | | |

## 5. API / action contracts
| Method & path | Request | Response | Permission | Errors (code → HTTP) |
|---|---|---|---|---|

Delete vs deactivate:
Concurrency:
Pagination, filters, sort:

## 6. Database changes
‹SQL file name, idempotent, what it adds (audit triggers, error codes, lookups, constraints)› or "none".

## 7. Audit (row history)
- **Tables covered by the audit trigger:** ‹list; add missing ones in the phase SQL›
- **User attribution:** ‹how the mutation runs with the verified user; what is snapshotted›
- **History view:** ‹History tab / endpoint per entity›

## 8. Ordered tasks
1. Pages from templates with marked temporary fixtures
2. Domain, use cases, repositories, endpoints
3. Wire pages to the backend
4. Complete CRUD and delete/deactivate
5. Audit logging
6. Verification

## 9. Verification
- **Functional:** per entity CRUD + reload, validation, permissions (allowed and denied), relationships, audit rows, error codes.
- **Visual:** screenshots of the page vs the template at the same viewport and data.

## 10. Acceptance criteria, risks, blockers

---
**Approve Phase ‹N› revision ‹R› for implementation?**
