import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { CreditControlScreen } from "@/features/distribution-ops/components/credit-control-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Credit Control" };

export default async function CreditControlPage() {
  const user = await requirePermission("crovr:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/receivables/credit">
      <Suspense>
        <CreditControlScreen can={{ approve: has("crovr:approve"), routes: has("route:view") }} userId={user.id} />
      </Suspense>
    </Screen>
  );
}
