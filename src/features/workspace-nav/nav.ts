import { Banknote, Boxes, Building2, CalendarCheck, Clock, HandCoins, ShoppingCart, Users, Landmark, LayoutGrid, Package, Percent, Plane, Rocket, Settings, Wallet, Warehouse, type LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { Route as RouteIcon } from "lucide-react";
import { ChartPie, HeartHandshake } from "lucide-react";
import { ChartColumn, Inbox, ReceiptText } from "lucide-react";
import { ShoppingBag } from "lucide-react";
import { Zap } from "lucide-react";
import { Target } from "lucide-react";
import { MessagesSquare } from "lucide-react";
import { Bell, ListChecks } from "lucide-react";

/**
 * Workspace sidebar (template NAV.app in template/src/90-nav.js). Only screens that exist are listed;
 * each phase adds its modules. An item shows only when the user holds its `permission`.
 * My Profile is not here: it opens from the top-bar user menu.
 */
export type NavLeaf = { label: string; href: string; permission?: string; badge?: string };
export type NavModule = NavLeaf & { icon: LucideIcon; desc?: string; children?: NavLeaf[] };
export type NavGroup = { title: string; modules: NavModule[] };

/** Template "Menu" section (tiles). */
export const MENU: NavModule[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  // Phase 44: tasks and everything due today
  { label: "Today's Work", desc: "Tasks & activities", href: "/today", icon: ListChecks },
];

/** Template groups (Workspace, Finance, Sales & Receivables, …), added phase by phase. */
export const GROUPS: NavGroup[] = [
  {
    title: "Workspace",
    modules: [
      { label: "Approvals Inbox", desc: "Everything waiting on you", href: "/approvals", icon: Inbox },
      { label: "Activity", desc: "Posts, mentions & comments", href: "/activity", icon: MessagesSquare },
      { label: "Setup Guide", desc: "Finish onboarding", href: "/setup", icon: Rocket, permission: "comp:view" },
    ],
  },
  {
    title: "Finance",
    modules: [
      {
        label: "Accounts",
        desc: "Chart of accounts and ledgers",
        href: "/accounting/coa",
        icon: Landmark,
        children: [
          { label: "Chart of Accounts", href: "/accounting/coa", permission: "coa:view" },
          { label: "Account Ledger", href: "/accounting/ledger", permission: "coa:view" },
          { label: "Opening Balances", href: "/accounting/opening", permission: "vch:view" },
          { label: "Cost Centres & Projects", href: "/accounting/cost-centres", permission: "coa:view" },
        ],
      },
      {
        label: "Voucher Management",
        desc: "Create and manage vouchers",
        href: "/accounting/vouchers",
        icon: ReceiptText,
        children: [
          { label: "Voucher Register", href: "/accounting/vouchers", permission: "vch:view" },
          { label: "New Voucher", href: "/accounting/vouchers/new", permission: "vch:create" },
          { label: "Recurring Templates", href: "/accounting/recurring", permission: "vch:view" },
        ],
      },
      {
        label: "Bank",
        desc: "Banking and cheque operations",
        href: "/bank/accounts",
        icon: Building2,
        children: [
          { label: "Bank Accounts", href: "/bank/accounts", permission: "bank:view" },
          { label: "Bank Transactions", href: "/bank/transactions", permission: "bank:view" },
          { label: "Receive & Issue Cheques", href: "/bank/cheques", permission: "bank:view" },
          { label: "Cheque Voucher (Bulk)", href: "/bank/cheque-voucher", permission: "bank:view" },
          { label: "Cheque Register & PDC", href: "/bank/cheque-register", permission: "bank:view" },
          { label: "Bank Reconciliation", href: "/bank/reconciliation", permission: "recon:view" },
          { label: "Bank Book", href: "/bank/book", permission: "bank:view" },
          { label: "Bank Rules & Import", href: "/bank/rules", permission: "bank:view" },
        ],
      },
      {
        label: "Cash",
        desc: "Cash book & petty cash",
        href: "/cash/book",
        icon: Banknote,
        children: [
          { label: "Cash Book", href: "/cash/book", permission: "cash:view" },
          { label: "Cash Ledger", href: "/cash/ledger", permission: "cash:view" },
          { label: "Petty Cash", href: "/cash/petty", permission: "cash:view" },
          { label: "Expense Claims", href: "/cash/expenses", permission: "cash:view" },
          { label: "Cash Setup", href: "/cash/setup", permission: "cash:view" },
        ],
      },
      {
        label: "Fixed Assets",
        desc: "Register & depreciation",
        href: "/assets",
        icon: Warehouse,
        children: [
          { label: "Asset Register", href: "/assets", permission: "fa:view" },
          { label: "Run Depreciation", href: "/assets/depreciation", permission: "fa:view" },
          { label: "Disposals", href: "/assets/disposals", permission: "fa:view" },
          { label: "Asset Categories", href: "/assets/categories", permission: "fa:view" },
        ],
      },
      {
        label: "Budgeting",
        desc: "Plan and compare",
        href: "/budgets",
        icon: Target,
        children: [
          { label: "Budgets", href: "/budgets", permission: "bud:view" },
          { label: "Budget vs Actual", href: "/budgets/variance", permission: "bud:view" },
        ],
      },
      {
        label: "Tax & Compliance",
        desc: "FBR, GST and WHT",
        href: "/tax/codes",
        icon: Percent,
        children: [
          { label: "Tax Codes", href: "/tax/codes", permission: "tax:view" },
          { label: "Sales Tax Return", href: "/tax/sales-tax", permission: "tax:view" },
          { label: "Withholding Tax", href: "/tax/wht", permission: "tax:view" },
          { label: "FBR Integration", href: "/tax/fbr", permission: "tax:view" },
        ],
      },
      {
        label: "Period Close",
        desc: "Fiscal years & closing",
        href: "/periods",
        icon: CalendarCheck,
        children: [
          { label: "Fiscal Periods", href: "/periods", permission: "close:view" },
          { label: "Year-end Close", href: "/periods/close", permission: "close:view" },
        ],
      },
    ],
  },
  {
    title: "Sales & Receivables",
    modules: [
      {
        label: "Sales",
        desc: "Quotes, orders and invoicing",
        href: "/sales/invoices",
        icon: ShoppingCart,
        children: [
          { label: "Quotations", href: "/sales/quotations", permission: "quo:view" },
          { label: "Sales Orders", href: "/sales/orders", permission: "quo:view" },
          { label: "Delivery Challans", href: "/sales/challans", permission: "sinv:view" },
          { label: "Sales Invoices", href: "/sales/invoices", permission: "sinv:view" },
          { label: "Sales Voucher", href: "/sales/voucher", permission: "sinv:create" },
          { label: "Sales Returns", href: "/sales/returns", permission: "sinv:view" },
          { label: "Credit Notes", href: "/sales/credit-notes", permission: "sinv:view" },
          { label: "Recurring Invoices", href: "/sales/recurring", permission: "sinv:view" },
          { label: "Point of Sale", href: "/sales/pos", permission: "pos:create" },
          { label: "Price Lists & Schemes", href: "/sales/price-lists", permission: "quo:view" },
        ],
      },
      {
        label: "Receivables",
        desc: "Customers, receipts & credit",
        href: "/customers",
        icon: HandCoins,
        children: [
          { label: "Customers", href: "/customers", permission: "cust:view" },
          { label: "Customer Receipts", href: "/receivables/receipts", permission: "rcpt:view" },
          { label: "AR Ageing & Statements", href: "/receivables/ageing", permission: "rcpt:view" },
          { label: "Credit Control", href: "/receivables/credit", permission: "crovr:view" },
          { label: "Payment Reminders", href: "/receivables/reminders", permission: "rcpt:view" },
        ],
      },
    ],
  },
  {
    title: "Purchases & Payables",
    modules: [
      {
        label: "Purchases",
        desc: "Orders and vendor bills",
        href: "/purchases/orders",
        icon: ShoppingBag,
        children: [
          { label: "Purchase Voucher", href: "/purchases/voucher", permission: "bill:create" },
          { label: "Purchase Orders", href: "/purchases/orders", permission: "po:view" },
          { label: "Goods Received (GRN)", href: "/purchases/grn", permission: "grn:view" },
          { label: "Vendor Bills", href: "/purchases/bills", permission: "bill:view" },
          { label: "New Bill", href: "/purchases/bills/new", permission: "bill:create" },
          { label: "Purchase Returns", href: "/purchases/returns", permission: "grn:view" },
          { label: "Debit Notes", href: "/purchases/debit-notes", permission: "bill:view" },
          { label: "Landed Cost", href: "/purchases/landed-cost", permission: "bill:view" },
        ],
      },
      {
        label: "Payables",
        desc: "Vendors, bills & payments",
        href: "/vendors",
        icon: Wallet,
        children: [
          { label: "Vendors", href: "/vendors", permission: "vend:view" },
          { label: "Payments & Allocation", href: "/payables/payments", permission: "vpay:view" },
          { label: "AP Ageing & Reports", href: "/payables/ageing", permission: "vpay:view" },
        ],
      },
    ],
  },
  {
    title: "Inventory",
    modules: [
      {
        label: "Products",
        desc: "Catalogue, kits & labels",
        href: "/inventory/items",
        icon: Package,
        children: [
          { label: "Product Catalogue", href: "/inventory/items", permission: "item:view" },
          { label: "Companies & Brands", href: "/inventory/companies", permission: "item:view" },
          { label: "Product Classes", href: "/inventory/classes", permission: "item:view" },
          { label: "Kits & Bundles", href: "/inventory/kits", permission: "item:view" },
          { label: "Barcode Labels", href: "/inventory/labels", permission: "item:view" },
          { label: "Units of Measure", href: "/inventory/units", permission: "item:view" },
        ],
      },
      {
        label: "Stock",
        desc: "Batches, reorder & movements",
        href: "/inventory/batches",
        icon: Boxes,
        children: [
          { label: "Stock In / Out", href: "/inventory/stock-in-out", permission: "adj:view" },
          { label: "Stock Transfers", href: "/inventory/transfer", permission: "xfer:view" },
          { label: "Stock Count", href: "/inventory/count", permission: "cnt:view" },
          { label: "Batches & Expiry", href: "/inventory/batches", permission: "item:view" },
          { label: "Stock Adjustments", href: "/inventory/adjustments", permission: "adj:view" },
          { label: "Stock Vouchers", href: "/inventory/stock-vouchers", permission: "adj:view" },
          { label: "Assembly Vouchers", href: "/inventory/assembly", permission: "adj:view" },
          { label: "Principal Claims", href: "/inventory/principal-claims", permission: "item:view" },
          { label: "Bulk Price Updates", href: "/inventory/price-updates", permission: "item:view" },
          { label: "Demand & Reorder", href: "/inventory/demand", permission: "item:view" },
          { label: "Movement Reasons", href: "/inventory/reasons", permission: "adj:view" },
        ],
      },
      { label: "Warehouses", desc: "Locations & bins", href: "/inventory/warehouses", icon: Warehouse, permission: "wh:view" },
    ],
  },
  {
    title: "Wholesale & Distribution",
    modules: [
      {
        label: "Wholesale",
        desc: "Bulk entry & bookings",
        href: "/wholesale/entry",
        icon: Zap,
        children: [
          { label: "Quick Wholesale Entry", href: "/wholesale/entry", permission: "wsentry:view" },
          { label: "Bulk Invoicing", href: "/wholesale/bulk", permission: "bulkinv:view" },
          { label: "Order Bookings", href: "/wholesale/bookings", permission: "booking:view" },
          { label: "Back-orders", href: "/wholesale/backorders", permission: "backord:view" },
        ],
      },
      {
        label: "Distribution",
        desc: "Routes, vans & recovery",
        href: "/wholesale/routes",
        icon: RouteIcon,
        children: [
          { label: "Routes & Salesmen", href: "/wholesale/routes", permission: "route:view" },
          { label: "Load Sheets", href: "/wholesale/load-sheet", permission: "loadsht:view" },
          { label: "Route Settlement", href: "/wholesale/settlement", permission: "settle:view" },
          { label: "Recovery Sheets", href: "/wholesale/recovery", permission: "recov:view" },
        ],
      },
    ],
  },
  {
    title: "Workforce",
    modules: [
      {
        label: "People",
        desc: "Employees & organisation",
        href: "/hr/employees",
        icon: Users,
        children: [
          { label: "Employees", href: "/hr/employees", permission: "emp:view" },
          { label: "Add Employee", href: "/hr/employees/new", permission: "emp:create" },
          { label: "Org Chart", href: "/hr/org", permission: "emp:view" },
          { label: "Departments & Designations", href: "/hr/departments", permission: "emp:view" },
        ],
      },
      {
        label: "Time & Attendance",
        desc: "Attendance, shifts & holidays",
        href: "/hr/shifts",
        icon: Clock,
        children: [
          { label: "Attendance Today", href: "/hr/attendance", permission: "att:view" },
          { label: "Attendance Register", href: "/hr/attendance/register", permission: "att:view" },
          { label: "Regularisation", href: "/hr/attendance/requests", permission: "att:view" },
          { label: "Shifts & Rosters", href: "/hr/shifts", permission: "att:view" },
          { label: "Holidays", href: "/hr/holidays", permission: "att:view" },
          { label: "Overtime", href: "/hr/overtime", permission: "att:view" },
          { label: "Biometric Devices", href: "/hr/devices", permission: "att:view" },
        ],
      },
      {
        label: "Leave",
        desc: "Requests, balances & policies",
        href: "/hr/leave/policies",
        icon: Plane,
        children: [
          { label: "Leave Overview", href: "/hr/leave", permission: "lv:view" }, // Phase 31
          { label: "Leave Requests", href: "/hr/leave/requests", permission: "lv:view" },
          { label: "Leave Balances", href: "/hr/leave/balances", permission: "lv:view" },
          { label: "Leave Policies", href: "/hr/leave/policies", permission: "lv:view" },
        ],
      },
      {
        label: "Payroll",
        desc: "Salaries, payslips & loans",
        href: "/hr/payroll/structures",
        icon: Wallet,
        children: [
          { label: "Overview", href: "/hr/payroll", permission: "prun:view" }, // Phase 32
          { label: "Run Payroll", href: "/hr/payroll/run", permission: "prun:view" },
          { label: "Payslips", href: "/hr/payroll/payslips", permission: "prun:view" },
          { label: "Loans & Advances", href: "/hr/loans", permission: "loan:view" },
          { label: "Final Settlement", href: "/hr/settlements", permission: "fs:view" }, // Phase 33 exits
          { label: "Salary Structures", href: "/hr/payroll/structures", permission: "prun:view" },
        ],
      },
      {
        label: "Talent",
        desc: "Onboarding, reviews & training",
        href: "/hr/onboarding",
        icon: Sparkles,
        children: [
          { label: "Recruitment", href: "/hr/recruitment", permission: "emp:view" }, // Phase 33
          { label: "Onboarding", href: "/hr/onboarding", permission: "emp:view" },
          { label: "Offboarding", href: "/hr/offboarding", permission: "emp:view" }, // Phase 31
          { label: "Performance", href: "/hr/performance", permission: "emp:view" },
          { label: "Training", href: "/hr/training", permission: "emp:view" },
          { label: "Policies", href: "/hr/policies", permission: "emp:view" },
        ],
      },
      {
        label: "Employee engagement",
        desc: "Helpdesk, announcements & pulse",
        href: "/hr/helpdesk-setup",
        icon: HeartHandshake,
        children: [
          { label: "Helpdesk setup", href: "/hr/helpdesk-setup", permission: "emp:view" },
          { label: "Announcements", href: "/hr/announcements", permission: "emp:view" },
          { label: "Polls & surveys", href: "/hr/engagement", permission: "emp:view" },
        ],
      },
    ],
  },
  {
    title: "Insights",
    modules: [
      {
        label: "Financial Statements",
        desc: "Reports and statements",
        href: "/reports/trial-balance",
        icon: ChartColumn,
        children: [
          { label: "Trial Balance", href: "/reports/trial-balance", permission: "vch:view" },
          { label: "General Ledger", href: "/reports/gl", permission: "vch:view" },
          { label: "Day Book", href: "/reports/day-book", permission: "vch:view" },
          { label: "Profit & Loss", href: "/reports/pnl", permission: "frep:view" },
          { label: "Balance Sheet", href: "/reports/balance-sheet", permission: "frep:view" },
          { label: "Cash Flow", href: "/reports/cash-flow", permission: "frep:view" },
        ],
      },
      {
        label: "Analytics",
        desc: "HR reports & report studio",
        href: "/reports/studio",
        icon: ChartPie,
        children: [
          { label: "Reports Centre", href: "/reports", permission: "rpt:view" },
          { label: "Report Studio", href: "/reports/studio", permission: "rpt:view" },
        ],
      },
    ],
  },
  {
    title: "System",
    modules: [
      {
        label: "Settings",
        desc: "Company, users and controls",
        href: "/settings/users",
        icon: Settings,
        children: [
          { label: "Company Settings", href: "/settings", permission: "comp:view" },
          { label: "Users", href: "/settings/users", permission: "usr:view" },
          { label: "Roles & Permissions", href: "/settings/roles", permission: "rol:view" },
          { label: "Approval Workflows", href: "/settings/approvals", permission: "wf:view" },
          { label: "Document Templates", href: "/settings/templates", permission: "comp:view" },
          { label: "Integrations", href: "/settings/integrations", permission: "intg:view" },
          { label: "Backup & Restore", href: "/settings/backup", permission: "bak:view" },
          { label: "Data Import", href: "/import", permission: "bak:view" },
        ],
      },
      // Phase 44: Notification Centre (own notifications, every user)
      { label: "Notifications", desc: "Alerts & activity", href: "/notifications", icon: Bell },
    ],
  },
];

const allowed = (granted: Set<string>, item: NavLeaf) => !item.permission || granted.has(item.permission);

/** The nav limited to what the user may open; modules keep only permitted children, empty groups disappear. */
export function navFor(permissions: string[]) {
  const granted = new Set(permissions);
  const filterModules = (mods: NavModule[]) =>
    mods
      .map((m) => (m.children ? { ...m, children: m.children.filter((c) => allowed(granted, c)) } : m))
      .filter((m) => (m.children ? m.children.length > 0 : allowed(granted, m)));
  return {
    menu: filterModules(MENU),
    groups: GROUPS.map((g) => ({ ...g, modules: filterModules(g.modules) })).filter((g) => g.modules.length > 0),
  };
}

/** Screens that are not in the sidebar but need a proper breadcrumb. */
const OTHER_PAGES: Record<string, { trail: string[]; title: string }> = {
  "/states": { trail: ["System"], title: "UI States" },
  "/unauthorized": { trail: [], title: "No access" },
  "/support": { trail: [], title: "Help & support" }, // Phase 42 (user menu)
};

/** Detail pages under a sidebar page (/customers/<id>): their title; the trail ends with the list page. */
const DETAIL_TITLES: Record<string, string> = { "/hr/payroll/runs": "Payroll Run", "/accounting/vouchers": "Voucher Detail", "/customers": "Customer Detail", "/vendors": "Vendor Detail", "/inventory/products": "Product Detail", "/hr/employees": "Employee Profile", "/purchases/bills": "Vendor Bill", "/sales/invoices": "Sales Invoice", "/assets": "Asset Detail", "/hr/settlements": "Final Settlement" };
/** Edit pages (<list>/<id>/edit): their title. */
const EDIT_TITLES: Record<string, string> = { "/accounting/vouchers": "Edit Voucher" };
/** Detail pages whose parent path is not the list page's path. */
const DETAIL_LIST: Record<string, string> = { "/hr/payroll/runs": "/hr/payroll/run", "/inventory/products": "/inventory/items" };

/** The sidebar path a page belongs to: a detail page whose parent isn't its list maps to the list (/inventory/products/<id> → /inventory/items). */
export function navPathFor(pathname: string): string {
  const parent = pathname.replace(/\/[^/]+$/, "");
  return DETAIL_LIST[parent] ?? pathname;
}

/** Breadcrumb trail for a path: [group, module, …] labels, and the page title. */
export function crumbsFor(pathname: string): { trail: string[]; title: string } | null {
  if (OTHER_PAGES[pathname]) return OTHER_PAGES[pathname];
  for (const m of MENU) if (m.href === pathname) return { trail: [], title: m.label };
  for (const g of GROUPS)
    for (const m of g.modules) {
      for (const c of m.children ?? []) if (c.href === pathname) return { trail: [g.title, m.label], title: c.label };
      if (m.href === pathname) return { trail: [g.title], title: m.label };
    }
  // An edit page under a detail page (/accounting/vouchers/<id>/edit).
  const edit = pathname.match(/^(.*)\/[^/]+\/edit$/);
  if (edit && EDIT_TITLES[edit[1]!]) {
    const base = crumbsFor(edit[1]!);
    if (base) return { trail: [...base.trail, base.title], title: EDIT_TITLES[edit[1]!]! };
  }
  // A detail page (/customers/<id>) only when no sidebar page has this exact path (/hr/employees/new stays "Add Employee").
  const parent = pathname.replace(/\/[^/]+$/, "");
  if (DETAIL_TITLES[parent]) {
    const base = crumbsFor(DETAIL_LIST[parent] ?? parent);
    if (base) return { trail: [...base.trail, base.title], title: DETAIL_TITLES[parent] };
  }
  return null;
}
