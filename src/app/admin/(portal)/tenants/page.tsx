import { Screen } from "@/components/ui/screen";
import { TenantsScreen } from "@/features/platform-tenants/components/tenants-screen";

export const metadata = { title: "All Tenants" };

/** Super Admin › Tenants › All Tenants (template admin/tenants). */
export default function AdminTenantsPage() {
  return (
    <Screen route="admin/tenants" className="ap-screen">
      <TenantsScreen />
    </Screen>
  );
}
