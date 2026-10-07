import { Screen } from "@/components/ui/screen";
import { VendorDetailScreen } from "@/features/parties/components/vendor-detail-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Vendor Detail" };

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("vend:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/vendors/view">
      <VendorDetailScreen id={id} can={{ create: has("vend:create"), edit: has("vend:edit"), remove: has("vend:delete") }} />
    </Screen>
  );
}
