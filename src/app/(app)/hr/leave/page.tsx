import { Screen } from "@/components/ui/screen";
import { LeaveOverviewScreen } from "@/features/hr/components/leave-overview-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Leave" };

/** HR › Leave › Overview (template app/hr/leave). */
export default async function LeavePage() {
  const user = await requirePermission("lv:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/leave">
      <LeaveOverviewScreen can={{ create: has("lv:create"), approve: has("lv:approve") }} />
    </Screen>
  );
}
