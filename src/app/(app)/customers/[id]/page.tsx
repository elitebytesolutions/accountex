import { Screen } from "@/components/ui/screen";
import { CustomerDetailScreen } from "@/features/parties/components/customer-detail-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Customer Detail" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("cust:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/customers/view">
      <CustomerDetailScreen id={id} meId={user.id} can={{ create: has("cust:create"), edit: has("cust:edit"), remove: has("cust:delete") }} />
    </Screen>
  );
}
