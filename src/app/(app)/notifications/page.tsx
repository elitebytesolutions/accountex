import { Screen } from "@/components/ui/screen";
import { NotificationsScreen } from "@/features/work/components/notifications-screen";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Notifications" };

/** Template app/notifications: the Notification Centre (Phase 44). Own notifications only. */
export default async function NotificationsPage() {
  await requireUser();
  return (
    <Screen route="app/notifications">
      <NotificationsScreen />
    </Screen>
  );
}
