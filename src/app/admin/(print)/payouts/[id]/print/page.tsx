import { PayoutStatementPrint } from "@/features/platform-billing/components/print-views";

export const metadata = { title: "Partner statement" };

/** The reseller statement's "Email PDF": a print view of the payout statement (emailing waits for Phase 29). */
export default async function AdminPayoutPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayoutStatementPrint id={id} />;
}
