import { Screen } from "@/components/ui/screen";
import { VendorBillsScreen } from "@/features/purchasing/components/vendor-bills-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Vendor Bills" };

export default async function Page() {
  const user = await requirePermission("bill:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/purchases/bills">
      <VendorBillsScreen can={{ create: has("bill:create"), approve: has("bill:approve"), post: has("bill:post") }} />
    </Screen>
  );
}
