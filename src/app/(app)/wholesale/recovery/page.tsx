import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { RecoveryScreen } from "@/features/distribution-ops/components/recovery-screen";
import "@/features/distribution/distribution.css";
import "@/features/distribution-ops/components/recovery-screen.css";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Recovery Sheet" };

export default async function RecoveryPage() {
  const user = await requirePermission("recov:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/wholesale/recovery" className="ds-screen">
      <Suspense>
        <RecoveryScreen can={{ create: has("recov:create"), edit: has("recov:edit"), post: has("recov:post") }} />
      </Suspense>
    </Screen>
  );
}
