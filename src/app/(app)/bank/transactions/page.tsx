import { Screen } from "@/components/ui/screen";
import { BankTransactionsScreen } from "@/features/banking/components/bank-transactions-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Bank Transactions" };

export default async function Page() {
  const user = await requirePermission("bank:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/bank/transactions">
      <BankTransactionsScreen can={{ create: has("bank:create"), edit: has("bank:edit") }} />
    </Screen>
  );
}
