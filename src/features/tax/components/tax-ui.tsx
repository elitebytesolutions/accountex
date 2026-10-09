import type { Tone } from "@/components/ui/badge";

/** Formatting shared by the Phase 28 tax screens. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
/** Rs 1,922,600 (no decimals) for KPI tiles. */
export const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
export const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number) as [number, number, number];
  return `${String(day).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
};
/** "Sep 2026" / "September 2026" for a YYYY-MM(-DD) month. */
export const monthLabel = (d: string, long = false) => {
  const [y, m] = d.split("-").map(Number) as [number, number];
  return `${(long ? LONG : MONTHS)[m - 1]} ${y}`;
};
/** Day `day` of the month after `period` (sales tax due on the 18th, WHT on the 15th). */
export const nextMonthDay = (period: string, day: number) => {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m, day));
  return d.toISOString().slice(0, 10);
};
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
/** This month and the `n - 1` before it, newest first. */
export const recentMonths = (n: number) => {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
};
export const daysUntil = (d: string) => Math.round((Date.parse(`${d}T00:00:00`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00`)) / 86_400_000);
export const today = () => new Date().toISOString().slice(0, 10);

export const RETURN_TONE: Record<string, Tone> = { DRAFT: "neutral", VALIDATED: "info", FILED: "good", PAID: "good", REVISED: "neutral" };
export const RETURN_LABEL: Record<string, string> = { DRAFT: "Draft", VALIDATED: "Validated", FILED: "Filed", PAID: "Paid", REVISED: "Revised" };
export const WHT_TONE: Record<string, Tone> = { UNPAID: "warn", PAID: "good", PART_PAID: "info", CLAIMED: "good", CANCELLED: "neutral" };
export const WHT_LABEL: Record<string, string> = { UNPAID: "Unpaid", PAID: "Paid", PART_PAID: "Part paid", CLAIMED: "Claimed", CANCELLED: "Cancelled" };
export const CERT_TONE: Record<string, Tone> = { DRAFT: "neutral", ISSUED: "good", RECEIVED: "info", CLAIMED: "good", CANCELLED: "neutral" };
export const CERT_LABEL: Record<string, string> = { DRAFT: "Draft", ISSUED: "Issued", RECEIVED: "Received", CLAIMED: "Claimed", CANCELLED: "Cancelled" };
export const SUB_TONE: Record<string, Tone> = { PENDING: "warn", ACCEPTED: "good", FAILED: "danger", SKIPPED: "neutral" };
export const SUB_LABEL: Record<string, string> = { PENDING: "Pending", ACCEPTED: "Accepted", FAILED: "Failed", SKIPPED: "Not reported" };
export const DIRECTION_LABEL: Record<string, string> = { DEDUCTED: "Deducted", COLLECTED: "Collected", SUFFERED: "Suffered" };

/** "153_1_A" → "153(1)(a)"; other codes as they are. */
export const sectionCode = (code: string) => {
  const m = /^(\d+)_(\d+)_([A-Z])$/.exec(code);
  return m ? `${m[1]}(${m[2]})(${m[3]!.toLowerCase()})` : code;
};
/** The nature part of a section's label ("153(1)(a) — goods" → "goods"), else a default by section. */
export const sectionNature = (code: string, labels: { code: string; label: string }[]) => {
  const l = labels.find((x) => x.code === code)?.label;
  const nature = l?.includes("—") ? l.split("—")[1]!.trim() : null;
  if (nature) return nature.charAt(0).toUpperCase() + nature.slice(1);
  if (code.startsWith("149")) return "Salary";
  if (code === "236G") return "Collected on sales to distributors";
  if (code === "236H") return "Collected on sales to retailers";
  return "Withholding tax";
};
