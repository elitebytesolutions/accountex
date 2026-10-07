import { Screen } from "@/components/ui/screen";
import { EmployeeWizard } from "@/features/hr/components/employee-wizard";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Add Employee" };

export default async function AddEmployeePage() {
  await requirePermission("emp:create");
  return (
    <Screen route="app/hr/employees/new">
      <EmployeeWizard />
    </Screen>
  );
}
