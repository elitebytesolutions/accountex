import { SalesInvoiceEditor } from "@/features/sales/components/sales-invoice-editor";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "New Sales Invoice" };

/** The editor wraps itself in <Screen route="app/sales/invoices/new"> (it switches to the view route once posted). */
export default async function Page({ searchParams }: { searchParams: Promise<{ so?: string }> }) {
  const user = await requirePermission("sinv:create");
  const { so } = await searchParams;
  const has = (p: string) => user.permissions.includes(p);
  return (
    <SalesInvoiceEditor
      id={null}
      salesOrderId={so ?? null}
      can={{ create: true, edit: has("sinv:edit"), delete: has("sinv:delete"), post: has("sinv:post") }}
      company={{ name: user.tenantName, canView: has("comp:view") }}
    />
  );
}
