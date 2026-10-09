import { Screen } from "@/components/ui/screen";
import { FinancialStatementScreen } from "@/features/ledger/components/financial-statements-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Profit & Loss" };

/** Financial Report Studio, "pnl" tab (template app/reports/pnl). */
export default async function Page() {
  await requirePermission("frep:view");
  return (
    <Screen route="app/reports/pnl">
      <FinancialStatementScreen kind="pnl" />
    </Screen>
  );
}
