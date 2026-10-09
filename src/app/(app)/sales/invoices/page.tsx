import { Screen } from "@/components/ui/screen";
import { SalesInvoicesScreen } from "@/features/sales/components/sales-invoices-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Sales Invoices" };

export default async function Page() {
  const user = await requirePermission("sinv:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/sales/invoices">
      <SalesInvoicesScreen can={{ create: has("sinv:create"), edit: has("sinv:edit"), delete: has("sinv:delete"), post: has("sinv:post") }} />
    </Screen>
  );
}
