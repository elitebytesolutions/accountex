import { Screen } from "@/components/ui/screen";
import { AuditScreen } from "@/features/platform-flags/components/audit-screen";

export const metadata = { title: "Platform Audit Log" };

/** Super Admin › Operations › System › Platform Audit Log (template admin/audit): log (read-only) + alert rules drawer. */
export default function AdminAuditPage() {
  return (
    <Screen route="admin/audit">
      <AuditScreen />
    </Screen>
  );
}
