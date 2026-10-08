import {
  Blocks, Boxes, Briefcase, CodeXml, Fingerprint, HardDrive, Landmark, MessageSquareText, MonitorSmartphone, Plug, ReceiptText, ShoppingBag,
  ShoppingCart, Smartphone, Truck, Users, WalletCards, Warehouse, type LucideIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { LookupsResponse } from "@/shared";
import { cn } from "@/components/ui/cn";
import { planTone } from "@/features/platform-catalogue/components/catalogue-ui";
import { labelOf, toneOf } from "@/features/settings/use-lookups";

/** Shared bits of the Phase 40 tenant screens (template 9B-admin-plus.js helpers: logo, ring, meter, plan pill, status). */
export { fmtDate, rs } from "@/features/platform-catalogue/components/catalogue-ui";

export const fmt = (n: number | null | undefined, dec = 0) => (n === null || n === undefined ? "—" : n.toLocaleString("en-PK", { maximumFractionDigits: dec, minimumFractionDigits: dec }));
/** 412000 → "412k", 18900000 → "18.9M" (template `short`). */
export const short = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1000)}k` : n % 1 ? n.toFixed(1) : fmt(n);
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
/** Whole days from today to an ISO date (negative = past). */
export const daysTo = (iso: string | null | undefined) => {
  if (!iso) return null;
  const today = new Date();
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - t0) / 864e5);
};
export const relDays = (n: number | null) => (n === null ? "" : n === 0 ? "today" : n > 0 ? `in ${n} d` : `${-n} d ago`);
export const plural = (n: number, w: string) => `${fmt(n)} ${w}${n === 1 ? "" : "s"}`;

/** Postgres arrays sometimes arrive as their text form ("{Admin,\"HR Manager\"}"); normalise to string[]. */
export function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v !== "string" || !v.startsWith("{")) return [];
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|([^,{}]+)/g;
  for (const m of v.slice(1, -1).matchAll(re)) out.push((m[1] ?? m[2] ?? "").replace(/\\(.)/g, "$1"));
  return out.filter(Boolean);
}

const ini = (name: string) => name.replace(/\(.*?\)|&/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const LOGO_T = ["g", "b", "v", "o", "i", "w"];
const AVATAR_T = ["", "c2", "c3", "c4", "c5", "c6"];

/** Template `logo()`: coloured initials tile (ap-logo xs / lg / xl). */
export function TenantLogo({ name, size }: { name: string; size?: "xs" | "lg" | "xl" }) {
  return <span className={cn("ap-logo", size, `t-${LOGO_T[hash(name) % LOGO_T.length]}`)}>{ini(name)}</span>;
}
/** Template `avatar()`. */
export function Avatar({ name, size = "sm" }: { name: string; size?: "xs" | "sm" }) {
  return <span className={cn("avatar", size, AVATAR_T[hash(name) % AVATAR_T.length])}>{ini(name)}</span>;
}

export const healthTone = (s: number) => (s >= 75 ? "good" : s >= 50 ? "warn" : "danger");
/** Template `ring()`: health score donut; "—" when the company has no score yet. */
export function HealthRing({ score, size = 38, stroke = 4 }: { score: number | null; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = score ?? 0, off = c * (1 - v / 100);
  return (
    <span className={cn("ap-ring", score !== null && healthTone(v))} style={{ ["--sz" as string]: `${size}px` }} title={score === null ? "No health score yet" : `Health ${score}/100`}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="trk" />
        {score !== null && <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="arc" strokeDasharray={c.toFixed(2)} style={{ ["--c" as string]: c.toFixed(2), ["--off" as string]: off.toFixed(2) } as CSSProperties} />}
      </svg>
      <b>{score ?? "—"}</b>
    </span>
  );
}

export const meterTone = (pct: number) => (pct > 100 ? "over" : pct >= 100 ? "full" : pct >= 80 ? "hot" : "ok");
/** Template `meter()`: label row + bar; amber from 80 %, red at 100 %, striped over. No limit = an empty bar. */
export function Meter({ used, limit, label, text, compact, title }: { used: number; limit: number | null; label?: ReactNode; text?: ReactNode; compact?: boolean; title?: string }) {
  const pct = limit ? (used / limit) * 100 : 0;
  return (
    <div className={cn("ap-meter", meterTone(pct), compact && "compact")} title={title}>
      {(label || text !== "") && <div className="ap-meter-top">{label && <span>{label}</span>}<em>{text ?? `${Math.round(pct)}%`}</em></div>}
      <div className="ap-bar"><i style={{ ["--w" as string]: `${Math.min(100, Math.max(0, pct)).toFixed(1)}%` }} /></div>
    </div>
  );
}

/** Template `planPill()` for a tenant row (plan code + name), "—" without a subscription. */
export function TenantPlanPill({ code, name }: { code: string | null; name: string | null }) {
  if (!code || !name) return <span className="ap-plan">No plan</span>;
  return <span className={cn("ap-plan", planTone({ code }))}>{name}</span>;
}

/** Template `statusBadge()` from the TenantStatus / SubscriptionStatus lookups. */
export function StatusBadge({ lookups, type = "TenantStatus", code }: { lookups: LookupsResponse; type?: string; code: string | null }) {
  if (!code) return <span className="badge neutral">—</span>;
  const tone = code === "TRIAL" ? "info" : code === "PROVISIONING" ? "violet" : code === "SUSPENDED" || code === "CHURNED" ? "neutral" : toneOf(lookups, type, code);
  return <span className={`badge ${tone} dot`}>{labelOf(lookups, type, code)}</span>;
}

/** Template MODS (9B): the workspace modules a tenant can have, with their icons. */
export const MODULES: { key: string; label: string; sub: string; icon: LucideIcon; group: "finance" | "hr" }[] = [
  { key: "ACC", label: "Accounting", sub: "GL, vouchers, bank, tax, period close", icon: Landmark, group: "finance" },
  { key: "SAL", label: "Sales & AR", sub: "Quotes, invoices, receipts, ageing", icon: ShoppingCart, group: "finance" },
  { key: "PUR", label: "Purchases & AP", sub: "POs, bills, payments", icon: ShoppingBag, group: "finance" },
  { key: "INV", label: "Inventory", sub: "Items, warehouses, stock valuation", icon: Boxes, group: "finance" },
  { key: "FA", label: "Fixed Assets", sub: "Register & depreciation", icon: Warehouse, group: "finance" },
  { key: "FBR", label: "FBR integration", sub: "POS invoices to FBR", icon: Plug, group: "finance" },
  { key: "DIST", label: "Distribution", sub: "Order booking, delivery, routes", icon: Truck, group: "finance" },
  { key: "POS", label: "Point of sale", sub: "Counter sales", icon: MonitorSmartphone, group: "finance" },
  { key: "PAY", label: "Payroll", sub: "Salary, tax u/s 149, EOBI, PESSI", icon: WalletCards, group: "hr" },
  { key: "ATT", label: "Attendance", sub: "Biometric sync, shifts, overtime", icon: Fingerprint, group: "hr" },
  { key: "REC", label: "Recruitment", sub: "Jobs, candidates, offers", icon: Briefcase, group: "hr" },
  { key: "ESS", label: "Employee Self-Service", sub: "Web & mobile portal", icon: Smartphone, group: "hr" },
];
export const moduleLabel = (k: string) => MODULES.find((m) => m.key === k)?.label ?? k;

/** Template `modsCell()`: one tile per module, lit when the tenant has it. */
export function ModsCell({ keys }: { keys: string[] }) {
  return (
    <span className="ap-mods">
      {MODULES.map((m) => {
        const on = keys.includes(m.key);
        const Icon = m.icon;
        return <i key={m.key} className={on ? "on" : undefined} title={`${m.label}${on ? "" : " · off"}`}><Icon /></i>;
      })}
    </span>
  );
}

/** The six meters the template shows (9B usage METRICS), by UsageMeters.code. */
export const USAGE_METRICS: { code: string; label: string; icon: LucideIcon; unit: string }[] = [
  { code: "USERS", label: "Users", icon: Users, unit: "" },
  { code: "INVOICES_MONTH", label: "Invoices / mo", icon: ReceiptText, unit: "" },
  { code: "STORAGE_GB", label: "Storage", icon: HardDrive, unit: " GB" },
  { code: "API_CALLS_MONTH", label: "API calls", icon: CodeXml, unit: "" },
  { code: "SMS_MONTH", label: "SMS", icon: MessageSquareText, unit: "" },
  { code: "FBR_SUBMISSIONS_MONTH", label: "FBR submissions", icon: Plug, unit: "" },
];
export const metricOf = (code: string) => USAGE_METRICS.find((m) => m.code === code) ?? { code, label: code, icon: Blocks, unit: "" };
