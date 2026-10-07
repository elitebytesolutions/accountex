import {
  Banknote, BadgeCheck, Calculator, ClipboardList, Crown, Eye, Landmark, Shield, ShieldCheck, ShoppingCart, Truck, UserRound, Users, WalletCards,
  Warehouse, type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui/cn";

/** Role icons offered for custom roles, plus those of the system roles (Roles.icon holds the lucide name). */
export const ROLE_ICONS: Record<string, LucideIcon> = {
  crown: Crown, landmark: Landmark, users: Users, "shopping-cart": ShoppingCart, "clipboard-list": ClipboardList, truck: Truck,
  warehouse: Warehouse, banknote: Banknote, eye: Eye, "user-round": UserRound, shield: Shield, calculator: Calculator,
  "wallet-cards": WalletCards, "badge-check": BadgeCheck, "shield-check": ShieldCheck,
};
export const RoleIcon = ({ name }: { name: string | null }) => {
  const Icon = ROLE_ICONS[name ?? ""] ?? Shield;
  return <Icon />;
};

/** Template `.cu-role` pill (role name in the role's tone). */
export function RolePill({ role, small }: { role: { name: string; icon: string | null; tone: string | null }; small?: boolean }) {
  return (
    <span className={cn("cu-role", `t-${role.tone ?? "neutral"}`, small && "sm")}>
      <RoleIcon name={role.icon} />
      {role.name.replace(" (read-only)", "")}
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "Today 09:14", "Yesterday 17:42", "29 Sep 11:20" (template style). */
export function whenLabel(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso), now = new Date();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay(d, now)) return `Today ${time}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `Yesterday ${time}`;
  return `${pad(d.getDate())} ${d.toLocaleString("en-GB", { month: "short" })}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""} ${time}`;
}

export const rs = (n: number) => `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

/** Template avatar colour classes (avCls: stable per name). */
export const avatarClass = (name: string) => `c${([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 6) + 1}`;

const STATUS_BADGE: Record<string, { tone: string; label: string }> = {
  ACTIVE: { tone: "good", label: "Active" },
  INVITED: { tone: "info", label: "Invited" },
  SUSPENDED: { tone: "danger", label: "Suspended" },
};
export const statusLabel = (status: string) => STATUS_BADGE[status]?.label ?? status;
export const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_BADGE[status] ?? { tone: "neutral", label: status };
  return <span className={cn("badge dot", s.tone)}>{s.label}</span>;
};

/** Template genPwd(): 12 characters with upper, lower, digits and a symbol, no look-alikes. */
export function generatePassword(): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "#@%&*!"];
  const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0]! % s.length]!;
  const chars = [...sets.map(pick), ...Array.from({ length: 8 }, () => pick(sets.join("")))];
  return chars.sort(() => crypto.getRandomValues(new Uint8Array(1))[0]! - 128).join("");
}

/** Template pwdScore(): 0 (too weak) … 4 (very strong). */
export function passwordScore(p: string): number {
  if (p.length < 10 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) return p.length >= 6 ? 1 : 0;
  return Math.min(4, 2 + Number(p.length >= 12) + Number(/[^A-Za-z0-9]/.test(p) && /[A-Z]/.test(p) && /[a-z]/.test(p)));
}
