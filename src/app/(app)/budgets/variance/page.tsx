import { Screen } from "@/components/ui/screen";
import { VarianceScreen } from "@/features/budgets/components/variance-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Budget vs Actual" };

export default async function BudgetVariancePage() {
  await requirePermission("bud:view");
  return (
    <Screen route="app/budgets/variance">
      <VarianceScreen />
    </Screen>
  );
}
