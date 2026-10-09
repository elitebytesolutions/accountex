import { Screen } from "@/components/ui/screen";
import { PurchaseVoucherScreen } from "@/features/purchasing/components/purchase-voucher-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Purchase Voucher" };

export default async function Page() {
  const user = await requirePermission("bill:create");
  return (
    <Screen route="app/purchases/voucher">
      <PurchaseVoucherScreen can={{ post: user.permissions.includes("bill:post") }} />
    </Screen>
  );
}
