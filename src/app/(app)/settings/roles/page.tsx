import { RolesScreen } from "@/features/access/components/roles-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Roles & Permissions" };

export default async function RolesPage() {
  const user = await requirePermission("rol:view");
  const has = (p: string) => user.permissions.includes(p);
  return <RolesScreen can={{ create: has("rol:create"), edit: has("rol:edit"), remove: has("rol:delete") }} />;
}
