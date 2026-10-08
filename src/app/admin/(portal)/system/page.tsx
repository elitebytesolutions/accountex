import { Screen } from "@/components/ui/screen";
import { SystemBackupsScreen } from "@/features/platform-config/components/backups-panel";

export const metadata = { title: "System Health" };

/** Super Admin › System › System Health (template admin/system). Phase 38 builds the Backups panel only. */
export default function AdminSystemPage() {
  return (
    <Screen route="admin/system">
      <SystemBackupsScreen />
    </Screen>
  );
}
