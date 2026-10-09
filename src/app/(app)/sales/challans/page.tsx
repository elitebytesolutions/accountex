import { Screen } from "@/components/ui/screen";
import { ChallansScreen } from "@/features/sales/components/challans-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Delivery Challans" };

export default async function Page() {
  const user = await requirePermission("sinv:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/sales/challans" className="sd-screen sd-dc">
      <ChallansScreen can={{ create: has("sinv:create"), edit: has("sinv:edit"), delete: has("sinv:delete"), post: has("sinv:post") }} />
    </Screen>
  );
}
