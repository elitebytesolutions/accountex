import { Screen } from "@/components/ui/screen";
import { AssetRegisterScreen } from "@/features/assets/components/asset-register-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Fixed Asset Register" };

export default async function AssetRegisterPage() {
  const user = await requirePermission("fa:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/assets">
      <AssetRegisterScreen can={{ create: has("fa:create"), edit: has("fa:edit"), delete: has("fa:delete"), post: has("fa:post"), approve: has("fa:approve") }} />
    </Screen>
  );
}
