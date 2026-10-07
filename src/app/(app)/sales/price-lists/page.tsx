import { Screen } from "@/components/ui/screen";
import { PriceListsScreen } from "@/features/sales-setup/components/price-lists-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Price Lists & Schemes" };

export default async function PriceListsPage() {
  const user = await requirePermission("quo:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { view: true, approve: has("quo:approve"), remove: has("quo:delete"), tiersView: has("pricetier:view"), tiersEdit: has("pricetier:edit") };
  return (
    <Screen route="app/sales/price-lists">
      <div className="cp-screen">
        <PriceListsScreen can={can} hasCust={has("cust:view")} hasItem={has("item:view")} />
      </div>
    </Screen>
  );
}
