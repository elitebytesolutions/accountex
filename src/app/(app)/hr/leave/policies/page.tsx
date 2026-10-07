import { Screen } from "@/components/ui/screen";
import { LeavePoliciesScreen } from "@/features/hr/components/leave-policies-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Leave Policies" };

export default async function LeavePoliciesPage() {
  const user = await requirePermission("lv:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/leave/policies">
      <LeavePoliciesScreen can={{ create: has("lv:create"), edit: has("lv:edit"), remove: has("lv:delete") }} />
    </Screen>
  );
}
