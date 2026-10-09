import { Screen } from "@/components/ui/screen";
import { AssetDetailScreen } from "@/features/assets/components/asset-detail-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Asset Detail" };

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("fa:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/assets/view">
      <AssetDetailScreen id={id} can={{ create: has("fa:create"), edit: has("fa:edit"), delete: has("fa:delete"), post: has("fa:post"), approve: has("fa:approve") }} />
    </Screen>
  );
}
