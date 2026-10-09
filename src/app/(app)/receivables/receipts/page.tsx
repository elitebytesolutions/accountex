import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { ReceiptsScreen } from "@/features/receivables/components/receipts-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Receipts & Allocation" };

export default async function ReceiptsPage() {
  const user = await requirePermission("rcpt:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/receivables/receipts">
      <Suspense>
        <ReceiptsScreen can={{ post: has("rcpt:post"), edit: has("rcpt:edit") }} />
      </Suspense>
    </Screen>
  );
}
