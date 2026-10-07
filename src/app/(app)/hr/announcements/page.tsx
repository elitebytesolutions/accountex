import { Screen } from "@/components/ui/screen";
import { AnnouncementsScreen } from "@/features/self-service/components/announcements-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Announcements" };

/** Workforce › Employee engagement › Announcements (no admin template: template-style screen, Phase 15). */
export default async function Page() {
  const user = await requirePermission("emp:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/announcements">
      <AnnouncementsScreen can={{ create: has("emp:create"), edit: has("emp:edit") }} />
    </Screen>
  );
}
