import { Screen } from "@/components/ui/screen";
import { OrgChartScreen } from "@/features/hr/components/org-chart-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Organisation Chart" };

export default async function OrgChartPage() {
  const user = await requirePermission("emp:view");
  return (
    <Screen route="app/hr/org">
      <OrgChartScreen companyName={user.tenantName} />
    </Screen>
  );
}
