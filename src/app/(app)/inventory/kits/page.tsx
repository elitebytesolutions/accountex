import { Screen } from "@/components/ui/screen";
import { KitsScreen } from "@/features/inventory/components/kits-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Kits & Bundles" };

export default async function KitsPage() {
  const user = await requirePermission("item:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("item:create"), edit: has("item:edit"), remove: has("item:delete") };
  return (
    <Screen route="app/inventory/kits" className="pr-screen pr-kit">
      <KitsScreen can={can} />
    </Screen>
  );
}
