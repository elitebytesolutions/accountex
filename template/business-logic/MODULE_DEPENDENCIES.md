# Module interdependency map

## Dependency model

```text
Platform tenant / plan / feature flags
  └─ Identity, roles, branch scope, approvals, audit, import, notifications
      ├─ Company profile, fiscal calendar, COA, tax codes, banks, warehouses
      │   ├─ Products + customers/vendors + price lists
      │   │   ├─ Sales ────────────────┐
      │   │   ├─ Purchases ──► Stock ──┼─► GL / tax / cash-bank ─► reports / close
      │   │   └─ Wholesale/distribution ┘
      └─ Employees, shifts, leave, attendance, overtime
          └─ Payroll, loans, settlement ─► GL / tax / bank ────► reports / close

ESS is a controlled request/view layer over HR, payroll, expense and approval data.
```

## Module contracts

| Consumer | Required upstream data/control | Produces for downstream modules |
|---|---|---|
| All tenant modules | Tenant, subscription/feature entitlement, authenticated user, role/branch scope, audit context | Notifications, activity/audit events, approval requests where configured |
| Accounting | Company fiscal settings, COA, branch, cost centre/project, document sequences | Posted journals/lines, opening balances, period status, financial dimensions |
| Treasury | Accounting accounts/period status; parties; bank/cash master | Bank/cash positions, cheque state, reconciliations, receipt/payment settlement and GL references |
| Tax | Tax master/code/rate; posted sales/purchase/payroll events; periods | Tax calculations, returns, deductions and statutory submission records |
| Products/inventory | Item/UOM/barcode, warehouse/bin/batch, user/branch scope | Availability, reservations, stock ledger/balance, batch/expiry and costing signals |
| Sales/AR | Customer/credit terms, price list/scheme, tax, item availability, approval/period status | Orders, deliveries, invoices/returns/credit notes, customer receivable and stock/GL/tax effects |
| Purchase/AP | Vendor terms, tax, item/warehouse, approval/period status | PO/GRN/bill/return/debit-note obligations, stock and AP/GL/tax effects |
| Wholesale/distribution | Sales customer/item/price/credit data; stock; routes/vehicles/employees | Bookings, allocations/delivery runs, cash/returns/settlement and recovery records |
| Assets/budgets | COA, tax/periods, purchase source/original cost, branches/cost centres | Asset value/depreciation/disposal journals; budget variance dimensions |
| HR | User, branch, department/designation/grade, policies | Employee master, approved attendance/leave/overtime/lifecycle inputs |
| Payroll | Employee status, salary structure, approved time/leave/OT, loans, tax parameters, bank | Payroll results/payslips, loan recovery, statutory deductions and GL/bank payment instructions |
| ESS | Identity mapped to employee, permissions, HR/payroll source records | Employee-originated requests, documents, helpdesk/collaboration events |
| Reports/close | Posted journals, stock, tax, payroll and operational records; date/branch scope | Read-only views, schedules and close attestations; never source transaction changes |

## Mandatory preconditions by event

| Event | Must already exist and be valid |
|---|---|
| Post any financial document | Current tenant/user context; create/post permission; matching approved workflow (if configured); open fiscal period and module; balanced/valid lines; unique number; audit context |
| Post sales invoice/POS/voucher | Customer not blocked; price/tax resolved; credit check/override; items and quantities valid; stock available or an explicit back-order policy; period open |
| Receive GRN or post purchase bill | Active vendor/item/warehouse; PO tolerance (where referenced); non-duplicate vendor bill; tax calculation; period open |
| Move/adjust stock | Active item/location/batch; positive permitted quantity or authorised negative-stock policy; reason; approver if policy requires; no closed period |
| Approve leave/attendance/expense/loan | Request is pending, actor is the current eligible approver, request has not changed since submission, entitlement/balance/attachment rules pass |
| Finalise payroll | Payroll period is open and unique; eligible employees/structure snapshot; approved attendance/leave/OT/loan/tax inputs; reviewer approval; bank/payment and GL mappings |
| Close period/year | Reconciliations and pending postings resolved; all required module locks/checklist steps complete; authorised close role; retained close audit and controlled reopen process |

## Data ownership rules

1. The source document owns its business lifecycle; downstream modules hold references and derived facts. A receipt settles an invoice but cannot alter invoice line amounts.
2. `acc.journal_entry` is the canonical financial impact. Source documents retain their status and reference the generated journal; reporting reconciles to posted journals.
3. `inv.stock_ledger` is the immutable movement history. Current stock is a derived balance/cache that must be reconstructable from ledger movements.
4. Employee personal data is owned by HR. ESS exposes filtered projections and submits requests; it must not bypass HR/payroll policy or approval services.
5. Any cross-module FK is tenant-aware. The contract requires `(tenant_id, id)` references for tenant records and no cascading deletion of business documents.

## Build/release gates

1. Platform, RLS/tenant context, identity/roles, audit, sequence and approval foundations.
2. Company settings, fiscal periods, COA, bank/cash, tax, branch and reference masters.
3. Journals/opening/reversal and period posting guards; then product, warehouse and stock ledger.
4. Sales/AR and purchases/AP, including their atomic stock/GL/tax/settlement integration.
5. Assets, budgets, wholesale/distribution, then HR/payroll/ESS.
6. Reporting, integrations, import/export, backups, dashboards and performance/observability hardening.

No downstream module is ready to release if an upstream control is a UI-only simulation. Use the gap register to decide which gate remains open.
