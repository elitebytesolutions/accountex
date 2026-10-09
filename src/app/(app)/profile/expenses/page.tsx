import "@/features/self-service/ess.css";
import { Screen } from "@/components/ui/screen";
import { MyExpenseClaimsScreen } from "@/features/cash/components/my-expense-claims-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Expense Claims" };

/** My Profile › Expense Claims (template app/profile/expenses): own claims, filed for approval and reimbursement. */
export default async function Page() {
  const user = await requirePermission("myexp:view");
  return (
    <Screen route="app/profile/expenses" className="es-screen">
      <MyExpenseClaimsScreen can={{ create: user.permissions.includes("myexp:create"), edit: user.permissions.includes("myexp:edit") }} />
    </Screen>
  );
}
