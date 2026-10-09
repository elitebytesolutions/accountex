import "@/features/self-service/ess.css";
import "@/features/ess-requests/team/team.css";
import { Screen } from "@/components/ui/screen";
import { MyTeamScreen } from "@/features/ess-requests/team/components/my-team-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "My Team" };

/** My Profile › My Team (template app/profile/team): team today, the approvals deck (engine requests + HR self-service queues), team calendar. */
export default async function Page() {
  const user = await requirePermission("myteam:view");
  return (
    <Screen route="app/profile/team" className="es-screen">
      <MyTeamScreen can={{ hr: user.permissions.includes("emp:edit") }} />
    </Screen>
  );
}
