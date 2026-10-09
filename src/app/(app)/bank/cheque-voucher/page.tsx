import { Screen } from "@/components/ui/screen";
import { ChequeVoucherScreen } from "@/features/banking/components/cheque-voucher-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Cheque Voucher (Bulk)" };

export default async function Page() {
  const user = await requirePermission("bank:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/bank/cheque-voucher">
      <ChequeVoucherScreen can={{ create: has("bank:create"), edit: has("bank:edit"), post: has("bank:post") }} />
    </Screen>
  );
}
