import { SalesInvoiceEditor } from "@/features/sales/components/sales-invoice-editor";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Sales Invoice" };

/**
 * Signed-in users only: approvers reach it from the approvals inbox; the API decides what they may see. Drafts open the
 * editor (<Screen route="app/sales/invoices/new">), everything else the printed view (<Screen route="app/sales/invoices/view">).
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const has = (p: string) => user.permissions.includes(p);
  return (
    <SalesInvoiceEditor
      id={id}
      salesOrderId={null}
      can={{ create: has("sinv:create"), edit: has("sinv:edit"), delete: has("sinv:delete"), post: has("sinv:post") }}
      company={{ name: user.tenantName, canView: has("comp:view") }}
    />
  );
}
