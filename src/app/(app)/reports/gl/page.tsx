import { Screen } from "@/components/ui/screen";
import { GeneralLedgerScreen } from "@/features/ledger/components/general-ledger-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "General Ledger" };

export default async function Page() {
  await requirePermission("vch:view");
  return (
    <Screen route="app/reports/gl">
      <GeneralLedgerScreen />
    </Screen>
  );
}
