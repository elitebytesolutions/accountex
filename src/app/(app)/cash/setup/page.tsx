import { CashSetupScreen } from "@/features/treasury/components/cash-setup-screen";
import { Screen } from "@/components/ui/screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Cash Setup" };

export default async function CashSetupPage() {
  const user = await requirePermission("cash:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/cash/setup">
      <CashSetupScreen can={{ create: has("cash:create"), edit: has("cash:edit"), remove: has("cash:delete") }} />
    </Screen>
  );
}
