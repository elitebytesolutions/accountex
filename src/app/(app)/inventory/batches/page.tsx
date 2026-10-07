import { Screen } from "@/components/ui/screen";
import { BatchesScreen } from "@/features/inventory/components/batches-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Batches & Expiry" };

export default async function BatchesPage() {
  const user = await requirePermission("item:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("item:create"), edit: has("item:edit"), remove: has("item:delete") };
  return (
    <Screen route="app/inventory/batches" className="so-scr">
      <BatchesScreen can={can} />
    </Screen>
  );
}
