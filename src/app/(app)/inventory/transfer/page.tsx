import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { StockTransferScreen } from "@/features/inventory/components/stock-transfer-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Stock Transfers" };

export default async function StockTransferPage() {
  const user = await requirePermission("xfer:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/inventory/transfer" className="so-scr">
      <Suspense>
        <StockTransferScreen can={{ create: has("xfer:create"), edit: has("xfer:edit"), post: has("xfer:post") }} />
      </Suspense>
    </Screen>
  );
}
