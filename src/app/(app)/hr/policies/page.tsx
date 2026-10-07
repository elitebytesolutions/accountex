import { Screen } from "@/components/ui/screen";
import { PoliciesScreen } from "@/features/hr/components/policies-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Company Policies" };

export default async function PoliciesPage() {
  const user = await requirePermission("emp:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    // No admin template exists for policies (template style); the route name follows the other HR screens.
    <Screen route="app/hr/policies">
      <PoliciesScreen can={{ create: has("emp:create"), edit: has("emp:edit"), remove: has("emp:delete") }} />
    </Screen>
  );
}
