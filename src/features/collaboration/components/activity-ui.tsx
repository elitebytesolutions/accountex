import {
  BookOpenCheck, Cog, FileArchive, FileText, Image as ImageIcon, Landmark, Package, Percent, ReceiptText, ShoppingCart, Truck, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api/errors";
import { initialsOf } from "@/features/auth/initials";

type ModTone = "green" | "blue" | "violet" | "lime" | "orange" | "red";

/** Module label, icon and tone for the feed (template MOD map, extended to every ACTIVITY_MODULES code). */
export const MODULES: Record<string, { label: string; icon: LucideIcon; tone: ModTone }> = {
  SALES: { label: "Sales", icon: ReceiptText, tone: "green" },
  PURCHASES: { label: "Purchases", icon: ShoppingCart, tone: "blue" },
  ACCOUNTING: { label: "Accounting", icon: BookOpenCheck, tone: "violet" },
  BANK: { label: "Bank", icon: Landmark, tone: "lime" },
  HR: { label: "HR", icon: Users, tone: "orange" },
  INVENTORY: { label: "Inventory", icon: Package, tone: "red" },
  PAYROLL: { label: "Payroll", icon: Wallet, tone: "orange" },
  TAX: { label: "Tax", icon: Percent, tone: "violet" },
  DISTRIBUTION: { label: "Distribution", icon: Truck, tone: "blue" },
  SYSTEM: { label: "General", icon: Cog, tone: "green" },
};
export const modOf = (m: string) => MODULES[m] ?? MODULES.SYSTEM!;

/** Template avatar colour classes, picked from the name so a person keeps one colour. */
const AV = ["", "c2", "c3", "c4", "c5", "c6"];
export function Avatar({ name, size }: { name: string; size?: "xs" | "sm" }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return <span className={["avatar", size, AV[h % AV.length]].filter(Boolean).join(" ")} aria-hidden>{initialsOf(name) || "?"}</span>;
}

export const fileIcon = (contentType: string, name: string): LucideIcon =>
  contentType === "application/pdf" || /\.pdf$/i.test(name) ? FileText : contentType.startsWith("image/") || /\.(png|jpe?g)$/i.test(name) ? ImageIcon : FileArchive;
export const sizeLabel = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_BYTES = 10 * 1024 * 1024;

export const apiMessage = (e: unknown, fallback: string) =>
  e instanceof ApiError ? (e.code === "COLLAB_NOT_YOURS" ? "Only the author can remove this." : e.message) : e instanceof Error && e.message ? e.message : fallback;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Ids of the people whose "@Full Name" appears in `text`. */
export function mentionedIds(text: string, people: { id: string; name: string }[], selfId: string) {
  return [...new Set(people.filter((p) => p.id !== selfId && text.includes(`@${p.name}`)).map((p) => p.id))].slice(0, 20);
}

/** Body text with "@Name" marked (template fmtText); `.me` when it names the current user. */
export function MentionText({ text, names, me }: { text: string; names: string[]; me: string }) {
  const known = [...new Set([...names, me])].filter(Boolean).sort((a, b) => b.length - a.length);
  const re = new RegExp(`@(${known.map(escapeRe).join("|")})`, "g");
  if (!known.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index));
    out.push(<mark key={m.index} className={m[1] === me ? "cp-at me" : "cp-at"}>@{m[1]}</mark>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

/** Day key and labels in the company's time zone. */
export function makeClock(timeZone: string) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hour12: true });
  const long = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const dayKey = (d: Date) => day.format(d);
  return {
    dayKey: (iso: string) => dayKey(new Date(iso)),
    time: (iso: string) => time.format(new Date(iso)),
    dayLabel: (iso: string) => {
      const k = dayKey(new Date(iso)), now = new Date();
      if (k === dayKey(now)) return "Today";
      if (k === dayKey(new Date(now.getTime() - 86_400_000))) return "Yesterday";
      const s = long.format(new Date(iso)).replace(",", "");
      return s.endsWith(String(now.getFullYear())) ? s.slice(0, -5) : s;
    },
  };
}
