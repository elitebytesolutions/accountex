import { Screen } from "@/components/ui/screen";
import { SecurityScreen } from "@/features/platform-config/components/security-screen";

export const metadata = { title: "Security & Privacy" };

/** Super Admin › System › Security & Privacy (template admin/security). */
export default function AdminSecurityPage() {
  return (
    <Screen route="admin/security" className="ap-screen">
      <SecurityScreen />
    </Screen>
  );
}
