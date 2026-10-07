# Scenarios and acceptance test cases

Run these against an API/database-backed build, not the current fixture UI. Seed one tenant with at least two branches, two users/roles, active/inactive masters, an open and a locked fiscal period, taxable/non-taxable items, and realistic approval thresholds. Every successful or failed mutating case must be tenant-isolated and audited.

## Scenario matrix

| ID | Given / when / then | Acceptance test |
|---|---|---|
| SCN-01 | Given an invited tenant owner, when they complete password and MFA enrolment, then they can select only entitled tenant/branch contexts. | TC-AUTH-01 valid login, TC-AUTH-02 expired/reset token, TC-AUTH-03 MFA failure/rate limit, TC-AUTH-04 cross-tenant route/API denial. |
| SCN-02 | Given a plan with a feature limit, when platform staff changes entitlement, then evaluation is deterministic and the change is approved/audited before it takes effect. | TC-PLAT-01 create tenant/seed rollback, TC-PLAT-02 feature prerequisite, TC-PLAT-03 plan limit, TC-PLAT-04 staff impersonation audit. |
| SCN-03 | Given a user without permission or outside branch scope, when they request a screen or record, then access is denied without leaking data. | TC-CTRL-01 role denial, TC-CTRL-02 branch filter, TC-CTRL-03 self-approval/SoD denial, TC-CTRL-04 audit append-only. |
| SCN-04 | Given a valid journal draft, when it is posted in an open period, then exactly balanced immutable journal lines and audit activity are committed. | TC-ACC-01 balanced posting, TC-ACC-02 unbalanced rejection, TC-ACC-03 locked-period rejection, TC-ACC-04 authorised reversal. |
| SCN-05 | Given opening balances, when finance posts an opening batch, then total debit equals total credit and a second post is idempotently rejected. | TC-ACC-05 opening totals, TC-ACC-06 duplicate post, TC-ACC-07 inactive account rejection. |
| SCN-06 | Given imported bank lines and book entries, when a reconciliation is completed, then matched/unmatched lines, difference and close controls are retained. | TC-TRY-01 import dedupe, TC-TRY-02 allocation ceiling, TC-TRY-03 cheque bounce once-only, TC-TRY-04 cash-day lock. |
| SCN-07 | Given a quoted taxable item, when sales converts quote to order, dispatch and invoice, then credit, quantity, tax, stock, AR and GL effects reconcile. | TC-SAL-01 quote conversion, TC-SAL-02 price/tax snapshot, TC-SAL-03 credit hold/override, TC-SAL-04 invoice idempotency, TC-SAL-05 return/credit note. |
| SCN-08 | Given a POS sale, when tender is closed, then the shift is balanced and sale/payment/stock effects are not duplicated on retry. | TC-SAL-06 tender/change validation, TC-SAL-07 close-shift variance, TC-SAL-08 duplicate device submission. |
| SCN-09 | Given a purchase order, when goods are received and billed, then tolerance/duplicate bill rules and GRN-to-stock/AP/tax logic apply. | TC-PUR-01 approved PO, TC-PUR-02 over-receipt tolerance, TC-PUR-03 three-way match exception, TC-PUR-04 vendor invoice duplicate, TC-PUR-05 landed-cost allocation. |
| SCN-10 | Given a transfer/count/adjustment, when authorised stock movement posts, then source, destination, batch and balance records reconcile to the movement history. | TC-INV-01 UOM conversion, TC-INV-02 transfer in-transit, TC-INV-03 prohibited negative stock, TC-INV-04 count approval, TC-INV-05 expiry restriction. |
| SCN-11 | Given a route load sheet, when deliveries, returns and collections are settled, then stock, cash/cheques, customer balances and recovery items reconcile. | TC-DIST-01 allocation against availability, TC-DIST-02 settlement variance, TC-DIST-03 recovery allocation, TC-DIST-04 back-order release. |
| SCN-12 | Given an asset, when depreciation/disposal is run, then the book value, run idempotency and gain/loss journal are correct. | TC-FA-01 capitalisation mapping, TC-FA-02 monthly run idempotency, TC-FA-03 disposal calculation/approval. |
| SCN-13 | Given taxable sales, purchases or payroll, when a return is prepared, then tax rate snapshots, adjustments and export completeness can be proven. | TC-TAX-01 date-effective rate, TC-TAX-02 sales return reversal, TC-TAX-03 WHT payment allocation, TC-TAX-04 FBR export/retry audit. |
| SCN-14 | Given a new employee and planned roster, when punches/leave/OT are approved, then the payroll input snapshot reflects only approved, effective records. | TC-HR-01 effective-dated employee, TC-HR-02 device dedupe/time zone, TC-HR-03 attendance regularisation, TC-HR-04 leave overlap/balance, TC-HR-05 OT policy. |
| SCN-15 | Given a payroll run, when it is finalised, then components, loans, tax, net pay, payslip access, bank file and GL totals are complete and single-posted. | TC-PAY-01 eligibility snapshot, TC-PAY-02 calculation/rounding, TC-PAY-03 approval required, TC-PAY-04 one final run, TC-PAY-05 loan recovery, TC-PAY-06 final settlement. |
| SCN-16 | Given an ESS employee request, when it is approved/rejected/withdrawn, then the authoritative source record changes only on valid approval and the employee sees the correct result. | TC-ESS-01 own-data scope, TC-ESS-02 manager-chain, TC-ESS-03 stale action, TC-ESS-04 receipt attachment, TC-ESS-05 notifications. |
| SCN-17 | Given a close checklist, when a period/year closes, then all blocking exceptions are visible, further postings fail, and authorised reopen is finite/audited. | TC-CLOSE-01 unresolved blocker, TC-CLOSE-02 module lock, TC-CLOSE-03 reopen approval, TC-CLOSE-04 year-end dry run, TC-CLOSE-05 report reconciliation. |
| SCN-18 | Given imports, integrations, backups and reports, when failures/retries occur, then there is idempotency, minimal permissions, no data leakage and an observable audit trail. | TC-OPS-01 import error row, TC-OPS-02 webhook signature/retry, TC-OPS-03 least-privilege API key, TC-OPS-04 backup restore authorisation, TC-OPS-05 scheduled report scope. |

## Detailed test design

### Identity, tenancy and governance

| ID | Preconditions and action | Expected result |
|---|---|---|
| TC-AUTH-01 | Owner accepts a valid invite and completes MFA. | Password is stored only as a secure verifier; MFA challenge succeeds; session has tenant/user/branch scope and audit event. |
| TC-AUTH-04 | User from Tenant A requests a Tenant B record by URL/API identifier. | 404/authorised-safe denial; no record metadata in response; security event is logged. |
| TC-PLAT-01 | Provision a tenant with an intentionally invalid COA seed mid-process. | Entire provisioning transaction fails; no partially enabled tenant, subscription or seeded records remain. |
| TC-CTRL-03 | Preparer of a high-value payment attempts approval. | Request is rejected by SoD rule and remains pending for an eligible approver. |
| TC-CTRL-04 | Attempt update/delete on audit event using normal application credentials. | Operation fails; existing audit payload and chronology remain unchanged. |

### Accounting, banking and close

| ID | Preconditions and action | Expected result |
|---|---|---|
| TC-ACC-01 | Create open-period JV with two active accounts and equal debit/credit. Post twice concurrently. | One journal posts with exactly one number/audit trail; retry returns the same outcome or a safe duplicate response, never a second posting. |
| TC-ACC-02 | Submit JV where debit differs from credit by 0.01. | Validation fails before any journal line, tax or source state is committed. |
| TC-ACC-03 | Post a dated document in a closed period/module. | Posting guard rejects it, including source-module-generated journals. |
| TC-ACC-04 | Reverse a posted JV in an authorised open period. | New journal references original, swaps Dr/Cr, balances, cannot be duplicated, and original remains untouched. |
| TC-TRY-01 | Upload the same bank statement twice. | One import/file identity and one set of source lines; second upload is recognised/rejected without duplicate cash effect. |
| TC-TRY-03 | Bounce a deposited customer cheque, then retry its webhook/UI action. | Receipt allocation is reopened and reversal is created once; duplicate action is harmless. |
| TC-CLOSE-02 | Close cash day/period, then attempt back-dated cash voucher/posting. | New action is blocked; authorised reopen is required and creates a separate audit record. |

### Sales, purchase and inventory

| ID | Preconditions and action | Expected result |
|---|---|---|
| TC-SAL-03 | Customer has insufficient available credit; create invoice. Then use an authorised override. | First action blocks; second requires reason, approver/limit policy and creates `credit_override` audit evidence. |
| TC-SAL-04 | Retry same invoice request with identical idempotency key after an uncertain network result. | Exactly one invoice, journal and stock movement; returned payload identifies the existing document. |
| TC-SAL-05 | Return part of a settled invoice. | Return/credit note quantity cannot exceed sold/returnable quantity; stock and AR/GL/tax reverse only the returned portion. |
| TC-PUR-02 | Receive quantity above PO balance. | Block or create explicit approved tolerance exception; no silent over-receipt. |
| TC-PUR-04 | Submit same vendor reference, vendor and amount twice. | Duplicate bill is rejected/flagged before AP or stock accounting effect. |
| TC-PUR-05 | Re-run landed-cost allocation. | Allocation is deterministic and only one set of valuation adjustments exists. |
| TC-INV-01 | Enter carton + loose quantity for item with conversion factor. | Stored base quantity equals carton × factor + loose; invalid fractional rules fail. |
| TC-INV-02 | Transfer stock from WH-A to WH-B, then attempt sale from WH-B before receipt. | Quantity is unavailable at destination until receipt; source and in-transit quantities reconcile. |
| TC-INV-04 | Submit a stock count variance without reason/approval. | Count may remain draft; adjustment cannot post. |

### Workforce, ESS and payroll

| ID | Preconditions and action | Expected result |
|---|---|---|
| TC-HR-02 | Import duplicate biometric punches and punches around midnight/time-zone boundary. | Idempotent device ingestion; correct attendance day/shift attribution with source log retained. |
| TC-HR-04 | Employee applies overlapping leave or more days than balance. | Request is blocked or follows documented unpaid/negative-balance policy; no duplicate debit of balance. |
| TC-PAY-01 | Change salary or attendance after payroll calculation but before finalisation. | Run shows source version mismatch/recalculation requirement; finalised run retains immutable input snapshot. |
| TC-PAY-04 | Finalise same payroll period/branch twice. | Only one final run/payslip/journal/payment file exists; duplicate job is rejected/idempotent. |
| TC-PAY-05 | Loan has a final instalment greater than outstanding principal. | Recovery is capped according to policy and residual/outstanding never becomes negative. |
| TC-ESS-01 | Employee calls ESS profile/payslip endpoint with another employee ID. | Only self record is returned; manager exception is permitted only for declared team scope. |
| TC-ESS-03 | Approver opens a leave request; employee withdraws it; approver then submits approval. | Approval fails as stale; request history shows withdrawal and no leave balance change. |

### Reporting, integrations and resilience

| ID | Preconditions and action | Expected result |
|---|---|---|
| TC-CLOSE-05 | Compare trial balance, GL and P&L after a mixed sales/purchase/payroll/asset period. | All reports use posted facts for the same scope and reconcile to journal totals; excluded drafts are demonstrable. |
| TC-OPS-01 | Import file containing three bad rows among valid rows. | Job records source, row-level errors and outcome; valid-row policy is explicit; rerun does not duplicate accepted rows. |
| TC-OPS-02 | Send invalid webhook signature then retry a transient 5xx delivery. | Invalid signature is rejected; delivery uses bounded retry/backoff, idempotency and observable final status. |
| TC-OPS-03 | Create an API key without a required scope and call a write endpoint. | Key secret is shown once, stored hashed, constrained to tenant/scopes, and request is denied. |
| TC-OPS-04 | Non-owner requests restore; owner requests a restore. | First is denied; second requires confirmation/approval, backup selection, audit and safe maintenance/rollback plan. |

## Exit criteria

- All critical tests (authentication, tenancy, posting, stock, payroll finalisation and close) pass on a real database with RLS enabled.
- Each posted source document reconciles to exactly one business outcome and its intended journal/stock/settlement entries.
- Failure/retry tests prove idempotency; no mutation relies only on disabling a browser button.
- Permission, approval and audit tests pass for both UI and direct API access.
