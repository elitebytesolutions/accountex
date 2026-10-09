import { Screen } from "@/components/ui/screen";
import { GrnScreen } from "@/features/purchasing/components/grn-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Goods Received (GRN)" };

export default async function Page() {
  const user = await requirePermission("grn:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/purchases/grn">
      <GrnScreen can={{ create: has("grn:create"), edit: has("grn:edit"), post: has("grn:post"), bill: has("bill:create") }} />
    </Screen>
  );
}
