import { Screen } from "@/components/ui/screen";
import { VendorBillEditor } from "@/features/purchasing/components/vendor-bill-editor";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "New Bill" };

export default async function Page({ searchParams }: { searchParams: Promise<{ po?: string; grn?: string }> }) {
  const user = await requirePermission("bill:create");
  const { po, grn } = await searchParams;
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/purchases/bills/new">
      <VendorBillEditor id={null} prefill={{ po: po ?? null, grn: grn ?? null }} can={{ create: true, edit: has("bill:edit"), approve: has("bill:approve"), post: has("bill:post") }} />
    </Screen>
  );
}
