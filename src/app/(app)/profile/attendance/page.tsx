import "@/features/self-service/ess.css";
import "@/features/hr/attendance.css";
import { Screen } from "@/components/ui/screen";
import { MyAttendanceScreen } from "@/features/hr/components/my-attendance-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "My Attendance" };

/** My Profile › Attendance (template app/profile/attendance): own punches, calendar and correction requests. */
export default async function Page() {
  const user = await requirePermission("myatt:view");
  return (
    <Screen route="app/profile/attendance" className="es-screen">
      <MyAttendanceScreen can={{ create: user.permissions.includes("myatt:create") }} />
    </Screen>
  );
}
