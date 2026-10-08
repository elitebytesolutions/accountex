import { Screen } from "@/components/ui/screen";
import { DunningScreen } from "@/features/platform-config/components/dunning-screen";

export const metadata = { title: "Dunning & Collections" };

/** Super Admin › Billing › Plans & Billing › Dunning & Collections (template admin/dunning). Phase 38: the policy panels. */
export default function AdminDunningPage() {
  return (
    <Screen route="admin/dunning" className="ap-screen">
      <DunningScreen />
    </Screen>
  );
}
