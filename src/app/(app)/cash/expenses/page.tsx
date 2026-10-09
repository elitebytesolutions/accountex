import { Screen } from "@/components/ui/screen";
import { ExpenseClaimsScreen } from "@/features/cash/components/expense-claims-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Expense Claims" };

export default async function Page() {
  const user = await requirePermission("cash:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/cash/expenses">
      <ExpenseClaimsScreen can={{ post: has("cash:post"), approve: has("cash:approve") }} />
    </Screen>
  );
}
