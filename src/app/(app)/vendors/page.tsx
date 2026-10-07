import { Screen } from "@/components/ui/screen";
import { VendorsScreen } from "@/features/parties/components/vendors-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Vendors" };

export default async function VendorsPage() {
  const user = await requirePermission("vend:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/vendors">
      <VendorsScreen can={{ create: has("vend:create"), edit: has("vend:edit"), remove: has("vend:delete") }} />
    </Screen>
  );
}
