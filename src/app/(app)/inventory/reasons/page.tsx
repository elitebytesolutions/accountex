import { ReasonsScreen } from "@/features/inventory/components/reasons-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Movement Reasons" };

export default async function ReasonsPage() {
  const user = await requirePermission("adj:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("adj:create"), edit: has("adj:edit"), remove: has("adj:delete") };
  return <ReasonsScreen can={can} />;
}
