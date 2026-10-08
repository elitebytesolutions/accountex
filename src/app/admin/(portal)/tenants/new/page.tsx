import { Screen } from "@/components/ui/screen";
import { OnboardWizard } from "@/features/platform-tenants/components/onboard-wizard";

export const metadata = { title: "Onboard Tenant" };

/** Super Admin › Tenants › Onboard Tenant (template admin/tenants/new, five-step wizard). */
export default function AdminOnboardTenantPage() {
  return (
    <Screen route="admin/tenants/new">
      <OnboardWizard />
    </Screen>
  );
}
