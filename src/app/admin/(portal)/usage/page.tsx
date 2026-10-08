import { Screen } from "@/components/ui/screen";
import { UsageScreen } from "@/features/platform-flags/components/usage-screen";

export const metadata = { title: "Usage & Quotas" };

/** Super Admin › Billing › Usage & Quotas (template admin/usage): per-tenant meters and overrides (Phase 40) and alert rules (Phase 39). */
export default function AdminUsagePage() {
  return (
    <Screen route="admin/usage" className="ap-screen">
      <UsageScreen />
    </Screen>
  );
}
