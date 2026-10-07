import { Screen } from "@/components/ui/screen";
import { OvertimeScreen } from "@/features/hr/components/overtime-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Overtime" };

export default async function OvertimePage() {
  const user = await requirePermission("att:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/overtime">
      {/* There is no att:delete permission; deleting a policy needs att:approve. */}
      <OvertimeScreen can={{ create: has("att:create"), edit: has("att:edit"), remove: has("att:approve") }} />
    </Screen>
  );
}
