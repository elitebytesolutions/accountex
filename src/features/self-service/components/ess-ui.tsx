import {
  Banknote, Building2, CalendarDays, FileText, HeartPulse, LifeBuoy, Laptop, Megaphone, PartyPopper, ShieldCheck, Sparkles, Truck, Users, Wrench, type LucideIcon,
} from "lucide-react";

/** Helpdesk desk icons (lucide names stored in HelpdeskCategories.icon) and their template tile colours (11-helpdesk.js CAT). */
export const DESK_ICONS: Record<string, { Icon: LucideIcon; tone: string; label: string }> = {
  users: { Icon: Users, tone: "green", label: "People" },
  banknote: { Icon: Banknote, tone: "lime", label: "Money" },
  laptop: { Icon: Laptop, tone: "blue", label: "Laptop" },
  "building-2": { Icon: Building2, tone: "orange", label: "Building" },
  "life-buoy": { Icon: LifeBuoy, tone: "violet", label: "Help" },
  "shield-check": { Icon: ShieldCheck, tone: "blue", label: "Shield" },
  "heart-pulse": { Icon: HeartPulse, tone: "red", label: "Health" },
  "file-text": { Icon: FileText, tone: "violet", label: "Document" },
  wrench: { Icon: Wrench, tone: "orange", label: "Tools" },
  truck: { Icon: Truck, tone: "lime", label: "Transport" },
};
export const deskIcon = (icon: string | null) => DESK_ICONS[icon ?? ""] ?? { Icon: LifeBuoy, tone: "violet", label: "Help" };

/** Announcement kind → template icon tile (08-company.js ANN): event megaphone / lime, benefit sparkles / green, policy file-text / blue, celebration party-popper / violet. */
export const KIND_ICONS: Record<string, { Icon: LucideIcon; tone: string }> = {
  GENERAL: { Icon: Megaphone, tone: "lime" },
  EVENT: { Icon: CalendarDays, tone: "lime" },
  BENEFIT: { Icon: Sparkles, tone: "green" },
  POLICY_UPDATE: { Icon: FileText, tone: "blue" },
  CELEBRATION: { Icon: PartyPopper, tone: "violet" },
};
export const kindIcon = (kind: string) => KIND_ICONS[kind] ?? KIND_ICONS.GENERAL!;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2 h ago" for today, else "29 Sep" (the template's announcement times). */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime(), mins = Math.round((now - t) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]}`;
}
/** "Fri, 09 Oct" */
export function shortDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}, ${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]}`;
}
/** "07 Oct 2026, 10:00" in local time. */
export const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
/** A datetime-local input value (local time) for an ISO instant. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** A datetime-local value back to an ISO instant (empty stays empty). */
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : "");
