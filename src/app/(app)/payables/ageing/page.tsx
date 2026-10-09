import { Screen } from "@/components/ui/screen";
import { PayablesStudioScreen } from "@/features/purchasing/components/payables-studio-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "AP Ageing & Reports" };

export default async function Page() {
  await requirePermission("vpay:view");
  return (
    <Screen route="app/payables/ageing">
      <PayablesStudioScreen />
    </Screen>
  );
}
