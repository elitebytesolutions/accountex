import { Screen } from "@/components/ui/screen";
import { FinancialStatementScreen } from "@/features/ledger/components/financial-statements-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Cash Flow" };

/** Financial Report Studio, "cf" tab (template app/reports/cash-flow). */
export default async function Page() {
  await requirePermission("frep:view");
  return (
    <Screen route="app/reports/cash-flow">
      <FinancialStatementScreen kind="cf" />
    </Screen>
  );
}
