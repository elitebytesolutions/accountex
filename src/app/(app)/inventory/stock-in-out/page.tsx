import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { StockInOutScreen } from "@/features/inventory/components/stock-in-out-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Stock In / Out" };

export default async function StockInOutPage() {
  const user = await requirePermission("adj:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/inventory/stock-in-out" className="so-scr">
      <Suspense>
        <StockInOutScreen can={{ create: has("adj:create"), edit: has("adj:edit"), post: has("adj:post") }} />
      </Suspense>
    </Screen>
  );
}
