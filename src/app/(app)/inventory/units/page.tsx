import { UnitsScreen } from "@/features/inventory/components/units-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Units of Measure" };

export default async function UnitsPage() {
  const user = await requirePermission("item:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("item:create"), edit: has("item:edit"), remove: has("item:delete") };
  return <UnitsScreen can={can} />;
}
