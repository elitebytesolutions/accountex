import "@/features/self-service/ess.css";
import "@/features/hr/attendance.css";
import "@/features/hr/leave.css";
import "@/features/hr/goals.css";
import { Screen } from "@/components/ui/screen";
import { MyGoalsScreen } from "@/features/hr/components/my-goals-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Goals & Reviews" };

/** My Profile › Goals & Reviews (template app/profile/goals): own goals, review, feedback and 1:1s. */
export default async function Page() {
  const user = await requirePermission("mygoal:view");
  return (
    <Screen route="app/profile/goals" className="es-screen">
      <MyGoalsScreen can={{ edit: user.permissions.includes("mygoal:edit") }} />
    </Screen>
  );
}
