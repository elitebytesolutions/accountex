import { Screen } from "@/components/ui/screen";
import { DepartmentsScreen } from "@/features/hr/components/departments-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Departments & Designations" };

export default async function DepartmentsPage() {
  const user = await requirePermission("emp:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/departments">
      <DepartmentsScreen can={{ create: has("emp:create"), edit: has("emp:edit"), remove: has("emp:delete") }} />
    </Screen>
  );
}
