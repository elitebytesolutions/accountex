# Finsoft business logic baseline

This folder is the functional baseline for the Finsoft ERP prototype. It turns the behaviours visible in the workspace into implementation-ready business rules, end-to-end scenarios, acceptance tests, dependencies and delivery gaps.

## Scope and evidence

The source of truth for screen coverage is the built [index.html](../index.html); it contains 193 valid routes: 28 Platform Admin, 145 Company Workspace, 17 ESS, plus chooser, login and mobile. The build order in [build.ps1](../build.ps1) shows that `index.html` is assembled from `src/` partials. Navigation is defined in [src/90-nav.js](../src/90-nav.js). The relational target model and naming conventions are defined in [erp-full/database/CONTRACT.md](../erp-full/database/CONTRACT.md) and its Basic-edition counterpart.

Important interpretation: this is a UI prototype, not a completed transactional system. Most screens use fixture data and client-side interactions; `localStorage` is used for selected preferences and calculator/COA state, and no application API calls were found in `src/`. Statements marked **Target rule** describe the required production behaviour inferred from the UI and schema contract. Statements marked **Implemented DB control** correspond to SQL that exists in the repository. Treat all other behaviour as a specification until a service/API implements it.

| Document | Use it for |
|---|---|
| [MODULE_CATALOG.md](MODULE_CATALOG.md) | Route-to-module coverage, ownership and intended records |
| [WORKFLOWS.md](WORKFLOWS.md) | Cross-module workflow definitions and state transitions |
| [SCENARIOS_AND_TEST_CASES.md](SCENARIOS_AND_TEST_CASES.md) | BDD scenarios and executable acceptance-test inventory |
| [MODULE_DEPENDENCIES.md](MODULE_DEPENDENCIES.md) | Upstream/downstream data and posting dependencies |
| [GAP_REGISTER.md](GAP_REGISTER.md) | Known prototype-to-production gaps, risks and priorities |

## Shared operating rules

1. Every tenant-owned record is tenant-scoped. Cross-tenant access is prohibited; branch scope applies where a document or master has a branch.
2. Documents receive their number from the configured document sequence and remain auditable. Posted financial documents must never be edited or hard-deleted; correct them with an authorised reversal, return, debit note or credit note.
3. A posting must be atomic: validate permission, approval state, fiscal period/module lock, all business validations, source-state eligibility, journal and stock consequences; then commit or roll back everything.
4. Financial journals must balance exactly: total debit = total credit. Inventory movements must preserve a trace to their source document, warehouse/bin/batch and quantity basis.
5. Approval, segregation-of-duties, attachment, credit-limit, tax and quantity rules are evaluated before posting—not merely shown as UI hints.
6. Financial reports, dashboards and ageing are read models. They may only read posted/valid transactions in the selected tenant, date range and branch scope.
7. All material creates, changes, approvals, postings, reversals, imports, integration calls and privileged access must write an immutable audit event with actor, time, record and before/after or action context.

## Status vocabulary

Use the following lifecycle terms consistently in service contracts and tests. A module may add narrowly scoped states, but it must document them.

`DRAFT → PENDING_APPROVAL → APPROVED → POSTED → PARTIALLY_SETTLED → SETTLED`

Terminal or exceptional paths are `REJECTED`, `CANCELLED/VOID`, `REVERSED`, `RETURNED`, `BOUNCED`, and `EXPIRED`. “Overdue”, “Partially paid” and similar labels are normally derived from due date and outstanding balance, not mutable source-of-truth states.

## Delivery order

Build the shared platform and control plane first, then the accounting spine, master data/inventory, commercial flows, workforce/ESS, and finally reporting/integrations. The dependency diagram and release gates are in [MODULE_DEPENDENCIES.md](MODULE_DEPENDENCIES.md). The SQL contract specifies the intended install order as schema `00` through `14`, foreign keys, views, RLS, then seed data.

## Maintenance rule

Whenever a screen, route, schema or workflow changes, update the matching module row, scenario/test IDs, dependency impact and gap status in this folder in the same pull request. A change is not functionally complete until its required tests pass and its audit/posting effects are documented.
