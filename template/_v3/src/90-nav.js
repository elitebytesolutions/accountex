/* Sidebar navigation per portal. Every `r` here must have a matching <section data-route>. */
window.NAV = {
  admin: {
    brand: { title: 'Finsoft', sub: 'Platform Console' },
    tiles: [
      { label: 'Overview', sub: 'Platform health', icon: 'layout-grid', r: 'admin/dashboard' },
      { label: 'Onboard', sub: 'New tenant', icon: 'rocket', r: 'admin/tenants/new' },
    ],
    groups: [
      { title: 'Tenants', tag: 'Your customers', tagIcon: 'building-2', modules: [
        { label: 'Tenant Management', desc: 'Organisations on Finsoft', icon: 'building-2', children: [
          { label: 'All Tenants', icon: 'list', r: 'admin/tenants' },
          { label: 'Onboard Tenant', icon: 'circle-plus', r: 'admin/tenants/new' },
          { label: 'Tenant Detail', icon: 'building', r: 'admin/tenants/view' },
        ]},
        { label: 'Templates', desc: 'COA & master seeds', icon: 'layers', r: 'admin/templates' },
      ]},
      { title: 'Growth', tag: 'Revenue engine', tagIcon: 'trending-up', modules: [
        { label: 'SaaS Analytics', desc: 'MRR, churn & cohorts', icon: 'chart-line', r: 'admin/analytics' },
        { label: 'Leads CRM', desc: 'Lead to trial to paid', icon: 'kanban', r: 'admin/leads' },
        { label: 'Partners & Coupons', desc: 'Resellers & discounts', icon: 'handshake', r: 'admin/partners' },
      ]},
      { title: 'Billing', tag: 'Revenue', tagIcon: 'banknote', modules: [
        { label: 'Plans & Billing', desc: 'Pricing and subscriptions', icon: 'credit-card', children: [
          { label: 'Plans & Pricing', icon: 'tags', r: 'admin/plans' },
          { label: 'Subscriptions', icon: 'repeat', r: 'admin/subscriptions' },
          { label: 'Platform Invoices', icon: 'receipt-text', r: 'admin/invoices' },
          { label: 'Dunning & Collections', icon: 'alarm-clock', r: 'admin/dunning' },
          { label: 'Usage & Quotas', icon: 'gauge', r: 'admin/usage' },
        ]},
        { label: 'Modules & Flags', desc: 'Feature rollout', icon: 'toggle-right', r: 'admin/features' },
      ]},
      { title: 'Operations', tag: 'Keep it running', tagIcon: 'activity', modules: [
        { label: 'Support', desc: 'Tickets & announcements', icon: 'life-buoy', children: [
          { label: 'Support Tickets', icon: 'messages-square', r: 'admin/support', badge: '9' },
          { label: 'Announcements', icon: 'megaphone', r: 'admin/announcements' },
          { label: 'Communications', icon: 'mail', r: 'admin/comms' },
        ]},
        { label: 'System', desc: 'Health, jobs & backups', icon: 'server', children: [
          { label: 'System Health', icon: 'heart-pulse', r: 'admin/system' },
          { label: 'Platform Audit Log', icon: 'scroll-text', r: 'admin/audit' },
          { label: 'Status & Incidents', icon: 'siren', r: 'admin/status' },
          { label: 'Security & Privacy', icon: 'lock-keyhole', r: 'admin/security' },
          { label: 'API & Webhooks', icon: 'webhook', r: 'admin/integrations' },
          { label: 'Tax Master', icon: 'percent', r: 'admin/tax-master' },
        ]},
        { label: 'Platform Team', desc: 'Staff & roles', icon: 'shield-check', r: 'admin/staff' },
      ]},
    ],
    foot: { initials: 'SJ', name: 'Saim Javed', role: 'Super Admin' },
  },

  app: {
    brand: { title: 'Finsoft', sub: 'Al-Noor Enterprises' },
    tiles: [
      { label: 'Dashboard', sub: 'Overview & insights', icon: 'layout-grid', r: 'app/dashboard' },
      { label: "Today's Work", sub: 'Tasks & activities', icon: 'list-checks', r: 'app/today', badge: '7' },
    ],
    groups: [
      { title: 'Workspace', tag: 'Get things done', tagIcon: 'zap', modules: [
        { label: 'Approvals Inbox', desc: 'Everything waiting on you', icon: 'inbox', r: 'app/approvals', badge: '9' },
        { label: 'Setup Guide', desc: 'Finish onboarding', icon: 'rocket', r: 'app/setup' },
        { label: 'Activity Feed', desc: 'Comments & mentions', icon: 'messages-square', r: 'app/activity' },
      ]},
      { title: 'Finance', tag: 'Manage your finances', tagIcon: 'wallet', modules: [
        { label: 'Accounts', desc: 'Chart of accounts and ledgers', icon: 'landmark', children: [
          { label: 'Chart of Accounts', icon: 'network', r: 'app/accounting/coa' },
          { label: 'Account Ledger', icon: 'book-open', r: 'app/accounting/ledger' },
          { label: 'Opening Balances', icon: 'flag', r: 'app/accounting/opening' },
          { label: 'Cost Centres & Projects', icon: 'folder-kanban', r: 'app/accounting/cost-centres' },
        ]},
        { label: 'Voucher Management', desc: 'Create and manage vouchers', icon: 'receipt-text', children: [
          { label: 'Voucher Register', icon: 'clipboard-list', r: 'app/accounting/vouchers', badge: '6' },
          { label: 'New Voucher', icon: 'file-plus', r: 'app/accounting/vouchers/new' },
          { label: 'Voucher Detail', icon: 'file-text', r: 'app/accounting/vouchers/view' },
          { label: 'Recurring Templates', icon: 'repeat', r: 'app/accounting/recurring' },
        ]},
        { label: 'Bank', desc: 'Banking and cheque operations', icon: 'building-2', children: [
          { label: 'Bank Accounts', icon: 'landmark', r: 'app/bank/accounts' },
          { label: 'Bank Transactions', icon: 'arrow-left-right', r: 'app/bank/transactions' },
          { label: 'Receive & Issue Cheques', icon: 'arrow-down-right', r: 'app/bank/cheques' },
          { label: 'Cheque Voucher (Bulk)', icon: 'sheet', r: 'app/bank/cheque-voucher' },
          { label: 'Cheque Register & PDC', icon: 'scroll', r: 'app/bank/cheque-register' },
          { label: 'Bank Reconciliation', icon: 'git-compare', r: 'app/bank/reconciliation' },
          { label: 'Bank Book', icon: 'book', r: 'app/bank/book' },
          { label: 'Bank Rules & Import', icon: 'wand-sparkles', r: 'app/bank/rules' },
        ]},
        { label: 'Cash', desc: 'Cash book & petty cash', icon: 'banknote', children: [
          { label: 'Cash Book', icon: 'book-open-text', r: 'app/cash/book' },
          { label: 'Cash Ledger', icon: 'notebook-tabs', r: 'app/cash/ledger' },
          { label: 'Petty Cash', icon: 'coins', r: 'app/cash/petty' },
          { label: 'Expense Claims', icon: 'receipt', r: 'app/cash/expenses' },
        ]},
        { label: 'Fixed Assets', desc: 'Register & depreciation', icon: 'warehouse', children: [
          { label: 'Asset Register', icon: 'package', r: 'app/assets' },
          { label: 'Asset Detail', icon: 'file-box', r: 'app/assets/view' },
          { label: 'Run Depreciation', icon: 'trending-down', r: 'app/assets/depreciation' },
          { label: 'Disposals', icon: 'package-x', r: 'app/assets/disposals' },
        ]},
        { label: 'Budgeting', desc: 'Plan and compare', icon: 'target', children: [
          { label: 'Budgets', icon: 'clipboard-check', r: 'app/budgets' },
          { label: 'Budget vs Actual', icon: 'chart-column', r: 'app/budgets/variance' },
        ]},
        { label: 'Tax & Compliance', desc: 'FBR, GST and WHT', icon: 'percent', children: [
          { label: 'Tax Codes', icon: 'tags', r: 'app/tax/codes' },
          { label: 'Sales Tax Return', icon: 'file-spreadsheet', r: 'app/tax/sales-tax' },
          { label: 'Withholding Tax', icon: 'file-minus', r: 'app/tax/wht' },
          { label: 'FBR Integration', icon: 'plug', r: 'app/tax/fbr' },
        ]},
        { label: 'Period Close', desc: 'Fiscal years & closing', icon: 'calendar-check', children: [
          { label: 'Fiscal Periods', icon: 'calendar-range', r: 'app/periods' },
          { label: 'Year-end Close', icon: 'lock', r: 'app/periods/close' },
        ]},
      ]},
      { title: 'Sales & Receivables', tag: 'Grow your business', tagIcon: 'shopping-cart', modules: [
        { label: 'Sales', desc: 'Quotes, orders and invoicing', icon: 'shopping-cart', children: [
          { label: 'Sales Voucher', icon: 'receipt-text', r: 'app/sales/voucher' },
          { label: 'POS / Counter Sale', icon: 'monitor-smartphone', r: 'app/sales/pos' },
          { label: 'Quotations', icon: 'file-pen', r: 'app/sales/quotations' },
          { label: 'Sales Orders', icon: 'clipboard-list', r: 'app/sales/orders' },
          { label: 'Sales Invoices', icon: 'receipt-text', r: 'app/sales/invoices' },
          { label: 'New Invoice', icon: 'file-plus', r: 'app/sales/invoices/new' },
          { label: 'Invoice View', icon: 'file-text', r: 'app/sales/invoices/view' },
          { label: 'Delivery Challans', icon: 'truck', r: 'app/sales/challans' },
          { label: 'Sales Returns', icon: 'undo-2', r: 'app/sales/returns' },
          { label: 'Credit Notes', icon: 'file-minus-2', r: 'app/sales/credit-notes' },
          { label: 'Recurring Invoices', icon: 'repeat', r: 'app/sales/recurring' },
          { label: 'Price Lists & Schemes', icon: 'tags', r: 'app/sales/price-lists' },
        ]},
        { label: 'Receivables', desc: 'Collections & credit', icon: 'hand-coins', children: [
          { label: 'Customers', icon: 'users', r: 'app/customers' },
          { label: 'Customer Detail', icon: 'user-round', r: 'app/customers/view' },
          { label: 'Receipts & Allocation', icon: 'badge-dollar-sign', r: 'app/receivables/receipts' },
          { label: 'AR Ageing & Reports', icon: 'hourglass', r: 'app/receivables/ageing' },
          { label: 'Credit Control', icon: 'shield-alert', r: 'app/receivables/credit' },
          { label: 'Payment Reminders', icon: 'bell-ring', r: 'app/receivables/reminders' },
        ]},
      ]},
      { title: 'Purchases & Payables', tag: 'Buy smart', tagIcon: 'package', modules: [
        { label: 'Purchases', desc: 'Orders and vendor bills', icon: 'shopping-bag', children: [
          { label: 'Purchase Voucher', icon: 'shopping-basket', r: 'app/purchases/voucher' },
          { label: 'Purchase Orders', icon: 'clipboard-list', r: 'app/purchases/orders' },
          { label: 'Goods Received (GRN)', icon: 'package-check', r: 'app/purchases/grn' },
          { label: 'Vendor Bills', icon: 'receipt', r: 'app/purchases/bills' },
          { label: 'New Bill', icon: 'file-plus', r: 'app/purchases/bills/new' },
          { label: 'Purchase Returns', icon: 'undo-2', r: 'app/purchases/returns' },
          { label: 'Debit Notes', icon: 'file-minus-2', r: 'app/purchases/debit-notes' },
          { label: 'Landed Cost', icon: 'ship', r: 'app/purchases/landed-cost' },
        ]},
        { label: 'Payables', desc: 'Vendors & payments', icon: 'wallet', children: [
          { label: 'Vendors', icon: 'truck', r: 'app/vendors' },
          { label: 'Vendor Detail', icon: 'store', r: 'app/vendors/view' },
          { label: 'Payments & Allocation', icon: 'send', r: 'app/payables/payments' },
          { label: 'AP Ageing & Reports', icon: 'hourglass', r: 'app/payables/ageing' },
        ]},
        { label: 'Inventory', desc: 'Items, stock & warehouses', icon: 'boxes', children: [
          { label: 'Items & Services', icon: 'package', r: 'app/inventory/items' },
          { label: 'Stock Levels', icon: 'bar-chart-3', r: 'app/inventory/stock' },
          { label: 'Stock Adjustments', icon: 'sliders-horizontal', r: 'app/inventory/adjustments' },
          { label: 'Stock Vouchers', icon: 'gift', r: 'app/inventory/stock-vouchers' },
          { label: 'Warehouses', icon: 'warehouse', r: 'app/inventory/warehouses' },
          { label: 'Inventory Reports', icon: 'file-chart-column', r: 'app/inventory/reports' },
        ]},
      ]},
      { title: 'Workforce', tag: 'Your people', tagIcon: 'users', modules: [
        { label: 'People', desc: 'Employees & organisation', icon: 'users', children: [
          { label: 'Employees', icon: 'contact', r: 'app/hr/employees' },
          { label: 'Employee Profile', icon: 'user-round', r: 'app/hr/employees/view' },
          { label: 'Add Employee', icon: 'user-plus', r: 'app/hr/employees/new' },
          { label: 'Org Chart', icon: 'network', r: 'app/hr/org' },
          { label: 'Departments & Designations', icon: 'building', r: 'app/hr/departments' },
        ]},
        { label: 'Time & Attendance', desc: 'Attendance, shifts & holidays', icon: 'clock', children: [
          { label: 'Attendance Today', icon: 'fingerprint', r: 'app/hr/attendance' },
          { label: 'Attendance Register', icon: 'calendar-days', r: 'app/hr/attendance/register' },
          { label: 'Regularisation', icon: 'clock-alert', r: 'app/hr/attendance/requests', badge: '3' },
          { label: 'Shifts & Rosters', icon: 'calendar-clock', r: 'app/hr/shifts' },
          { label: 'Holidays', icon: 'party-popper', r: 'app/hr/holidays' },
          { label: 'Overtime', icon: 'timer', r: 'app/hr/overtime' },
          { label: 'Biometric Devices', icon: 'scan-face', r: 'app/hr/devices' },
        ]},
        { label: 'Leave', desc: 'Requests, balances & policies', icon: 'plane', children: [
          { label: 'Leave Overview', icon: 'calendar-heart', r: 'app/hr/leave' },
          { label: 'Leave Requests', icon: 'inbox', r: 'app/hr/leave/requests', badge: '4' },
          { label: 'Leave Balances', icon: 'scale', r: 'app/hr/leave/balances' },
          { label: 'Leave Policies', icon: 'book-check', r: 'app/hr/leave/policies' },
        ]},
        { label: 'Payroll', desc: 'Salaries, payslips & loans', icon: 'wallet-cards', children: [
          { label: 'Payroll Overview', icon: 'gauge', r: 'app/hr/payroll' },
          { label: 'Run Payroll', icon: 'play-circle', r: 'app/hr/payroll/run' },
          { label: 'Salary Structures', icon: 'layers', r: 'app/hr/payroll/structures' },
          { label: 'Payslips', icon: 'file-text', r: 'app/hr/payroll/payslips' },
          { label: 'Payslip View', icon: 'file-check', r: 'app/hr/payroll/payslip' },
          { label: 'Loans & Advances', icon: 'hand-coins', r: 'app/hr/loans' },
          { label: 'Final Settlement', icon: 'user-x', r: 'app/hr/settlement' },
          { label: 'Statutory Reports', icon: 'file-spreadsheet', r: 'app/hr/payroll/reports' },
        ]},
        { label: 'Talent', desc: 'Hiring, onboarding & reviews', icon: 'sparkles', children: [
          { label: 'Recruitment', icon: 'briefcase', r: 'app/hr/recruitment' },
          { label: 'Onboarding', icon: 'door-open', r: 'app/hr/onboarding' },
          { label: 'Offboarding', icon: 'log-out', r: 'app/hr/offboarding' },
          { label: 'Performance', icon: 'star', r: 'app/hr/performance' },
          { label: 'Training', icon: 'graduation-cap', r: 'app/hr/training' },
        ]},
      ]},
      { title: 'Insights', tag: 'See the bigger picture', tagIcon: 'chart-pie', modules: [
        { label: 'Financial Statements', desc: 'Reports and statements', icon: 'chart-column', children: [
          { label: 'Reports Hub', icon: 'layout-dashboard', r: 'app/reports' },
          { label: 'Trial Balance', icon: 'scale', r: 'app/reports/trial-balance' },
          { label: 'Profit & Loss', icon: 'trending-up', r: 'app/reports/pnl' },
          { label: 'Balance Sheet', icon: 'columns-2', r: 'app/reports/balance-sheet' },
          { label: 'Cash Flow', icon: 'waves', r: 'app/reports/cash-flow' },
          { label: 'General Ledger', icon: 'book-open', r: 'app/reports/gl' },
          { label: 'Day Book', icon: 'calendar', r: 'app/reports/day-book' },
        ]},
        { label: 'Analytics', desc: 'HR reports & report studio', icon: 'chart-pie', children: [
          { label: 'HR Reports', icon: 'users-round', r: 'app/hr/reports' },
          { label: 'Report Studio', icon: 'wand-sparkles', r: 'app/reports/studio' },
        ]},
      ]},
      { title: 'System', tag: 'Configure Finsoft', tagIcon: 'settings', modules: [
        { label: 'Settings', desc: 'Company, users and controls', icon: 'settings', children: [
          { label: 'Company Settings', icon: 'building-2', r: 'app/settings' },
          { label: 'Users', icon: 'user-cog', r: 'app/settings/users' },
          { label: 'Roles & Permissions', icon: 'shield-check', r: 'app/settings/roles' },
          { label: 'Approval Workflows', icon: 'git-branch', r: 'app/settings/approvals' },
          { label: 'Document Templates', icon: 'printer', r: 'app/settings/templates' },
          { label: 'Integrations', icon: 'plug', r: 'app/settings/integrations' },
          { label: 'Data Import', icon: 'file-up', r: 'app/import' },
          { label: 'Audit Trail', icon: 'scroll-text', r: 'app/settings/audit' },
          { label: 'Backup & Restore', icon: 'database-backup', r: 'app/settings/backup' },
        ]},
        { label: 'Notifications', desc: 'Alerts & activity', icon: 'bell', r: 'app/notifications', badge: '12' },
        { label: 'My Profile', desc: 'Account & security', icon: 'circle-user', r: 'app/profile' },
      ]},
    ],
    foot: { initials: 'SJ', name: 'Sana Javed', role: 'Finance Manager' },
  },

  ess: {
    brand: { title: 'Finsoft', sub: 'Employee Self-Service' },
    tiles: [
      { label: 'Home', sub: 'My day', icon: 'house', r: 'ess/dashboard' },
      { label: 'Notifications', sub: 'Updates for you', icon: 'bell', r: 'ess/notifications', badge: '3' },
    ],
    groups: [
      { title: 'My Work', tag: 'Time & leave', tagIcon: 'clock', modules: [
        { label: 'My Attendance', desc: 'Check-ins & corrections', icon: 'fingerprint', r: 'ess/attendance' },
        { label: 'My Leave', desc: 'Balances & requests', icon: 'calendar-heart', r: 'ess/leave' },
        { label: 'Shifts & Swaps', desc: 'Roster & swap requests', icon: 'calendar-clock', r: 'ess/shifts' },
        { label: 'My Team', desc: 'Team today & approvals', icon: 'users', r: 'ess/team', badge: '4' },
      ]},
      { title: 'My Money', tag: 'Pay & claims', tagIcon: 'wallet', modules: [
        { label: 'My Payslips', desc: 'Salary & tax', icon: 'file-text', r: 'ess/payslips' },
        { label: 'Tax Declarations', desc: 'Projection & proofs', icon: 'percent', r: 'ess/tax' },
        { label: 'Loans & Advances', desc: 'Request & repayments', icon: 'hand-coins', r: 'ess/loans' },
        { label: 'Expense Claims', desc: 'Scan & submit receipts', icon: 'receipt', r: 'ess/expenses' },
      ]},
      { title: 'Grow', tag: 'Goals & learning', tagIcon: 'sprout', modules: [
        { label: 'Goals & Reviews', desc: 'OKRs & self-review', icon: 'target', r: 'ess/goals' },
        { label: 'Kudos & Pulse', desc: 'Recognition & surveys', icon: 'heart-handshake', r: 'ess/kudos' },
        { label: 'Onboarding', desc: 'Tasks & policies', icon: 'list-checks', r: 'ess/onboarding' },
      ]},
      { title: 'Me', tag: 'Profile & help', tagIcon: 'user', modules: [
        { label: 'My Profile', desc: 'Details & documents', icon: 'circle-user', r: 'ess/profile' },
        { label: 'Letters & Requests', desc: 'Certificates & NOCs', icon: 'file-badge', r: 'ess/requests' },
        { label: 'Helpdesk', desc: 'Ask HR, IT, Payroll', icon: 'life-buoy', r: 'ess/helpdesk' },
        { label: 'Directory', desc: 'People & org chart', icon: 'contact', r: 'ess/company' },
      ]},
    ],
    foot: { initials: 'BK', name: 'Bilal Khan', role: 'Sales Executive' },
  },
};
