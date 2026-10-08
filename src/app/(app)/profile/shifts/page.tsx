import "@/features/self-service/ess.css";
import "@/features/hr/attendance.css";
import { Screen } from "@/components/ui/screen";
import { MyShiftsScreen } from "@/features/hr/components/my-shifts-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Shifts & Swaps" };

/** My Profile › Shifts (template app/profile/shifts): published roster, swaps, open shifts. */
export default async function Page() {
  const user = await requirePermission("myshift:view");
  return (
    <Screen route="app/profile/shifts" className="es-screen">
      <MyShiftsScreen can={{ create: user.permissions.includes("myshift:create") }} />
    </Screen>
  );
}
