import { Screen } from "@/components/ui/screen";
import { CashLedgerScreen } from "@/features/cash/components/cash-ledger-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Cash Ledger" };

export default async function Page() {
  const user = await requirePermission("cash:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/cash/ledger">
      <CashLedgerScreen can={{ create: has("cash:create"), post: has("cash:post"), approve: has("cash:approve") }} />
    </Screen>
  );
}
