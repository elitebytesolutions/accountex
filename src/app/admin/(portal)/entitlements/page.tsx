import { Screen } from "@/components/ui/screen";
import { EntitlementsScreen } from "@/features/platform-catalogue/components/entitlements-screen";

export const metadata = { title: "Plan Entitlements" };

/** Super Admin › Billing › Feature Management › Plan Entitlements (template admin/entitlements). */
export default function AdminEntitlementsPage() {
  return (
    <Screen route="admin/entitlements" className="ff-screen">
      <EntitlementsScreen />
    </Screen>
  );
}
