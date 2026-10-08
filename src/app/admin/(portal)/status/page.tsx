import { Screen } from "@/components/ui/screen";
import { StatusScreen } from "@/features/platform-flags/components/status-screen";

export const metadata = { title: "Status & Incidents" };

/** Super Admin › Operations › System › Status & Incidents (template admin/status): the maintenance part (Phase 39). */
export default function AdminStatusPage() {
  return (
    <Screen route="admin/status" className="ap-screen">
      <StatusScreen />
    </Screen>
  );
}
