import "@/features/self-service/ess.css";
import "@/features/ess-requests/engagement/engagement.css";
import { Screen } from "@/components/ui/screen";
import { MyAnnouncements } from "@/features/self-service/components/my-announcements";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Directory" };

/** My Profile › Directory (template app/profile/directory): people with presence, my status, announcements with read receipts / RSVP (Phase 34). */
export default async function Page() {
  await requirePermission("dir:view");
  return (
    <Screen route="app/profile/directory" className="es-screen">
      <MyAnnouncements />
    </Screen>
  );
}
