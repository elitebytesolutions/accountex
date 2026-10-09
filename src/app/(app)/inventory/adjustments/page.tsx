import { Screen } from "@/components/ui/screen";
import { StockAdjustmentsScreen } from "@/features/inventory/components/stock-adjustments-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Stock Adjustments" };

export default async function Page() {
  const user = await requirePermission("adj:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/inventory/adjustments">
      <StockAdjustmentsScreen can={{ create: has("adj:create"), edit: has("adj:edit"), post: has("adj:post") }} />
    </Screen>
  );
}
