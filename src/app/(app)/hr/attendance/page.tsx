import { Screen } from "@/components/ui/screen";
import { AttendanceTodayScreen } from "@/features/hr/components/attendance-today-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Attendance" };

/** HR › Time & Attendance › Attendance Today (template app/hr/attendance). */
export default async function AttendancePage() {
  const user = await requirePermission("att:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/attendance">
      <AttendanceTodayScreen can={{ create: has("att:create"), edit: has("att:edit") }} />
    </Screen>
  );
}
