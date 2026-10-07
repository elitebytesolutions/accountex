import { Screen } from "@/components/ui/screen";
import { EmployeesScreen } from "@/features/hr/components/employees-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Employees" };

export default async function EmployeesPage() {
  const user = await requirePermission("emp:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/employees">
      <EmployeesScreen can={{ create: has("emp:create"), export: has("emp:export") }} />
    </Screen>
  );
}
