import { Building2, ChartLine, CreditCard, Handshake, Kanban, Layers, LayoutGrid, LifeBuoy, Rocket, Server, ShieldCheck, Tags, ToggleRight, type LucideIcon } from "lucide-react";
import type { NavGroup, NavLeaf, NavModule } from "@/features/workspace-nav/nav";

/**
 * Super Admin sidebar (template NAV.admin in template/src/90-nav.js), same shape as workspace-nav/nav.ts.
 *
 * Every template group and module is declared here in template order; each admin phase only adds its own leaves
 * (`{ label, href }`) or `href` on a single-page module. Modules without a built page (no `href`, or no children) and
 * empty groups are hidden, so a route appears exactly when its page exists. There are no permissions: the single
 * Super Admin sees everything.
 */
export type { NavGroup, NavLeaf, NavModule };

/** Template "Menu" tiles: Overview, Onboard (Phase 40). */
export const ADMIN_MENU: NavModule[] = [
  { label: "Overview", desc: "Platform health", href: "/admin/dashboard", icon: LayoutGrid },
  { label: "Onboard", desc: "New tenant", href: "/admin/tenants/new", icon: Rocket }, // Phase 40
];

/** Template groups. `href: ""` = page not built yet (hidden). */
export const ADMIN_GROUPS: NavGroup[] = [
  {
    title: "Tenants",
    modules: [
      {
        label: "Tenant Management",
        desc: "Organisations on Accountex",
        href: "/admin/tenants",
        icon: Building2,
        // template order: All Tenants, Onboard Tenant, Tenant Detail (the detail is /admin/tenants/<id>, not a leaf)
        children: [
          { label: "All Tenants", href: "/admin/tenants" }, // Phase 40
          { label: "Onboard Tenant", href: "/admin/tenants/new" }, // Phase 40
        ],
      },
      { label: "Templates", desc: "COA & master seeds", href: "/admin/templates", icon: Layers }, // Phase 37
    ],
  },
  {
    title: "Growth",
    modules: [
      { label: "SaaS Analytics", desc: "MRR, churn & cohorts", href: "", icon: ChartLine },
      { label: "Leads CRM", desc: "Lead to trial to paid", href: "", icon: Kanban },
      // Phase 36: the Coupons tab (Phase 38 adds the Resellers tab to the same page)
      { label: "Partners & Coupons", desc: "Resellers & discounts", href: "/admin/partners", icon: Handshake },
    ],
  },
  {
    title: "Billing",
    modules: [
      {
        label: "Plans & Billing",
        desc: "Pricing and subscriptions",
        href: "/admin/plans",
        icon: CreditCard,
        children: [
          // template order: Plans & Pricing, Subscriptions, Platform Invoices, Dunning & Collections, Usage & Quotas
          { label: "Plans & Pricing", href: "/admin/plans" }, // Phase 36
          { label: "Subscriptions", href: "/admin/subscriptions" }, // Phase 40
          { label: "Dunning & Collections", href: "/admin/dunning" }, // Phase 38: dunning policy (cases are Phase 41)
          { label: "Usage & Quotas", href: "/admin/usage" }, // Phase 39: alert rules (meters are Phase 40)
        ],
      },
      {
        label: "Feature Management",
        desc: "Flags, segments & entitlements",
        href: "/admin/entitlements",
        icon: ToggleRight,
        children: [
          // template order: Feature Flags, Flag Detail, Segments, Plan Entitlements, Change Requests
          { label: "Feature Flags", href: "/admin/features" }, // Phase 39
          { label: "Segments", href: "/admin/segments" }, // Phase 38
          { label: "Plan Entitlements", href: "/admin/entitlements" }, // Phase 36
        ],
      },
    ],
  },
  {
    title: "Operations",
    modules: [
      {
        label: "Support",
        desc: "Tickets & announcements",
        href: "",
        icon: LifeBuoy,
        // template order: Support Tickets, Announcements, Communications
        children: [
          { label: "Communications", href: "/admin/comms" }, // Phase 37
        ],
      },
      {
        label: "System",
        desc: "Health, jobs & backups",
        href: "",
        icon: Server,
        // template order: System Health, Platform Audit Log, Status & Incidents, Security & Privacy, API & Webhooks, Tax Master
        children: [
          { label: "System Health", href: "/admin/system" }, // Phase 38: backups panel
          { label: "Platform Audit Log", href: "/admin/audit" }, // Phase 39
          { label: "Status & Incidents", href: "/admin/status" }, // Phase 39: maintenance windows (incidents are Phase 43)
          { label: "Security & Privacy", href: "/admin/security" }, // Phase 38
          { label: "API & Webhooks", href: "/admin/integrations" }, // Phase 38
          { label: "Tax Master", href: "/admin/tax-master" }, // Phase 37
        ],
      },
      { label: "Platform Team", desc: "Staff & roles", href: "", icon: ShieldCheck },
    ],
  },
];

/** The built part of the admin nav: modules with a page (or with built children), non-empty groups. */
export function adminNav() {
  const built = (mods: NavModule[]) =>
    mods
      .map((m) => (m.children ? { ...m, children: m.children.filter((c) => c.href) } : m))
      .filter((m) => (m.children ? m.children.length > 0 : Boolean(m.href)));
  return {
    menu: built(ADMIN_MENU),
    groups: ADMIN_GROUPS.map((g) => ({ ...g, modules: built(g.modules) })).filter((g) => g.modules.length > 0),
  };
}

/** Admin screens that are not in the sidebar (hidden links such as a detail page) and need a breadcrumb. */
const ADMIN_OTHER_PAGES: Record<string, { trail: string[]; title: string }> = {};

/** Detail pages under a sidebar page (/admin/features/<id>): their title; the trail ends with the list page. */
const ADMIN_DETAIL_TITLES: Record<string, string> = {
  "/admin/features": "Flag Detail", // Phase 39
  "/admin/tenants": "Tenant 360", // Phase 40
};

/** A built sidebar leaf (e.g. /admin/tenants/new), which is never treated as a detail page of its parent. */
const isAdminLeaf = (pathname: string) => ADMIN_MENU.some((m) => m.href === pathname) || ADMIN_GROUPS.some((g) => g.modules.some((m) => m.children?.some((c) => c.href === pathname)));

/** The sidebar path a page belongs to (a detail page maps to its list page). */
export function adminNavPathFor(pathname: string): string {
  const parent = pathname.replace(/\/[^/]+$/, "");
  return ADMIN_DETAIL_TITLES[parent] && !isAdminLeaf(pathname) ? parent : pathname;
}

/** Breadcrumb trail for an admin path: [group, module] labels and the page title (template setCrumbs, root "Platform"). */
export function adminCrumbsFor(pathname: string): { trail: string[]; title: string } | null {
  if (ADMIN_OTHER_PAGES[pathname]) return ADMIN_OTHER_PAGES[pathname];
  for (const m of ADMIN_MENU) if (m.href === pathname) return { trail: [], title: m.label };
  for (const g of ADMIN_GROUPS)
    for (const m of g.modules) {
      for (const c of m.children ?? []) if (c.href && c.href === pathname) return { trail: [g.title, m.label], title: c.label };
      if (!m.children && m.href && m.href === pathname) return { trail: [g.title], title: m.label };
    }
  const parent = pathname.replace(/\/[^/]+$/, "");
  if (ADMIN_DETAIL_TITLES[parent]) {
    const base = adminCrumbsFor(parent);
    if (base) return { trail: [...base.trail, base.title], title: ADMIN_DETAIL_TITLES[parent] };
  }
  return null;
}

/**
 * Template TOP.admin.create (the top-bar "Create" menu), in template order. Each phase adds its own built entries;
 * template entries: Onboard Tenant (40), New Plan (36), Announcement (42), Support Ticket (43).
 */
export type AdminCreateItem = { title: string; sub: string; icon: LucideIcon; href: string; tone?: string };
export const ADMIN_CREATE: AdminCreateItem[] = [
  { title: "Onboard Tenant", sub: "Provision a new organisation", icon: Building2, href: "/admin/tenants/new" }, // Phase 40
  { title: "New Plan", sub: "Pricing & limits", icon: Tags, href: "/admin/plans?new=1", tone: "tone-violet" }, // Phase 36
  { title: "New flag", sub: "Release, kill switch or experiment", icon: ToggleRight, href: "/admin/features?new=1", tone: "tone-blue" }, // Phase 39
];
