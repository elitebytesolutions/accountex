import { Screen } from "@/components/ui/screen";
import { DisposalsScreen } from "@/features/assets/components/disposals-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Asset Disposals" };

export default async function DisposalsPage() {
  const user = await requirePermission("fa:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/assets/disposals">
      <DisposalsScreen can={{ create: has("fa:create"), edit: has("fa:edit"), delete: has("fa:delete"), post: has("fa:post"), approve: has("fa:approve") }} />
    </Screen>
  );
}
