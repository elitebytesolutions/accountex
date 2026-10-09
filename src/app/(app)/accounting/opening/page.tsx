import { Screen } from "@/components/ui/screen";
import { OpeningScreen } from "@/features/ledger/components/opening-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Opening Balances" };

export default async function OpeningPage() {
  const user = await requirePermission("vch:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/accounting/opening">
      <OpeningScreen can={{ edit: has("vch:edit"), post: has("vch:post") }} />
    </Screen>
  );
}
