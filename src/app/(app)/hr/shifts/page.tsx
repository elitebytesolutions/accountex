import { Screen } from "@/components/ui/screen";
import { ShiftsScreen } from "@/features/hr/components/shifts-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Shifts & Roster" };

export default async function ShiftsPage() {
  const user = await requirePermission("att:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/shifts">
      {/* There is no att:delete permission; deleting a shift needs att:approve. */}
      <ShiftsScreen can={{ create: has("att:create"), edit: has("att:edit"), remove: has("att:approve") }} canDelete={has("att:approve")} canPublish={has("att:approve")} />
    </Screen>
  );
}
