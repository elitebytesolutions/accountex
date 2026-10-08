import "@/features/self-service/ess.css";
import "@/features/hr/attendance.css";
import "@/features/hr/leave.css";
import { Screen } from "@/components/ui/screen";
import { MyLeaveScreen } from "@/features/hr/components/my-leave-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "My Leave" };

/** My Profile › Leave (template app/profile/leave): balances, own requests, team calendar, apply / withdraw / cancel. */
export default async function Page() {
  const user = await requirePermission("mylv:view");
  return (
    <Screen route="app/profile/leave" className="es-screen">
      <MyLeaveScreen can={{ create: user.permissions.includes("mylv:create") }} />
    </Screen>
  );
}
