import { Screen } from "@/components/ui/screen";
import { PettyCashScreen } from "@/features/treasury/components/petty-cash-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Petty Cash" };

export default async function PettyCashPage() {
  const user = await requirePermission("cash:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/cash/petty">
      <PettyCashScreen can={{ create: has("cash:create"), edit: has("cash:edit"), remove: has("cash:delete") }} />
    </Screen>
  );
}
