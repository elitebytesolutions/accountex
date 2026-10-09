import { Screen } from "@/components/ui/screen";
import { VouchersScreen } from "@/features/ledger/components/vouchers-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Voucher Register" };

export default async function VouchersPage() {
  const user = await requirePermission("vch:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/accounting/vouchers">
      <VouchersScreen can={{ create: has("vch:create"), edit: has("vch:edit"), post: has("vch:post"), remove: has("vch:delete"), exportCsv: has("vch:export") }} />
    </Screen>
  );
}
