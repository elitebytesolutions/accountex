import { Screen } from "@/components/ui/screen";
import { TrialBalanceScreen } from "@/features/ledger/components/trial-balance-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Trial Balance" };

export default async function Page() {
  await requirePermission("vch:view");
  return (
    <Screen route="app/reports/trial-balance">
      <TrialBalanceScreen />
    </Screen>
  );
}
