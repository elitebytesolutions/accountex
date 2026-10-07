# Page → entity map (Basic edition)

One section per screen of the Finsoft prototype. Each section lists the source files, the tables it reads and writes, a UI-field → column table, its status flow, what each action does (journal, stock movement, notifications), and its permission key. Format: `../database/CONTRACT.md` §7.

Values the prototype only simulates in the browser are marked **[simulated]**. Dashboard and report screens map to views (`<schema>.v*` in `../database/views/`).

## Files

| File | Screens |
|---|---|
| [01-platform-admin.md](01-platform-admin.md) | 9 |
| [02-auth-workspace-settings.md](02-auth-workspace-settings.md) | 12 |
| [03-accounting.md](03-accounting.md) | 7 |
| [04-bank-cash.md](04-bank-cash.md) | 6 |
| [06-tax.md](06-tax.md) | 1 |
| [07-financial-reports.md](07-financial-reports.md) | 6 |
| [08-sales-receivables.md](08-sales-receivables.md) | 11 |
| [09-purchases-payables.md](09-purchases-payables.md) | 10 |
| [10-inventory.md](10-inventory.md) | 11 |

## Coverage checklist (every route → its section)

| ✓ | Route | Screen | File |
|---|---|---|---|
| ✓ | `admin/audit` | Platform Audit Log | 01-platform-admin.md |
| ✓ | `admin/dashboard` | Platform Overview | 01-platform-admin.md |
| ✓ | `admin/plans` | Plans & Pricing | 01-platform-admin.md |
| ✓ | `admin/staff` | Platform Team | 01-platform-admin.md |
| ✓ | `admin/subscriptions` | Subscriptions | 01-platform-admin.md |
| ✓ | `admin/templates` | Templates | 01-platform-admin.md |
| ✓ | `admin/tenants/new` | Onboard Tenant | 01-platform-admin.md |
| ✓ | `admin/tenants/view` | Tenant 360 | 01-platform-admin.md |
| ✓ | `admin/tenants` | All Tenants | 01-platform-admin.md |
| ✓ | `app/404` | Page not found | 02-auth-workspace-settings.md |
| ✓ | `app/accounting/coa` | Chart of Accounts | 03-accounting.md |
| ✓ | `app/accounting/ledger` | Account Ledger | 03-accounting.md |
| ✓ | `app/accounting/opening` | Opening Balances | 03-accounting.md |
| ✓ | `app/accounting/vouchers/new` | New Voucher | 03-accounting.md |
| ✓ | `app/accounting/vouchers/view` | Voucher Detail | 03-accounting.md |
| ✓ | `app/accounting/vouchers` | Voucher Register | 03-accounting.md |
| ✓ | `app/bank/accounts` | Bank Accounts | 04-bank-cash.md |
| ✓ | `app/bank/book` | Bank Book | 04-bank-cash.md |
| ✓ | `app/bank/cheque-register` | Cheque Register & PDC | 04-bank-cash.md |
| ✓ | `app/bank/cheques` | Receive & Issue Cheques | 04-bank-cash.md |
| ✓ | `app/bank/transactions` | Bank Transactions | 04-bank-cash.md |
| ✓ | `app/cash/book` | Cash Book | 04-bank-cash.md |
| ✓ | `app/customers/view` | Customer Detail | 08-sales-receivables.md |
| ✓ | `app/customers` | Customers | 08-sales-receivables.md |
| ✓ | `app/dashboard` | Dashboard | 02-auth-workspace-settings.md |
| ✓ | `app/inventory/adjustments` | Stock Adjustments | 10-inventory.md |
| ✓ | `app/inventory/batches` | Batches & Expiry | 10-inventory.md |
| ✓ | `app/inventory/classes` | Product Classes | 10-inventory.md |
| ✓ | `app/inventory/companies` | Companies & Brands | 10-inventory.md |
| ✓ | `app/inventory/items` | Product Catalogue | 10-inventory.md |
| ✓ | `app/inventory/movements` | Stock Movements | 10-inventory.md |
| ✓ | `app/inventory/products/view` | Product Detail | 10-inventory.md |
| ✓ | `app/inventory/stock` | Whole Stock | 10-inventory.md |
| ✓ | `app/inventory/stock-in-out` | Stock In / Out | 10-inventory.md |
| ✓ | `app/inventory/transfer` | Stock Transfers | 10-inventory.md |
| ✓ | `app/inventory/warehouses` | Warehouses | 10-inventory.md |
| ✓ | `app/notifications` | Notification Centre | 02-auth-workspace-settings.md |
| ✓ | `app/payables/ageing` | AP Ageing & Reports | 09-purchases-payables.md |
| ✓ | `app/payables/payments` | Payments & Allocation | 09-purchases-payables.md |
| ✓ | `app/periods` | Fiscal Years & Periods | 03-accounting.md |
| ✓ | `app/profile` | My Profile | 02-auth-workspace-settings.md |
| ✓ | `app/purchases/bills/new` | New Vendor Bill | 09-purchases-payables.md |
| ✓ | `app/purchases/bills` | Vendor Bills | 09-purchases-payables.md |
| ✓ | `app/purchases/debit-notes` | Debit Notes | 09-purchases-payables.md |
| ✓ | `app/purchases/grn` | Goods Received (GRN) | 09-purchases-payables.md |
| ✓ | `app/purchases/orders` | Purchase Orders | 09-purchases-payables.md |
| ✓ | `app/purchases/voucher` | Purchase Voucher | 09-purchases-payables.md |
| ✓ | `app/receivables/ageing` | AR Ageing & Reports | 08-sales-receivables.md |
| ✓ | `app/receivables/receipts` | Receipts & Allocation | 08-sales-receivables.md |
| ✓ | `app/reports/balance-sheet` | Balance Sheet | 07-financial-reports.md |
| ✓ | `app/reports/day-book` | Day Book | 07-financial-reports.md |
| ✓ | `app/reports/gl` | General Ledger | 07-financial-reports.md |
| ✓ | `app/reports/pnl` | Profit & Loss | 07-financial-reports.md |
| ✓ | `app/reports/trial-balance` | Trial Balance | 07-financial-reports.md |
| ✓ | `app/reports` | Reports Centre | 07-financial-reports.md |
| ✓ | `app/sales/credit-notes` | Credit Notes | 08-sales-receivables.md |
| ✓ | `app/sales/invoices/new` | New Sales Invoice | 08-sales-receivables.md |
| ✓ | `app/sales/invoices/view` | Invoice View | 08-sales-receivables.md |
| ✓ | `app/sales/invoices` | Sales Invoices | 08-sales-receivables.md |
| ✓ | `app/sales/orders` | Sales Orders | 08-sales-receivables.md |
| ✓ | `app/sales/quotations` | Quotations | 08-sales-receivables.md |
| ✓ | `app/sales/voucher` | Sales Voucher | 08-sales-receivables.md |
| ✓ | `app/settings/audit` | Audit Trail | 02-auth-workspace-settings.md |
| ✓ | `app/settings/roles` | Roles & Permissions | 02-auth-workspace-settings.md |
| ✓ | `app/settings/users` | Users | 02-auth-workspace-settings.md |
| ✓ | `app/settings` | Company Settings | 02-auth-workspace-settings.md |
| ✓ | `app/tax/codes` | Tax Codes | 06-tax.md |
| ✓ | `app/unauthorized` | No access | 02-auth-workspace-settings.md |
| ✓ | `app/vendors/view` | Vendor Detail | 09-purchases-payables.md |
| ✓ | `app/vendors` | Vendors | 09-purchases-payables.md |
| ✓ | `login/forgot` | Reset password | 02-auth-workspace-settings.md |
| ✓ | `login/mfa` | Verify sign in | 02-auth-workspace-settings.md |
| ✓ | `login` | Sign in | 02-auth-workspace-settings.md |

## Interactive map

Open `index.html` in this folder (works from file://, no server) for the interactive page -> entity & field map: screen navigator, field mapping validated against the DDL, entity -> screens reverse view and a coverage dashboard. Deep links: `index.html#screen=app/sales/invoices`, `#table=Sales.SalesInvoices`, `#tab=coverage`, `#debug=1`.

Rebuild after editing any entity doc or SQL file:

    powershell -File build-entity-map.ps1
