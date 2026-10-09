import { Screen } from "@/components/ui/screen";
import { ChequesScreen } from "@/features/banking/components/cheques-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Receive & Issue Cheques" };

export default async function Page() {
  const user = await requirePermission("bank:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/bank/cheques">
      <ChequesScreen can={{ create: has("bank:create"), edit: has("bank:edit"), post: has("bank:post") }} />
    </Screen>
  );
}
