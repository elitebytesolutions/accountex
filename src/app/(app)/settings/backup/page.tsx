import { Screen } from "@/components/ui/screen";
import { BackupScreen } from "@/features/data-ops/components/backup-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Backup & Restore" };

export default async function BackupPage() {
  const user = await requirePermission("bak:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/settings/backup">
      <BackupScreen can={{ create: has("bak:create"), export: has("bak:export") }} />
    </Screen>
  );
}
