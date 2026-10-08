import { InvoicePrint } from "@/features/platform-billing/components/print-views";

export const metadata = { title: "Platform invoice" };

/** The invoice drawer's "PDF": a print view of the platform invoice (template .paper styles, browser print). */
export default async function AdminInvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoicePrint id={id} />;
}
