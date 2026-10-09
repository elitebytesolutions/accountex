import type { Tone } from "@/components/ui/badge";

/** Formatting shared by the Phase 44 screens. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
/** Rs 1.12M / Rs 340,000 */
export const rsShort = (n: number) => (Math.abs(n) >= 1_000_000 ? `Rs ${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M` : rs(n));
const parts = (d: string) => d.slice(0, 10).split("-").map(Number) as [number, number, number];
export const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = parts(d);
  return `${String(day).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
};
export const dayName = (d: string, long = false) => {
  const [y, m, day] = parts(d);
  const w = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return long ? LONG_DAYS[w]! : DAYS[w]!;
};
export const longDate = (d: string) => {
  const [y, m, day] = parts(d);
  return `${dayName(d, true)}, ${String(day).padStart(2, "0")} ${LONG[m - 1]} ${y}`;
};
/** "10:42 AM" from "10:42" */
export const clock = (t: string | null) => {
  if (!t) return "";
  const [h, mm] = t.split(":").map(Number) as [number, number];
  return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
/** "01 Oct, 09:42" or "Today 09:42" */
export const whenShort = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return today ? `Today ${t}` : `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}, ${t}`;
};
export const today = () => new Date().toISOString().slice(0, 10);

export const PRIORITY: Record<string, { label: string; tone: Tone }> = { HIGH: { label: "High", tone: "danger" }, MEDIUM: { label: "Medium", tone: "warn" }, LOW: { label: "Low", tone: "info" } };
export const TASK_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "neutral" }, IN_PROGRESS: { label: "In progress", tone: "warn" }, DONE: { label: "Done", tone: "good" }, CANCELLED: { label: "Cancelled", tone: "neutral" }, OVERDUE: { label: "Overdue", tone: "danger" },
};
export const MODULE_LABEL: Record<string, { label: string; href: string }> = {
  ACCOUNTING: { label: "Accounting", href: "/accounting/vouchers" }, BANKING: { label: "Banking", href: "/bank/accounts" }, CASH: { label: "Cash", href: "/cash/book" },
  RECEIVABLES: { label: "Receivables", href: "/receivables/receipts" }, PAYABLES: { label: "Payables", href: "/payables/payments" }, SALES: { label: "Sales", href: "/sales/invoices" },
  PURCHASES: { label: "Purchases", href: "/purchases/bills" }, INVENTORY: { label: "Inventory", href: "/inventory/products" }, TAX: { label: "Tax", href: "/tax/sales-tax" },
  HR: { label: "HR", href: "/hr/employees" }, PAYROLL: { label: "Payroll", href: "/hr/payroll" }, PERIOD_CLOSE: { label: "Period close", href: "/periods" }, OTHER: { label: "Other", href: "/today" },
};
