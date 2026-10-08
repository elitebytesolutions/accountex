import "@/features/hr/attendance.css";
import "@/features/payroll/payroll-dash.css";
import { Screen } from "@/components/ui/screen";
import { PayrollOverviewScreen } from "@/features/payroll/components/payroll-overview-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Payroll Overview" };

/** Workforce › Payroll (template app/hr/payroll): last run KPIs, 12-month cost, the open run, departments, recent runs. */
export default async function PayrollOverviewPage() {
  const user = await requirePermission("prun:view");
  return (
    <Screen route="app/hr/payroll" className="fd-screen">
      <PayrollOverviewScreen canRun={user.permissions.includes("prun:create") || user.permissions.includes("prun:edit")} />
    </Screen>
  );
}
