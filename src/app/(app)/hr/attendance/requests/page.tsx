import { Screen } from "@/components/ui/screen";
import { RegularisationScreen } from "@/features/hr/components/regularisation-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Regularisation Requests" };

/** HR › Time & Attendance › Regularisation (template app/hr/attendance/requests). `?request=<id>` opens one (approvals inbox link). */
export default async function RegularisationPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const user = await requirePermission("att:view");
  const { request } = await searchParams;
  return (
    <Screen route="app/hr/attendance/requests">
      <RegularisationScreen can={{ approve: user.permissions.includes("att:approve") }} initialId={request} />
    </Screen>
  );
}
