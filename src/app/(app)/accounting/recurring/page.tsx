import { Screen } from "@/components/ui/screen";
import { RecurringScreen } from "@/features/ledger/components/recurring-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Recurring Templates" };

export default async function RecurringPage() {
  const user = await requirePermission("vch:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/accounting/recurring">
      <RecurringScreen can={{ create: has("vch:create"), edit: has("vch:edit"), remove: has("vch:delete"), post: has("vch:post") }} />
    </Screen>
  );
}
