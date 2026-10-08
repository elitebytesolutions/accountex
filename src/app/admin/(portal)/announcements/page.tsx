import { Screen } from "@/components/ui/screen";
import { AnnouncementsScreen } from "@/features/platform-growth/components/announcements-screen";

export const metadata = { title: "Announcements" };

/** Super Admin › Operations › Support › Announcements (template admin/announcements). */
export default function AdminAnnouncementsPage() {
  return (
    <Screen route="admin/announcements" className="ap-screen">
      <AnnouncementsScreen />
    </Screen>
  );
}
