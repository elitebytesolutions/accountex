import { Screen } from "@/components/ui/screen";
import { WarehousesScreen } from "@/features/inventory/components/warehouses-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Warehouses" };

export default async function WarehousesPage() {
  const user = await requirePermission("wh:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("wh:create"), edit: has("wh:edit"), remove: has("wh:delete") };
  return (
    <Screen route="app/inventory/warehouses">
      <WarehousesScreen can={can} />
    </Screen>
  );
}
