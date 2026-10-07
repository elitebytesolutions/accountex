import { Screen } from "@/components/ui/screen";
import { ClassesScreen } from "@/features/inventory/components/classes-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Product Classes" };

export default async function ClassesPage() {
  const user = await requirePermission("item:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("item:create"), edit: has("item:edit"), remove: has("item:delete") };
  return (
    <Screen route="app/inventory/classes" className="pr-screen pr-cl">
      <ClassesScreen can={can} />
    </Screen>
  );
}
