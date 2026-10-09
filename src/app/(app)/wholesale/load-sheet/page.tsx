import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { LoadSheetScreen } from "@/features/distribution-ops/components/load-sheet-screen";
import "@/features/distribution/distribution.css";
import "@/features/distribution-ops/components/load-sheet-screen.css";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Load Sheets" };

export default async function LoadSheetPage() {
  const user = await requirePermission("loadsht:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("loadsht:create"), edit: has("loadsht:edit"), approve: has("loadsht:approve"), post: has("loadsht:post"), delivery: has("delivery:edit") };
  return (
    <Screen route="app/wholesale/load-sheet" className="ds-screen">
      <Suspense>
        <LoadSheetScreen can={can} />
      </Suspense>
    </Screen>
  );
}
