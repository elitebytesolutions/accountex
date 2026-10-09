import { Screen } from "@/components/ui/screen";
import { BulkScreen } from "@/features/wholesale/components/bulk-screen";
import "@/features/wholesale/components/bulk-screen.css";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Bulk Invoicing" };

export default async function BulkInvoicingPage() {
  const user = await requirePermission("bulkinv:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("bulkinv:create"), post: has("bulkinv:post") };
  return (
    <Screen route="app/wholesale/bulk" className="ws2-screen ws2-bulk">
      <BulkScreen can={can} />
    </Screen>
  );
}
