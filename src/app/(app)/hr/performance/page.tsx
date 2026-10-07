import { Screen } from "@/components/ui/screen";
import { PerformanceScreen } from "@/features/hr/components/performance-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Performance" };

export default async function PerformancePage() {
  // There are no perf:* permissions: appraisal cycles use emp:*.
  const user = await requirePermission("emp:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/performance">
      <PerformanceScreen can={{ create: has("emp:create"), edit: has("emp:edit"), remove: has("emp:delete") }} />
    </Screen>
  );
}
