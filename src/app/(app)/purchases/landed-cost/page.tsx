import { Screen } from "@/components/ui/screen";
import { LandedCostScreen } from "@/features/purchasing/components/landed-cost-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Landed Cost" };

export default async function Page() {
  const user = await requirePermission("bill:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/purchases/landed-cost">
      <div className="cp-screen">
        <LandedCostScreen can={{ create: has("bill:create"), edit: has("bill:edit"), post: has("bill:post") }} />
      </div>
    </Screen>
  );
}
