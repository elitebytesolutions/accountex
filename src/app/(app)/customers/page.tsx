import { Screen } from "@/components/ui/screen";
import { CustomersScreen } from "@/features/parties/components/customers-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  const user = await requirePermission("cust:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/customers">
      <CustomersScreen can={{ create: has("cust:create"), edit: has("cust:edit"), remove: has("cust:delete") }} />
    </Screen>
  );
}
