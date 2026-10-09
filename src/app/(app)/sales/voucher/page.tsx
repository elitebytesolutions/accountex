import { Screen } from "@/components/ui/screen";
import { SalesVoucherScreen } from "@/features/sales/components/sales-voucher-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Sales Voucher" };

export default async function Page() {
  const user = await requirePermission("sinv:create");
  return (
    <Screen route="app/sales/voucher" className="sd-screen sd-sv">
      <SalesVoucherScreen can={{ post: user.permissions.includes("sinv:post") }} />
    </Screen>
  );
}
