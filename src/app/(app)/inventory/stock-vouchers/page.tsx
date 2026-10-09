import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { StockVouchersScreen } from "@/features/inventory/components/stock-vouchers-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Stock Vouchers" };

export default async function StockVouchersPage() {
  const user = await requirePermission("adj:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/inventory/stock-vouchers" className="pd-scr pd-sv">
      <Suspense>
        <StockVouchersScreen can={{ create: has("adj:create"), edit: has("adj:edit"), post: has("adj:post") }} />
      </Suspense>
    </Screen>
  );
}
