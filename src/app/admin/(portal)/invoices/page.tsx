import { Screen } from "@/components/ui/screen";
import { InvoicesScreen } from "@/features/platform-billing/components/invoices-screen";

export const metadata = { title: "Platform Invoices" };

/** Super Admin › Billing › Plans & Billing › Platform Invoices (template admin/invoices). Phase 41. */
export default function AdminInvoicesPage() {
  return (
    <Screen route="admin/invoices" className="ap-screen">
      <InvoicesScreen />
    </Screen>
  );
}
