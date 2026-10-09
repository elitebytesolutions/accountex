import { Screen } from "@/components/ui/screen";
import { StockCountScreen } from "@/features/inventory/components/stock-count-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Stock Count" };

export default async function Page() {
  const user = await requirePermission("cnt:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/inventory/count" className="so-scr">
      <StockCountScreen can={{ create: has("cnt:create"), count: has("cnt:edit"), approve: has("cnt:approve"), cancel: has("cnt:post") }} />
    </Screen>
  );
}
