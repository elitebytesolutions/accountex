# Page → entity map (Full edition)

One section per screen of the Finsoft prototype. Each section lists the source files, the tables it reads and writes, a UI-field → column table, its status flow, what each action does (journal, stock movement, notifications), and its permission key. Format: `../database/CONTRACT.md` §7.

Values the prototype only simulates in the browser are marked **[simulated]**. Dashboard and report screens map to views (`<schema>.v*` in `../database/views/`).

## Files

| File | Screens |
|---|---|
| [01-platform-admin.md](01-platform-admin.md) | 28 |
| [02-auth-workspace-settings.md](02-auth-workspace-settings.md) | 24 |
| [03-accounting.md](03-accounting.md) | 12 |
| [04-bank-cash.md](04-bank-cash.md) | 12 |
| [05-fixed-assets.md](05-fixed-assets.md) | 4 |
| [06-tax.md](06-tax.md) | 4 |
| [07-financial-reports.md](07-financial-reports.md) | 8 |
| [08-sales-receivables.md](08-sales-receivables.md) | 18 |
| [09-purchases-payables.md](09-purchases-payables.md) | 12 |
| [10-inventory.md](10-inventory.md) | 18 |
| [11-wholesale-distribution.md](11-wholesale-distribution.md) | 8 |
| [12-hr.md](12-hr.md) | 22 |
| [13-payroll.md](13-payroll.md) | 8 |
| [14-ess.md](14-ess.md) | 17 |

## Coverage checklist (every route → its section)

| ✓ | Route | Screen | File |
|---|---|---|---|
| ✓ | `admin/analytics` | SaaS Analytics | 01-platform-admin.md |
| ✓ | `admin/announcements` | Announcements | 01-platform-admin.md |
| ✓ | `admin/audit` | Platform Audit Log | 01-platform-admin.md |
| ✓ | `admin/change-requests` | Change Requests | 01-platform-admin.md |
| ✓ | `admin/comms` | Communications | 01-platform-admin.md |
| ✓ | `admin/dashboard` | Platform Overview | 01-platform-admin.md |
| ✓ | `admin/dunning` | Dunning & Collections | 01-platform-admin.md |
| ✓ | `admin/entitlements` | Plan Entitlements | 01-platform-admin.md |
| ✓ | `admin/features/view` | Flag Detail | 01-platform-admin.md |
| ✓ | `admin/features` | Feature Flags | 01-platform-admin.md |
| ✓ | `admin/integrations` | API & Webhooks | 01-platform-admin.md |
| ✓ | `admin/invoices` | Platform Invoices | 01-platform-admin.md |
| ✓ | `admin/leads` | Leads CRM | 01-platform-admin.md |
| ✓ | `admin/partners` | Partners & Coupons | 01-platform-admin.md |
| ✓ | `admin/plans` | Plans & Pricing | 01-platform-admin.md |
| ✓ | `admin/security` | Security & Privacy | 01-platform-admin.md |
| ✓ | `admin/segments` | Segments | 01-platform-admin.md |
| ✓ | `admin/staff` | Platform Team | 01-platform-admin.md |
| ✓ | `admin/status` | Status & Incidents | 01-platform-admin.md |
| ✓ | `admin/subscriptions` | Subscriptions | 01-platform-admin.md |
| ✓ | `admin/support` | Support Tickets | 01-platform-admin.md |
| ✓ | `admin/system` | System Health | 01-platform-admin.md |
| ✓ | `admin/tax-master` | Tax Master | 01-platform-admin.md |
| ✓ | `admin/templates` | Templates | 01-platform-admin.md |
| ✓ | `admin/tenants/new` | Onboard Tenant | 01-platform-admin.md |
| ✓ | `admin/tenants/view` | Tenant 360 | 01-platform-admin.md |
| ✓ | `admin/tenants` | All Tenants | 01-platform-admin.md |
| ✓ | `admin/usage` | Usage & Quotas | 01-platform-admin.md |
| ✓ | `app/404` | Page not found | 02-auth-workspace-settings.md |
| ✓ | `app/accounting/coa` | Chart of Accounts | 03-accounting.md |
| ✓ | `app/accounting/cost-centres` | Cost Centres & Projects | 03-accounting.md |
| ✓ | `app/accounting/ledger` | Account Ledger | 03-accounting.md |
| ✓ | `app/accounting/opening` | Opening Balances | 03-accounting.md |
| ✓ | `app/accounting/recurring` | Recurring Templates | 03-accounting.md |
| ✓ | `app/accounting/vouchers/new` | New Voucher | 03-accounting.md |
| ✓ | `app/accounting/vouchers/view` | Voucher Detail | 03-accounting.md |
| ✓ | `app/accounting/vouchers` | Voucher Register | 03-accounting.md |
| ✓ | `app/activity` | Activity Feed | 02-auth-workspace-settings.md |
| ✓ | `app/approvals` | Approvals Inbox | 02-auth-workspace-settings.md |
| ✓ | `app/assets/depreciation` | Run Depreciation | 05-fixed-assets.md |
| ✓ | `app/assets/disposals` | Asset Disposals | 05-fixed-assets.md |
| ✓ | `app/assets/view` | Asset Detail | 05-fixed-assets.md |
| ✓ | `app/assets` | Fixed Asset Register | 05-fixed-assets.md |
| ✓ | `app/bank/accounts` | Bank Accounts | 04-bank-cash.md |
| ✓ | `app/bank/book` | Bank Book | 04-bank-cash.md |
| ✓ | `app/bank/cheque-register` | Cheque Register & PDC | 04-bank-cash.md |
| ✓ | `app/bank/cheques` | Receive & Issue Cheques | 04-bank-cash.md |
| ✓ | `app/bank/cheque-voucher` | Cheque Voucher | 04-bank-cash.md |
| ✓ | `app/bank/reconciliation` | Bank Reconciliation | 04-bank-cash.md |
| ✓ | `app/bank/rules` | Bank Rules & Import | 04-bank-cash.md |
| ✓ | `app/bank/transactions` | Bank Transactions | 04-bank-cash.md |
| ✓ | `app/budgets/variance` | Budget vs Actual | 03-accounting.md |
| ✓ | `app/budgets` | Budgets | 03-accounting.md |
| ✓ | `app/cash/book` | Cash Book | 04-bank-cash.md |
| ✓ | `app/cash/expenses` | Expense Claims | 04-bank-cash.md |
| ✓ | `app/cash/ledger` | Cash Ledger | 04-bank-cash.md |
| ✓ | `app/cash/petty` | Petty Cash | 04-bank-cash.md |
| ✓ | `app/customers/view` | Customer Detail | 08-sales-receivables.md |
| ✓ | `app/customers` | Customers | 08-sales-receivables.md |
| ✓ | `app/dashboard` | Dashboard | 02-auth-workspace-settings.md |
| ✓ | `app/hr/attendance/register` | Attendance Register | 12-hr.md |
| ✓ | `app/hr/attendance/requests` | Regularisation Requests | 12-hr.md |
| ✓ | `app/hr/attendance` | Attendance Today | 12-hr.md |
| ✓ | `app/hr/departments` | Departments & Designations | 12-hr.md |
| ✓ | `app/hr/devices` | Biometric Devices | 12-hr.md |
| ✓ | `app/hr/employees/new` | Add Employee | 12-hr.md |
| ✓ | `app/hr/employees/view` | Employee Profile | 12-hr.md |
| ✓ | `app/hr/employees` | Employees | 12-hr.md |
| ✓ | `app/hr/holidays` | Holiday Calendar | 12-hr.md |
| ✓ | `app/hr/leave/balances` | Leave Balances | 12-hr.md |
| ✓ | `app/hr/leave/policies` | Leave Types & Policies | 12-hr.md |
| ✓ | `app/hr/leave/requests` | Leave Requests | 12-hr.md |
| ✓ | `app/hr/leave` | Leave Overview | 12-hr.md |
| ✓ | `app/hr/loans` | Loans & Advances | 13-payroll.md |
| ✓ | `app/hr/offboarding` | Offboarding & Exits | 12-hr.md |
| ✓ | `app/hr/onboarding` | Onboarding | 12-hr.md |
| ✓ | `app/hr/org` | Organisation Chart | 12-hr.md |
| ✓ | `app/hr/overtime` | Overtime | 12-hr.md |
| ✓ | `app/hr/payroll/payslip` | Payslip view | 13-payroll.md |
| ✓ | `app/hr/payroll/payslips` | Payslips | 13-payroll.md |
| ✓ | `app/hr/payroll/reports` | Payroll Reports | 13-payroll.md |
| ✓ | `app/hr/payroll/run` | Run Payroll | 13-payroll.md |
| ✓ | `app/hr/payroll/structures` | Salary Structures | 13-payroll.md |
| ✓ | `app/hr/payroll` | Payroll Overview | 13-payroll.md |
| ✓ | `app/hr/performance` | Performance | 12-hr.md |
| ✓ | `app/hr/recruitment` | Recruitment | 12-hr.md |
| ✓ | `app/hr/reports` | HR Reports | 12-hr.md |
| ✓ | `app/hr/settlement` | Final Settlement | 13-payroll.md |
| ✓ | `app/hr/shifts` | Shifts & Roster | 12-hr.md |
| ✓ | `app/hr/training` | Training & Development | 12-hr.md |
| ✓ | `app/import` | Data Import | 02-auth-workspace-settings.md |
| ✓ | `app/inventory/adjustments` | Stock Adjustments | 10-inventory.md |
| ✓ | `app/inventory/batches` | Batches & Expiry | 10-inventory.md |
| ✓ | `app/inventory/classes` | Product Classes | 10-inventory.md |
| ✓ | `app/inventory/companies` | Companies & Brands | 10-inventory.md |
| ✓ | `app/inventory/count` | Stock Count | 10-inventory.md |
| ✓ | `app/inventory/demand` | Demand & Reorder | 10-inventory.md |
| ✓ | `app/inventory/items` | Product Catalogue | 10-inventory.md |
| ✓ | `app/inventory/kits` | Kits & Bundles | 10-inventory.md |
| ✓ | `app/inventory/labels` | Barcode Labels | 10-inventory.md |
| ✓ | `app/inventory/movements` | Stock Movements | 10-inventory.md |
| ✓ | `app/inventory/products/view` | Product Detail | 10-inventory.md |
| ✓ | `app/inventory/reports` | Inventory Reports | 10-inventory.md |
| ✓ | `app/inventory/stock` | Whole Stock | 10-inventory.md |
| ✓ | `app/inventory/stock-in-out` | Stock In / Out | 10-inventory.md |
| ✓ | `app/inventory/stock-view` | Stock In View | 10-inventory.md |
| ✓ | `app/inventory/stock-vouchers` | Stock Vouchers | 10-inventory.md |
| ✓ | `app/inventory/transfer` | Stock Transfers | 10-inventory.md |
| ✓ | `app/inventory/warehouses` | Warehouses | 10-inventory.md |
| ✓ | `app/notifications` | Notification Centre | 02-auth-workspace-settings.md |
| ✓ | `app/payables/ageing` | AP Ageing & Reports | 09-purchases-payables.md |
| ✓ | `app/payables/payments` | Payments & Allocation | 09-purchases-payables.md |
| ✓ | `app/periods/close` | Year-end Close | 03-accounting.md |
| ✓ | `app/periods` | Fiscal Years & Periods | 03-accounting.md |
| ✓ | `app/profile` | My Profile | 02-auth-workspace-settings.md |
| ✓ | `app/purchases/bills/new` | New Vendor Bill | 09-purchases-payables.md |
| ✓ | `app/purchases/bills` | Vendor Bills | 09-purchases-payables.md |
| ✓ | `app/purchases/debit-notes` | Debit Notes | 09-purchases-payables.md |
| ✓ | `app/purchases/grn` | Goods Received (GRN) | 09-purchases-payables.md |
| ✓ | `app/purchases/landed-cost` | Landed Cost | 09-purchases-payables.md |
| ✓ | `app/purchases/orders` | Purchase Orders | 09-purchases-payables.md |
| ✓ | `app/purchases/returns` | Purchase Returns | 09-purchases-payables.md |
| ✓ | `app/purchases/voucher` | Purchase Voucher | 09-purchases-payables.md |
| ✓ | `app/receivables/ageing` | AR Ageing & Reports | 08-sales-receivables.md |
| ✓ | `app/receivables/credit` | Credit Control | 08-sales-receivables.md |
| ✓ | `app/receivables/receipts` | Receipts & Allocation | 08-sales-receivables.md |
| ✓ | `app/receivables/reminders` | Payment Reminders | 08-sales-receivables.md |
| ✓ | `app/reports/balance-sheet` | Balance Sheet | 07-financial-reports.md |
| ✓ | `app/reports/cash-flow` | Cash Flow | 07-financial-reports.md |
| ✓ | `app/reports/day-book` | Day Book | 07-financial-reports.md |
| ✓ | `app/reports/gl` | General Ledger | 07-financial-reports.md |
| ✓ | `app/reports/pnl` | Profit & Loss | 07-financial-reports.md |
| ✓ | `app/reports/studio` | Report Studio | 07-financial-reports.md |
| ✓ | `app/reports/trial-balance` | Trial Balance | 07-financial-reports.md |
| ✓ | `app/reports` | Reports Centre | 07-financial-reports.md |
| ✓ | `app/sales/challans` | Delivery Challans | 08-sales-receivables.md |
| ✓ | `app/sales/credit-notes` | Credit Notes | 08-sales-receivables.md |
| ✓ | `app/sales/invoices/new` | New Sales Invoice | 08-sales-receivables.md |
| ✓ | `app/sales/invoices/view` | Invoice View | 08-sales-receivables.md |
| ✓ | `app/sales/invoices` | Sales Invoices | 08-sales-receivables.md |
| ✓ | `app/sales/orders` | Sales Orders | 08-sales-receivables.md |
| ✓ | `app/sales/pos` | POS / Counter Sale | 08-sales-receivables.md |
| ✓ | `app/sales/price-lists` | Price Lists & Schemes | 08-sales-receivables.md |
| ✓ | `app/sales/quotations` | Quotations | 08-sales-receivables.md |
| ✓ | `app/sales/recurring` | Recurring Invoices | 08-sales-receivables.md |
| ✓ | `app/sales/returns` | Sales Returns | 08-sales-receivables.md |
| ✓ | `app/sales/voucher` | Sales Voucher | 08-sales-receivables.md |
| ✓ | `app/settings/approvals` | Approval Workflows | 02-auth-workspace-settings.md |
| ✓ | `app/settings/audit` | Audit Trail | 02-auth-workspace-settings.md |
| ✓ | `app/settings/backup` | Backup & Restore | 02-auth-workspace-settings.md |
| ✓ | `app/settings/integrations` | Integrations | 02-auth-workspace-settings.md |
| ✓ | `app/settings/roles` | Roles & Permissions | 02-auth-workspace-settings.md |
| ✓ | `app/settings/templates` | Document Templates | 02-auth-workspace-settings.md |
| ✓ | `app/settings/users` | Users | 02-auth-workspace-settings.md |
| ✓ | `app/settings` | Company Settings | 02-auth-workspace-settings.md |
| ✓ | `app/setup` | Setup Guide | 02-auth-workspace-settings.md |
| ✓ | `app/states` | UI States | 02-auth-workspace-settings.md |
| ✓ | `app/tax/codes` | Tax Codes | 06-tax.md |
| ✓ | `app/tax/fbr` | FBR Integration | 06-tax.md |
| ✓ | `app/tax/sales-tax` | Sales Tax Return | 06-tax.md |
| ✓ | `app/tax/wht` | Withholding Tax | 06-tax.md |
| ✓ | `app/today` | Today's Work | 02-auth-workspace-settings.md |
| ✓ | `app/unauthorized` | No access | 02-auth-workspace-settings.md |
| ✓ | `app/vendors/view` | Vendor Detail | 09-purchases-payables.md |
| ✓ | `app/vendors` | Vendors | 09-purchases-payables.md |
| ✓ | `app/wholesale/backorders` | Back-orders | 11-wholesale-distribution.md |
| ✓ | `app/wholesale/bookings` | Order Bookings | 11-wholesale-distribution.md |
| ✓ | `app/wholesale/bulk` | Bulk Invoicing | 11-wholesale-distribution.md |
| ✓ | `app/wholesale/entry` | Quick Wholesale Entry | 11-wholesale-distribution.md |
| ✓ | `app/wholesale/load-sheet` | Load Sheets | 11-wholesale-distribution.md |
| ✓ | `app/wholesale/recovery` | Recovery Sheet | 11-wholesale-distribution.md |
| ✓ | `app/wholesale/routes` | Routes & Salesmen | 11-wholesale-distribution.md |
| ✓ | `app/wholesale/settlement` | Route Settlement | 11-wholesale-distribution.md |
| ✓ | `chooser` | Welcome to Finsoft | 02-auth-workspace-settings.md |
| ✓ | `ess/attendance` | My Attendance | 14-ess.md |
| ✓ | `ess/company` | Directory | 14-ess.md |
| ✓ | `ess/dashboard` | My Day | 14-ess.md |
| ✓ | `ess/expenses` | Expense Claims | 14-ess.md |
| ✓ | `ess/goals` | Goals & Reviews | 14-ess.md |
| ✓ | `ess/helpdesk` | Helpdesk | 14-ess.md |
| ✓ | `ess/kudos` | Kudos & Pulse | 14-ess.md |
| ✓ | `ess/leave` | My Leave | 14-ess.md |
| ✓ | `ess/loans` | Loans & Advances (ESS) | 14-ess.md |
| ✓ | `ess/notifications` | Notifications | 14-ess.md |
| ✓ | `ess/onboarding` | Onboarding | 14-ess.md |
| ✓ | `ess/payslips` | My Payslips | 14-ess.md |
| ✓ | `ess/profile` | My Profile | 14-ess.md |
| ✓ | `ess/requests` | Letters & Requests | 14-ess.md |
| ✓ | `ess/shifts` | Shifts & Swaps | 14-ess.md |
| ✓ | `ess/tax` | Tax Declarations | 14-ess.md |
| ✓ | `ess/team` | My Team | 14-ess.md |
| ✓ | `login/forgot` | Reset password | 02-auth-workspace-settings.md |
| ✓ | `login/mfa` | Verify sign in | 02-auth-workspace-settings.md |
| ✓ | `login` | Sign in | 02-auth-workspace-settings.md |
| ✓ | `mobile` | Mobile Apps | 02-auth-workspace-settings.md |

## Interactive map

Open `index.html` in this folder (works from file://, no server) for the interactive page -> entity & field map: screen navigator, field mapping validated against the DDL, entity -> screens reverse view and a coverage dashboard. Deep links: `index.html#screen=app/sales/invoices`, `#table=Sales.SalesInvoices`, `#tab=coverage`, `#debug=1`.

Rebuild after editing any entity doc or SQL file:

    powershell -File build-entity-map.ps1
