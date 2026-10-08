import { Screen } from "@/components/ui/screen";
import { AttendanceRegisterScreen } from "@/features/hr/components/attendance-register-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Attendance Register" };

/** HR › Time & Attendance › Attendance Register (template app/hr/attendance/register). Locking needs att:approve. */
export default async function AttendanceRegisterPage() {
  const user = await requirePermission("att:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/attendance/register">
      <AttendanceRegisterScreen can={{ edit: has("att:edit"), approve: has("att:approve") }} />
    </Screen>
  );
}
