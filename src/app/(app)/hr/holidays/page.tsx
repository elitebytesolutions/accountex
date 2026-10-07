import { Screen } from "@/components/ui/screen";
import { HolidaysScreen } from "@/features/hr/components/holidays-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Holiday Calendar" };

export default async function HolidaysPage() {
  const user = await requirePermission("att:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/holidays">
      {/* There is no att:delete permission; deleting a holiday needs att:approve. */}
      <HolidaysScreen can={{ create: has("att:create"), edit: has("att:edit"), remove: has("att:approve") }} canDelete={has("att:approve")} />
    </Screen>
  );
}
