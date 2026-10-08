import { Screen } from "@/components/ui/screen";
import { SupportScreen } from "@/features/platform-growth/components/support-screen";
import { requireAdmin } from "@/lib/admin-session";

export const metadata = { title: "Support Tickets" };

/** Super Admin › Operations › Support › Support Tickets (template admin/support). */
export default async function AdminSupportPage() {
  const admin = await requireAdmin();
  return (
    <Screen route="admin/support" className="ap-screen">
      <SupportScreen staffName={admin.name} />
    </Screen>
  );
}
