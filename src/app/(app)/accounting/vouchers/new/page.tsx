import { Screen } from "@/components/ui/screen";
import { VoucherEditor } from "@/features/ledger/components/voucher-editor";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "New Voucher" };

export default async function NewVoucherPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requirePermission("vch:create");
  const { type } = await searchParams;
  return (
    <Screen route="app/accounting/vouchers/new">
      <VoucherEditor id={null} initialType={type ?? null} can={{ post: user.permissions.includes("vch:post"), template: user.permissions.includes("vch:create") }} />
    </Screen>
  );
}
