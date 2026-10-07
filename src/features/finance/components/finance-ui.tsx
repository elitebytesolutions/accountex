import {
  Activity, Boxes, Building2, CalendarClock, ChartColumn, Clock, Coins, Database, FileText, FolderOpen, HandCoins, Landmark, Percent, PieChart,
  PiggyBank, Receipt, ShieldCheck, ShoppingBag, ShoppingCart, Truck, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { Account } from "@/shared";

/** Template CLS (97-coa.js): per class name, tone and icon. */
export const CLASS_UI: Record<number, { name: string; tone: string; icon: LucideIcon }> = {
  1: { name: "Assets", tone: "ct-green", icon: Database },
  2: { name: "Liabilities", tone: "ct-red", icon: Landmark },
  3: { name: "Equity", tone: "ct-blue", icon: PieChart },
  4: { name: "Income", tone: "ct-violet", icon: ChartColumn },
  5: { name: "Expenses", tone: "ct-orange", icon: ShoppingBag },
};

const SUBTYPE_ICONS: Record<string, LucideIcon> = {
  CASH: Coins, BANK: Landmark, RECEIVABLE: Users, INVENTORY: Boxes, PREPAYMENT: CalendarClock, FIXED_ASSET: Building2, DEPOSIT: ShieldCheck,
  PAYABLE: Truck, ACCRUAL: Clock, TAX: Receipt, STATUTORY: FileText, BORROWING: HandCoins, CAPITAL: PieChart, RESERVE: PiggyBank, DRAWINGS: Wallet,
  SALES: ShoppingCart, OTHER_INCOME: Coins, FINANCE_INCOME: Coins, COST_OF_SALES: Boxes, EMPLOYEE_COST: Users, PREMISES: Landmark,
  DEPRECIATION: Activity, GENERAL_EXPENSE: FileText, FINANCE_COST: Percent, TAXATION: Receipt,
};

/** Row icon: class icon for level 1, folder for headers and groups, sub-type icon for postable accounts. */
export function AccountIcon({ account }: { account: Pick<Account, "level" | "accountClass" | "subType"> }) {
  const Icon = account.level === 1 ? (CLASS_UI[account.accountClass]?.icon ?? Database) : account.level < 4 ? FolderOpen : (SUBTYPE_ICONS[account.subType ?? ""] ?? FileText);
  return <Icon />;
}

export const kindLabel = (kind: string) => (kind === "HEADER" ? "Header" : kind === "GROUP" ? "Group" : "Postable");

const group = (n: number) => Math.round(n).toLocaleString("en-US");

/** Template money(): "Rs 2,942,320" with muted ".00" decimals. */
export function Money({ value, dec = 2, rs = true }: { value: number; dec?: number; rs?: boolean }) {
  const [whole, frac] = Math.abs(value).toFixed(dec).split(".");
  return (
    <>
      {value < 0 && "-"}
      {rs && "Rs "}
      {group(Number(whole))}
      {dec > 0 && <span className="dec">.{frac}</span>}
    </>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "01 Jul 2026" from an ISO date or timestamp. */
export function dateLabel(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Local calendar date as YYYY-MM-DD. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Highlights `q` inside `text` (template hl()). */
export function Hl({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** Downloads rows as a CSV file. */
export function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}
