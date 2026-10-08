import "@/features/payroll/payroll.css";
import { Screen } from "@/components/ui/screen";
import { PayslipsScreen } from "@/features/payroll/components/payslips-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Payslips" };

/** Workforce › Payroll › Payslips (template app/hr/payroll/payslips); `?tab=tax` opens the tax declarations review. */
export default async function PayslipsPage({ searchParams }: { searchParams: Promise<{ tab?: string; run?: string }> }) {
  const user = await requirePermission("prun:view");
  const { tab, run } = await searchParams;
  return (
    <Screen route="app/hr/payroll/payslips">
      <PayslipsScreen canApproveTax={user.permissions.includes("prun:approve")} initialTab={tab === "tax" ? "tax" : "payslips"} initialRun={run} />
    </Screen>
  );
}
