# Business workflows

Each workflow defines the production contract behind one or more prototype screens. “Post” means an atomic, permissioned transaction—not a front-end status change.

## WF-01 — Tenant onboarding and operating setup

**Trigger:** Platform staff creates a tenant from `admin/tenants/new`.

1. Validate tenant identity, administrator contact, plan, subscription and selected modules.
2. Create `platform.tenant`, subscription and module/feature entitlement records; provision the owner/staff invitation.
3. Apply the selected COA/master template, then create company profile, fiscal calendar, branches, currency/tax defaults, roles and document sequences.
4. Mark setup steps complete only after their corresponding records have been persisted and validated.
5. Enable tenant access only when subscription and mandatory setup/entitlement checks pass.

**Exception paths:** Duplicate legal/tax identity; expired trial; failed seed transaction (roll back all provisioning); disabled module; owner invitation expiry. **Outputs:** tenant audit event, setup state, invitations and usable tenant context.

## WF-02 — General journal, approval, posting and reversal

**Trigger:** Finance user creates a voucher from `app/accounting/vouchers/new` or a source module generates one.

1. Allocate document number; save editable lines as `DRAFT`.
2. Validate date/fiscal period, account activity, branch/dimensions, exactly balanced debit/credit, no invalid party combination and required attachment/narration rules.
3. Submit to approval if the workflow/threshold applies; otherwise authorise posting according to role policy.
4. On `POSTED`, lock journal and lines; update only derived totals and write journal/audit/activity records.
5. To correct a posted journal, generate a dated mirror journal through controlled reversal; never mutate the original.

**Exception paths:** Closed/locked period, self-approval/SoD breach, stale approval, unbalanced lines, missing account mapping. **Outputs:** `acc.journal_entry`, `acc.journal_line`, optional `core.approval_request`, audit event.

## WF-03 — Quote to cash

**Trigger:** Sales creates a quotation, order or invoice from the Sales screens.

1. Resolve active customer, address/terms, branch, price list/scheme, tax code/rate and item/UOM/batch availability as of document date.
2. Create quotation; allow conversion only while valid. Convert accepted quotation to sales order without duplicating committed quantities.
3. Reserve stock for an approved order where the business policy requires it. Create delivery challan/dispatch and consume only delivered quantity.
4. Create/post invoice after delivery (or immediately for counter/POS policy). Re-evaluate credit limit/hold; require a time-bound, audited override when exceeded.
5. Atomically post AR/revenue/tax journal and required stock/COGS movement; derive invoice balance/status from allocations.
6. Record receipt and allocate against open invoices. A return creates a sales return/credit note, reverses eligible stock/financial effects, and reopens balance as applicable.

**Controls:** no duplicate invoice, no invoice over shipped quantity without policy, no negative stock without authorised policy, tax snapshot retained, credit override cannot be silent. **Outputs:** sales documents, inventory ledger, journal, receivable allocation, reminders/ageing data.

## WF-04 — Procure to pay

**Trigger:** Buyer issues PO or store accepts goods.

1. Create PO from an authorised vendor, items, quantities, price/tax and delivery branch/warehouse; apply approval threshold.
2. Receive against PO into GRN. Enforce quantity/quality/tolerance and prevent receipt above permitted outstanding quantity.
3. Post bill by matching vendor, PO/GRN, received quantity, duplicate vendor reference, price/tax and landed cost policy.
4. On bill posting, recognise inventory/expense, AP and recoverable/withheld tax; record stock effect at GRN or bill according to the configured accrual policy, never both.
5. Create payment only for approved/open vendor obligation; allocate payment, cheque or bank transaction. Return/debit note reverses the applicable stock and/or payable effect.

**Controls:** three-way match exception requires approval; landed cost allocation is repeat-safe; payment allocation cannot exceed open balance. **Outputs:** PO/GRN/bill, stock ledger, AP, journal, tax and settlement records.

## WF-05 — Inventory control and fulfilment

**Trigger:** A stock operation originates from purchase, sale, adjustment, transfer, count, kit/assembly, sample/gift or distribution.

1. Resolve item base quantity from carton/loose UOM and validate warehouse/bin/batch/expiry restrictions.
2. Create an immutable stock-ledger movement with source type/id, reason, direction, quantities, valuation basis and actor.
3. Update derived on-hand/available/reserved balance atomically. A transfer is `OUT` at source plus controlled `IN` receipt at destination; in-transit state prevents double availability.
4. Stock count records counted quantity and variance. Post adjustment only after count approval and a reason is supplied.
5. Reorder demand is derived from approved rules, availability, open demand/reservations and lead time—not manually overwritten without an audit event.

**Controls:** idempotent source posting, serial/batch uniqueness, expiry checks, no unapproved negative stock, stock ledger reconstruction reconciliation. **Outputs:** stock ledger/balance, reservations, valuation/COGS inputs and inventory reports.

## WF-06 — Bank, cash and cheque lifecycle

**Trigger:** Import a statement, record cash/bank movement, receive/issue cheque, or reconcile.

1. Import statement with source file identity/hash and deduplicate lines. Apply rules only as proposed matches; a user confirms exceptions.
2. Record bank/cash transaction and its source document/GL effect. Allocate receipt/payment to the party/document without exceeding outstanding amount.
3. Cheque transitions through controlled statuses (received/issued, deposited, cleared, bounced, cancelled as applicable). A bounce creates the documented reversal/reopening consequence exactly once.
4. Reconciliation matches bank-statement lines to book entries, records unmatched reasons, and locks a completed reconciliation except for authorised reopen.
5. Close cash day by counting denominations and locking cash vouchers through the close date; subsequent correction follows a controlled reopen process.

**Controls:** statement import idempotency, status-transition guard, no post-close cash changes, reconciliation difference must be explained. **Outputs:** bank/cash books, cheque register, reconciliation, journal and audit events.

## WF-07 — Expense claim to reimbursement

**Trigger:** Employee submits from `ess/expenses` or finance creates a claim.

1. Validate claimant, category, amount/date, policy limits, currency/tax and mandatory receipt threshold.
2. Freeze submitted lines and attachments; route through manager/finance approval. Reject/return preserves a reason and notification.
3. On approval, create payable/reimbursement obligation; on payment, allocate cash/bank transaction and post expense/tax/employee clearing entries.
4. A correction after payment is a controlled adjustment, not an overwrite.

**Controls:** employee can see only own claims; approver cannot approve own claim; duplicate receipt detection is required. **Outputs:** claim/action trail, AP or employee payable, payment and GL/tax effects.

## WF-08 — Hire to payroll to settlement

**Trigger:** HR hires/updates an employee, then runs payroll.

1. Create employee with organisational assignment, employment status/effective dates, bank/statutory data, salary structure and role/ESS invitation.
2. Import/receive device punches, apply roster/holiday rules and calculate attendance days, late marks and overtime. Submit exceptions/regularisation for approval.
3. Accrue/validate leave against policy and approved requests. Collect approved attendance, leave, overtime, loans/advances and tax declarations as payroll inputs.
4. Create a payroll run snapshot for eligible active employees. Calculate components, deductions, statutory tax, loan instalments and net pay; run exception checks and reviewer approval.
5. Finalise once: lock payroll inputs/results, produce payslips, create payment instructions and balanced payroll GL/tax journals. Release employee payslip visibility after finalisation.
6. Offboarding starts clearance; final settlement incorporates approved leave encashment, outstanding loan/asset/notice deductions and final pay, then deactivates payroll/ESS access only after settlement policy permits.

**Controls:** effective-dated salary history, one finalised run per payroll period/branch, no payroll after period lock, retro/arrears traceability, PII-access limitation. **Outputs:** payroll run/lines/components, payslip, loans recoveries, statutory liabilities, journal and payment files.

## WF-09 — Leave and ESS request approval

**Trigger:** Employee submits leave, attendance correction, loan/advance, letter or profile request.

1. Confirm requester identity maps to an active employee and determine the request policy/workflow as of request date.
2. Validate dates, overlap, balance/eligibility, attachments and substitute/team coverage rules when applicable.
3. Create pending request and notify only the current eligible approver. Approval actions are optimistic-concurrency protected: no action on a changed/withdrawn request.
4. On approval, update the owned HR/payroll record (leave balance, attendance day or loan) and emit notification/activity/audit. On rejection, preserve reason and do not change entitlement.

**Controls:** no manager-chain bypass, no self-approval, withdrawal/re-submission retains history, ESS users cannot directly update authoritative HR/payroll data. **Outputs:** request/action history and updated approved source records.

## WF-10 — Period close, year end and reporting

**Trigger:** Finance begins close from `app/periods` or `app/periods/close`.

1. Reconcile bank/cash, review unposted source documents, suspense, inventory valuation, AP/AR ageing, tax and payroll/asset tasks.
2. Post approved close journals (accruals, depreciation, tax and adjustments) and verify trial balance is balanced.
3. Lock the fiscal period and affected module posting rights. Reopen needs specific authority, reason, time window and audit record.
4. At year end, run dry-run validation, complete authorised final close and generate opening/retained earnings treatment under the defined accounting policy.
5. Render reports from scoped, posted read models; schedules/shares must enforce recipient and branch/tenant permissions.

**Controls:** no implicit reopen, report totals reconcile to GL, released reports identify period/as-of time, source documents cannot bypass lock. **Outputs:** locks/reopen records/year-end close, close checklist, financial statements and audit evidence.
