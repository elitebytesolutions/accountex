# Business-logic gap register

Severity: **P0** blocks safe production use; **P1** blocks reliable module release; **P2** is important before broad rollout. Status reflects repository evidence on 2026-10-02, not an assumption about an external backend.

| ID | Severity | Gap / evidence | Business risk | Required closure |
|---|---|---|---|---|
| GAP-01 | P0 | The UI is static/client-side prototype. `src/` contains fixture-driven JavaScript and no application data API calls were found. | Screens can appear to post/approve without durable, secure transaction processing. | Implement authenticated API/service layer, transactional database access, idempotency keys and server-side validation for every mutation. |
| GAP-02 | P0 | At validation, `erp-full/database/schema/` has 10 schema files but is still missing contracted module schemas such as Platform, Fixed Assets, Purchase, HR, ESS and Reporting (the contract lists 01–14). | Several visible modules lack an actual repository schema implementation. | Implement/version all contracted schema and FK files, views, RLS and seed migrations before module release. |
| GAP-03 | P0 | Tenant/role/branch behaviour is routed in UI; it is not evidence of enforced server authorisation. | Cross-tenant data exposure or unauthorised financial actions. | Enforce tenant context + RLS + API authorisation; test direct API denial (TC-AUTH-04, TC-CTRL-01/02). |
| GAP-04 | P0 | Approval controls are UI workflow screens, not demonstrated transactional gates. | Users can bypass approval or self-approve by calling a backend endpoint directly. | Central approval service with policy snapshot, SoD, delegation, threshold conditions, concurrency control and posting gate. |
| GAP-05 | P0 | Financial/stock posting integrations are documented in the contract/UI but not implemented end to end. | GL, stock, tax, AP/AR and cash can diverge. | Implement atomic posting handlers plus reversal/idempotency/reconciliation tests for each source document. |
| GAP-06 | P0 | UI deletion/undo interactions commonly hide rows in browser state; no server retention policy is evidenced. | Apparent deletes/reversals may remove audit trail or differ from accounting requirements. | Soft-delete only eligible masters; prohibit document hard delete; controlled void/reverse with immutable audit. |
| GAP-07 | P1 | SQL contract has encoding corruption in displayed glyphs (for example arrows/symbols shown as mojibake). | Migration/document misunderstanding and data-quality defects. | Normalise all SQL/Markdown to UTF-8, add migration lint and CI encoding check. |
| GAP-08 | P1 | The repository contains a partial set of Full schema/FK files, but entity maps, posting rules and scope files referenced by the contract are absent from the visible `erp-full` tree. | Developers cannot trace every screen to exact persistence/posting design. | Create module entity maps, `POSTING_RULES.md`, `SCOPE.md`, views and corresponding migrations; link to this folder. |
| GAP-09 | P1 | Import, FBR, biometric, bank statement, POS, Shopify/Daraz, API key and webhook screens are prototype integrations. | Duplicate transactions, missing statutory submissions, insecure external access or unreconciled imports. | Define adapter contracts, credential vaulting, signatures, rate limits, import hashes, retries/dead-letter queues and reconciliation ownership. |
| GAP-10 | P1 | Payroll and statutory calculation parameters/versioning are not evidenced as executable rules. | Incorrect net pay/tax, legal and employee-trust risk. | Effective-date salary/tax/leave/OT policies; immutable payroll input snapshots; independent payroll test pack and finance sign-off. |
| GAP-11 | P1 | Dashboards and report studio are presentation shells/fixture data rather than verified reporting views. | Management reports may not reconcile to books or respect scope. | Define materialised/query views, period/as-of semantics, reconciliation controls, schedules and report access rules. |
| GAP-12 | P1 | Backup/restore is a screen concept; no operational recovery workflow is evidenced. | Irrecoverable tenant data loss or unsafe overwrite. | Encrypted backups, retention, restore authorisation, tenant isolation, tested RPO/RTO and audit/migration compatibility checks. |
| GAP-13 | P1 | Document/attachment storage, malware checks and retention are not evidenced. | Missing audit evidence, PII leakage or unsafe uploads. | Object storage contract, antivirus/content validation, immutable references, access checks and retention/legal-hold policy. |
| GAP-14 | P2 | Mobile route is present but no offline conflict or device-security rules are specified. | Duplicate field transactions / insecure cached data. | Define mobile authentication/session expiry, offline queue/idempotency/conflict policy and wipe/storage controls. |
| GAP-15 | P2 | No observable test/CI suite is present for the documented critical workflows. | Regressions will reintroduce financial, tenant or payroll defects. | Add migration tests, API/contract tests, workflow E2E tests and reconciliation test fixtures; gate deployment. |

## Recommended remediation sequence

1. Close GAP-01 through GAP-06 before exposing a tenant to real financial, payroll or inventory data.
2. Deliver shared identity/RLS/audit/approval/sequence services and the accounting posting engine first.
3. Implement inventory and sales/purchase posting as atomic vertical slices, then validate treasury/tax and period close.
4. Implement HR/payroll/ESS only with effective dating, privacy controls and a separately approved statutory ruleset.
5. Add integrations/reporting/backups after their underlying ledger and observability controls are verified.

## Decisions required from business owners

- Is negative stock ever allowed, and per warehouse/channel which approver may override it?
- Does stock/accounting recognition occur at GRN or vendor bill; at delivery challan or invoice; and which costing method applies?
- What are approval thresholds, delegation/SoD rules and permissible emergency overrides?
- What are credit limit, over-delivery, purchase tolerance, return and cheque-bounce policies?
- Which Pakistan tax/payroll rules, effective dates, filing outputs and retention periods are authoritative?
- What RPO/RTO, PII/privacy, attachment retention and tenant deletion/archive rules apply?
