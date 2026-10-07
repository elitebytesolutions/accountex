import { E, type Phase } from "./types";

// ---------------------------------------------------------------------------
// Workspace masters
// ---------------------------------------------------------------------------

export const masters: Phase[] = [
  {
    no: 1, title: "Company core", portal: "workspace", kind: "MASTER", status: "done",
    objective: "Branches, currencies, company profile/settings and document numbering: referenced by every later entity.",
    entities: [
      E("branches", "Branches", ["Company.Branches"], {
        tpl: ["app/settings#set-branches"], api: "settings/branches", perm: ["comp"],
        rules: ["Code unique per tenant", "Cannot deactivate the last active branch or a branch with open documents"],
      }),
      E("currencies", "Currencies & Exchange Rates", ["Company.Currencies", "Company.ExchangeRates"], {
        tpl: ["app/settings#set-finance"], api: "settings/currencies", perm: ["comp"],
        x: ["GET /settings/currencies/:code/rates?from&to: rate history", "POST /settings/currencies/:code/rates: add a dated rate"],
        rules: ["Base currency (Tenants.baseCurrency) cannot be deactivated", "One rate per currency per date; rates are history (no edit after use)"],
      }),
      E("company-settings", "Company Settings & Setup Guide", ["Company.CompanySettings", "Company.CompanySettingValues", "Company.SetupGuideSteps"], {
        tpl: ["app/settings#set-profile", "app/settings#set-branding", "app/settings#set-sales", "app/settings#set-hr", "app/settings#set-tax", "app/setup"],
        api: "settings/company", perm: ["comp"],
        x: ["GET /settings/company: all setting groups", "PATCH /settings/company/:group: update one group", "GET /settings/setup-guide, POST /settings/setup-guide/:step/complete"],
        rules: ["Settings are key/value with typed validation per key", "Logo upload via Attachments (Phase 35 storage; temporary URL field until then)"],
        deps: ["branches"],
      }),
      E("numbering-series", "Numbering Series", ["Company.NumberingSeries", "Company.NumberingSeriesCounters"], {
        tpl: ["app/settings#set-numbering"], api: "settings/numbering-series", perm: ["comp"],
        x: ["GET /settings/numbering-series/:id/preview: next number (Company.getNumberingSeriesPreview)"],
        rules: ["Counters are advanced only inside the posting transaction (no gaps on rollback)", "Prefix/format immutable once a number is issued"],
        deps: ["branches"],
      }),
    ],
  },
  {
    no: 2, title: "Access & security", portal: "workspace", kind: "MASTER", status: "done",
    objective: "Users (with the Employee role trigger), roles/permissions, approval workflows, document templates and the user's own account security.",
    entities: [
      E("users", "Users", ["Company.Users", "Company.UserBranches", "Company.UserWarehouses", "Company.UserRoles"], {
        tpl: ["app/settings/users"], api: "settings/users", perm: ["usr"],
        x: ["Create now with a temporary password (must change at first sign-in); invites are Phase 15", "POST /settings/users/:id/suspend|reactivate|remove", "PUT /settings/users/:id/roles: replace job roles (Employee is kept by trigger)", "POST /settings/users/:id/reset-password"],
        rules: ["Every user always holds EMPLOYEE (DB trigger)", "Email unique per tenant (appUserEmailUidx)", "Cannot suspend yourself or the last Admin"],
        deps: ["branches"],
      }),
      E("roles", "Roles & Permissions", ["Company.Roles", "Company.RolePermissions", "Company.RoleLimits", "Company.Permissions"], {
        tpl: ["app/settings/roles"], api: "settings/roles", perm: ["rol"],
        x: ["GET /settings/permissions: permission catalogue (read-only)", "PUT /settings/roles/:id/permissions: replace grants", "POST /settings/roles/:id/copy"],
        rules: ["System roles (isSystem) cannot be deleted or renamed", "Admin keeps all permissions", "Role limits (approval amounts) validated against currency"],
      }),
      E("approval-workflows", "Approval Workflows", ["Company.ApprovalWorkflows", "Company.ApprovalWorkflowSteps", "Company.ApprovalWorkflowConditions", "Company.ApprovalDelegations"], {
        tpl: ["app/settings/approvals"], api: "settings/approval-workflows", perm: ["wf"],
        x: ["POST /settings/approval-workflows/:id/test: dry-run a document against conditions", "CRUD /settings/approval-delegations"],
        rules: ["One active workflow per document type and condition set", "Steps ordered; approver = role or user", "Segregation of duties: requester cannot approve own document"],
        deps: ["roles", "users"],
      }),
      E("document-templates", "Document Types & Templates", ["Company.DocumentTypes", "Company.DocumentTemplates"], {
        tpl: ["app/settings/templates"], api: "settings/document-templates", perm: ["comp"],
        x: ["POST /settings/document-templates/:id/preview: render sample PDF", "POST /settings/document-templates/:id/set-default"],
        rules: ["One default template per document type"],
      }),
      E("account-security", "Account & Security", ["Company.UserSessions", "Company.UserPreferences"], {
        tpl: ["app/profile/security", "login"], api: "me", perm: [],
        x: ["POST /me/password", "GET|DELETE /me/sessions/:id", "GET|PATCH /me/profile", "GET|PATCH /me/preferences", "POST /auth/login {companyCode,email,password}, POST /auth/logout"],
        rules: ["Always own data only; no permission needed", "Sessions are server-side (Company.UserSessions); revoke takes effect on the next request", "Sign-in screen rebuilt from the template (login) with the company code; it is public"],
        deps: ["users"],
      }),
    ],
  },
  {
    no: 3, title: "Finance structure", portal: "workspace", kind: "MASTER", status: "done",
    objective: "Fiscal calendar, chart of accounts, cost centres/projects and the account mappings that posting uses.",
    entities: [
      E("fiscal-periods", "Fiscal Years & Periods", ["Accounting.FiscalYears", "Accounting.FiscalPeriods", "Accounting.PeriodModuleLocks"], {
        tpl: ["app/periods"], api: "accounting/fiscal-years", perm: ["close"],
        x: ["POST /accounting/fiscal-years/:id/generate-periods", "POST /accounting/periods/:id/lock|unlock (per module)"],
        rules: ["Periods contiguous, no overlap; year starts at Tenants.fiscalYearStartMonth", "Locked period rejects postings (DB check)"],
      }),
      E("chart-of-accounts", "Chart of Accounts", ["Accounting.ChartOfAccounts", "Accounting.AccountBranches", "Accounting.SavedLedgerViews"], {
        tpl: ["app/accounting/coa", "app/accounting/ledger"], api: "accounting/accounts", perm: ["coa"],
        x: ["GET /accounting/accounts/tree", "POST /accounting/accounts/import-template: from Platform COA template", "GET /accounting/accounts/:id/ledger (read; postings arrive in Phase 16)", "CRUD /accounting/ledger-views"],
        rules: ["Code unique; parent/child hierarchy; only leaf accounts are postable", "Cannot delete an account with postings; deactivate instead"],
        deps: ["branches", "currencies"],
      }),
      E("cost-centres", "Cost Centres & Projects", ["Accounting.CostCentres", "Accounting.Projects", "Accounting.ProjectTags", "Accounting.CostAllocationRules", "Accounting.CostAllocationSplits"], {
        tpl: ["app/accounting/cost-centres"], api: "accounting/cost-centres", perm: ["coa"],
        x: ["CRUD /accounting/projects", "CRUD /accounting/cost-allocation-rules (splits must total 100%)"],
        rules: ["Allocation splits sum to 100%"],
        deps: ["chart-of-accounts"],
      }),
      E("account-mappings", "Account Mappings & Posting Roles", ["Company.DefaultAccountMappings", "Company.PostingRoles"], {
        tpl: ["app/settings#set-finance"], api: "settings/account-mappings", perm: ["coa", "comp"],
        x: ["PUT /settings/account-mappings: bulk save"],
        rules: ["Every posting role used by a module must map to a postable account before that module posts"],
        deps: ["chart-of-accounts"],
      }),
    ],
  },
  {
    no: 4, title: "Tax & treasury setup", portal: "workspace", kind: "MASTER", status: "done",
    objective: "Tax codes and the bank/cash/cheque/expense masters treasury transactions need.",
    entities: [
      E("tax-codes", "Tax Codes", ["Tax.TaxCodes", "Tax.TaxCodeRates"], {
        tpl: ["app/tax/codes"], api: "tax/codes", perm: ["tax"],
        x: ["Rates edited as a dated list on the tax code (no overlapping periods)"],
        rules: ["Rates are effective-dated history", "GL accounts must be postable", "Manual entry; import from the Platform Tax Master arrives with Phase 37"],
        deps: ["chart-of-accounts"],
      }),
      E("bank-accounts", "Banks & Bank Accounts", ["BankCash.Banks", "BankCash.BankAccounts"], {
        tpl: ["app/bank/accounts"], api: "bank/accounts", perm: ["bank"],
        x: ["CRUD /bank/banks (common Pakistani banks seeded per company; add inline)"],
        rules: ["Each bank account linked to one postable GL account (created or linked)", "IBAN format validation", "At most one Primary account"],
        deps: ["chart-of-accounts", "currencies", "branches"],
      }),
      E("cash-accounts", "Cash Accounts & Categories", ["BankCash.CashAccounts", "BankCash.CashCategories"], {
        tpl: [], api: "cash/accounts", perm: ["cash"],
        x: ["CRUD /cash/categories"],
        rules: ["One cash account per GL account; its code is the GL code (created or linked)", "Petty / imprest accounts need an imprest amount"],
        deps: ["chart-of-accounts", "branches"],
        open: ["No setup template: template-styled panels on /cash/setup (decided 2026-10-05); the Cash Book phase opens the same drawers"],
      }),
      E("cheque-books", "Cheque Books", ["BankCash.ChequeBooks"], {
        tpl: [], api: "bank/cheque-books", perm: ["bank"],
        rules: ["Leaf range must not overlap per bank account", "One active book per bank account"],
        deps: ["bank-accounts"],
        open: ["No setup template (the Cheques Issued tab lists cheques): template-styled tab in the bank account drawer (decided 2026-10-05)"],
      }),
      E("expense-categories", "Expense Categories", ["BankCash.ExpenseCategories"], {
        tpl: [], api: "cash/expense-categories", perm: ["cash"],
        rules: ["Each category maps to a postable expense account"],
        deps: ["chart-of-accounts"],
        open: ["No setup template: template-styled panel on /cash/setup (decided 2026-10-05); Expense Claims opens the same drawer later"],
      }),
    ],
  },
  {
    no: 5, title: "Treasury rules & compliance setup", portal: "workspace", kind: "MASTER", status: "done",
    objective: "Bank matching rules, petty cash funds, fixed asset categories and FBR (POS integration) settings.",
    entities: [
      E("bank-rules", "Bank Rules", ["BankCash.BankRules", "BankCash.BankRuleConditions"], {
        tpl: ["app/bank/rules"], api: "bank/rules", perm: ["bank"],
        x: ["POST /bank/rules/:id/test: run against sample statement lines", "PUT /bank/rules/order"],
        rules: ["Statement import and invoice matching on this screen arrive with Banking (Phase 17)"],
        deps: ["bank-accounts", "chart-of-accounts"],
      }),
      E("petty-cash-funds", "Petty Cash Funds", ["BankCash.PettyCashFunds"], {
        tpl: ["app/cash/petty"], api: "cash/petty-funds", perm: ["cash"],
        rules: ["Imprest amount > 0; custodian is an active user", "The fund drives its petty cash account: created with it (or an unused petty account linked); imprest and custodian copied onto the account"],
        deps: ["cash-accounts", "users"],
      }),
      E("asset-categories", "Fixed Asset Categories", ["FixedAssets.FixedAssetCategories"], {
        tpl: [], api: "assets/categories", perm: ["fa"],
        rules: ["Depreciation method and rate required unless NONE; cost / accumulated depreciation / expense accounts postable"],
        deps: ["chart-of-accounts"],
        open: ["No setup template (app/assets is the asset register): template-styled page /assets/categories (decided 2026-10-05)"],
      }),
      E("fbr-settings", "FBR Settings", ["Tax.FbrSettings", "Tax.FbrBranchMappings", "Company.TenantSecrets"], {
        tpl: ["app/tax/fbr"], api: "tax/fbr", perm: ["tax"],
        rules: ["Credentials encrypted at rest (AES-256-GCM, APP_ENCRYPTION_KEY) in Company.TenantSecrets; never returned by the API", "Test connection and sync arrive with FBR Submissions (Phase 28)"],
        deps: ["branches"],
      }),
      E("sod-rules", "Segregation-of-Duties Rules", ["Company.SegregationOfDutiesRules"], {
        tpl: ["app/settings/roles"], api: "settings/sod-rules", perm: ["rol"],
        x: ["CRUD /settings/sod-rules; Roles & Permissions reads conflicts from these rules"],
        rules: ["Moved from Phase 3: until then the Phase 2 rules in src/shared/access/sod.ts apply", "Default rules seeded per company (same as the Phase 2 code rules), all WARN; BLOCK rules refuse saving a role"],
        deps: ["roles"],
        open: ["No template for managing rules (Roles only shows conflicts): template-styled tab on /settings/roles (decided 2026-10-05)"],
      }),
    ],
  },
  {
    no: 6, title: "Product setup", portal: "workspace", kind: "MASTER", status: "done",
    objective: "Units, brands, classes, warehouses and stock movement reasons needed before products and stock.",
    entities: [
      E("units", "Units of Measure", ["Inventory.UnitsOfMeasure"], {
        tpl: [], api: "inventory/units", perm: ["item"],
        rules: ["System units seeded per company (PCS, PKT, BOX, CTN, DZN, KG, G, L, ML, M); system rows can't be deleted"],
        open: ["No dedicated template: template-styled page /inventory/units (decided 2026-10-05)"],
      }),
      E("brands", "Brands / Companies", ["Inventory.ProductCompanies"], {
        tpl: ["app/inventory/companies"], api: "inventory/companies", perm: ["item"],
      }),
      E("product-classes", "Product Classes", ["Inventory.ProductClasses", "Inventory.ProductSubclasses"], {
        tpl: ["app/inventory/classes"], api: "inventory/classes", perm: ["item"],
        rules: ["Subclass names unique within a class"],
      }),
      E("warehouses", "Warehouses & Bins", ["Inventory.Warehouses", "Inventory.WarehouseBins"], {
        tpl: ["app/inventory/warehouses"], api: "inventory/warehouses", perm: ["wh"],
        rules: ["Warehouse belongs to a branch; cannot deactivate with stock on hand", "One primary warehouse: making another primary moves the flag", "Bins managed inside the warehouse drawer; VAN type hidden until Distribution vans exist"],
        deps: ["branches"],
      }),
      E("movement-reasons", "Stock Movement Reasons", ["Inventory.StockMovementReasons"], {
        tpl: [], api: "inventory/movement-reasons", perm: ["adj"],
        rules: ["System reasons seeded per company (opening, found, damaged, expired, theft / loss, internal use, samples, count variance); system rows can't be deleted"],
        deps: ["chart-of-accounts"],
        open: ["No dedicated template (adjustments only shows a by-reason report): template-styled page /inventory/reasons (decided 2026-10-05)"],
      }),
    ],
  },
  {
    no: 7, title: "Parties", portal: "workspace", kind: "MASTER", status: "done",
    objective: "Customers and vendors with their groups, contacts, addresses and bank accounts.",
    entities: [
      E("customer-groups", "Customer Groups", ["Sales.CustomerGroups"], {
        tpl: ["app/customers"], api: "sales/customer-groups", perm: ["cust"],
        open: ["No template (only a filter on app/customers): template-styled drawer from /customers (decided 2026-10-05)"],
      }),
      E("customers", "Customers", ["Sales.Customers", "Sales.CustomerAddresses", "Sales.CustomerContacts", "Sales.CustomerNotes"], {
        tpl: ["app/customers", "app/customers/view"], api: "sales/customers", perm: ["cust"],
        x: ["GET /sales/customers/:id/statement (read; data from Phase 23+)", "CRUD /sales/customers/:id/contacts|addresses|notes", "POST /sales/customers/import (Phase 35 importer reuses the use case)"],
        rules: ["NTN/STRN/CNIC format checks", "Credit limit >= 0", "Receivable account postable", "Price list / price tier offered from Phase 9; opening balance entered and posted in Phase 16 (decided 2026-10-05)"],
        deps: ["customer-groups", "chart-of-accounts", "tax-codes"],
      }),
      E("vendor-categories", "Vendor Categories", ["Purchases.VendorCategories"], {
        tpl: ["app/vendors"], api: "purchases/vendor-categories", perm: ["vend"],
        open: ["No template (only a filter on app/vendors): template-styled drawer from /vendors (decided 2026-10-05)"],
      }),
      E("vendors", "Vendors", ["Purchases.Vendors", "Purchases.VendorContacts", "Purchases.VendorBankAccounts"], {
        tpl: ["app/vendors", "app/vendors/view"], api: "purchases/vendors", perm: ["vend"],
        x: ["CRUD /purchases/vendors/:id/contacts|bank-accounts", "GET /purchases/vendors/:id/statement (read)"],
        rules: ["WHT status from FBR active-taxpayer check (manual flag until integration)", "The vendor row's bank / IBAN mirror its primary bank account"],
        deps: ["vendor-categories", "chart-of-accounts", "tax-codes"],
      }),
    ],
  },
  {
    no: 8, title: "Products", portal: "workspace", kind: "MASTER", status: "done",
    objective: "The product catalogue with units, barcodes, suppliers and batches, plus kits, label templates and reorder rules.",
    entities: [
      E("products", "Products", ["Inventory.Products", "Inventory.ProductUnits", "Inventory.ProductBarcodes", "Inventory.ProductSuppliers", "Inventory.ProductBatches", "Inventory.ProductPriceLogs"], {
        tpl: ["app/inventory/items", "app/inventory/products/view", "app/inventory/batches"], api: "inventory/products", perm: ["item"],
        x: ["CRUD /inventory/products/:id/units|barcodes|suppliers", "GET /inventory/products/:id/price-log (read-only)", "GET /inventory/products/lookup?barcode="],
        rules: ["SKU and barcode unique per tenant", "Base unit required; conversion factors > 0", "Price changes write ProductPriceLogs", "Batches: register with manual add and disposition changes; stock moves from Phase 20 (decided 2026-10-06)", "No product images until a shared file-storage feature (decided 2026-10-06)"],
        deps: ["units", "brands", "product-classes", "vendors", "tax-codes"],
      }),
      E("kits", "Kits & Bundles", ["Inventory.KitsAndBundles", "Inventory.KitComponents"], {
        tpl: ["app/inventory/kits"], api: "inventory/kits", perm: ["item"],
        rules: ["A kit cannot contain itself (cycle check)"],
        deps: ["products"],
      }),
      E("barcode-labels", "Barcode Labels", ["Inventory.BarcodeLabelTemplates", "Inventory.BarcodeLabelJobs", "Inventory.BarcodeLabelJobLines"], {
        tpl: ["app/inventory/labels"], api: "inventory/label-templates", perm: ["item"],
        x: ["POST /inventory/label-jobs: records a printed job (printing is browser print of the preview; no server PDF, decided 2026-10-06)"],
        deps: ["products"],
      }),
      E("reorder-rules", "Reorder Rules", ["Inventory.ReorderRules"], {
        tpl: ["app/inventory/demand"], api: "inventory/reorder-rules", perm: ["item"],
        rules: ["Low <= high level; one rule per product per warehouse (null = all)", "Rules edited on the product detail; /inventory/demand shows only the Reorder Suggestions tab until Phase 22 adds Demand of Goods (decided 2026-10-06)"],
        deps: ["products", "warehouses"],
      }),
    ],
  },
  {
    no: 9, title: "Pricing & collections setup", portal: "workspace", kind: "MASTER", status: "done",
    objective: "Price lists, schemes, reminder templates/rules and wholesale price tiers used by sales.",
    entities: [
      E("price-lists", "Price Lists", ["Sales.PriceLists", "Sales.PriceListItems", "Sales.PriceListQuantityBreaks"], {
        tpl: ["app/sales/price-lists"], api: "sales/price-lists", perm: ["quo"],
        x: ["POST /sales/price-lists/:id/items/bulk", "POST /sales/price-lists/:id/copy", "GET /sales/price-lists/resolve?customer&product&qty"],
        rules: ["Effective-dated; quantity breaks ascending", "Writes need quo:approve (approvers), views quo:view; assigned via customer group / customer priceListId (decided 2026-10-07)"],
        deps: ["products", "customer-groups", "currencies"],
      }),
      E("sales-schemes", "Sales Schemes", ["Sales.SalesSchemes", "Sales.SalesSchemeItems", "Sales.SalesSchemeEligibilities"], {
        tpl: ["app/sales/price-lists"], api: "sales/schemes", perm: ["quo"],
        rules: ["Buy/free item rules validated; date window required"],
        deps: ["products", "customer-groups"],
        x: ["Schemes are the template's Schemes tab on /sales/price-lists (decided 2026-10-07)"],
      }),
      E("reminder-setup", "Payment Reminder Setup", ["Sales.PaymentReminderTemplates", "Sales.PaymentReminderRules"], {
        tpl: ["app/receivables/reminders"], api: "receivables/reminder-rules", perm: ["rcpt"],
        x: ["CRUD /receivables/reminder-templates", "POST /receivables/reminder-templates/:id/preview"],
        rules: ["Seeded per company: 4 templates (EN + UR) and 4 rules (-3, 0, +7, +15 days); sending, logs and KPIs arrive with receivables (decided 2026-10-07)"],
      }),
      E("price-tiers", "Price Tiers", ["Distribution.PriceTiers"], {
        tpl: ["app/sales/price-lists"], api: "distribution/price-tiers", perm: ["pricetier"],
        rules: ["Added 'Price tiers' tab on /sales/price-lists; the three tiers (PriceTierCode lookup) are seeded per company and edited, not added (decided 2026-10-07)"],
      }),
    ],
  },
  {
    no: 10, title: "Organisation", portal: "workspace", kind: "MASTER", status: "done",
    objective: "HR organisation structure, shifts and holidays.",
    entities: [
      E("departments", "Departments", ["HumanResources.Departments"], {
        tpl: ["app/hr/departments", "app/hr/org"], api: "hr/departments", perm: ["emp"],
        rules: ["Hierarchy without cycles", "/hr/org shows the Departments and Positions views now; People view from Phase 11; cost centre = pick an existing one (decided 2026-10-07)"], deps: ["branches"],
      }),
      E("designations", "Designations", ["HumanResources.Designations"], {
        tpl: ["app/hr/departments"], api: "hr/designations", perm: ["emp"], deps: ["departments"],
      }),
      E("grades", "Grades", ["HumanResources.Grades"], {
        tpl: ["app/hr/departments"], api: "hr/grades", perm: ["emp"],
        rules: ["On the template's Designations & Grades tab of /hr/departments; no seed (decided 2026-10-07)"],
      }),
      E("work-shifts", "Work Shifts", ["HumanResources.WorkShifts"], {
        tpl: ["app/hr/shifts"], api: "hr/shifts", perm: ["att"],
        rules: ["Overnight shifts allowed; grace minutes >= 0", "Default General shift seeded per company; delete needs att:approve (no att:delete); weekly roster with attendance (decided 2026-10-07)"],
      }),
      E("holidays", "Holidays", ["HumanResources.Holidays", "HumanResources.HolidayBranches"], {
        tpl: ["app/hr/holidays"], api: "hr/holidays", perm: ["att"], deps: ["branches"],
        rules: ["FY 2026-27 Pakistan public holidays seeded per company (moon-dependent ones tentative) (decided 2026-10-07)"],
      }),
    ],
  },
  {
    no: 11, title: "HR policies & people", portal: "workspace", kind: "MASTER", status: "in-progress",
    objective: "Leave and overtime policies, biometric devices and the employee master (linked to Company.Users.employeeId).",
    entities: [
      E("leave-types", "Leave Types & Eligibility", ["HumanResources.LeaveTypes", "HumanResources.LeaveEligibilityRules"], {
        tpl: ["app/hr/leave/policies"], api: "hr/leave-types", perm: ["lv"],
        rules: ["Accrual and carry-forward rules validated", "The template's 7 Pakistan leave types seeded per company, editable (decided 2026-10-07)"], deps: ["grades", "branches"],
      }),
      E("overtime-policies", "Overtime Policies", ["HumanResources.OvertimePolicies"], {
        tpl: ["app/hr/overtime"], api: "hr/overtime-policies", perm: ["att"],
        rules: ["One active policy per company; the template policy seeded; overtime claims arrive with attendance (decided 2026-10-07)"],
      }),
      E("biometric-devices", "Biometric Devices", ["HumanResources.BiometricDevices", "HumanResources.DeviceSyncLogs"], {
        tpl: ["app/hr/devices"], api: "hr/devices", perm: ["att"],
        x: ["POST /hr/devices/:id/sync: pull punches (writes DeviceSyncLogs)", "GET /hr/devices/:id/sync-logs"],
        rules: ["No device connector yet: sync and test connection disabled until attendance (decided 2026-10-07)"],
        deps: ["branches"],
      }),
      E("employees", "Employees", ["HumanResources.Employees", "HumanResources.EmployeeStatutoryDetails", "HumanResources.EmployeeBankAccounts", "HumanResources.EmployeeDocuments", "HumanResources.EmployeePositionHistory", "HumanResources.BranchHrSettings"], {
        tpl: ["app/hr/employees", "app/hr/employees/view", "app/hr/employees/new", "app/hr/org"], api: "hr/employees", perm: ["emp"],
        x: ["POST /hr/employees/:id/link-user: set Company.Users.employeeId", "POST /hr/employees/:id/transfer|promote (writes position history)", "CRUD /hr/employees/:id/documents|bank-accounts", "GET /hr/org-chart"],
        rules: ["CNIC unique; employee code from numbering series", "Position changes are history rows, not edits", "Salary data visible only with salary permission (Phase 12)", "Wizard step 3 = statutory switches only until Phase 12; HR links an existing user (no login creation); documents are a checklist until uploads (Phase 35) (decided 2026-10-07)"],
        deps: ["departments", "designations", "grades", "work-shifts", "branches", "numbering-series"],
      }),
    ],
  },
  {
    no: 12, title: "Payroll setup", portal: "workspace", kind: "MASTER",
    objective: "Salary components and structures, pay groups, tax slabs and each employee's salary.",
    entities: [
      E("salary-components", "Salary Components", ["Payroll.SalaryComponents"], {
        tpl: ["app/hr/payroll/structures"], api: "payroll/components", perm: ["prun"],
        x: ["POST /payroll/components/import-template: from Platform templates"],
        rules: ["Formula components validated (no cycles)"], deps: ["chart-of-accounts"],
      }),
      E("salary-structures", "Salary Structures", ["Payroll.SalaryStructures", "Payroll.SalaryStructureComponents", "Payroll.SalaryStructureCommissionTiers"], {
        tpl: ["app/hr/payroll/structures"], api: "payroll/structures", perm: ["prun"], deps: ["salary-components"],
      }),
      E("pay-groups", "Pay Groups", ["Payroll.PayGroups"], {
        tpl: ["app/hr/payroll"], api: "payroll/pay-groups", perm: ["prun"],
        open: ["Pay groups have no dedicated template: confirm placement on Payroll Overview"],
      }),
      E("tax-slabs", "Salary Tax Slabs", ["Payroll.SalaryTaxSlabs"], {
        tpl: ["app/hr/payroll/structures"], api: "payroll/tax-slabs", perm: ["prun"],
        x: ["POST /payroll/tax-slabs/import-master: from Platform Tax Master salary slabs"],
        rules: ["Slabs contiguous per tax year"],
        open: ["Tax slab screen placement to be confirmed"],
      }),
      E("employee-salaries", "Employee Salaries", ["Payroll.EmployeeSalaries"], {
        tpl: ["app/hr/employees/view"], api: "payroll/employee-salaries", perm: ["prun", "emp"],
        x: ["POST /payroll/employee-salaries/:employeeId/revise: effective-dated revision"],
        rules: ["Effective-dated history; never overwrite a past salary"], deps: ["employees", "salary-structures", "pay-groups"],
      }),
    ],
  },
  {
    no: 13, title: "Talent & policy setup", portal: "workspace", kind: "MASTER",
    objective: "Templates and programmes that onboarding, performance and training transactions use, plus company policies.",
    entities: [
      E("onboarding-templates", "Onboarding Templates", ["HumanResources.OnboardingTemplates", "HumanResources.OnboardingTemplateTasks"], {
        tpl: ["app/hr/onboarding"], api: "hr/onboarding-templates", perm: ["emp"],
      }),
      E("performance-cycles", "Performance Cycles & Competencies", ["HumanResources.PerformanceCycles", "HumanResources.CompetencyRatings", "HumanResources.KeyResults"], {
        tpl: ["app/hr/performance"], api: "hr/performance-cycles", perm: ["emp"],
        x: ["POST /hr/performance-cycles/:id/open|close"],
      }),
      E("training-programs", "Training Programs", ["HumanResources.TrainingPrograms"], {
        tpl: ["app/hr/training"], api: "hr/training-programs", perm: ["emp"],
      }),
      E("company-policies", "Company Policies", ["EmployeeSelfService.CompanyPolicies"], {
        tpl: ["app/profile/onboarding"], api: "hr/policies", perm: ["emp", "myonb"],
        x: ["POST /hr/policies/:id/publish (new version requires re-acknowledgement)"],
        rules: ["Published versions are immutable"],
      }),
    ],
  },
  {
    no: 14, title: "Distribution setup", portal: "workspace", kind: "MASTER",
    objective: "Shop areas, routes with stops and visit days, vans, commission slabs and order templates.",
    entities: [
      E("shop-areas", "Shop Areas", ["Distribution.ShopAreas"], {
        tpl: ["app/wholesale/routes"], api: "distribution/shop-areas", perm: ["route"],
      }),
      E("routes", "Routes", ["Distribution.Routes", "Distribution.RouteStops", "Distribution.RouteVisitDays", "Distribution.ShopRouteProfiles"], {
        tpl: ["app/wholesale/routes"], api: "distribution/routes", perm: ["route"],
        x: ["PUT /distribution/routes/:id/stops: reorder stops", "PUT /distribution/routes/:id/assignment: booker, salesman, van, driver"],
        rules: ["A customer is on at most one route per visit day", "Assigned staff must hold the matching role (ORDER_BOOKER / SALESMAN / DELIVERYMAN)"],
        deps: ["shop-areas", "customers", "users"],
      }),
      E("vans", "Vans", ["Distribution.Vans"], {
        tpl: ["app/wholesale/routes"], api: "distribution/vans", perm: ["van"], deps: ["warehouses"],
        open: ["Vans have no dedicated template: confirm tab on Routes & Salesmen"],
      }),
      E("commission-slabs", "Commission Slabs", ["Distribution.CommissionSlabs"], {
        tpl: ["app/wholesale/routes"], api: "distribution/commission-slabs", perm: ["target"],
        rules: ["Slabs contiguous and ascending"],
        open: ["Commission slabs have no dedicated template"],
      }),
      E("order-templates", "Order Templates", ["Distribution.OrderTemplates", "Distribution.OrderTemplateLines"], {
        tpl: ["app/wholesale/bookings"], api: "distribution/order-templates", perm: ["booking"], deps: ["customers", "products"],
      }),
    ],
  },
  {
    no: 15, title: "Self-service & reporting setup", portal: "workspace", kind: "MASTER",
    objective: "Helpdesk, announcements/presence, polls & surveys, and saved report definitions.",
    entities: [
      E("helpdesk-setup", "Helpdesk Categories & FAQs", ["EmployeeSelfService.HelpdeskCategories", "EmployeeSelfService.HelpdeskFaqs"], {
        tpl: ["app/profile/helpdesk"], api: "helpdesk/categories", perm: ["emp"],
        x: ["CRUD /helpdesk/faqs"],
      }),
      E("announcements", "Company Announcements & Presence", ["EmployeeSelfService.CompanyAnnouncements", "EmployeeSelfService.CompanyAnnouncementReads", "EmployeeSelfService.PresenceStatuses"], {
        tpl: ["app/profile/directory"], api: "company/announcements", perm: ["emp", "dir"],
        x: ["POST /company/announcements/:id/publish", "POST /company/announcements/:id/read", "PUT /me/presence"],
      }),
      E("surveys", "Polls & Pulse Surveys", ["EmployeeSelfService.Polls", "EmployeeSelfService.PollOptions", "EmployeeSelfService.PulseSurveys", "EmployeeSelfService.PulseSurveyQuestions"], {
        tpl: ["app/profile/kudos"], api: "company/surveys", perm: ["emp", "mykudos"],
        x: ["POST /company/polls/:id/open|close", "POST /company/pulse-surveys/:id/open|close"],
        rules: ["Anonymous surveys never expose respondent identity in results"],
      }),
      E("sign-in-recovery", "Sign-in Recovery & MFA", ["Company.UserInvites", "Company.UserMfaMethods", "Company.TrustedDevices", "Company.PasswordResets"], {
        tpl: ["login/mfa", "login/forgot"], api: "me/mfa", perm: [],
        x: ["POST /settings/users/invite (email/WhatsApp link) + accept page", "POST /me/mfa/enrol|verify|disable", "DELETE /me/trusted-devices/:id", "POST /auth/forgot, POST /auth/reset"],
        rules: ["Deferred from Phase 2: needs mail/SMS delivery", "Reset and invite tokens hashed and single-use", "MFA secrets encrypted; recovery codes hashed"],
        deps: ["users", "account-security"],
      }),
      E("saved-reports", "Saved Reports", ["Reports.SavedReports", "Reports.SavedReportColumns", "Reports.SavedReportShares", "Reports.ReportSchedules"], {
        tpl: ["app/reports/studio"], api: "reports/saved", perm: ["rpt"],
        x: ["PUT /reports/saved/:id/columns", "PUT /reports/saved/:id/shares", "CRUD /reports/saved/:id/schedules"],
      }),
    ],
  },
];
