import { BankAccountsScreen } from "@/features/treasury/components/bank-accounts-screen";
import { Screen } from "@/components/ui/screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Bank Accounts" };

export default async function BankAccountsPage() {
  const user = await requirePermission("bank:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/bank/accounts">
      <BankAccountsScreen can={{ create: has("bank:create"), edit: has("bank:edit"), remove: has("bank:delete") }} />
    </Screen>
  );
}
