import { Screen } from "@/components/ui/screen";
import { TemplatesScreen } from "@/features/platform-templates/components/templates-screen";

export const metadata = { title: "Templates" };

/** Super Admin › Tenants › Templates (template admin/templates): COA templates, master seed lists, default role grants. */
export default function AdminTemplatesPage() {
  return (
    <Screen route="admin/templates" className="ap-screen">
      <TemplatesScreen />
    </Screen>
  );
}
