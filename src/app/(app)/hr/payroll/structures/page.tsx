import { Screen } from "@/components/ui/screen";
import { PayrollSetupScreen } from "@/features/payroll/components/payroll-setup-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Salary Structures" };

export default async function SalaryStructuresPage() {
  const user = await requirePermission("prun:view");
  return (
    <Screen route="app/hr/payroll/structures">
      <PayrollSetupScreen can={{ edit: user.permissions.includes("prun:edit") }} />
    </Screen>
  );
}
