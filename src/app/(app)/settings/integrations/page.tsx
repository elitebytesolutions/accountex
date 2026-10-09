import { Screen } from "@/components/ui/screen";
import { IntegrationsScreen } from "@/features/data-ops/components/integrations-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const user = await requirePermission("intg:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/settings/integrations">
      <IntegrationsScreen can={{ create: has("intg:create"), edit: has("intg:edit"), delete: has("intg:delete") }} />
    </Screen>
  );
}
