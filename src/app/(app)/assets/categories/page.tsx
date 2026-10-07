import { AssetCategoriesScreen } from "@/features/assets/components/asset-categories-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Asset Categories" };

export default async function AssetCategoriesPage() {
  const user = await requirePermission("fa:view");
  const has = (p: string) => user.permissions.includes(p);
  return <AssetCategoriesScreen can={{ create: has("fa:create"), edit: has("fa:edit"), remove: has("fa:delete") }} />;
}
