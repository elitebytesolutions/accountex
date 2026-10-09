import { Screen } from "@/components/ui/screen";
import { EmployeeProfileScreen } from "@/features/hr/components/employee-profile-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Employee Profile" };

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("emp:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/employees/view">
      <EmployeeProfileScreen id={id} can={{ edit: has("emp:edit"), remove: has("emp:delete"), salaryView: has("prun:view"), salaryApprove: has("prun:approve") }} />
    </Screen>
  );
}
