import { Screen } from "@/components/ui/screen";
import { CashBookScreen } from "@/features/cash/components/cash-book-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Cash Book" };

export default async function Page() {
  const user = await requirePermission("cash:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/cash/book">
      <CashBookScreen can={{ create: has("cash:create"), post: has("cash:post"), approve: has("cash:approve") }} />
    </Screen>
  );
}
