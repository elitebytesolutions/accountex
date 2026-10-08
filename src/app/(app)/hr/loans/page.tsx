import "@/features/payroll/payroll.css";
import { Screen } from "@/components/ui/screen";
import { LoansScreen } from "@/features/payroll/components/loans-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Loans & Advances" };

/** Workforce › Loans & Advances (template app/hr/loans). `?loan=<id>` opens one (approval inbox link). */
export default async function LoansPage({ searchParams }: { searchParams: Promise<{ loan?: string }> }) {
  const user = await requirePermission("loan:view");
  const has = (p: string) => user.permissions.includes(p);
  const { loan } = await searchParams;
  return (
    <Screen route="app/hr/loans">
      <LoansScreen can={{ create: has("loan:create"), approve: has("loan:approve"), post: has("loan:post"), export: has("loan:export") }} initialId={loan} />
    </Screen>
  );
}
