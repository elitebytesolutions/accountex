import "@/features/self-service/ess.css";
import "@/features/hr/attendance.css";
import { Screen } from "@/components/ui/screen";
import { MyHelpdesk } from "@/features/self-service/components/my-helpdesk";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Helpdesk" };

/** My Profile › Helpdesk (template app/profile/helpdesk): desks, quick answers and tickets (Phase 34). */
export default async function Page() {
  const user = await requirePermission("myhelp:view");
  return (
    <Screen route="app/profile/helpdesk" className="es-screen">
      <MyHelpdesk canRaise={user.permissions.includes("myhelp:create")} />
    </Screen>
  );
}
