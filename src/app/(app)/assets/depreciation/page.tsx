import { Screen } from "@/components/ui/screen";
import { DepreciationScreen } from "@/features/assets/components/depreciation-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Run Depreciation" };

export default async function DepreciationPage() {
  const user = await requirePermission("fa:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/assets/depreciation">
      <DepreciationScreen can={{ create: has("fa:create"), edit: has("fa:edit"), delete: has("fa:delete"), post: has("fa:post"), approve: has("fa:approve") }} />
    </Screen>
  );
}
