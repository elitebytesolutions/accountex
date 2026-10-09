import { Screen } from "@/components/ui/screen";
import { ApprovalsScreen } from "@/features/ledger/components/approvals-screen";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Approvals Inbox" };

/** Everyone signed in: the inbox lists only what the user may act on or has requested. */
export default async function ApprovalsPage() {
  await requireUser();
  return (
    <Screen route="app/approvals">
      <ApprovalsScreen />
    </Screen>
  );
}
