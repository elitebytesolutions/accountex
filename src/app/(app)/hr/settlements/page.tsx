import { Screen } from "@/components/ui/screen";
import { SettlementsScreen } from "@/features/payroll/components/settlements-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Final Settlements" };

/** Final settlements register (the template's app/hr/settlement view is the detail page). */
export default async function SettlementsPage() {
  await requirePermission("fs:view");
  return (
    <Screen route="app/hr/settlement">
      <SettlementsScreen />
    </Screen>
  );
}
