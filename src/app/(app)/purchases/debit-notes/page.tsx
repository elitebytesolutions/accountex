import { Screen } from "@/components/ui/screen";
import { DebitNotesScreen } from "@/features/purchasing/components/debit-notes-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Debit Notes" };

export default async function Page() {
  const user = await requirePermission("bill:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/purchases/debit-notes">
      <DebitNotesScreen can={{ create: has("bill:create"), edit: has("bill:edit"), post: has("bill:post") }} />
    </Screen>
  );
}
