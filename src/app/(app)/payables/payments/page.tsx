import { Screen } from "@/components/ui/screen";
import { PaymentsScreen } from "@/features/purchasing/components/payments-screen";
import { requirePermission, requireUser } from "@/lib/session";

export const metadata = { title: "Payments & Allocation" };

/**
 * vpay:view; an approver without it may still open the page on a ?payment=<id> link from the approvals inbox
 * (the API lets them read only the payment whose current step they can act on).
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment } = await searchParams;
  const user = payment ? await requireUser() : await requirePermission("vpay:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/payables/payments">
      <PaymentsScreen userId={user.id} can={{ view: has("vpay:view"), create: has("vpay:create"), edit: has("vpay:edit"), post: has("vpay:post") }} />
    </Screen>
  );
}
