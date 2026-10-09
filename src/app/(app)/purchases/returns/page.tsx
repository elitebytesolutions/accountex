import { Screen } from "@/components/ui/screen";
import { PurchaseReturnsScreen } from "@/features/purchasing/components/purchase-returns-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Purchase Returns" };

export default async function Page() {
  const user = await requirePermission("grn:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/purchases/returns">
      <PurchaseReturnsScreen can={{ create: has("grn:create"), edit: has("grn:edit"), post: has("grn:post") }} />
    </Screen>
  );
}
