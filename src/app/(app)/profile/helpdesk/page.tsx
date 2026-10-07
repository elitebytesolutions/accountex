import "@/features/self-service/ess.css";
import { Screen } from "@/components/ui/screen";
import { MyHelpdesk } from "@/features/self-service/components/my-helpdesk";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Helpdesk" };

/** My Profile › Helpdesk (template app/profile/helpdesk): desks and quick answers. Tickets arrive in Phase 34. */
export default async function Page() {
  await requirePermission("myhelp:view");
  return (
    <Screen route="app/profile/helpdesk" className="es-screen">
      <MyHelpdesk />
    </Screen>
  );
}
