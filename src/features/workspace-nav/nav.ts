import { Banknote, Boxes, Building2, CalendarCheck, Clock, HandCoins, ShoppingCart, Users, Landmark, LayoutGrid, Package, Percent, Plane, Rocket, Settings, Wallet, Warehouse, type LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { Route as RouteIcon } from "lucide-react";
import { ChartPie, HeartHandshake } from "lucide-react";

/**
 * Workspace sidebar (template NAV.app in template/src/90-nav.js). Only screens that exist are listed;
 * each phase adds its modules. An item shows only when the user holds its `permission`.
 * My Profile is not here: it opens from the top-bar user menu.
 */
export type NavLeaf = { label: string; href: string; permission?: string; badge?: string };
export type NavModule = NavLeaf & { icon: LucideIcon; desc?: string; children?: NavLeaf[] };
export type NavGroup = { title: string; modules: NavModule[] };

/** Template "Menu" section (tiles). */
export const MENU: NavModule[] = [{ label: "Dashboard", href: "/dashboard", icon: LayoutGrid }];

/** Template groups (Workspace, Finance, Sales & Receivables, …), added phase by phase. */
export const GROUPS: NavGroup[] = [
  {
    title: "Workspace",
    modules: [{ label: "Setup Guide", desc: "Finish onboarding", href: "/setup", icon: Rocket, permission: "comp:view" }],
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
          { label: "Cost Centres & Projects", href: "/accounting/cost-centres", permission: "coa:view" },
        ],
      },
      {
        label: "Bank",
        desc: "Banking and cheque operations",
        href: "/bank/accounts",
        icon: Building2,
        children: [
          { label: "Bank Accounts", href: "/bank/accounts", permission: "bank:view" },
          { label: "Bank Rules & Import", href: "/bank/rules", permission: "bank:view" },
        ],
      },
      {
        label: "Cash",
        desc: "Cash book & petty cash",
        href: "/cash/setup",
        icon: Banknote,
        children: [
          { label: "Petty Cash", href: "/cash/petty", permission: "cash:view" },
          { label: "Cash Setup", href: "/cash/setup", permission: "cash:view" },
        ],
      },
      {
        label: "Fixed Assets",
        desc: "Register & depreciation",
        href: "/assets/categories",
        icon: Warehouse,
        children: [{ label: "Asset Categories", href: "/assets/categories", permission: "fa:view" }],
      },
      {
        label: "Tax & Compliance",
        desc: "FBR, GST and WHT",
        href: "/tax/codes",
        icon: Percent,
        children: [
          { label: "Tax Codes", href: "/tax/codes", permission: "tax:view" },
          { label: "FBR Integration", href: "/tax/fbr", permission: "tax:view" },
        ],
      },
      {
        label: "Period Close",
        desc: "Fiscal years & closing",
        href: "/periods",
        icon: CalendarCheck,
        children: [{ label: "Fiscal Periods", href: "/periods", permission: "close:view" }],
      },
    ],
  },
  {
    title: "Sales & Receivables",
    modules: [
      {
        label: "Sales",
        desc: "Quotes, orders and invoicing",
        href: "/sales/price-lists",
        icon: ShoppingCart,
        children: [{ label: "Price Lists & Schemes", href: "/sales/price-lists", permission: "quo:view" }],
      },
      {
        label: "Receivables",
        desc: "Customers, receipts & credit",
        href: "/customers",
        icon: HandCoins,
        children: [
          { label: "Customers", href: "/customers", permission: "cust:view" },
          { label: "Payment Reminders", href: "/receivables/reminders", permission: "rcpt:view" },
        ],
      },
    ],
  },
  {
    title: "Purchases & Payables",
    modules: [
      {
        label: "Payables",
        desc: "Vendors, bills & payments",
        href: "/vendors",
        icon: Wallet,
        children: [{ label: "Vendors", href: "/vendors", permission: "vend:view" }],
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
          { label: "Batches & Expiry", href: "/inventory/batches", permission: "item:view" },
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
        label: "Distribution",
        desc: "Routes, vans & recovery",
        href: "/wholesale/routes",
        icon: RouteIcon,
        children: [{ label: "Routes & Salesmen", href: "/wholesale/routes", permission: "route:view" }],
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
        children: [{ label: "Leave Policies", href: "/hr/leave/policies", permission: "lv:view" }],
      },
      {
        label: "Payroll",
        desc: "Salaries, payslips & loans",
        href: "/hr/payroll/structures",
        icon: Wallet,
        children: [{ label: "Salary Structures", href: "/hr/payroll/structures", permission: "prun:view" }],
      },
      {
        label: "Talent",
        desc: "Onboarding, reviews & training",
        href: "/hr/onboarding",
        icon: Sparkles,
        children: [
          { label: "Onboarding", href: "/hr/onboarding", permission: "emp:view" },
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
        label: "Analytics",
        desc: "HR reports & report studio",
        href: "/reports/studio",
        icon: ChartPie,
        children: [{ label: "Report Studio", href: "/reports/studio", permission: "rpt:view" }],
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
        ],
      },
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
};

/** Detail pages under a sidebar page (/customers/<id>): their title; the trail ends with the list page. */
const DETAIL_TITLES: Record<string, string> = { "/customers": "Customer Detail", "/vendors": "Vendor Detail", "/inventory/products": "Product Detail", "/hr/employees": "Employee Profile" };
/** Detail pages whose parent path is not the list page's path. */
const DETAIL_LIST: Record<string, string> = { "/inventory/products": "/inventory/items" };

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
  // A detail page (/customers/<id>) only when no sidebar page has this exact path (/hr/employees/new stays "Add Employee").
  const parent = pathname.replace(/\/[^/]+$/, "");
  if (DETAIL_TITLES[parent]) {
    const base = crumbsFor(DETAIL_LIST[parent] ?? parent);
    if (base) return { trail: [...base.trail, base.title], title: DETAIL_TITLES[parent] };
  }
  return null;
}
