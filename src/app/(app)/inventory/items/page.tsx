import { Screen } from "@/components/ui/screen";
import { CatalogueScreen } from "@/features/inventory/components/catalogue-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Product Catalogue" };

export default async function ProductCataloguePage() {
  const user = await requirePermission("item:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("item:create"), edit: has("item:edit"), remove: has("item:delete") };
  return (
    <Screen route="app/inventory/items" className="pr-screen pr-cat">
      <CatalogueScreen can={can} />
    </Screen>
  );
}
