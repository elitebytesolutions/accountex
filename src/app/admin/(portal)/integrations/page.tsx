import { Screen } from "@/components/ui/screen";
import { IntegrationsScreen } from "@/features/platform-config/components/integrations-screen";

export const metadata = { title: "API & Webhooks" };

/** Super Admin › System › API & Webhooks (template admin/integrations). */
export default function AdminIntegrationsPage() {
  return (
    <Screen route="admin/integrations" className="ap-screen">
      <IntegrationsScreen />
    </Screen>
  );
}
