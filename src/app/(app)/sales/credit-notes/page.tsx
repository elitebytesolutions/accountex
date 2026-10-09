import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { CreditNotesScreen } from "@/features/sales/components/credit-notes-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Credit Notes" };

export default async function Page() {
  const user = await requirePermission("sinv:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/sales/credit-notes">
      <Suspense>
        <CreditNotesScreen can={{ create: has("sinv:create"), edit: has("sinv:edit"), post: has("sinv:post"), delete: has("sinv:delete") }} />
      </Suspense>
    </Screen>
  );
}
