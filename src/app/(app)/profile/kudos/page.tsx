import "@/features/self-service/ess.css";
import { Screen } from "@/components/ui/screen";
import { MyEngagement } from "@/features/self-service/components/my-engagement";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Kudos & Pulse" };

/** My Profile › Kudos & Pulse (template app/profile/kudos): the open pulse surveys and polls. Answers, votes and kudos arrive in Phase 34. */
export default async function Page() {
  await requirePermission("mykudos:view");
  return (
    <Screen route="app/profile/kudos" className="es-screen">
      <MyEngagement />
    </Screen>
  );
}
