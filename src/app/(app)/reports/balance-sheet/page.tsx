import { Screen } from "@/components/ui/screen";
import { FinancialStatementScreen } from "@/features/ledger/components/financial-statements-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Balance Sheet" };

/** Financial Report Studio, "bs" tab (template app/reports/balance-sheet). */
export default async function Page() {
  await requirePermission("frep:view");
  return (
    <Screen route="app/reports/balance-sheet">
      <FinancialStatementScreen kind="bs" />
    </Screen>
  );
}
