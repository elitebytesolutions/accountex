import { Screen } from "@/components/ui/screen";
import { VoucherView } from "@/features/ledger/components/voucher-view";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Voucher Detail" };

export default async function VoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("vch:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/accounting/vouchers/view">
      <VoucherView id={id} userId={user.id} can={{ create: has("vch:create"), edit: has("vch:edit"), post: has("vch:post"), remove: has("vch:delete") }} />
    </Screen>
  );
}
