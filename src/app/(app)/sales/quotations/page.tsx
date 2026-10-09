import { Screen } from "@/components/ui/screen";
import { QuotationsScreen } from "@/features/sales/components/quotations-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Quotations" };

export default async function Page() {
  const user = await requirePermission("quo:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/sales/quotations">
      <QuotationsScreen userId={user.id} can={{ create: has("quo:create"), edit: has("quo:edit"), delete: has("quo:delete") }} />
    </Screen>
  );
}
