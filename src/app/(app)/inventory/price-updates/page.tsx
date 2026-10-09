import { Screen } from "@/components/ui/screen";
import { PriceUpdatesScreen } from "@/features/inventory/components/price-updates-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Bulk Price Updates" };

export default async function Page() {
  const user = await requirePermission("item:view");
  return (
    <Screen route="app/inventory/price-updates">
      <PriceUpdatesScreen can={{ edit: user.permissions.includes("item:edit") }} />
    </Screen>
  );
}
