import { Screen } from "@/components/ui/screen";
import { EmployeeWizard } from "@/features/hr/components/employee-wizard";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Add Employee" };

export default async function AddEmployeePage() {
  const user = await requirePermission("emp:create");
  return (
    <Screen route="app/hr/employees/new">
      <EmployeeWizard canSalary={user.permissions.includes("prun:approve")} />
    </Screen>
  );
}
