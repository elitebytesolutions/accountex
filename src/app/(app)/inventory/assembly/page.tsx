import { Screen } from "@/components/ui/screen";
import { AssemblyScreen } from "@/features/inventory/components/assembly-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Assembly Vouchers" };

export default async function Page() {
  const user = await requirePermission("adj:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/inventory/assembly">
      <AssemblyScreen can={{ create: has("adj:create"), edit: has("adj:edit"), post: has("adj:post") }} />
    </Screen>
  );
}
