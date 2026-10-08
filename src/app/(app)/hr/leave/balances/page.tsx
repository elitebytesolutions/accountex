import { Screen } from "@/components/ui/screen";
import { LeaveBalancesScreen } from "@/features/hr/components/leave-balances-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Leave Balances" };

/** HR › Leave › Balances (template app/hr/leave/balances): accrual, adjustments and the year-end close. */
export default async function LeaveBalancesPage() {
  const user = await requirePermission("lv:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/leave/balances">
      <LeaveBalancesScreen can={{ edit: has("lv:edit"), approve: has("lv:approve") }} />
    </Screen>
  );
}
