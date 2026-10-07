import { LedgerScreen } from "@/features/finance/components/ledger-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Account Ledger" };

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  await requirePermission("coa:view");
  const { account } = await searchParams;
  return <LedgerScreen accountId={account ?? null} />;
}
