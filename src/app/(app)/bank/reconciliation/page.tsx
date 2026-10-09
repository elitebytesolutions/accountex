import { Screen } from "@/components/ui/screen";
import { ReconciliationScreen } from "@/features/banking/components/reconciliation-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Bank Reconciliation" };

export default async function Page() {
  const user = await requirePermission("recon:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/bank/reconciliation">
      <ReconciliationScreen can={{ create: has("recon:create"), edit: has("recon:edit"), complete: has("recon:post"), reopen: has("recon:approve") }} />
    </Screen>
  );
}
