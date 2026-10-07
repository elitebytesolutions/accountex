# Module catalogue and route coverage

This catalogue covers every functional area exposed by the current navigation. “Records” are the target entities from the schema contract; where the SQL table is not yet present, that is an intended contract entity, not an implemented backend.

## Access surfaces

| Surface | Routes | Business responsibility | Primary actors |
|---|---:|---|---|
| Entry, authentication and mobile | 4 | Login, MFA, password recovery, workspace selection and mobile access | User, platform staff |
| Platform Admin | 28 | Multi-tenant provisioning, commercial operations, feature governance, support and platform security | Super admin, support, billing staff |
| Company Workspace | 145 | Tenant ERP operations, controls, accounting, trade, stock, HR and analytics | Tenant administrator, finance, operations, HR, approvers |
| Employee Self-Service | 17 | Employee requests, personal payroll/leave/attendance and collaboration | Employee, line manager |

## Platform and shared controls

| Module | Routes / screens | Target records and business logic |
|---|---|---|
| Identity and workspace | `login`, `login/mfa`, `login/forgot`, `chooser`, `mobile` | `core.app_user`, user sessions, MFA, password reset, user preferences. Authenticate, enforce MFA/enrolment where required, select tenant/branch and establish tenant context. |
| Tenant administration | `admin/dashboard`, `admin/tenants*`, `admin/templates` | `platform.tenant`, contacts, tenant modules, COA templates/seeds. Provision tenant, select plan/modules, seed masters/COA and maintain tenant lifecycle. |
| Commercial platform ops | `admin/plans`, `subscriptions`, `invoices`, `dunning`, `usage`, `analytics`, `leads`, `partners` | Plans/features, subscriptions, platform invoices/payments, usage, leads, partners/coupons. Enforce plan limits and subscription state before granting entitlements. |
| Feature governance | `admin/features*`, `segments`, `entitlements`, `change-requests` | Feature flags, variations, environments, targets, prerequisites, schedules and change approvals. Evaluate deterministic entitlement/flag outcome for a tenant/user/context; every flag change is audited. |
| Platform operations | `admin/support`, `announcements`, `comms`, `system`, `audit`, `status`, `security`, `integrations`, `tax-master`, `staff` | Support tickets, announcements, incidents, staff/roles/sessions, IP/privacy controls, platform API/webhooks and master tax seed. Restrict privileged actions and retain immutable operation trail. |
| Tenant governance | `app/settings*`, `app/setup`, `app/import`, `app/approvals`, `app/activity`, `app/notifications`, `app/profile`, `app/today` | Company profile/settings, users/roles, approval workflows/requests, imports/errors, templates, integrations/API keys/webhooks, backup/restore, tasks, notifications, audit, activity. Centralises permission and approval decisions used by all modules. |

## Finance and compliance

| Module | Routes / screens | Target records and business logic |
|---|---|---|
| Accounting core | `app/accounting/coa`, `ledger`, `opening`, `cost-centres`, `vouchers*`, `recurring` | Accounts, cost centres/projects, fiscal years/periods, journals/lines, opening batches, recurring templates/runs. Creates the accounting system of record; validates balanced entries and controlled posting/reversal. |
| Treasury and cash | `app/bank/*`, `app/cash/*`, `app/receivables/receipts`, `app/payables/payments` | Banks/accounts, transactions, statements/rules, reconciliations, cheques/PDC/bounces, cash accounts/day close, petty cash, expense claims, receipts and payment allocations. Controls cash movement, clearing and settlements. |
| Fixed assets and budget | `app/assets*`, `app/budgets*` | Asset categories/assets/transfers/depreciation/disposal; budgets/versions/lines. Capitalise eligible spend, calculate/post depreciation, dispose assets, compare actuals to budget. |
| Tax and period close | `app/tax/*`, `app/periods*` | Tax code/rates, sales-tax return/annex, WHT deductions/returns/payments, FBR configuration/submissions, fiscal periods, locks/reopens and year-end close. Controls compliant taxation and lock-down of completed periods. |
| Reporting | `app/reports*`, `app/inventory/reports`, `app/receivables/ageing`, `app/payables/ageing`, `app/hr/reports`, `app/hr/payroll/reports` | Report definitions/columns/shares/schedules/runs and derived financial/operational views. Reads posted facts only; honours branch, period and user scope. |

## Revenue, purchasing and inventory

| Module | Routes / screens | Target records and business logic |
|---|---|---|
| Sales and receivables | `app/customers*`, `app/sales/quotations`, `orders`, `invoices*`, `voucher`, `pos`, `challans`, `returns`, `credit-notes`, `recurring`, `price-lists`, `app/receivables/credit`, `reminders` | Customers/contacts, prices/schemes, quotations, sales orders, delivery challans, invoices/vouchers/POS, returns/credit notes, receipts/allocation, credit holds/overrides, reminders and recurring profiles. Prices, tax, credit and stock availability are validated before commitment/posting. |
| Purchasing and payables | `app/vendors*`, `app/purchases/orders`, `grn`, `bills*`, `voucher`, `returns`, `debit-notes`, `landed-cost`, `app/payables/*` | Vendors, POs, GRNs, bills, returns/debit notes, landed-cost shipments/items/charges, payments/allocation. Enforces ordered/received/billed quantities and moves accepted goods to stock. |
| Product master | `app/inventory/items`, `products/view`, `companies`, `classes`, `kits`, `labels`, `warehouses` | UOM, manufacturer, class/subclass, item/UOM/barcode, kit/components, warehouses/bins/batches, labels. Defines the item, units, costing/tax/price context and stock locations used by trade operations. |
| Stock operations | `app/inventory/stock`, `stock-view`, `stock-in-out`, `transfer`, `count`, `batches`, `movements`, `adjustments`, `stock-vouchers`, `demand` | Stock ledger/balance, manual in/out, transfer/receipt, stock count/variance, adjustments, stock vouchers, batches/expiry, reservation, reorder rules and demand. Creates immutable movement history and updates available/on-hand stock atomically. |
| Wholesale and distribution | `app/wholesale/entry`, `bulk`, `bookings`, `backorders`, `load-sheet`, `settlement`, `recovery`, `routes` | Areas/routes/stops, vehicles, customer routes, bookings, held bills, bulk invoices, backorders, delivery runs/load sheets, settlements, cash counts, recoveries, targets/commission. Converts field demand into controlled deliveries, settlement and receivable recovery. |

## People, pay and ESS

| Module | Routes / screens | Target records and business logic |
|---|---|---|
| HR core and time | `app/hr/employees*`, `org`, `departments`, `attendance*`, `shifts`, `holidays`, `overtime`, `devices` | Employees, departments/designations/grades, employee details/documents/history, shifts/rosters/holidays, biometric devices/punches/sync, attendance days/requests, overtime policy/entries. Produces approved attendance inputs for leave and payroll. |
| Leave and lifecycle | `app/hr/leave*`, `recruitment`, `onboarding`, `offboarding`, `performance`, `training` | Leave types/policies/balances/adjustments/requests; candidates/requisitions; onboarding/tasks; exit/clearance/interview; reviews/goals/training. Applies eligibility/accrual and approval rules, then maintains employee lifecycle state. |
| Payroll | `app/hr/payroll*`, `app/hr/loans`, `app/hr/settlement` | Salary components/structures, employee salary, payroll runs/inputs/lines/components/payslips, loans/installments, final settlements, tax declarations/slabs. Snapshots eligible employees and approved inputs, calculates, approves, posts and distributes payslips. |
| ESS | `ess/dashboard`, `attendance`, `leave`, `shifts`, `team`, `payslips`, `tax`, `loans`, `expenses`, `goals`, `kudos`, `onboarding`, `profile`, `requests`, `helpdesk`, `company`, `notifications` | Employee-facing views and requests for the same HR/payroll data plus letters/helpdesk/kudos/pulse/polls/shift swaps. Limits employee visibility to own data; manager actions use delegated scopes and the common approval engine. |

## Route audit note

The navigation asserts every linked route should have a matching screen. The 193 route count above is taken from `data-route` values in `index.html` after excluding JavaScript template literals. “404” and “unauthorised” screens are deliberate exception routes and must be covered by access-control tests.
