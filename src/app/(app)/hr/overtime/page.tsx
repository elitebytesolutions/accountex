import { Screen } from "@/components/ui/screen";
import { OvertimeScreen } from "@/features/hr/components/overtime-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Overtime" };

/** HR › Time & Attendance › Overtime: claims (Phase 30) and the policy (Phase 11). `?claim=<id>` highlights one (approvals inbox link). */
export default async function OvertimePage({ searchParams }: { searchParams: Promise<{ claim?: string }> }) {
  const user = await requirePermission("att:view");
  const has = (p: string) => user.permissions.includes(p);
  const { claim } = await searchParams;
  return (
    <Screen route="app/hr/overtime">
      {/* There is no att:delete permission; deleting a policy needs att:approve. */}
      <OvertimeScreen can={{ create: has("att:create"), edit: has("att:edit"), remove: has("att:approve"), approve: has("att:approve") }} initialId={claim} />
    </Screen>
  );
}
