import { Screen } from "@/components/ui/screen";
import { SalesTaxScreen } from "@/features/tax/components/sales-tax-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Sales Tax Return" };

export default async function SalesTaxPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await searchParams;
  const user = await requirePermission("tax:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/tax/sales-tax">
      <SalesTaxScreen initialPeriod={/^\d{4}-\d{2}$/.test(period ?? "") ? `${period}-01` : null} can={{ create: has("tax:create"), edit: has("tax:edit"), approve: has("tax:approve"), post: has("tax:post"), export: has("tax:export") }} />
    </Screen>
  );
}
