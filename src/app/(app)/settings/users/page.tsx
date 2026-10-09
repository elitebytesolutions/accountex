import { UsersScreen } from "@/features/access/components/users-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const user = await requirePermission("usr:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <UsersScreen
      me={user.id}
      myName={user.name}
      companyName={user.tenantName}
      can={{ create: has("usr:create"), edit: has("usr:edit"), remove: has("usr:delete"), export: has("usr:export") }}
    />
  );
}
