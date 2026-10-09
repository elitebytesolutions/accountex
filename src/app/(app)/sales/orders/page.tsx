import { Screen } from "@/components/ui/screen";
import { SalesOrdersScreen } from "@/features/sales/components/sales-orders-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Sales Orders" };

export default async function Page() {
  const user = await requirePermission("quo:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/sales/orders">
      <SalesOrdersScreen
        userId={user.id}
        can={{ create: has("quo:create"), edit: has("quo:edit"), delete: has("quo:delete"), approve: has("quo:approve"), overrideCredit: has("crovr:approve"), challan: has("sinv:create") }}
      />
    </Screen>
  );
}
