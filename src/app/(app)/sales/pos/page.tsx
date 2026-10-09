import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { PosScreen } from "@/features/sales/components/pos-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "POS / Counter Sale" };

export default async function PosPage() {
  const user = await requirePermission("pos:create");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/sales/pos" className="sd-screen sd-pos">
      <Suspense>
        <PosScreen can={{ report: has("pos:view"), supervise: has("pos:approve") }} />
      </Suspense>
    </Screen>
  );
}
