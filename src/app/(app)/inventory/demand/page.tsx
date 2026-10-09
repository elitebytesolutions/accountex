import { Screen } from "@/components/ui/screen";
import { DemandScreen } from "@/features/inventory/components/demand-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Demand & Reorder" };

export default async function DemandPage() {
  const user = await requirePermission("item:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/inventory/demand" className="so-scr">
      <DemandScreen can={{ edit: has("item:edit"), po: has("po:create") }} />
    </Screen>
  );
}
