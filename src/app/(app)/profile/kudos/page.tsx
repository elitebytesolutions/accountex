import "@/features/self-service/ess.css";
import "@/features/ess-requests/engagement/engagement.css";
import { Screen } from "@/components/ui/screen";
import { MyEngagement } from "@/features/self-service/components/my-engagement";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Kudos & Pulse" };

/** My Profile › Kudos & Pulse (template app/profile/kudos): kudos wall and reactions, weekly pulse and live poll (Phase 34). */
export default async function Page() {
  await requirePermission("mykudos:view");
  return (
    <Screen route="app/profile/kudos" className="es-screen">
      <MyEngagement />
    </Screen>
  );
}
