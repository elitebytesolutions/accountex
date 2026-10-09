import { Screen } from "@/components/ui/screen";
import { PurchaseOrdersScreen } from "@/features/purchasing/components/purchase-orders-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Purchase Orders" };

export default async function Page() {
  const user = await requirePermission("po:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/purchases/orders">
      <PurchaseOrdersScreen userId={user.id} can={{ create: has("po:create"), edit: has("po:edit"), approve: has("po:approve"), receive: has("grn:create"), bill: has("bill:create") }} />
    </Screen>
  );
}
