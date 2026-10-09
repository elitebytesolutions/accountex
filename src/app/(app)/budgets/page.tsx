import { Screen } from "@/components/ui/screen";
import { BudgetsScreen } from "@/features/budgets/components/budgets-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  const user = await requirePermission("bud:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/budgets">
      <BudgetsScreen can={{ create: has("bud:create"), edit: has("bud:edit"), approve: has("bud:approve"), delete: has("bud:delete") }} />
    </Screen>
  );
}
