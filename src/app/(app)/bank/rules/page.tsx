import { Screen } from "@/components/ui/screen";
import { BankRulesScreen } from "@/features/treasury/components/bank-rules-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Bank Rules & Import" };

export default async function BankRulesPage() {
  const user = await requirePermission("bank:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/bank/rules">
      <div className="cp-screen">
        <BankRulesScreen can={{ create: has("bank:create"), edit: has("bank:edit"), remove: has("bank:delete") }} />
      </div>
    </Screen>
  );
}
