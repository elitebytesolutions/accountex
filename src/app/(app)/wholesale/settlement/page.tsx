import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { SettlementScreen } from "@/features/distribution-ops/components/settlement-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Route Settlement" };

export default async function RouteSettlementPage() {
  const user = await requirePermission("settle:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/wholesale/settlement" className="ds-screen">
      <Suspense>
        <SettlementScreen can={{ edit: has("settle:edit"), post: has("settle:approve") }} />
      </Suspense>
    </Screen>
  );
}
