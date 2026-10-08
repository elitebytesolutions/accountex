import { Blocks, BookOpen, Boxes, Building2, FileText, Fingerprint, Gauge, HardDrive, IdCard, Landmark, MessageCircle, MonitorSmartphone, ReceiptText, ShieldCheck, ShoppingBag, Truck, UserSearch, Users, Wallet, Webhook, type LucideIcon } from "lucide-react";
import type { SubscriptionPlan } from "@/shared";

/** Shared bits of the Super Admin catalogue screens (Phase 36). */
export const rs = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`);
export const fmtNum = (n: number) => n.toLocaleString("en-PK", { maximumFractionDigits: 3 });
export const fmtDate = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Template plan pill colours (ap-plan / ff-plan: starter, growth, business, enterprise), by the plan's base code. */
export function planTone(plan: Pick<SubscriptionPlan, "code">): string {
  const base = plan.code.replace(/_V\d+$/, "");
  return ({ GROWTH: "growth", BUSINESS: "business", ENTERPRISE: "enterprise", STARTER: "starter" } as Record<string, string>)[base] ?? "";
}

/** Template `ff-plan` / `ap-plan` pill. */
export function PlanPill({ plan, kind = "ff" }: { plan: Pick<SubscriptionPlan, "code" | "name">; kind?: "ff" | "ap" }) {
  return <span className={`${kind}-plan ${planTone(plan)}`}>{plan.name}</span>;
}

/** Workspace modules a plan feature can include (lookup ModuleKey; its labels are just the codes). */
export const MODULE_KEY_LABELS: Record<string, string> = {
  ACC: "Accounting & GL",
  SAL: "Sales & receivables",
  PUR: "Purchases & payables",
  INV: "Inventory & warehouses",
  FA: "Fixed assets",
  PAY: "Payroll & statutory (EOBI, PESSI)",
  ATT: "Attendance & biometric sync",
  REC: "Recruitment & performance",
  ESS: "Employee Self-Service",
  FBR: "FBR integration",
  DIST: "Wholesale & distribution",
  POS: "Point of sale",
};
export const moduleKeyLabel = (k: string) => MODULE_KEY_LABELS[k] ?? k;

/** Plans new customers can buy: active, by sort order (retired versions stay out of matrices). */
export const activePlans = (plans: SubscriptionPlan[]) => plans.filter((p) => p.status === "ACTIVE").sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

/** "1 change" / "3 changes". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Icons a module or add-on can show (lucide names stored in PlatformModules.icon / Addons.icon). */
export const CATALOGUE_ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen, "receipt-text": ReceiptText, "shopping-bag": ShoppingBag, boxes: Boxes, truck: Truck,
  "monitor-smartphone": MonitorSmartphone, "building-2": Building2, users: Users, wallet: Wallet, fingerprint: Fingerprint,
  "user-search": UserSearch, "id-card": IdCard, blocks: Blocks, landmark: Landmark, "shield-check": ShieldCheck,
  "message-circle": MessageCircle, "hard-drive": HardDrive, webhook: Webhook, gauge: Gauge, "file-text": FileText,
};
export function CatalogueIcon({ name }: { name: string | null | undefined }) {
  const Icon = (name && CATALOGUE_ICONS[name]) || Blocks;
  return <Icon />;
}
/** Template entitlement group icons (9J-flags.js ENT), by lookup EntGroup. */
export const GROUP_ICONS: Record<string, LucideIcon> = {
  CORE_MODULES: Blocks, COMPLIANCE: Landmark, SALES_DISTRIBUTION: Truck, INVENTORY: Boxes, FINANCE: Wallet, HR: Users, PLATFORM: ShieldCheck,
};
