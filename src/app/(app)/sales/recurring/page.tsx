import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { RecurringInvoicesScreen } from "@/features/sales/components/recurring-invoices-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Recurring Invoices" };

export default async function RecurringInvoicesPage() {
  const user = await requirePermission("sinv:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/sales/recurring">
      <div className="cp-screen">
        <Suspense>
          <RecurringInvoicesScreen can={{ create: has("sinv:create"), edit: has("sinv:edit"), post: has("sinv:post"), delete: has("sinv:delete") }} />
        </Suspense>
      </div>
    </Screen>
  );
}
