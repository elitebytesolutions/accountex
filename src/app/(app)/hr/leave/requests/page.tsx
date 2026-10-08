import { Screen } from "@/components/ui/screen";
import { LeaveRequestsScreen } from "@/features/hr/components/leave-requests-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Leave Requests" };

/** HR › Leave › Requests (template app/hr/leave/requests). `?request=<id>` opens one (approvals inbox link). */
export default async function LeaveRequestsPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const user = await requirePermission("lv:view");
  const { request } = await searchParams;
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/leave/requests">
      <LeaveRequestsScreen can={{ create: has("lv:create"), approve: has("lv:approve") }} initialId={request} />
    </Screen>
  );
}
