import { TaxCodesScreen } from "@/features/treasury/components/tax-codes-screen";
import { Screen } from "@/components/ui/screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Tax Codes" };

export default async function TaxCodesPage() {
  const user = await requirePermission("tax:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/tax/codes">
      <TaxCodesScreen can={{ create: has("tax:create"), edit: has("tax:edit") }} />
    </Screen>
  );
}
