import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { SalesReturnsScreen } from "@/features/sales/components/sales-returns-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Sales Returns" };

export default async function Page() {
  const user = await requirePermission("sinv:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/sales/returns" className="sd-screen sd-sr">
      <Suspense>
        <SalesReturnsScreen can={{ create: has("sinv:create"), edit: has("sinv:edit"), post: has("sinv:post"), delete: has("sinv:delete") }} />
      </Suspense>
    </Screen>
  );
}
