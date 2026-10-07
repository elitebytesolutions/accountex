import {
  ArrowDownToLine, Baby, Box, Briefcase, CalendarX, ClipboardCheck, Cookie, CupSoda, Droplets, Gift, HardHat, Lightbulb, Package, PackagePlus, PackageX, Paperclip,
  Pill, Recycle, SearchCheck, Shirt, ShieldAlert, ShoppingBasket, Smartphone, Sofa, Sparkles, SprayCan, Tag, Truck, Utensils, Wrench, type LucideIcon,
} from "lucide-react";

/** The icon names classes and movement reasons store (CLASS_ICONS / REASON_ICONS), as components. */
const ICONS: Record<string, LucideIcon> = {
  package: Package, paperclip: Paperclip, "hard-hat": HardHat, lightbulb: Lightbulb, "shopping-basket": ShoppingBasket, "spray-can": SprayCan,
  "cup-soda": CupSoda, cookie: Cookie, shirt: Shirt, pill: Pill, baby: Baby, wrench: Wrench, sofa: Sofa, smartphone: Smartphone,
  "package-plus": PackagePlus, "package-x": PackageX, "search-check": SearchCheck, "arrow-down-to-line": ArrowDownToLine, "calendar-x": CalendarX,
  "shield-alert": ShieldAlert, utensils: Utensils, gift: Gift, "clipboard-check": ClipboardCheck, droplets: Droplets, truck: Truck, recycle: Recycle,
  briefcase: Briefcase, box: Box, sparkles: Sparkles,
};

export function NamedIcon({ name }: { name: string | null | undefined }) {
  const Icon = (name && ICONS[name]) || Tag;
  return <Icon />;
}
