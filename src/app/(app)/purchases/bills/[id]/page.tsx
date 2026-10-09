import { Screen } from "@/components/ui/screen";
import { VendorBillEditor } from "@/features/purchasing/components/vendor-bill-editor";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Vendor Bill" };

/** Signed-in users only: approvers reach it from the approvals inbox; the API decides what they may see. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/purchases/bills/new">
      <VendorBillEditor id={id} prefill={{ po: null, grn: null }} can={{ create: has("bill:create"), edit: has("bill:edit"), approve: has("bill:approve"), post: has("bill:post") }} />
    </Screen>
  );
}
