import { Screen } from "@/components/ui/screen";
import { DemandScreen } from "@/features/inventory/components/demand-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Demand & Reorder" };

export default async function DemandPage() {
  await requirePermission("item:view");
  return (
    <Screen route="app/inventory/demand" className="so-scr">
      <DemandScreen />
    </Screen>
  );
}
