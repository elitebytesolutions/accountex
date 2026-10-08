"use client";

import { CreditCard, Landmark, Smartphone, Zap, type LucideIcon } from "lucide-react";
import type { LookupsResponse, PlatformInvoice } from "@/shared";
import { labelOf, toneOf } from "@/features/settings/use-lookups";

/** Shared bits of the Phase 41 billing screens. */
export { fmtDate, rs } from "@/features/platform-catalogue/components/catalogue-ui";
export { fmtDateTime, Logo, useLoad, type LoadError } from "@/features/platform-config/components/config-ui";

/** "28,708.96" (amounts in the template's tables carry two decimals). */
export const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "Rs 28,709" for KPIs. */
export const rs0 = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `Rs ${Math.round(n).toLocaleString("en-PK")}`);
export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
export const monthShort = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
export const todayPk = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export const BILLING_LOOKUPS = [
  "PlatformInvoiceStatus", "InvoiceKind", "LineKind", "PlatformPaymentStatus", "DunningCasePaymentMethod", "DunningCaseStage",
  "DunningAttemptStatus", "DunningAttemptMethod", "PromiseSource", "ResellerPayoutStatus", "TenantStatus",
];

/** Template invoice badges: Open (info), Partially paid (warn), Paid (good), Overdue (danger, an open invoice past due). */
export function InvoiceStatus({ inv, lookups }: { inv: Pick<PlatformInvoice, "status" | "overdue">; lookups: LookupsResponse }) {
  if (inv.overdue) return <span className="badge danger">Overdue</span>;
  return <span className={`badge ${toneOf(lookups, "PlatformInvoiceStatus", inv.status) ?? "neutral"}`}>{labelOf(lookups, "PlatformInvoiceStatus", inv.status)}</span>;
}

export function LookupBadge({ lookups, type, code, dot }: { lookups: LookupsResponse; type: string; code: string | null | undefined; dot?: boolean }) {
  if (!code) return <span className="muted">—</span>;
  return <span className={`badge ${toneOf(lookups, type, code) ?? "neutral"}${dot ? " dot" : ""}`}>{labelOf(lookups, type, code)}</span>;
}

/** Template dunning rails (.ap-meth): card, JazzCash, Easypaisa, Raast, direct debit. */
const METHOD: Record<string, [string, string, LucideIcon]> = {
  CARD: ["card", "Card", CreditCard], JAZZCASH: ["jazz", "JazzCash", Smartphone], EASYPAISA: ["easy", "Easypaisa", Smartphone],
  RAAST: ["raast", "Raast", Zap], DIRECT_DEBIT: ["dd", "Direct debit", Landmark], BANK_TRANSFER: ["dd", "Bank transfer", Landmark], INVOICE: ["dd", "Invoice", Landmark],
};
export function MethodPill({ method }: { method: string | null | undefined }) {
  if (!method) return <span className="muted small">Not set</span>;
  const [cls, label, Icon] = METHOD[method] ?? ["", method, CreditCard];
  return <span className={`ap-meth ${cls}`}><Icon />{label}</span>;
}
export const methodLabel = (m: string | null | undefined) => (m ? METHOD[m]?.[1] ?? m : "—");
