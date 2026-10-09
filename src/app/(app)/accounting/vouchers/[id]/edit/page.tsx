import { Screen } from "@/components/ui/screen";
import { VoucherEditor } from "@/features/ledger/components/voucher-editor";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Edit Voucher" };

export default async function EditVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("vch:edit");
  return (
    <Screen route="app/accounting/vouchers/new">
      <VoucherEditor id={id} initialType={null} can={{ post: user.permissions.includes("vch:post"), template: user.permissions.includes("vch:create") }} />
    </Screen>
  );
}
